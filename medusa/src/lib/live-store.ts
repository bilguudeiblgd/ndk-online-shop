// In-memory store for live selling session state.
// This is transient data (claim codes, reservations) that doesn't need to persist.

import { randomUUID } from "crypto"

export interface LiveProduct {
  productId: string
  title: string
  size: string
  color: string
  price: number
  claimCode: number
  stock: number
  reserved: number
  status: "LIVE" | "ENDED"
  createdAt: string
}

export interface LiveOrder {
  id: string
  productId: string
  userName: string
  phone: string
  status: "RESERVED" | "PAID" | "EXPIRED"
  createdAt: string
}

class LiveStore {
  private products = new Map<string, LiveProduct>()
  private claimCodes = new Map<number, string>() // code → productId
  private orders = new Map<string, LiveOrder>()

  createProduct(data: {
    name: string
    size: string
    color: string
    price: number
    stock: number
  }): LiveProduct {
    const code = this.generateClaimCode()
    const id = randomUUID()
    const product: LiveProduct = {
      productId: id,
      title: data.name,
      size: data.size,
      color: data.color,
      price: data.price,
      claimCode: code,
      stock: data.stock,
      reserved: 0,
      status: "LIVE",
      createdAt: new Date().toISOString(),
    }
    this.products.set(id, product)
    this.claimCodes.set(code, id)
    return product
  }

  private generateClaimCode(): number {
    if (this.claimCodes.size >= 100) {
      throw new Error("Бүх код ашиглагдсан (100)")
    }
    let code: number
    do {
      code = Math.floor(Math.random() * 100)
    } while (this.claimCodes.has(code))
    return code
  }

  getActiveProducts(): LiveProduct[] {
    return Array.from(this.products.values()).filter(
      (p) => p.status === "LIVE"
    )
  }

  getAllProducts(): LiveProduct[] {
    return Array.from(this.products.values())
  }

  getProduct(id: string): LiveProduct | undefined {
    return this.products.get(id)
  }

  endProduct(id: string): LiveProduct {
    const p = this.products.get(id)
    if (!p) throw new Error("Бүтээгдэхүүн олдсонгүй")
    if (p.status === "ENDED") throw new Error("Аль хэдийн зогссон")
    p.status = "ENDED"
    this.claimCodes.delete(p.claimCode)
    return p
  }

  findByClaimCode(code: number): LiveProduct | undefined {
    const id = this.claimCodes.get(code)
    if (!id) return undefined
    return this.products.get(id)
  }

  reserveStock(
    productId: string,
    userName: string,
    phone: string
  ): LiveOrder {
    const p = this.products.get(productId)
    if (!p) throw new Error("Бүтээгдэхүүн олдсонгүй")
    if (p.status !== "LIVE") throw new Error("Бүтээгдэхүүн шууд биш")
    if (p.stock - p.reserved <= 0) throw new Error("Дууссан")

    p.reserved++

    const order: LiveOrder = {
      id: randomUUID(),
      productId,
      userName,
      phone,
      status: "RESERVED",
      createdAt: new Date().toISOString(),
    }
    this.orders.set(order.id, order)
    return order
  }

  getOrders(): LiveOrder[] {
    return Array.from(this.orders.values())
  }

  processComment(
    text: string,
    user: string
  ): { order?: LiveOrder; error?: string } {
    const match = /^(\d{1,2})\s+(\d+)/.exec(text)
    if (!match) {
      return { error: "comment does not match claim format" }
    }

    const code = parseInt(match[1])
    const phone = match[2]

    const product = this.findByClaimCode(code)
    if (!product) {
      return { error: `no active product with claim code ${code}` }
    }

    try {
      const order = this.reserveStock(product.productId, user, phone)
      return { order }
    } catch (err: any) {
      return { error: err.message }
    }
  }
}

// Singleton
export const liveStore = new LiveStore()
