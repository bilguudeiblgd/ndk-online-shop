"use client";

import { useState } from "react";
import { createProduct } from "@/lib/api";

export default function ProductForm() {
  const [name, setName] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await createProduct({
        name,
        size,
        color,
        price: parseFloat(price),
        stock: parseInt(stock),
      });
      setName("");
      setSize("");
      setColor("");
      setPrice("");
      setStock("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Бүтээгдэхүүн үүсгэж чадсангүй");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900">Бүтээгдэхүүн нэмэх</h2>
      {error && <p className="text-red-500 text-xs">{error}</p>}
      <input
        type="text"
        placeholder="Бүтээгдэхүүний нэр"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
      />
      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          placeholder="Размер"
          value={size}
          onChange={(e) => setSize(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
        <input
          type="text"
          placeholder="Өнгө"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input
          type="number"
          placeholder="Үнэ (₮)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
          min="1"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
        <input
          type="number"
          placeholder="Тоо ширхэг"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          required
          min="1"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium py-2.5 px-4 rounded-lg disabled:opacity-50 transition-colors"
      >
        {loading ? "Үүсгэж байна..." : "Шууд эхлүүлэх"}
      </button>
    </form>
  );
}
