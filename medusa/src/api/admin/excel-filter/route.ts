import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { filterTransactions, ColumnMapping, Product } from "../../../lib/excel-filter"
import multer from "multer"

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

function parseMultipart(req: any, res: any): Promise<void> {
  return new Promise((resolve, reject) => {
    upload.single("file")(req, res, (err: any) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  await parseMultipart(req, res)

  const file = (req as any).file
  if (!file) {
    res.status(400).json({ error: "файл шаардлагатай" })
    return
  }

  const body = req.body as any

  // Parse products
  let products: Product[] = []
  try {
    products = JSON.parse(body.products || "[]")
  } catch {
    res.status(400).json({ error: "бүтээгдэхүүний мэдээлэл буруу" })
    return
  }

  if (!products.length || !products.every((p) => p.name && p.price > 0)) {
    res.status(400).json({ error: "бүтээгдэхүүн нэмнэ үү (нэр + үнэ)" })
    return
  }

  const sheet: number = parseInt(body.sheet ?? "0", 10)

  // Manual column mapping (optional)
  const columns: ColumnMapping | undefined = body.col_credit
    ? {
        date: body.col_date || undefined,
        branch: body.col_branch || undefined,
        credit: body.col_credit || undefined,
        balance: body.col_balance || undefined,
        message: body.col_message || undefined,
        account: body.col_account || undefined,
      }
    : undefined
  const startRow: number | undefined = body.startRow
    ? parseInt(body.startRow, 10)
    : undefined

  const logger = req.scope.resolve("logger")
  logger.info(
    `[excel] файл: ${file.originalname}, бүтээгдэхүүн: ${products.length}, хуудас: ${sheet}`
  )

  try {
    const { result, output } = await filterTransactions(file.buffer, {
      products,
      sheet,
      columns,
      startRow,
    })

    logger.info(
      `[excel] нийт: ${result.total}, зөв: ${result.acceptedCount}, дүн буруу: ${result.badAmount.length}, утас байхгүй: ${result.badPhone.length}`
    )

    const format = req.query.format as string
    if (format === "json") {
      res.json({
        total: result.total,
        accepted: result.acceptedCount,
        badAmount: result.badAmount.length,
        badPhone: result.badPhone.length,
        noMatch: result.noMatch.length,
        productStats: result.productStats,
      })
      return
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="filtered_${file.originalname}"`
    )
    res.send(output)
  } catch (err: any) {
    logger.error(`[excel] алдаа: ${err.message}`)
    res.status(422).json({ error: err.message })
  }
}
