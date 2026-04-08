"use client";

import type { Product } from "@/lib/types";
import { endProduct } from "@/lib/api";

export default function ActiveProductPanel({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center text-gray-400">
        Идэвхтэй бүтээгдэхүүн байхгүй. Нэмнэ үү.
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
    <div className="space-y-4">
      {products.map((p) => {
        const remaining = p.stock - p.reserved;
        const soldOut = remaining <= 0;
        return (
          <div
            key={p.id}
            className={`bg-white rounded-lg shadow p-5 border-l-4 ${
              soldOut ? "border-red-500 bg-red-50" : "border-green-500"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-bold text-gray-800 text-lg">{p.name}</h3>
                <p className="text-sm text-gray-500">
                  {p.size && `Размер: ${p.size}`}
                  {p.size && p.color && " / "}
                  {p.color && `Өнгө: ${p.color}`}
                </p>
                <p className="text-sm font-medium text-gray-700 mt-1">
                  {p.price.toLocaleString()}₮
                </p>
                <div className="mt-2">
                  <span
                    className={`text-sm font-bold ${
                      soldOut ? "text-red-600" : "text-green-600"
                    }`}
                  >
                    {soldOut ? "ДУУССАН" : `${remaining} үлдсэн`}
                  </span>
                  <span className="text-xs text-gray-400 ml-2">
                    ({p.reserved}/{p.stock} захиалсан)
                  </span>
                </div>
                <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      soldOut ? "bg-red-500" : "bg-green-500"
                    }`}
                    style={{
                      width: `${Math.max(0, (remaining / p.stock) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="ml-4 text-center">
                <div className="text-xs text-gray-400 uppercase tracking-wide">
                  Код
                </div>
                <div
                  className={`text-5xl font-black tabular-nums ${
                    soldOut ? "text-red-400" : "text-blue-600"
                  }`}
                >
                  {String(p.claimCode).padStart(2, "0")}
                </div>
              </div>
            </div>
            <button
              onClick={() => handleEnd(p.id)}
              className="mt-3 text-sm text-gray-400 hover:text-red-500 transition-colors"
            >
              Зарлага зогсоох
            </button>
          </div>
        );
      })}
    </div>
  );
}
