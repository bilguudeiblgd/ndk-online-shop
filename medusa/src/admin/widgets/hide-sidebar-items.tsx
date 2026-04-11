import { defineWidgetConfig } from "@medusajs/admin-sdk"

const HideSidebarItems = () => {
  return (
    <style>{`
      /* Hide sidebar items we don't need */
      nav a[href="/app/promotions"],
      nav a[href="/app/price-lists"],
      nav a[href="/app/customers"],
      nav a[href="/app/marketing"],
      nav a[href="/app/gift-cards"] {
        display: none !important;
      }
    `}</style>
  )
}

export const config = defineWidgetConfig({
  zone: "order.list.before",
})

export default HideSidebarItems
