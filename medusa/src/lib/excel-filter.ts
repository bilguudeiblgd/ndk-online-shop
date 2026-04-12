import ExcelJS from "exceljs"

// Mongolian phone: 8 digits starting with 6, 7, 8, 9
const phoneRegex = /\b([6-9]\d{7})\b/

export type TransactionStatus =
  | "Зөв"
  | "Утас олдсонгүй"
  | "Дүн таарахгүй"
  | "Бусад"

export interface VariantFilter {
  variantId: string
  productTitle: string
  variantTitle: string
  price: number
  codes: string[] // multiple keywords (cyrillic/latin)
}

export interface TransactionMatch {
  variantId: string
  productTitle: string
  variantTitle: string
  quantity: number
  subtotal: number
}

export interface Transaction {
  date: string
  branch: string
  amount: number
  balance: string
  message: string
  account: string
  phone: string
  matches: TransactionMatch[]
  matchLabel: string
  status: TransactionStatus
}

export interface ColumnMapping {
  date?: string
  branch?: string
  credit?: string
  balance?: string
  message?: string
  account?: string
}

export interface FilterParams {
  variants: VariantFilter[]
  sheet?: number
  columns?: ColumnMapping
  startRow?: number
  dateFrom?: string  // "YYYY-MM-DD"
  dateTo?: string    // "YYYY-MM-DD"
}

export interface VariantStats {
  variantId: string
  productTitle: string
  variantTitle: string
  price: number
  matchedCount: number
  totalQuantity: number
  totalRevenue: number
}

export interface FilterResult {
  accepted: Transaction[]
  badPhone: Transaction[]
  badAmount: Transaction[]
  noMatch: Transaction[]
  total: number
  acceptedCount: number
  variantStats: VariantStats[]
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

// --- Matching engine ---

const MAX_QTY = 5

function findMatches(
  amount: number,
  variants: VariantFilter[],
  message: string
): TransactionMatch[] | null {
  const msgLower = message.toLowerCase()

  // 1. Code-based: prefer variants whose code appears in the message
  const codeVariants = variants.filter((v) =>
    v.codes.some((c) => msgLower.includes(c.toLowerCase()))
  )
  if (codeVariants.length > 0) {
    const result = solveAmount(amount, codeVariants)
    if (result) return result
  }

  // 2. Try all variants
  return solveAmount(amount, variants)
}

function solveAmount(
  target: number,
  variants: VariantFilter[]
): TransactionMatch[] | null {
  const targetInt = Math.round(target)
  if (targetInt <= 0) return null

  // Fast path: single variant × quantity
  for (const v of variants) {
    const priceInt = Math.round(v.price)
    if (priceInt <= 0) continue
    if (targetInt % priceInt === 0) {
      const qty = targetInt / priceInt
      if (qty >= 1 && qty <= MAX_QTY) {
        return [
          {
            variantId: v.variantId,
            productTitle: v.productTitle,
            variantTitle: v.variantTitle,
            quantity: qty,
            subtotal: targetInt,
          },
        ]
      }
    }
  }

  return null
}

function formatMatchLabel(matches: TransactionMatch[]): string {
  return matches
    .map((m) => {
      const label = m.variantTitle ? `${m.productTitle} (${m.variantTitle})` : m.productTitle
      return `${label} ×${m.quantity}`
    })
    .join(", ")
}

// --- Main ---

export async function filterTransactions(
  buffer: Buffer,
  params: FilterParams
): Promise<{ result: FilterResult; output: Buffer }> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as any)

  const sheetIndex = params.sheet ?? 0
  const sheet = workbook.worksheets[sheetIndex]
  if (!sheet)
    throw new Error(
      `Хуудас [${sheetIndex}] олдсонгүй (нийт ${workbook.worksheets.length} хуудас)`
    )

  if (!params.variants.length)
    throw new Error("Бүтээгдэхүүн сонгоно уу")

  // Build column map: manual or auto-detect
  let dataStartRow: number
  const colMap: Record<string, number> = {}

  function colLetterToNum(letter: string): number {
    return letter.toUpperCase().charCodeAt(0) - 64
  }

  if (params.columns) {
    // Manual column mapping
    for (const [key, letter] of Object.entries(params.columns)) {
      if (letter) colMap[key] = colLetterToNum(letter)
    }
    dataStartRow = params.startRow ?? 1
  } else {
    // Default: A=date, B=amount, C=message, D=account
    colMap.date = 1    // A
    colMap.credit = 2  // B
    colMap.message = 3 // C
    colMap.account = 4 // D
    dataStartRow = params.startRow ?? 1
  }

  // Date filter bounds
  const dateFromMs = params.dateFrom ? new Date(params.dateFrom).getTime() : null
  const dateToMs = params.dateTo
    ? new Date(params.dateTo).getTime() + 86400000 - 1 // end of day
    : null

  function parseDateVal(col: number | undefined, row: ExcelJS.Row): { str: string; ms: number | null } {
    if (!col) return { str: "", ms: null }
    const raw = row.getCell(col).value
    if (raw instanceof Date) {
      return { str: raw.toISOString().slice(0, 10), ms: raw.getTime() }
    }
    const str = String(raw ?? "").trim()
    if (!str) return { str: "", ms: null }
    const t = new Date(str).getTime()
    return { str, ms: isNaN(t) ? null : t }
  }

  // Parse transactions
  const transactions: Transaction[] = []

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < dataStartRow) return

    const getVal = (col: number | undefined) => {
      if (!col) return ""
      return String(row.getCell(col).value ?? "").trim()
    }
    const getNum = (col: number | undefined) => {
      if (!col) return 0
      return parseNumber(row.getCell(col).value)
    }

    // Date filter
    const dateInfo = parseDateVal(colMap.date, row)
    if (dateInfo.ms !== null) {
      if (dateFromMs !== null && dateInfo.ms < dateFromMs) return
      if (dateToMs !== null && dateInfo.ms > dateToMs) return
    }

    const credit = getNum(colMap.credit)
    if (credit <= 0) return

    const message = getVal(colMap.message)
    const phoneMatch = phoneRegex.exec(message)
    const phone = phoneMatch ? phoneMatch[1] : ""

    const matches = findMatches(credit, params.variants, message)
    const hasPhone = phone !== ""
    const hasMatch = matches !== null && matches.length > 0

    let status: TransactionStatus
    if (hasPhone && hasMatch) status = "Зөв"
    else if (!hasPhone && hasMatch) status = "Утас олдсонгүй"
    else if (hasPhone && !hasMatch) status = "Дүн таарахгүй"
    else status = "Бусад"

    transactions.push({
      date: dateInfo.str,
      branch: getVal(colMap.branch),
      amount: credit,
      balance: getVal(colMap.balance),
      message,
      account: getVal(colMap.account),
      phone,
      matches: matches ?? [],
      matchLabel: matches ? formatMatchLabel(matches) : "",
      status,
    })
  })

  // Categorize
  const result: FilterResult = {
    accepted: [],
    badPhone: [],
    badAmount: [],
    noMatch: [],
    total: transactions.length,
    acceptedCount: 0,
    variantStats: [],
  }

  const statsMap = new Map<string, VariantStats>()
  for (const v of params.variants) {
    statsMap.set(v.variantId, {
      variantId: v.variantId,
      productTitle: v.productTitle,
      variantTitle: v.variantTitle,
      price: v.price,
      matchedCount: 0,
      totalQuantity: 0,
      totalRevenue: 0,
    })
  }

  for (const t of transactions) {
    switch (t.status) {
      case "Зөв":
        result.accepted.push(t)
        result.acceptedCount++
        for (const m of t.matches) {
          const s = statsMap.get(m.variantId)
          if (s) {
            s.matchedCount++
            s.totalQuantity += m.quantity
            s.totalRevenue += m.subtotal
          }
        }
        break
      case "Утас олдсонгүй":
        result.badPhone.push(t)
        break
      case "Дүн таарахгүй":
        result.badAmount.push(t)
        break
      default:
        result.noMatch.push(t)
    }
  }

  result.variantStats = Array.from(statsMap.values())

  const output = await generateOutput(result, params)
  return { result, output }
}

// --- Output ---

async function generateOutput(
  result: FilterResult,
  _params: FilterParams
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const headers = [
    "Огноо",
    "Утас",
    "Дүн",
    "Таарсан бүтээгдэхүүн",
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

  function addSheet(name: string, txns: Transaction[], fillColor: string) {
    const ws = wb.addWorksheet(name)
    const hRow = ws.addRow(headers)
    hRow.eachCell((cell) => {
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
        t.matchLabel,
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
    ws.getColumn(4).width = 30
    ws.getColumn(5).width = 40
    ws.getColumn(6).width = 18
    ws.getColumn(7).width = 20
  }

  // "Зөв" sheet — grouped by product/variant
  if (result.accepted.length) {
    const ws = wb.addWorksheet("Зөв")
    const hRow = ws.addRow(headers)
    hRow.eachCell((cell) => {
      cell.fill = headerFill
      cell.font = headerFont
      cell.alignment = { horizontal: "center" }
    })

    const rowFill: ExcelJS.FillPattern = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFC6EFCE" },
    }
    const groupFill: ExcelJS.FillPattern = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    }
    const groupFont: Partial<ExcelJS.Font> = {
      bold: true,
      color: { argb: "FFFFFFFF" },
      size: 11,
    }

    // Group by matchLabel (product combo), sort by label
    const groups = new Map<string, Transaction[]>()
    for (const t of result.accepted) {
      const key = t.matchLabel || "Бусад"
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(t)
    }

    const sortedKeys = Array.from(groups.keys()).sort()
    for (const key of sortedKeys) {
      const txns = groups.get(key)!
      // Group header row
      const labelRow = ws.addRow([`${key}  (${txns.length})`])
      labelRow.eachCell((cell) => {
        cell.fill = groupFill
        cell.font = groupFont
      })
      ws.mergeCells(labelRow.number, 1, labelRow.number, headers.length)

      for (const t of txns) {
        const r = ws.addRow([
          t.date,
          t.phone,
          t.amount,
          t.matchLabel,
          t.message,
          t.status,
          t.account,
        ])
        r.eachCell((cell) => {
          cell.fill = rowFill
        })
      }
    }

    ws.getColumn(1).width = 20
    ws.getColumn(2).width = 12
    ws.getColumn(3).width = 15
    ws.getColumn(4).width = 30
    ws.getColumn(5).width = 40
    ws.getColumn(6).width = 18
    ws.getColumn(7).width = 20
  }

  if (result.badAmount.length)
    addSheet("Дүн таарахгүй", result.badAmount, "FFFFC7CE")
  if (result.badPhone.length)
    addSheet("Утас олдсонгүй", result.badPhone, "FFFFC7CE")
  if (result.noMatch.length) addSheet("Бусад", result.noMatch, "FFD9D9D9")

  // Summary sheet
  const summary = wb.addWorksheet("Нэгтгэл")
  let row = 1
  const write = (col: string, val: string | number, bold = false) => {
    const cell = summary.getCell(`${col}${row}`)
    cell.value = val
    if (bold) cell.font = { bold: true }
  }

  write("A", "Нийт гүйлгээ", true)
  write("B", result.total)
  row++
  write("A", "Зөв", true)
  write("B", result.accepted.length)
  row++
  write("A", "Дүн таарахгүй", true)
  write("B", result.badAmount.length)
  row++
  write("A", "Утас олдсонгүй", true)
  write("B", result.badPhone.length)
  row++
  write("A", "Бусад", true)
  write("B", result.noMatch.length)
  row += 2

  // Per-variant stats table
  write("A", "Бүтээгдэхүүн", true)
  write("B", "Хувилбар", true)
  write("C", "Үнэ", true)
  write("D", "Зөв захиалга", true)
  write("E", "Нийт ширхэг", true)
  write("F", "Нийт орлого", true)
  row++

  for (const s of result.variantStats) {
    write("A", s.productTitle)
    write("B", s.variantTitle)
    write("C", s.price)
    write("D", s.matchedCount)
    write("E", s.totalQuantity)
    write("F", s.totalRevenue)
    row++
  }

  summary.getColumn(1).width = 25
  summary.getColumn(2).width = 20
  summary.getColumn(3).width = 15
  summary.getColumn(4).width = 15
  summary.getColumn(5).width = 15
  summary.getColumn(6).width = 18

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
