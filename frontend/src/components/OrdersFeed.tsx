"use client";

import type { Order, Product } from "@/lib/types";

const statusColors: Record<string, string> = {
  RESERVED: "bg-yellow-100 text-yellow-800",
  PAID: "bg-green-100 text-green-800",
  EXPIRED: "bg-gray-100 text-gray-500",
};

const statusLabels: Record<string, string> = {
  RESERVED: "Захиалсан",
  PAID: "Төлсөн",
  EXPIRED: "Хугацаа дууссан",
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
      <div className="bg-white rounded-lg shadow p-6 text-center text-gray-400">
        Захиалга байхгүй. Хүлээж байна...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50">
        <h2 className="font-bold text-gray-800">
          Захиалгууд <span className="text-sm font-normal text-gray-400">({orders.length})</span>
        </h2>
      </div>
      <div className="divide-y max-h-[500px] overflow-y-auto">
        {sorted.map((o) => {
          const product = productMap.get(o.productId);
          return (
            <div key={o.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-sm text-gray-800">
                    {o.userName || "Хэрэглэгч"}
                  </span>
                  <span className="text-xs text-gray-400 ml-2">
                    {product?.name ?? o.productId.slice(0, 8)}
                  </span>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full ${
                    statusColors[o.status] ?? ""
                  }`}
                >
                  {statusLabels[o.status] ?? o.status}
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                <span className="font-mono">{o.phone}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
