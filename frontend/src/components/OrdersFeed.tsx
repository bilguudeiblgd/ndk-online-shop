"use client";

import type { Order, Product } from "@/lib/types";

const statusConfig: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  RESERVED: { label: "Захиалсан", dot: "bg-yellow-400", bg: "bg-yellow-50", text: "text-yellow-700" },
  PAID: { label: "Төлсөн", dot: "bg-emerald-400", bg: "bg-emerald-50", text: "text-emerald-700" },
  EXPIRED: { label: "Хугацаа дууссан", dot: "bg-gray-300", bg: "bg-gray-50", text: "text-gray-500" },
};

export default function OrdersFeed({
  orders,
  products,
}: {
  orders: Order[];
  products: Product[];
}) {
  const productMap = new Map(products.map((p) => [p.id, p]));

  const sorted = [...orders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (sorted.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <p className="text-sm text-gray-400">Захиалга байхгүй</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Захиалгууд</h2>
          <span className="text-xs text-gray-400">{orders.length}</span>
        </div>
      </div>
      <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
        {sorted.map((o) => {
          const product = productMap.get(o.productId);
          const config = statusConfig[o.status];
          return (
            <div key={o.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {o.userName || "Хэрэглэгч"}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {product?.name ?? "—"} &middot; <span className="font-mono">{o.phone}</span>
                  </p>
                </div>
                {config && (
                  <span className={`flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md ${config.bg} ${config.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                    {config.label}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
