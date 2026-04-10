"use client";

import { useEffect, useState } from "react";
import type { Order } from "@/lib/types";
import { getOrders } from "@/lib/api";
import AppShell from "@/components/AppShell";

const statusConfig: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  RESERVED: { label: "Захиалсан", dot: "bg-yellow-400", bg: "bg-yellow-50", text: "text-yellow-700" },
  PAID: { label: "Төлсөн", dot: "bg-emerald-400", bg: "bg-emerald-50", text: "text-emerald-700" },
  EXPIRED: { label: "Хугацаа дууссан", dot: "bg-gray-300", bg: "bg-gray-50", text: "text-gray-500" },
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    getOrders().then((data) => setOrders(data ?? []));
    const interval = setInterval(() => {
      getOrders().then((data) => setOrders(data ?? []));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const sorted = [...orders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <AppShell>
      <div className="px-8 py-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Захиалгууд</h1>
            <p className="text-sm text-gray-400 mt-0.5">Бүх захиалгын жагсаалт</p>
          </div>
          <span className="text-xs text-gray-400">{orders.length} захиалга</span>
        </div>

        {sorted.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <p className="text-sm text-gray-400">Захиалга байхгүй</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Нэр</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Утас</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Төлөв</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-4 py-3">Огноо</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((o) => {
                  const config = statusConfig[o.status];
                  return (
                    <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {o.userName || "Хэрэглэгч"}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-gray-600">{o.phone}</td>
                      <td className="px-4 py-3">
                        {config && (
                          <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md ${config.bg} ${config.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                            {config.label}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {new Date(o.createdAt).toLocaleString("mn-MN")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
