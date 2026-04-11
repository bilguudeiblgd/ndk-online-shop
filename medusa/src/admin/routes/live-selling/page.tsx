import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, Button, Input, Badge, toast } from "@medusajs/ui"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, useEffect } from "react"
import { sdk } from "../../lib/client"

interface LiveProduct {
  productId: string
  title: string
  claimCode: number
  stock: number
  reserved: number
  status: "LIVE" | "ENDED"
}

interface LiveOrder {
  id: string
  productId: string
  userName: string
  phone: string
  status: string
  createdAt: string
}

const LiveSellingPage = () => {
  const queryClient = useQueryClient()
  const [liveProducts, setLiveProducts] = useState<LiveProduct[]>([])
  const [orders, setOrders] = useState<LiveOrder[]>([])

  // Form state
  const [name, setName] = useState("")
  const [size, setSize] = useState("")
  const [color, setColor] = useState("")
  const [price, setPrice] = useState("")
  const [stock, setStock] = useState("")

  // Fetch live products from our custom endpoint
  const { data: liveData } = useQuery({
    queryKey: ["live-products"],
    queryFn: () => sdk.client.fetch<{ products: LiveProduct[] }>("/admin/live-selling/products"),
    refetchInterval: 5000,
  })

  const { data: ordersData } = useQuery({
    queryKey: ["live-orders"],
    queryFn: () => sdk.client.fetch<{ orders: LiveOrder[] }>("/admin/live-selling/orders"),
    refetchInterval: 5000,
  })

  useEffect(() => {
    if (liveData?.products) setLiveProducts(liveData.products)
  }, [liveData])

  useEffect(() => {
    if (ordersData?.orders) setOrders(ordersData.orders)
  }, [ordersData])

  // Create live product
  const createLive = useMutation({
    mutationFn: (data: { name: string; size: string; color: string; price: number; stock: number }) =>
      sdk.client.fetch("/admin/live-selling/products", {
        method: "POST",
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["live-products"] })
      toast.success("Бүтээгдэхүүн шууд эхэллээ")
      setName("")
      setSize("")
      setColor("")
      setPrice("")
      setStock("")
    },
    onError: (err: Error) => {
      toast.error(err.message || "Алдаа гарлаа")
    },
  })

  const endProduct = useMutation({
    mutationFn: (productId: string) =>
      sdk.client.fetch(`/admin/live-selling/products/${productId}/end`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["live-products"] })
      toast.success("Бүтээгдэхүүн зогссон")
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    createLive.mutate({
      name,
      size,
      color,
      price: parseFloat(price),
      stock: parseInt(stock),
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Heading level="h1">Шууд худалдаа</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Бүтээгдэхүүн нэмэх, захиалга хянах
          </Text>
        </div>
        <Badge color="red" className="animate-pulse">ШУУД</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Form + Active Products */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Create Form */}
          <Container>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Text size="small" weight="plus" leading="compact">Бүтээгдэхүүн нэмэх</Text>
              <Input
                placeholder="Бүтээгдэхүүний нэр"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Размер" value={size} onChange={(e) => setSize(e.target.value)} />
                <Input placeholder="Өнгө" value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="number"
                  placeholder="Үнэ (₮)"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
                <Input
                  type="number"
                  placeholder="Тоо ширхэг"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                isLoading={createLive.isPending}
                disabled={createLive.isPending}
              >
                Шууд эхлүүлэх
              </Button>
            </form>
          </Container>

          {/* Active Products */}
          <div>
            <Text size="small" weight="plus" leading="compact" className="text-ui-fg-subtle mb-3">
              Идэвхтэй бүтээгдэхүүн
            </Text>
            {liveProducts.length === 0 ? (
              <Container>
                <Text size="small" className="text-ui-fg-subtle text-center py-4">
                  Идэвхтэй бүтээгдэхүүн байхгүй
                </Text>
              </Container>
            ) : (
              <div className="flex flex-col gap-3">
                {liveProducts.filter(p => p.status === "LIVE").map((p) => {
                  const remaining = p.stock - p.reserved
                  const soldOut = remaining <= 0
                  const pct = Math.max(0, (remaining / p.stock) * 100)
                  return (
                    <Container key={p.productId}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Text size="small" weight="plus">{p.title}</Text>
                            {soldOut && <Badge color="red">ДУУССАН</Badge>}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <Text size="small" className="text-ui-fg-subtle">
                              {remaining} / {p.stock} үлдсэн
                            </Text>
                            <Text size="small" className="text-ui-fg-muted">
                              ({p.reserved} захиалсан)
                            </Text>
                          </div>
                          {/* Stock bar */}
                          <div className="mt-2 w-full bg-ui-bg-switch-off rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full transition-all ${
                                soldOut ? "bg-ui-tag-red-icon" : pct < 30 ? "bg-ui-tag-orange-icon" : "bg-ui-tag-green-icon"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <div className="ml-4 text-center">
                          <Text size="small" className="text-ui-fg-muted">Код</Text>
                          <Text size="xlarge" weight="plus" className="tabular-nums">
                            {String(p.claimCode).padStart(2, "0")}
                          </Text>
                        </div>
                      </div>
                      <Button
                        size="small"
                        variant="secondary"
                        className="mt-3"
                        onClick={() => endProduct.mutate(p.productId)}
                        disabled={endProduct.isPending}
                      >
                        Зогсоох
                      </Button>
                    </Container>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Orders */}
        <div>
          <Text size="small" weight="plus" leading="compact" className="text-ui-fg-subtle mb-3">
            Захиалгууд ({orders.length})
          </Text>
          <Container className="!p-0">
            {orders.length === 0 ? (
              <div className="p-4 text-center">
                <Text size="small" className="text-ui-fg-subtle">Захиалга байхгүй</Text>
              </div>
            ) : (
              <div className="divide-y divide-ui-border-base max-h-[600px] overflow-y-auto">
                {[...orders].sort((a, b) =>
                  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                ).map((o) => (
                  <div key={o.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <Text size="small" weight="plus">{o.userName || "Хэрэглэгч"}</Text>
                      <Badge color={o.status === "RESERVED" ? "orange" : o.status === "PAID" ? "green" : "grey"} size="small">
                        {o.status === "RESERVED" ? "Захиалсан" : o.status === "PAID" ? "Төлсөн" : "Дууссан"}
                      </Badge>
                    </div>
                    <Text size="small" className="text-ui-fg-subtle mt-0.5 font-mono">{o.phone}</Text>
                  </div>
                ))}
              </div>
            )}
          </Container>
        </div>
      </div>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Шууд худалдаа",
  icon: undefined,
})

export default LiveSellingPage
