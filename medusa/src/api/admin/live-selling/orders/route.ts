import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { liveStore } from "../../../../lib/live-store"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const orders = liveStore.getOrders()
  res.json({ orders })
}
