import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, Button, Input, Label, toast } from "@medusajs/ui"
import { useState, useRef } from "react"

type ColumnMode = "auto" | "manual"

const COLUMNS = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"]

const COLUMN_FIELDS = [
  { key: "credit", label: "Кредит / Дүн", required: true },
  { key: "message", label: "Гүйлгээний утга", required: true },
  { key: "account", label: "Харьцсан данс", required: true },
  { key: "date", label: "Огноо", required: false },
  { key: "balance", label: "Эцсийн үлдэгдэл", required: false },
  { key: "branch", label: "Салбар", required: false },
] as const

interface ProductInput {
  name: string
  price: string
  code: string
}

interface ProductStat {
  name: string
  price: number
  matchedCount: number
  totalQuantity: number
  totalRevenue: number
}

interface FilterSummary {
  total: number
  accepted: number
  badAmount: number
  badPhone: number
  noMatch: number
  productStats: ProductStat[]
}

const ExcelFilterPage = () => {
  const [file, setFile] = useState<File | null>(null)
  const [sheet, setSheet] = useState("0")
  const [columnMode, setColumnMode] = useState<ColumnMode>("auto")
  const [colMap, setColMap] = useState<Record<string, string>>({
    credit: "", message: "", account: "", date: "", balance: "", branch: "",
  })
  const [startRow, setStartRow] = useState("1")
  const [products, setProducts] = useState<ProductInput[]>([
    { name: "", price: "", code: "" },
  ])
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<FilterSummary | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function addProduct() {
    setProducts([...products, { name: "", price: "", code: "" }])
  }

  function removeProduct(index: number) {
    setProducts(products.filter((_, i) => i !== index))
  }

  function updateProduct(index: number, field: keyof ProductInput, value: string) {
    setProducts(products.map((p, i) => (i === index ? { ...p, [field]: value } : p)))
  }

  function getValidProducts() {
    return products
      .filter((p) => p.name.trim() && p.price.trim() && parseFloat(p.price) > 0)
      .map((p) => ({
        name: p.name.trim(),
        price: parseFloat(p.price),
        code: p.code.trim() || undefined,
      }))
  }

  function buildFormData() {
    const fd = new FormData()
    fd.append("file", file!)
    fd.append("sheet", sheet)
    fd.append("products", JSON.stringify(getValidProducts()))
    if (columnMode === "manual") {
      for (const [key, val] of Object.entries(colMap)) {
        if (val) fd.append(`col_${key}`, val)
      }
      fd.append("startRow", startRow)
    }
    return fd
  }

  async function handleFilter() {
    if (!file) return

    const valid = getValidProducts()
    if (!valid.length) {
      toast.error("Бүтээгдэхүүн нэмнэ үү (нэр + үнэ)")
      return
    }

    if (columnMode === "manual") {
      const missing = COLUMN_FIELDS
        .filter((f) => f.required && !colMap[f.key])
        .map((f) => f.label)
      if (missing.length) {
        toast.error(`${missing.join(", ")} багана заавал сонгоно уу`)
        return
      }
    }

    setLoading(true)
    setSummary(null)

    try {
      const summaryRes = await fetch("/admin/excel-filter?format=json", {
        method: "POST",
        body: buildFormData(),
        credentials: "include",
      })
      if (!summaryRes.ok) throw new Error(await summaryRes.text())
      const summaryData = await summaryRes.json()
      setSummary(summaryData)

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

  function handleReset() {
    setFile(null)
    setSheet("0")
    setColumnMode("auto")
    setColMap({ credit: "", message: "", account: "", date: "", balance: "", branch: "" })
    setStartRow("1")
    setProducts([{ name: "", price: "", code: "" }])
    setSummary(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Heading level="h1">Гүйлгээ шүүгч</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-1">
          Банкны гүйлгээг бүтээгдэхүүний үнээр шүүх
        </Text>
      </div>

      <div className="max-w-2xl flex flex-col gap-6">
        <Container>
          <div className="flex flex-col gap-5">
            {/* File */}
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

            {/* Sheet index */}
            <div>
              <Label className="mb-1.5 block">Хуудасны дугаар (0-ээс эхэлнэ)</Label>
              <Input
                type="number"
                placeholder="0"
                value={sheet}
                onChange={(e) => setSheet(e.target.value)}
              />
            </div>

            {/* Column mapping mode */}
            <div>
              <Label className="mb-2 block">Баганы тохиргоо</Label>
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
              <Text size="small" className="text-ui-fg-muted mt-1">
                {columnMode === "auto"
                  ? "Толгой мөрөөс автоматаар таних"
                  : "Багана бүрийг гараар сонгох (толгой мөргүй файлд тохиромжтой)"}
              </Text>
            </div>

            {/* Manual column mapping */}
            {columnMode === "manual" && (
              <div className="border border-ui-border-base rounded-lg p-4 flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  {COLUMN_FIELDS.map((f) => (
                    <div key={f.key}>
                      <Label className="mb-1 block text-xs">
                        {f.label}{f.required && " *"}
                      </Label>
                      <select
                        value={colMap[f.key] || ""}
                        onChange={(e) => setColMap((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        className="w-full border border-ui-border-base rounded-lg px-3 py-2 text-sm bg-ui-bg-field"
                      >
                        <option value="">--</option>
                        {COLUMNS.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Мэдээлэл эхлэх мөр (1-ээс эхэлнэ)</Label>
                  <Input
                    type="number"
                    placeholder="1"
                    value={startRow}
                    onChange={(e) => setStartRow(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </Container>

        {/* Products */}
        <Container>
          <div className="flex items-center justify-between mb-4">
            <Text size="small" weight="plus" leading="compact">
              Бүтээгдэхүүн
            </Text>
            <Button size="small" variant="secondary" onClick={addProduct}>
              + Нэмэх
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            {/* Column labels */}
            <div className="grid grid-cols-[1fr_100px_100px_32px] gap-2 px-1">
              <Text size="xsmall" className="text-ui-fg-muted">Нэр *</Text>
              <Text size="xsmall" className="text-ui-fg-muted">Үнэ *</Text>
              <Text size="xsmall" className="text-ui-fg-muted">Код</Text>
              <div />
            </div>

            {products.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_100px_100px_32px] gap-2 items-center">
                <Input
                  size="small"
                  placeholder="Бүтээгдэхүүн"
                  value={p.name}
                  onChange={(e) => updateProduct(i, "name", e.target.value)}
                />
                <Input
                  size="small"
                  type="number"
                  placeholder="₮"
                  value={p.price}
                  onChange={(e) => updateProduct(i, "price", e.target.value)}
                />
                <Input
                  size="small"
                  placeholder="--"
                  value={p.code}
                  onChange={(e) => updateProduct(i, "code", e.target.value)}
                />
                {products.length > 1 ? (
                  <button
                    onClick={() => removeProduct(i)}
                    className="text-ui-fg-muted hover:text-ui-fg-base text-lg leading-none"
                  >
                    x
                  </button>
                ) : <div />}
              </div>
            ))}
          </div>

          <Text size="xsmall" className="text-ui-fg-muted mt-3">
            Код заавал биш. Гүйлгээний утганд код олдвол тухайн бүтээгдэхүүнд эхлээд таарна. 1 гүйлгээнд олон ширхэг (×2, ×3) эсвэл өөр бүтээгдэхүүний хослол бас таарна.
          </Text>
        </Container>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            onClick={handleFilter}
            disabled={loading || !file || !getValidProducts().length}
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

        {/* Results */}
        {summary && (
          <Container>
            <Text size="small" weight="plus" leading="compact" className="mb-4">Үр дүн</Text>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <StatCard value={summary.total} label="Нийт" />
              <StatCard value={summary.accepted} label="Зөв" color="green" />
              <StatCard value={summary.badAmount} label="Дүн таарахгүй" color="red" />
              <StatCard value={summary.badPhone} label="Утас олдсонгүй" color="orange" />
              {summary.noMatch > 0 && (
                <StatCard value={summary.noMatch} label="Бусад" />
              )}
            </div>

            {/* Per-product stats */}
            {summary.productStats && summary.productStats.length > 0 && (
              <div>
                <Text size="xsmall" weight="plus" className="text-ui-fg-muted mb-2">
                  Бүтээгдэхүүн тус бүрийн тоо (зөв захиалга)
                </Text>
                <div className="border border-ui-border-base rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-ui-bg-subtle border-b border-ui-border-base">
                        <th className="text-left px-3 py-2 font-medium">Нэр</th>
                        <th className="text-right px-3 py-2 font-medium">Үнэ</th>
                        <th className="text-right px-3 py-2 font-medium">Захиалга</th>
                        <th className="text-right px-3 py-2 font-medium">Ширхэг</th>
                        <th className="text-right px-3 py-2 font-medium">Орлого</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.productStats.map((s, i) => (
                        <tr key={i} className="border-b border-ui-border-base last:border-0">
                          <td className="px-3 py-2">{s.name}</td>
                          <td className="px-3 py-2 text-right">{s.price.toLocaleString()}₮</td>
                          <td className="px-3 py-2 text-right">{s.matchedCount}</td>
                          <td className="px-3 py-2 text-right">{s.totalQuantity}</td>
                          <td className="px-3 py-2 text-right">{s.totalRevenue.toLocaleString()}₮</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <Text size="small" className="text-ui-fg-muted mt-4">
              Файл автоматаар татагдсан.
            </Text>
          </Container>
        )}
      </div>
    </div>
  )
}

function StatCard({ value, label, color }: { value: number; label: string; color?: string }) {
  const colorClasses = {
    green: "bg-ui-tag-green-bg text-ui-tag-green-text border-ui-tag-green-border",
    red: "bg-ui-tag-red-bg text-ui-tag-red-text border-ui-tag-red-border",
    orange: "bg-ui-tag-orange-bg text-ui-tag-orange-text border-ui-tag-orange-border",
  }
  const cls = color && colorClasses[color as keyof typeof colorClasses]
    ? `border rounded-lg p-3 text-center ${colorClasses[color as keyof typeof colorClasses]}`
    : "border border-ui-border-base rounded-lg p-3 text-center"

  return (
    <div className={cls}>
      <Text size="xlarge" weight="plus">{value}</Text>
      <Text size="xsmall" className="mt-1">{label}</Text>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Гүйлгээ шүүгч",
})

export default ExcelFilterPage
