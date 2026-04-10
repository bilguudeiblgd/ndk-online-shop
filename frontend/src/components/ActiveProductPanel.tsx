"use client";

import type { Product } from "@/lib/types";
import { endProduct } from "@/lib/api";

export default function ActiveProductPanel({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <p className="text-sm text-gray-400">Идэвхтэй бүтээгдэхүүн байхгүй</p>
      </div>
    );
  }

  async function handleEnd(id: string) {
    try {
      await endProduct(id);
    } catch {
      // handled via WS
    }
  }

  return (
    <div className="space-y-3">
      {products.map((p) => {
        const remaining = p.stock - p.reserved;
        const soldOut = remaining <= 0;
        const pct = Math.max(0, (remaining / p.stock) * 100);

        return (
          <div
            key={p.id}
            className="bg-white border border-gray-200 rounded-xl p-5"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{p.name}</h3>
                  {soldOut && (
                    <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded">
                      ДУУССАН
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {[p.size && `${p.size}`, p.color && `${p.color}`].filter(Boolean).join(" / ")}
                </p>
                <p className="text-sm font-medium text-gray-900 mt-1">
                  {p.price.toLocaleString()}₮
                </p>
              </div>

              {/* Claim code */}
              <div className="ml-4 flex flex-col items-center">
                <span className="text-[10px] text-gray-400 uppercase tracking-widest">Код</span>
                <span
                  className={`text-4xl font-black tabular-nums leading-none mt-1 ${
                    soldOut ? "text-gray-300" : "text-gray-900"
                  }`}
                >
                  {String(p.claimCode).padStart(2, "0")}
                </span>
              </div>
            </div>

            {/* Stock */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-gray-500">
                  {remaining} / {p.stock} үлдсэн
                </span>
                <span className="text-gray-400">{p.reserved} захиалсан</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    soldOut ? "bg-red-400" : pct < 30 ? "bg-yellow-400" : "bg-emerald-400"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <button
              onClick={() => handleEnd(p.id)}
              className="mt-3 text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Зогсоох
            </button>
          </div>
        );
      })}
    </div>
  );
}
