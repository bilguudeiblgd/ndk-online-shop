import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createOrderWorkflow,
  createOrderPaymentCollectionWorkflow,
  markPaymentCollectionAsPaid,
} from "@medusajs/medusa/core-flows"

interface OrderItem {
  variantId: string
  quantity: number
  unitPrice: number
  title: string
}

interface OrderInput {
  phone: string
  date: string
  message: string
  account: string
  amount: number
  items: OrderItem[]
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const logger = req.scope.resolve("logger")
  const { orders } = req.body as { orders: OrderInput[] }

  if (!orders?.length) {
    res.status(400).json({ error: "захиалга байхгүй" })
    return
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code"],
  })
  if (!regions.length) {
    res.status(422).json({ error: "Бүс нутаг (region) тохируулна уу" })
    return
  }
  const region = regions[0]

  const { data: salesChannels } = await query.graph({
    entity: "sales_channel",
    fields: ["id"],
  })
  if (!salesChannels.length) {
    res
      .status(422)
      .json({ error: "Борлуулалтын суваг (sales channel) тохируулна уу" })
    return
  }
  const salesChannel = salesChannels[0]

  logger.info(
    `[excel-orders] ${orders.length} захиалга үүсгэж байна`
  )

  let created = 0
  let failed = 0
  const errors: string[] = []

  for (const order of orders) {
    try {
      // 1. Create the order
      const { result: createdOrder } = await createOrderWorkflow(req.scope).run({
        input: {
          region_id: region.id,
          currency_code: region.currency_code,
          email: `${order.phone}@liveselling.local`,
          sales_channel_id: salesChannel.id,
          items: order.items.map((item) => ({
            variant_id: item.variantId,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            title: item.title,
          })),
          shipping_address: {
            first_name: order.phone,
            last_name: "",
            address_1: "-",
            city: "Улаанбаатар",
            country_code: "mn",
            postal_code: "00000",
            phone: order.phone,
          },
          metadata: {
            bank_date: order.date,
            bank_message: order.message,
            bank_account: order.account,
            bank_amount: order.amount,
            source: "excel-filter",
          },
        } as any,
      })

      // 2. Create payment collection
      const { result: paymentCollections } =
        await createOrderPaymentCollectionWorkflow(req.scope).run({
          input: {
            order_id: createdOrder.id,
            amount: order.amount,
          },
        })

      // 3. Mark as paid (captured)
      await markPaymentCollectionAsPaid(req.scope).run({
        input: {
          payment_collection_id: paymentCollections[0].id,
          order_id: createdOrder.id,
        },
      })

      created++
      logger.info(`[excel-orders] ✓ ${order.phone}`)
    } catch (err: any) {
      failed++
      const msg = `${order.phone}: ${err.message}`
      errors.push(msg)
      logger.error(`[excel-orders] ✗ ${msg}`)
    }
  }

  logger.info(
    `[excel-orders] Дууслаа: ${created} үүссэн, ${failed} алдаатай`
  )

  res.json({ created, failed, errors: errors.slice(0, 20) })
}
