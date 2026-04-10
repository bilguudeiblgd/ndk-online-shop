"use client";

import { useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type FilterMode = "price" | "price_code";

interface FilterSummary {
  total: number;
  accepted: number;
  badAmount: number;
  badCode: number;
  badPhone: number;
  noMatch: number;
}

export default function ExcelFilter() {
  const [file, setFile] = useState<File | null>(null);
  const [price, setPrice] = useState("");
  const [mode, setMode] = useState<FilterMode>("price");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<FilterSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function buildFormData() {
    const fd = new FormData();
    fd.append("file", file!);
    fd.append("price", price);
    fd.append("mode", mode);
    if (mode === "price_code") fd.append("code", code);
    return fd;
  }

  async function handleFilter() {
    if (!file || !price) return;
    if (mode === "price_code" && !code) {
      setError("Код оруулна уу");
      return;
    }
    setError("");
    setLoading(true);
    setSummary(null);

    try {
      // Summary
      const summaryRes = await fetch(`${API}/excel/filter?format=json`, {
        method: "POST",
        body: buildFormData(),
      });
      if (!summaryRes.ok) throw new Error(await summaryRes.text());
      setSummary(await summaryRes.json());

      // Download
      const fileRes = await fetch(`${API}/excel/filter`, {
        method: "POST",
        body: buildFormData(),
      });
      if (!fileRes.ok) throw new Error(await fileRes.text());

      const blob = await fileRes.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `шүүсэн_${file.name}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Алдаа гарлаа");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setFile(null);
    setPrice("");
    setCode("");
    setSummary(null);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <p className="text-red-600 text-xs">{error}</p>
          </div>
        )}

        {/* Mode toggle */}
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-2">Горим</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("price")}
              className={`flex-1 text-sm font-medium py-2 px-3 rounded-lg border transition-colors ${
                mode === "price"
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              Зөвхөн үнэ
            </button>
            <button
              type="button"
              onClick={() => setMode("price_code")}
              className={`flex-1 text-sm font-medium py-2 px-3 rounded-lg border transition-colors ${
                mode === "price_code"
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              Үнэ + Код
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">
            {mode === "price"
              ? "Утасны дугаар + дүн таарвал зөв"
              : "Утасны дугаар + дүн + код бүгд таарвал зөв"}
          </p>
        </div>

        {/* File */}
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1.5">
            Гүйлгээний файл
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        {/* Price */}
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1.5">
            Бүтээгдэхүүний үнэ (₮)
          </label>
          <input
            type="number"
            placeholder="25000"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            min="1"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>

        {/* Code (only in price+code mode) */}
        {mode === "price_code" && (
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1.5">
              Код (гүйлгээний утганд агуулагдах)
            </label>
            <input
              type="text"
              placeholder="Жишээ: LS001"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleFilter}
            disabled={loading || !file || !price || (mode === "price_code" && !code)}
            className="flex-1 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium py-2.5 px-4 rounded-lg disabled:opacity-50 transition-colors"
          >
            {loading ? "Шүүж байна..." : "Шүүх"}
          </button>
          {summary && (
            <button
              onClick={handleReset}
              className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium py-2.5 px-4 rounded-lg transition-colors"
            >
              Цэвэрлэх
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {summary && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Үр дүн</h3>
          <div className={`grid gap-3 ${mode === "price_code" ? "grid-cols-3 lg:grid-cols-6" : "grid-cols-2 lg:grid-cols-4"}`}>
            <StatCard value={summary.total} label="Нийт" border="border-gray-200" bg="" text="text-gray-900" />
            <StatCard value={summary.accepted} label="Зөв" border="border-emerald-200" bg="bg-emerald-50" text="text-emerald-700" />
            <StatCard value={summary.badAmount} label="Дүн таарахгүй" border="border-red-200" bg="bg-red-50" text="text-red-700" />
            {mode === "price_code" && (
              <StatCard value={summary.badCode} label="Код олдсонгүй" border="border-yellow-200" bg="bg-yellow-50" text="text-yellow-700" />
            )}
            <StatCard value={summary.badPhone} label="Утас олдсонгүй" border="border-orange-200" bg="bg-orange-50" text="text-orange-700" />
            <StatCard value={summary.noMatch} label="Бусад" border="border-gray-200" bg="bg-gray-50" text="text-gray-500" />
          </div>
          <p className="text-[11px] text-gray-400 mt-4">Файл автоматаар татагдсан.</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ value, label, border, bg, text }: { value: number; label: string; border: string; bg: string; text: string }) {
  return (
    <div className={`rounded-lg border ${border} ${bg} p-3 text-center`}>
      <div className={`text-xl font-bold ${text}`}>{value}</div>
      <div className={`text-[11px] mt-1 ${text} opacity-70`}>{label}</div>
    </div>
  );
}
