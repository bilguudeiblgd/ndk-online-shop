import { defineMiddlewares } from "@medusajs/framework/http"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/excel-filter",
      method: "POST",
      bodyParser: false,
    },
  ],
})
