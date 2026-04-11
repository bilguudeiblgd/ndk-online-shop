import ExcelJS from "exceljs"

// Mongolian phone: 8 digits starting with 6, 7, 8, 9
const phoneRegex = /\b([6-9]\d{7})\b/

export type FilterMode = "price" | "price_code"

export type TransactionStatus =
  | "Зөв"
  | "Утас олдсонгүй"
  | "Дүн таарахгүй"
  | "Код олдсонгүй"
  | "Бусад"

export interface Transaction {
  date: string
  branch: string
  debit: number
  credit: number
  amount: number
  balance: string
  message: string
  account: string
  phone: string
  hasCode: boolean
  status: TransactionStatus
}

export interface FilterParams {
  price: number
  mode: FilterMode
  code?: string
}

export interface FilterResult {
  accepted: Transaction[]
  badPhone: Transaction[]
  badAmount: Transaction[]
  badCode: Transaction[]
  noMatch: Transaction[]
  total: number
  acceptedCount: number
}

function parseNumber(val: unknown): number {
  if (typeof val === "number") return val
  if (typeof val === "string") {
    const cleaned = val.replace(/,/g, "").replace(/\s/g, "")
    const n = parseFloat(cleaned)
    return isNaN(n) ? 0 : n
  }
  return 0
}

function amountMatch(credit: number, price: number): boolean {
  return Math.abs(credit - price) < 1
}

function classify(
  t: Transaction,
  params: FilterParams
): TransactionStatus {
  const hasPhone = t.phone !== ""
  const priceOK = amountMatch(t.amount, params.price)

  if (params.mode === "price") {
    if (hasPhone && priceOK) return "Зөв"
    if (hasPhone && !priceOK) return "Дүн таарахгүй"
    if (!hasPhone && priceOK) return "Утас олдсонгүй"
    return "Бусад"
  }

  // price_code mode
  const hasCode = t.hasCode
  if (hasPhone && priceOK && hasCode) return "Зөв"
  if (hasPhone && priceOK && !hasCode) return "Код олдсонгүй"
  if (!hasPhone && priceOK && hasCode) return "Утас олдсонгүй"
  if (hasPhone && !priceOK && hasCode) return "Дүн таарахгүй"
  if (!hasPhone && !priceOK) return "Бусад"
  if (!hasCode && !priceOK) return "Бусад"
  if (!hasPhone) return "Утас олдсонгүй"
  if (!priceOK) return "Дүн таарахгүй"
  return "Бусад"
}

export async function filterTransactions(
  buffer: Buffer,
  params: FilterParams
): Promise<{ result: FilterResult; output: Buffer }> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as any)

  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error("Хуудас олдсонгүй")

  // Find header row
  let headerRow = -1
  const colMap: Record<string, number> = {}

  sheet.eachRow((row, rowNumber) => {
    if (headerRow > 0) return
    row.eachCell((cell, colNumber) => {
      const val = String(cell.value || "").toLowerCase()
      if (val.includes("гүйлгээний огноо")) {
        headerRow = rowNumber
      }
    })
    if (headerRow === rowNumber) {
      row.eachCell((cell, colNumber) => {
        const val = String(cell.value || "").toLowerCase()
        if (val.includes("огноо")) colMap.date = colNumber
        if (val.includes("салбар")) colMap.branch = colNumber
        if (val.includes("дебит")) colMap.debit = colNumber
        if (val.includes("кредит")) colMap.credit = colNumber
        if (val.includes("эцсийн")) colMap.balance = colNumber
        if (val.includes("утга")) colMap.message = colNumber
        if (val.includes("харьцсан")) colMap.account = colNumber
      })
    }
  })

  if (headerRow < 0) {
    throw new Error(
      "Толгой мөр олдсонгүй ('Гүйлгээний огноо' агуулсан мөр)"
    )
  }

  // Parse transactions
  const transactions: Transaction[] = []

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return

    const getVal = (col: number | undefined) => {
      if (!col) return ""
      const cell = row.getCell(col)
      return String(cell.value ?? "").trim()
    }

    const date = getVal(colMap.date)
    const credit = parseNumber(row.getCell(colMap.credit ?? 0).value)

    // Skip non-credit or empty rows
    if (!date || credit <= 0) return

    const message = getVal(colMap.message)

    // Extract phone
    const phoneMatch = phoneRegex.exec(message)
    const phone = phoneMatch ? phoneMatch[1] : ""

    // Check code
    let hasCode = false
    if (params.mode === "price_code" && params.code) {
      hasCode = message
        .toLowerCase()
        .includes(params.code.toLowerCase())
    }

    const t: Transaction = {
      date,
      branch: getVal(colMap.branch),
      debit: parseNumber(row.getCell(colMap.debit ?? 0).value),
      credit,
      amount: credit,
      balance: getVal(colMap.balance),
      message,
      account: getVal(colMap.account),
      phone,
      hasCode,
      status: "Бусад",
    }

    t.status = classify(t, params)
    transactions.push(t)
  })

  // Categorize
  const result: FilterResult = {
    accepted: [],
    badPhone: [],
    badAmount: [],
    badCode: [],
    noMatch: [],
    total: transactions.length,
    acceptedCount: 0,
  }

  for (const t of transactions) {
    switch (t.status) {
      case "Зөв":
        result.accepted.push(t)
        result.acceptedCount++
        break
      case "Утас олдсонгүй":
        result.badPhone.push(t)
        break
      case "Дүн таарахгүй":
        result.badAmount.push(t)
        break
      case "Код олдсонгүй":
        result.badCode.push(t)
        break
      default:
        result.noMatch.push(t)
    }
  }

  // Generate output
  const output = await generateOutput(result, params)
  return { result, output }
}

async function generateOutput(
  result: FilterResult,
  params: FilterParams
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const headers = [
    "Огноо",
    "Утас",
    "Дүн",
    "Гүйлгээний утга",
    "Төлөв",
    "Харьцсан данс",
  ]

  const headerFill: ExcelJS.FillPattern = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF333333" },
  }
  const headerFont: Partial<ExcelJS.Font> = {
    bold: true,
    color: { argb: "FFFFFFFF" },
    size: 11,
  }

  function addSheet(
    name: string,
    txns: Transaction[],
    fillColor: string
  ) {
    const ws = wb.addWorksheet(name)
    const headerRow = ws.addRow(headers)
    headerRow.eachCell((cell) => {
      cell.fill = headerFill
      cell.font = headerFont
      cell.alignment = { horizontal: "center" }
    })

    const rowFill: ExcelJS.FillPattern = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: fillColor },
    }

    for (const t of txns) {
      const r = ws.addRow([
        t.date,
        t.phone,
        t.amount,
        t.message,
        t.status,
        t.account,
      ])
      r.eachCell((cell) => {
        cell.fill = rowFill
      })
    }

    ws.getColumn(1).width = 20
    ws.getColumn(2).width = 12
    ws.getColumn(3).width = 15
    ws.getColumn(4).width = 40
    ws.getColumn(5).width = 18
    ws.getColumn(6).width = 20
  }

  addSheet("Зөв", result.accepted, "FFC6EFCE")
  if (result.badAmount.length)
    addSheet("Дүн таарахгүй", result.badAmount, "FFFFC7CE")
  if (result.badCode.length)
    addSheet("Код олдсонгүй", result.badCode, "FFFFEB9C")
  if (result.badPhone.length)
    addSheet("Утас олдсонгүй", result.badPhone, "FFFFC7CE")
  if (result.noMatch.length)
    addSheet("Бусад", result.noMatch, "FFD9D9D9")

  // Summary
  const summary = wb.addWorksheet("Нэгтгэл")
  let row = 1
  const addSummaryRow = (label: string, value: string | number) => {
    summary.getCell(`A${row}`).value = label
    summary.getCell(`B${row}`).value = value
    row++
  }
  if (params.mode === "price_code") {
    addSummaryRow("Горим", "Үнэ + Код")
    addSummaryRow("Код", params.code || "")
  } else {
    addSummaryRow("Горим", "Зөвхөн үнэ")
  }
  addSummaryRow("Бүтээгдэхүүний үнэ", params.price)
  addSummaryRow("Нийт гүйлгээ", result.total)
  addSummaryRow("Зөв", result.accepted.length)
  addSummaryRow("Дүн таарахгүй", result.badAmount.length)
  if (params.mode === "price_code") {
    addSummaryRow("Код олдсонгүй", result.badCode.length)
  }
  addSummaryRow("Утас олдсонгүй", result.badPhone.length)
  addSummaryRow("Бусад", result.noMatch.length)
  summary.getColumn(1).width = 25
  summary.getColumn(2).width = 20

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
