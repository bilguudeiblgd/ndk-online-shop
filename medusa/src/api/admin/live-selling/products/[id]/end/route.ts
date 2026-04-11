import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { liveStore } from "../../../../../../lib/live-store"

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const id = req.params.id

  try {
    const product = liveStore.endProduct(id)
    req.scope.resolve("logger").info(`[live] product ended: ${product.title}`)
    res.json({ product })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}
