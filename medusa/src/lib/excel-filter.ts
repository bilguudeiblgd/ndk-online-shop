import ExcelJS from "exceljs"

// Mongolian phone: 8 digits starting with 6, 7, 8, 9
const phoneRegex = /\b([6-9]\d{7})\b/

export type TransactionStatus =
  | "Зөв"
  | "Утас олдсонгүй"
  | "Дүн таарахгүй"
  | "Бусад"

export interface Product {
  name: string
  price: number
  code?: string
}

export interface TransactionMatch {
  product: string
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
  products: Product[]
  sheet?: number
  columns?: ColumnMapping
  startRow?: number
}

export interface ProductStats {
  name: string
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
  productStats: ProductStats[]
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
const MAX_ATTEMPTS = 50000

function findMatches(
  amount: number,
  products: Product[],
  message: string
): TransactionMatch[] | null {
  const msgLower = message.toLowerCase()

  // 1. Code-based: prefer products whose code appears in the message
  const codeProducts = products.filter(
    (p) => p.code && msgLower.includes(p.code.toLowerCase())
  )
  if (codeProducts.length > 0) {
    const result = solveAmount(amount, codeProducts)
    if (result) return result
  }

  // 2. Try all products
  return solveAmount(amount, products)
}

function solveAmount(
  target: number,
  products: Product[]
): TransactionMatch[] | null {
  const targetInt = Math.round(target)
  if (targetInt <= 0) return null

  // Fast path: single product × quantity
  for (const p of products) {
    const priceInt = Math.round(p.price)
    if (priceInt <= 0) continue
    if (targetInt % priceInt === 0) {
      const qty = targetInt / priceInt
      if (qty >= 1 && qty <= MAX_QTY) {
        return [{ product: p.name, quantity: qty, subtotal: targetInt }]
      }
    }
  }

  // Multi-product combination (bounded subset sum)
  if (products.length >= 2) {
    let attempts = 0
    const solve = (
      remaining: number,
      idx: number
    ): TransactionMatch[] | null => {
      if (remaining === 0) return []
      if (remaining < 0 || idx >= products.length) return null
      if (++attempts > MAX_ATTEMPTS) return null

      const priceInt = Math.round(products[idx].price)
      if (priceInt <= 0) return solve(remaining, idx + 1)

      const maxQ = Math.min(MAX_QTY, Math.floor(remaining / priceInt))
      for (let qty = maxQ; qty >= 0; qty--) {
        const sub = priceInt * qty
        const rest = solve(remaining - sub, idx + 1)
        if (rest !== null) {
          return qty > 0
            ? [
                { product: products[idx].name, quantity: qty, subtotal: sub },
                ...rest,
              ]
            : rest
        }
      }
      return null
    }
    const combo = solve(targetInt, 0)
    if (combo && combo.length > 0) return combo
  }

  return null
}

function formatMatchLabel(matches: TransactionMatch[]): string {
  return matches.map((m) => `${m.product} ×${m.quantity}`).join(", ")
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

  if (!params.products.length)
    throw new Error("Бүтээгдэхүүн нэмнэ үү")

  // Build column map: manual or auto-detect
  let dataStartRow: number
  const colMap: Record<string, number> = {}

  function colLetterToNum(letter: string): number {
    return letter.toUpperCase().charCodeAt(0) - 64
  }

  if (params.columns && params.columns.credit) {
    for (const [key, letter] of Object.entries(params.columns)) {
      if (letter) colMap[key] = colLetterToNum(letter)
    }
    dataStartRow = params.startRow ?? 1
  } else {
    let headerRow = -1
    sheet.eachRow((row, rowNumber) => {
      if (headerRow > 0) return
      row.eachCell((cell) => {
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
          if (val.includes("кредит")) colMap.credit = colNumber
          if (val.includes("эцсийн")) colMap.balance = colNumber
          if (val.includes("утга")) colMap.message = colNumber
          if (val.includes("харьцсан")) colMap.account = colNumber
        })
      }
    })

    if (headerRow < 0) {
      throw new Error(
        "Толгой мөр олдсонгүй ('Гүйлгээний огноо' агуулсан мөр). Баганы тохиргоог гараар сонгоно уу."
      )
    }
    dataStartRow = headerRow + 1
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

    const credit = getNum(colMap.credit)
    if (credit <= 0) return

    const message = getVal(colMap.message)
    const phoneMatch = phoneRegex.exec(message)
    const phone = phoneMatch ? phoneMatch[1] : ""

    const matches = findMatches(credit, params.products, message)
    const hasPhone = phone !== ""
    const hasMatch = matches !== null && matches.length > 0

    let status: TransactionStatus
    if (hasPhone && hasMatch) status = "Зөв"
    else if (!hasPhone && hasMatch) status = "Утас олдсонгүй"
    else if (hasPhone && !hasMatch) status = "Дүн таарахгүй"
    else status = "Бусад"

    transactions.push({
      date: getVal(colMap.date),
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
    productStats: [],
  }

  // Per-product stats accumulator
  const statsMap = new Map<string, ProductStats>()
  for (const p of params.products) {
    statsMap.set(p.name, {
      name: p.name,
      price: p.price,
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
        // Update per-product stats from accepted transactions
        for (const m of t.matches) {
          const s = statsMap.get(m.product)
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

  result.productStats = Array.from(statsMap.values())

  const output = await generateOutput(result, params)
  return { result, output }
}

// --- Output ---

async function generateOutput(
  result: FilterResult,
  params: FilterParams
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

  function addSheet(
    name: string,
    txns: Transaction[],
    fillColor: string
  ) {
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

  addSheet("Зөв", result.accepted, "FFC6EFCE")
  if (result.badAmount.length)
    addSheet("Дүн таарахгүй", result.badAmount, "FFFFC7CE")
  if (result.badPhone.length)
    addSheet("Утас олдсонгүй", result.badPhone, "FFFFC7CE")
  if (result.noMatch.length)
    addSheet("Бусад", result.noMatch, "FFD9D9D9")

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

  // Per-product stats table
  write("A", "Бүтээгдэхүүн", true)
  write("B", "Үнэ", true)
  write("C", "Зөв захиалга", true)
  write("D", "Нийт ширхэг", true)
  write("E", "Нийт орлого", true)
  row++

  for (const s of result.productStats) {
    write("A", s.name)
    write("B", s.price)
    write("C", s.matchedCount)
    write("D", s.totalQuantity)
    write("E", s.totalRevenue)
    row++
  }

  summary.getColumn(1).width = 25
  summary.getColumn(2).width = 15
  summary.getColumn(3).width = 15
  summary.getColumn(4).width = 15
  summary.getColumn(5).width = 18

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
