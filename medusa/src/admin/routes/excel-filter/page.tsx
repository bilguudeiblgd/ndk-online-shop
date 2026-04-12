import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Container,
  Heading,
  Text,
  Button,
  Input,
  Label,
  toast,
} from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useState, useRef } from "react"
import { sdk } from "../../lib/client"

// --- Types ---

type ColumnMode = "auto" | "manual"

const COLUMNS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")

const COLUMN_FIELDS = [
  { key: "credit", label: "Кредит / Дүн", required: true },
  { key: "message", label: "Гүйлгээний утга", required: true },
  { key: "account", label: "Харьцсан данс", required: true },
  { key: "date", label: "Огноо", required: false },
  { key: "balance", label: "Эцсийн үлдэгдэл", required: false },
  { key: "branch", label: "Салбар", required: false },
] as const

interface MedusaPrice {
  amount: number
  currency_code: string
}

interface MedusaVariant {
  id: string
  title: string
  sku: string | null
  prices: MedusaPrice[]
}

interface MedusaProduct {
  id: string
  title: string
  thumbnail: string | null
  variants: MedusaVariant[]
}

interface VariantStat {
  variantId: string
  productTitle: string
  variantTitle: string
  price: number
  matchedCount: number
  totalQuantity: number
  totalRevenue: number
}

interface TransactionMatch {
  variantId: string
  productTitle: string
  variantTitle: string
  quantity: number
  subtotal: number
}

interface AcceptedTransaction {
  phone: string
  amount: number
  date: string
  message: string
  account: string
  matches: TransactionMatch[]
  matchLabel: string
}

interface FilterSummary {
  total: number
  acceptedCount: number
  accepted: AcceptedTransaction[]
  badAmountCount: number
  badPhoneCount: number
  noMatchCount: number
  variantStats: VariantStat[]
}

// --- Helpers ---

function getVariantPrice(v: MedusaVariant): number {
  const mnt = v.prices?.find((p) => p.currency_code === "mnt")
  if (mnt) return mnt.amount
  const krw = v.prices?.find((p) => p.currency_code === "krw")
  if (krw) return krw.amount
  return v.prices?.[0]?.amount ?? 0
}

// --- Component ---

const ExcelFilterPage = () => {
  // File settings
  const [file, setFile] = useState<File | null>(null)
  const [sheet, setSheet] = useState("0")
  const [columnMode, setColumnMode] = useState<ColumnMode>("auto")
  const [colMap, setColMap] = useState<Record<string, string>>({
    date: "A", credit: "B", message: "C", account: "D", balance: "", branch: "",
  })
  const [startRow, setStartRow] = useState("1")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  // Product search
  const [searchTerm, setSearchTerm] = useState("")
  const [showSearch, setShowSearch] = useState(false)

  // Selected products and variant codes
  const [selectedProducts, setSelectedProducts] = useState<MedusaProduct[]>([])
  const [variantCodes, setVariantCodes] = useState<Record<string, string[]>>({})

  // Filter state
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<FilterSummary | null>(null)

  // Order creation state
  const [creatingOrders, setCreatingOrders] = useState(false)
  const [orderResult, setOrderResult] = useState<{
    created: number
    failed: number
    errors: string[]
  } | null>(null)

  // --- Product search query ---
  const { data: searchResults } = useQuery({
    queryKey: ["product-search", searchTerm],
    queryFn: async () => {
      const res = await sdk.client.fetch<{
        products: MedusaProduct[]
      }>(`/admin/products?q=${encodeURIComponent(searchTerm)}&limit=10&fields=*variants,*variants.prices`)
      return res.products
    },
    enabled: searchTerm.length >= 1 && showSearch,
  })

  // --- Product selection ---
  function selectProduct(product: MedusaProduct) {
    if (selectedProducts.some((p) => p.id === product.id)) return
    setSelectedProducts([...selectedProducts, product])

    // Auto-populate codes from variant title parts and SKU
    const newCodes = { ...variantCodes }
    for (const v of product.variants || []) {
      const autoCodes: string[] = []
      if (v.title) {
        // "40 / Black" → ["40", "Black"]
        const parts = v.title.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean)
        autoCodes.push(...parts)
      }
      if (v.sku) {
        autoCodes.push(v.sku)
      }
      // Deduplicate
      newCodes[v.id] = [...new Set(autoCodes)]
    }
    setVariantCodes(newCodes)

    setShowSearch(false)
    setSearchTerm("")
  }

  function removeProduct(productId: string) {
    setSelectedProducts(selectedProducts.filter((p) => p.id !== productId))
    // Clean up codes for removed variants
    const product = selectedProducts.find((p) => p.id === productId)
    if (product) {
      const newCodes = { ...variantCodes }
      for (const v of product.variants) {
        delete newCodes[v.id]
      }
      setVariantCodes(newCodes)
    }
  }

  // --- Variant codes ---
  function addCode(variantId: string, code: string) {
    const trimmed = code.trim()
    if (!trimmed) return
    const existing = variantCodes[variantId] || []
    if (existing.includes(trimmed)) return
    setVariantCodes({ ...variantCodes, [variantId]: [...existing, trimmed] })
  }

  function removeCode(variantId: string, code: string) {
    const existing = variantCodes[variantId] || []
    setVariantCodes({
      ...variantCodes,
      [variantId]: existing.filter((c) => c !== code),
    })
  }

  // --- Build variant filters for API ---
  function getVariantFilters() {
    return selectedProducts.flatMap((p) =>
      p.variants.map((v) => ({
        variantId: v.id,
        productTitle: p.title,
        variantTitle: v.title || "",
        price: getVariantPrice(v),
        codes: variantCodes[v.id] || [],
      }))
    )
  }

  // --- Form data ---
  function buildFormData() {
    const fd = new FormData()
    fd.append("file", file!)
    fd.append("sheet", sheet)
    fd.append("variants", JSON.stringify(getVariantFilters()))
    if (dateFrom) fd.append("dateFrom", dateFrom)
    if (dateTo) fd.append("dateTo", dateTo)
    if (columnMode === "manual") {
      for (const [key, val] of Object.entries(colMap)) {
        if (val) fd.append(`col_${key}`, val)
      }
      fd.append("startRow", startRow)
    }
    return fd
  }

  // --- Filter ---
  async function handleFilter() {
    if (!file) return

    const filters = getVariantFilters()
    if (!filters.length || !filters.some((v) => v.price > 0)) {
      toast.error("Бүтээгдэхүүн сонгоно уу (үнэтэй)")
      return
    }

    if (columnMode === "manual") {
      const missing = COLUMN_FIELDS.filter(
        (f) => f.required && !colMap[f.key]
      ).map((f) => f.label)
      if (missing.length) {
        toast.error(`${missing.join(", ")} багана заавал сонгоно уу`)
        return
      }
    }

    setLoading(true)
    setSummary(null)
    setOrderResult(null)

    try {
      // Get JSON summary with full accepted list
      const summaryRes = await fetch("/admin/excel-filter?format=json", {
        method: "POST",
        body: buildFormData(),
        credentials: "include",
      })
      if (!summaryRes.ok) throw new Error(await summaryRes.text())
      const summaryData: FilterSummary = await summaryRes.json()
      setSummary(summaryData)

      // Download filtered file
      const fileRes = await fetch("/admin/excel-filter", {
        method: "POST",
        body: buildFormData(),
        credentials: "include",
      })
      if (!fileRes.ok) throw new Error(await fileRes.text())

      const blob = await fileRes.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `шүүсэн_${file.name}`
      a.click()
      window.URL.revokeObjectURL(url)

      toast.success("Файл амжилттай шүүгдлээ")
    } catch (err: any) {
      toast.error(err.message || "Алдаа гарлаа")
    } finally {
      setLoading(false)
    }
  }

  // --- Create orders ---
  async function handleCreateOrders() {
    if (!summary?.accepted.length) return

    setCreatingOrders(true)
    setOrderResult(null)

    try {
      // Build order inputs from accepted transactions
      const orders = summary.accepted.map((t) => ({
        phone: t.phone,
        date: t.date,
        message: t.message,
        account: t.account,
        amount: t.amount,
        items: t.matches.map((m) => ({
          variantId: m.variantId,
          quantity: m.quantity,
          unitPrice: m.subtotal / m.quantity,
          title: m.variantTitle
            ? `${m.productTitle} - ${m.variantTitle}`
            : m.productTitle,
        })),
      }))

      const res = await sdk.client.fetch<{
        created: number
        failed: number
        errors: string[]
      }>("/admin/excel-filter/orders", {
        method: "POST",
        body: { orders },
      })

      setOrderResult(res)

      if (res.created > 0) {
        toast.success(`${res.created} захиалга амжилттай үүслээ`)
      }
      if (res.failed > 0) {
        toast.error(`${res.failed} захиалга үүсгэж чадсангүй`)
      }
    } catch (err: any) {
      toast.error(err.message || "Захиалга үүсгэхэд алдаа гарлаа")
    } finally {
      setCreatingOrders(false)
    }
  }

  // --- Reset ---
  function handleReset() {
    setFile(null)
    setSheet("0")
    setColumnMode("auto")
    setColMap({
      date: "A", credit: "B", message: "C", account: "D", balance: "", branch: "",
    })
    setStartRow("1")
    setDateFrom("")
    setDateTo("")
    setSummary(null)
    setOrderResult(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  // --- Render ---
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Heading level="h1">Гүйлгээ шүүгч</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          Банкны гүйлгээг бүтээгдэхүүнтэй тулгаж, захиалга үүсгэх
        </Text>
      </div>

      <div className="max-w-3xl flex flex-col gap-6">
        {/* ===== File Settings ===== */}
        <Container>
          <Text size="small" weight="plus" leading="compact" className="mb-4">
            Файлын тохиргоо
          </Text>
          <div className="flex flex-col gap-4">
            <div>
              <Label className="mb-1.5 block">Гүйлгээний файл (XLSX)</Label>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full border border-ui-border-base rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block">Хуудас (0-ээс)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={sheet}
                  onChange={(e) => setSheet(e.target.value)}
                />
              </div>
              <div>
                <Label className="mb-1.5 block">Баганы тохиргоо</Label>
                <div className="flex gap-2">
                  <Button
                    size="small"
                    variant={columnMode === "auto" ? "primary" : "secondary"}
                    onClick={() => setColumnMode("auto")}
                  >
                    Автомат
                  </Button>
                  <Button
                    size="small"
                    variant={columnMode === "manual" ? "primary" : "secondary"}
                    onClick={() => setColumnMode("manual")}
                  >
                    Гараар
                  </Button>
                </div>
                <Text size="xsmall" className="text-ui-fg-muted mt-1">
                  {columnMode === "auto"
                    ? "A=Огноо, B=Дүн, C=Утга, D=Данс"
                    : "Багана бүрийг гараар сонгох"}
                </Text>
              </div>
            </div>

            {columnMode === "manual" && (
              <div className="border border-ui-border-base rounded-lg p-4 flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  {COLUMN_FIELDS.map((f) => (
                    <div key={f.key}>
                      <Label className="mb-1 block text-xs">
                        {f.label}
                        {f.required && " *"}
                      </Label>
                      <select
                        value={colMap[f.key] || ""}
                        onChange={(e) =>
                          setColMap((prev) => ({
                            ...prev,
                            [f.key]: e.target.value,
                          }))
                        }
                        className="w-full border border-ui-border-base rounded-lg px-3 py-2 text-sm bg-ui-bg-field"
                      >
                        <option value="">--</option>
                        {COLUMNS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <div>
                  <Label className="mb-1 block text-xs">
                    Мэдээлэл эхлэх мөр (1-ээс)
                  </Label>
                  <Input
                    type="number"
                    placeholder="1"
                    value={startRow}
                    onChange={(e) => setStartRow(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Date filter */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block">Огноо (эхлэх)</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <Label className="mb-1.5 block">Огноо (дуусах)</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>
          </div>
        </Container>

        {/* ===== Product Selection ===== */}
        <Container>
          <Text size="small" weight="plus" leading="compact" className="mb-4">
            Бүтээгдэхүүн сонгох
          </Text>

          {/* Search */}
          <div className="relative mb-4">
            <Input
              placeholder="Бүтээгдэхүүн хайх..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setShowSearch(true)
              }}
              onFocus={() => setShowSearch(true)}
            />
            {showSearch && searchResults && searchResults.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-ui-bg-base border border-ui-border-base rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {searchResults
                  .filter(
                    (p) => !selectedProducts.some((sp) => sp.id === p.id)
                  )
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => selectProduct(p)}
                      className="w-full text-left px-4 py-3 hover:bg-ui-bg-subtle border-b border-ui-border-base last:border-0 flex items-center gap-3"
                    >
                      {p.thumbnail && (
                        <img
                          src={p.thumbnail}
                          alt=""
                          className="w-8 h-8 rounded object-cover"
                        />
                      )}
                      <div>
                        <Text size="small" weight="plus">
                          {p.title}
                        </Text>
                        <Text size="xsmall" className="text-ui-fg-muted">
                          {p.variants?.length || 0} хувилбар
                        </Text>
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Selected products with variants */}
          {selectedProducts.length === 0 && (
            <Text size="small" className="text-ui-fg-muted">
              Бүтээгдэхүүн хайж нэмнэ үү
            </Text>
          )}

          <div className="flex flex-col gap-4">
            {selectedProducts.map((product) => (
              <div
                key={product.id}
                className="border border-ui-border-base rounded-lg overflow-hidden"
              >
                {/* Product header */}
                <div className="flex items-center justify-between px-4 py-3 bg-ui-bg-subtle border-b border-ui-border-base">
                  <div className="flex items-center gap-3">
                    {product.thumbnail && (
                      <img
                        src={product.thumbnail}
                        alt=""
                        className="w-8 h-8 rounded object-cover"
                      />
                    )}
                    <Text size="small" weight="plus">
                      {product.title}
                    </Text>
                  </div>
                  <button
                    onClick={() => removeProduct(product.id)}
                    className="text-ui-fg-muted hover:text-ui-fg-base text-sm"
                  >
                    Хасах
                  </button>
                </div>

                {/* Variants */}
                <div className="divide-y divide-ui-border-base">
                  {product.variants?.map((variant) => (
                    <div key={variant.id} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <Text size="small">
                            {variant.title || "Үндсэн"}
                            {variant.sku && (
                              <span className="text-ui-fg-muted ml-2">
                                SKU: {variant.sku}
                              </span>
                            )}
                          </Text>
                        </div>
                        <Text size="small" weight="plus">
                          {getVariantPrice(variant).toLocaleString()}₮
                        </Text>
                      </div>

                      {/* Code tags */}
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {(variantCodes[variant.id] || []).map((code) => (
                          <span
                            key={code}
                            className="inline-flex items-center gap-1 bg-ui-bg-subtle border border-ui-border-base rounded px-2 py-0.5 text-xs"
                          >
                            {code}
                            <button
                              onClick={() => removeCode(variant.id, code)}
                              className="text-ui-fg-muted hover:text-ui-fg-base"
                            >
                              x
                            </button>
                          </span>
                        ))}
                        <CodeInput
                          onAdd={(code) => addCode(variant.id, code)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {selectedProducts.length > 0 && (
            <Text size="xsmall" className="text-ui-fg-muted mt-3">
              Хувилбар бүрд код нэмж болно (кирилл, латин аль ч). Гүйлгээний
              утганд код олдвол тухайн хувилбарт эхлээд таарна.
            </Text>
          )}
        </Container>

        {/* ===== Actions ===== */}
        <div className="flex gap-3">
          <Button
            onClick={handleFilter}
            disabled={loading || !file || !selectedProducts.length}
            isLoading={loading}
          >
            Шүүх
          </Button>
          {summary && (
            <Button variant="secondary" onClick={handleReset}>
              Цэвэрлэх
            </Button>
          )}
        </div>

        {/* ===== Results ===== */}
        {summary && (
          <Container>
            <Text
              size="small"
              weight="plus"
              leading="compact"
              className="mb-4"
            >
              Үр дүн
            </Text>

            {/* Stats cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <StatCard value={summary.total} label="Нийт" />
              <StatCard
                value={summary.acceptedCount}
                label="Зөв"
                color="green"
              />
              <StatCard
                value={summary.badAmountCount}
                label="Дүн таарахгүй"
                color="red"
              />
              <StatCard
                value={summary.badPhoneCount}
                label="Утас олдсонгүй"
                color="orange"
              />
              {summary.noMatchCount > 0 && (
                <StatCard value={summary.noMatchCount} label="Бусад" />
              )}
            </div>

            {/* Per-variant stats */}
            {summary.variantStats?.length > 0 && (
              <div className="mb-6">
                <Text
                  size="xsmall"
                  weight="plus"
                  className="text-ui-fg-muted mb-2"
                >
                  Хувилбар тус бүр (зөв захиалга)
                </Text>
                <div className="border border-ui-border-base rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-ui-bg-subtle border-b border-ui-border-base">
                        <th className="text-left px-3 py-2 font-medium">
                          Бүтээгдэхүүн
                        </th>
                        <th className="text-left px-3 py-2 font-medium">
                          Хувилбар
                        </th>
                        <th className="text-right px-3 py-2 font-medium">
                          Үнэ
                        </th>
                        <th className="text-right px-3 py-2 font-medium">
                          Захиалга
                        </th>
                        <th className="text-right px-3 py-2 font-medium">
                          Ширхэг
                        </th>
                        <th className="text-right px-3 py-2 font-medium">
                          Орлого
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.variantStats
                        .filter((s) => s.totalQuantity > 0)
                        .map((s) => (
                          <tr
                            key={s.variantId}
                            className="border-b border-ui-border-base last:border-0"
                          >
                            <td className="px-3 py-2">{s.productTitle}</td>
                            <td className="px-3 py-2">
                              {s.variantTitle || "-"}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {s.price.toLocaleString()}₮
                            </td>
                            <td className="px-3 py-2 text-right">
                              {s.matchedCount}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {s.totalQuantity}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {s.totalRevenue.toLocaleString()}₮
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <Button
              variant="secondary"
              size="small"
              onClick={async () => {
                try {
                  const res = await fetch("/admin/excel-filter", {
                    method: "POST",
                    body: buildFormData(),
                    credentials: "include",
                  })
                  if (!res.ok) throw new Error("Татаж чадсангүй")
                  const blob = await res.blob()
                  const url = window.URL.createObjectURL(blob)
                  const a = document.createElement("a")
                  a.href = url
                  a.download = `шүүсэн_${file?.name || "result.xlsx"}`
                  a.click()
                  window.URL.revokeObjectURL(url)
                } catch (err: any) {
                  toast.error(err.message)
                }
              }}
            >
              Excel татах
            </Button>
          </Container>
        )}

        {/* ===== Order Creation ===== */}
        {summary && summary.acceptedCount > 0 && (
          <Container>
            <div className="flex items-center justify-between mb-4">
              <div>
                <Text size="small" weight="plus" leading="compact">
                  Захиалга үүсгэх
                </Text>
                <Text size="xsmall" className="text-ui-fg-muted mt-1">
                  {summary.acceptedCount} зөв гүйлгээнээс захиалга үүсгэх
                </Text>
              </div>
              <Button
                onClick={handleCreateOrders}
                disabled={creatingOrders || orderResult !== null}
                isLoading={creatingOrders}
                variant="primary"
              >
                {orderResult
                  ? `${orderResult.created} үүссэн`
                  : `${summary.acceptedCount} захиалга үүсгэх`}
              </Button>
            </div>

            {orderResult && (
              <div className="flex flex-col gap-2">
                <div className="flex gap-3">
                  {orderResult.created > 0 && (
                    <Text size="small" className="text-ui-tag-green-text">
                      {orderResult.created} амжилттай
                    </Text>
                  )}
                  {orderResult.failed > 0 && (
                    <Text size="small" className="text-ui-tag-red-text">
                      {orderResult.failed} алдаатай
                    </Text>
                  )}
                </div>
                {orderResult.errors.length > 0 && (
                  <div className="bg-ui-bg-subtle rounded-lg p-3 max-h-40 overflow-y-auto">
                    {orderResult.errors.map((e, i) => (
                      <Text
                        key={i}
                        size="xsmall"
                        className="text-ui-fg-muted"
                      >
                        {e}
                      </Text>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Preview of accepted transactions */}
            {!orderResult && summary.accepted.length > 0 && (
              <div className="border border-ui-border-base rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-ui-bg-subtle border-b border-ui-border-base sticky top-0">
                      <th className="text-left px-3 py-2 font-medium">Огноо</th>
                      <th className="text-left px-3 py-2 font-medium">Утас</th>
                      <th className="text-right px-3 py-2 font-medium">Дүн</th>
                      <th className="text-left px-3 py-2 font-medium">Данс</th>
                      <th className="text-left px-3 py-2 font-medium">Утга</th>
                      <th className="text-left px-3 py-2 font-medium">Таарсан</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.accepted.slice(0, 50).map((t, i) => (
                      <tr
                        key={i}
                        className="border-b border-ui-border-base last:border-0"
                      >
                        <td className="px-3 py-1.5 whitespace-nowrap">{t.date}</td>
                        <td className="px-3 py-1.5">{t.phone}</td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">
                          {t.amount.toLocaleString()}₮
                        </td>
                        <td className="px-3 py-1.5">{t.account}</td>
                        <td className="px-3 py-1.5 max-w-[200px] truncate" title={t.message}>{t.message}</td>
                        <td className="px-3 py-1.5">{t.matchLabel}</td>
                      </tr>
                    ))}
                    {summary.accepted.length > 50 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-3 py-2 text-center text-ui-fg-muted"
                        >
                          ... {summary.accepted.length - 50} илүү
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Container>
        )}
      </div>
    </div>
  )
}

// --- Sub-components ---

function CodeInput({ onAdd }: { onAdd: (code: string) => void }) {
  const [value, setValue] = useState("")

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && value.trim()) {
      e.preventDefault()
      onAdd(value.trim())
      setValue("")
    }
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => {
        if (value.trim()) {
          onAdd(value.trim())
          setValue("")
        }
      }}
      placeholder="+ код"
      className="border border-dashed border-ui-border-base rounded px-2 py-0.5 text-xs w-20 focus:w-32 transition-all outline-none focus:border-ui-border-interactive"
    />
  )
}

function StatCard({
  value,
  label,
  color,
}: {
  value: number
  label: string
  color?: string
}) {
  const colorClasses = {
    green:
      "bg-ui-tag-green-bg text-ui-tag-green-text border-ui-tag-green-border",
    red: "bg-ui-tag-red-bg text-ui-tag-red-text border-ui-tag-red-border",
    orange:
      "bg-ui-tag-orange-bg text-ui-tag-orange-text border-ui-tag-orange-border",
  }
  const cls =
    color && colorClasses[color as keyof typeof colorClasses]
      ? `border rounded-lg p-3 text-center ${colorClasses[color as keyof typeof colorClasses]}`
      : "border border-ui-border-base rounded-lg p-3 text-center"

  return (
    <div className={cls}>
      <Text size="xlarge" weight="plus">
        {value}
      </Text>
      <Text size="xsmall" className="mt-1">
        {label}
      </Text>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Гүйлгээ шүүгч",
})

export default ExcelFilterPage
