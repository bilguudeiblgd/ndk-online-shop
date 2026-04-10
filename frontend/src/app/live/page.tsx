"use client";

import { useCallback, useEffect, useState } from "react";
import type { Product, Order, WSEvent } from "@/lib/types";
import { getActiveProducts, getOrders } from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";
import AppShell from "@/components/AppShell";
import ProductForm from "@/components/ProductForm";
import ActiveProductPanel from "@/components/ActiveProductPanel";
import OrdersFeed from "@/components/OrdersFeed";

export default function LivePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    getActiveProducts().then((data) => {
      setProducts(data ?? []);
      setAllProducts(data ?? []);
    });
    getOrders().then((data) => setOrders(data ?? []));
  }, []);

  const handleEvent = useCallback((event: WSEvent) => {
    switch (event.type) {
      case "NEW_PRODUCT": {
        const p = event.payload as Product;
        setProducts((prev) => [...prev, p]);
        setAllProducts((prev) => [...prev, p]);
        break;
      }
      case "STOCK_UPDATE": {
        const p = event.payload as Product;
        setProducts((prev) => prev.map((x) => (x.id === p.id ? p : x)));
        setAllProducts((prev) => prev.map((x) => (x.id === p.id ? p : x)));
        break;
      }
      case "NEW_ORDER": {
        const o = event.payload as Order;
        setOrders((prev) => [...prev, o]);
        break;
      }
      case "SOLD_OUT": {
        const p = event.payload as Product;
        setProducts((prev) => prev.map((x) => (x.id === p.id ? p : x)));
        break;
      }
      case "PRODUCT_END": {
        const p = event.payload as Product;
        setProducts((prev) => prev.filter((x) => x.id !== p.id));
        setAllProducts((prev) => prev.map((x) => (x.id === p.id ? p : x)));
        break;
      }
    }
  }, []);

  useWebSocket(handleEvent);

  return (
    <AppShell>
      <div className="px-8 py-6">
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Шууд худалдаа</h1>
            <p className="text-sm text-gray-400 mt-0.5">Бүтээгдэхүүн нэмэх, захиалга хянах</p>
          </div>
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-full px-3 py-1">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-medium text-red-600">ШУУД</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: form + products */}
          <div className="lg:col-span-2 space-y-6">
            <ProductForm />
            <div>
              <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                Идэвхтэй бүтээгдэхүүн
              </h2>
              <ActiveProductPanel products={products} />
            </div>
          </div>

          {/* Right: orders */}
          <div>
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              Захиалгууд
            </h2>
            <OrdersFeed orders={orders} products={allProducts} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
