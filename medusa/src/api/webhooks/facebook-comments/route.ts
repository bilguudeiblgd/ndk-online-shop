import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { liveStore } from "../../../lib/live-store"

interface FacebookComment {
  message: string
  from?: { id?: string; name?: string }
  created_time?: string
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const body = req.body as FacebookComment | FacebookComment[]
  const comments = Array.isArray(body) ? body : [body]
  const logger = req.scope.resolve("logger")

  const results: Record<string, unknown>[] = []

  for (const comment of comments) {
    const text = comment.message || ""
    const user = comment.from?.name || comment.from?.id || "facebook_user"

    if (!text) {
      results.push({ status: "skipped", reason: "empty message" })
      continue
    }

    logger.info(`[webhook] ${user}: "${text}"`)

    const { order, error } = liveStore.processComment(text, user)

    if (error) {
      logger.info(`[webhook] skipped: ${error}`)
      results.push({ status: "skipped", reason: error, message: text, user })
    } else if (order) {
      logger.info(`[webhook] ORDER CREATED: ${order.id} from ${user}`)
      results.push({ status: "order_created", order })
    }
  }

  res.json({
    processed: results.length,
    results,
  })
}
