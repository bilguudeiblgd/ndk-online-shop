import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { filterTransactions, FilterMode } from "../../../lib/excel-filter"
import multer from "multer"

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

// Wrap multer for use in Medusa route
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

  const price = parseFloat((req.body as any).price)
  if (!price || price <= 0) {
    res.status(400).json({ error: "зөв үнэ оруулна уу" })
    return
  }

  const mode: FilterMode = (req.body as any).mode || "price"
  const code: string = (req.body as any).code || ""

  if (mode === "price_code" && !code) {
    res.status(400).json({ error: "код оруулна уу" })
    return
  }

  const logger = req.scope.resolve("logger")
  logger.info(`[excel] файл: ${file.originalname}, үнэ: ${price}₮, горим: ${mode}`)

  try {
    const { result, output } = await filterTransactions(file.buffer, {
      price,
      mode,
      code,
    })

    logger.info(
      `[excel] нийт: ${result.total}, зөв: ${result.acceptedCount}, дүн буруу: ${result.badAmount.length}, утас байхгүй: ${result.badPhone.length}`
    )

    // JSON summary or file download
    const format = req.query.format as string
    if (format === "json") {
      res.json({
        total: result.total,
        accepted: result.acceptedCount,
        badAmount: result.badAmount.length,
        badCode: result.badCode.length,
        badPhone: result.badPhone.length,
        noMatch: result.noMatch.length,
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
