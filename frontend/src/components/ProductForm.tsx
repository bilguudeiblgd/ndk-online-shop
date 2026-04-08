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
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-4">
      <h2 className="text-lg font-bold text-gray-800">Бүтээгдэхүүн нэмэх</h2>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <input
        type="text"
        placeholder="Бүтээгдэхүүний нэр"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className="w-full border rounded px-3 py-2 text-sm text-gray-800"
      />
      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          placeholder="Размер"
          value={size}
          onChange={(e) => setSize(e.target.value)}
          className="border rounded px-3 py-2 text-sm text-gray-800"
        />
        <input
          type="text"
          placeholder="Өнгө"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="border rounded px-3 py-2 text-sm text-gray-800"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input
          type="number"
          placeholder="Үнэ"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
          min="0.01"
          step="0.01"
          className="border rounded px-3 py-2 text-sm text-gray-800"
        />
        <input
          type="number"
          placeholder="Тоо ширхэг"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          required
          min="1"
          className="border rounded px-3 py-2 text-sm text-gray-800"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded disabled:opacity-50 transition-colors"
      >
        {loading ? "Үүсгэж байна..." : "Шууд эхлүүлэх"}
      </button>
    </form>
  );
}
