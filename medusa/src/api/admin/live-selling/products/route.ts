import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { liveStore } from "../../../../lib/live-store"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const products = liveStore.getAllProducts()
  res.json({ products })
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { name, size, color, price, stock } = req.body as {
    name: string
    size: string
    color: string
    price: number
    stock: number
  }

  if (!name || !price || !stock) {
    res.status(400).json({ error: "name, price, stock шаардлагатай" })
    return
  }

  try {
    const product = liveStore.createProduct({ name, size: size || "", color: color || "", price, stock })
    req.scope.resolve("logger").info(`[live] product created: ${product.title} (code: ${product.claimCode})`)
    res.status(201).json({ product })
  } catch (err: any) {
    res.status(409).json({ error: err.message })
  }
}
