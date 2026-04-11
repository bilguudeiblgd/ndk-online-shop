import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, Button, Input, Label, toast } from "@medusajs/ui"
import { useState, useRef } from "react"
import { sdk } from "../../lib/client"

type FilterMode = "price" | "price_code"

interface FilterSummary {
  total: number
  accepted: number
  badAmount: number
  badCode: number
  badPhone: number
  noMatch: number
}

const ExcelFilterPage = () => {
  const [file, setFile] = useState<File | null>(null)
  const [price, setPrice] = useState("")
  const [mode, setMode] = useState<FilterMode>("price")
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<FilterSummary | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFilter() {
    if (!file || !price) return
    if (mode === "price_code" && !code) {
      toast.error("Код оруулна уу")
      return
    }

    setLoading(true)
    setSummary(null)

    const formData = new FormData()
    formData.append("file", file)
    formData.append("price", price)
    formData.append("mode", mode)
    if (mode === "price_code") formData.append("code", code)

    try {
      // Get summary
      const summaryRes = await fetch("/admin/excel-filter?format=json", {
        method: "POST",
        body: formData,
        credentials: "include",
      })
      if (!summaryRes.ok) throw new Error(await summaryRes.text())
      const summaryData = await summaryRes.json()
      setSummary(summaryData)

      // Download file
      const formData2 = new FormData()
      formData2.append("file", file)
      formData2.append("price", price)
      formData2.append("mode", mode)
      if (mode === "price_code") formData2.append("code", code)

      const fileRes = await fetch("/admin/excel-filter", {
        method: "POST",
        body: formData2,
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
    setPrice("")
    setCode("")
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
            {/* Mode toggle */}
            <div>
              <Label className="mb-2 block">Горим</Label>
              <div className="flex gap-2">
                <Button
                  size="small"
                  variant={mode === "price" ? "primary" : "secondary"}
                  onClick={() => setMode("price")}
                >
                  Зөвхөн үнэ
                </Button>
                <Button
                  size="small"
                  variant={mode === "price_code" ? "primary" : "secondary"}
                  onClick={() => setMode("price_code")}
                >
                  Үнэ + Код
                </Button>
              </div>
              <Text size="small" className="text-ui-fg-muted mt-1">
                {mode === "price"
                  ? "Утасны дугаар + дүн таарвал зөв"
                  : "Утасны дугаар + дүн + код бүгд таарвал зөв"}
              </Text>
            </div>

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

            {/* Price */}
            <div>
              <Label className="mb-1.5 block">Бүтээгдэхүүний үнэ (₮)</Label>
              <Input
                type="number"
                placeholder="25000"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>

            {/* Code */}
            {mode === "price_code" && (
              <div>
                <Label className="mb-1.5 block">Код (гүйлгээний утганд агуулагдах)</Label>
                <Input
                  placeholder="Жишээ: LS001"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                onClick={handleFilter}
                disabled={loading || !file || !price || (mode === "price_code" && !code)}
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
          </div>
        </Container>

        {/* Results */}
        {summary && (
          <Container>
            <Text size="small" weight="plus" leading="compact" className="mb-4">Үр дүн</Text>
            <div className={`grid gap-3 ${mode === "price_code" ? "grid-cols-3" : "grid-cols-2"} lg:${mode === "price_code" ? "grid-cols-6" : "grid-cols-4"}`}>
              <StatCard value={summary.total} label="Нийт" />
              <StatCard value={summary.accepted} label="Зөв" color="green" />
              <StatCard value={summary.badAmount} label="Дүн таарахгүй" color="red" />
              {mode === "price_code" && (
                <StatCard value={summary.badCode} label="Код олдсонгүй" color="orange" />
              )}
              <StatCard value={summary.badPhone} label="Утас олдсонгүй" color="orange" />
              {summary.noMatch > 0 && (
                <StatCard value={summary.noMatch} label="Бусад" />
              )}
            </div>
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
