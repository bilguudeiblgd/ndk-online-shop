const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export async function createProduct(data: {
  name: string;
  size: string;
  color: string;
  price: number;
  stock: number;
}) {
  const res = await fetch(`${API}/products/live`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getActiveProducts() {
  const res = await fetch(`${API}/products/active`);
  return res.json();
}

export async function endProduct(id: string) {
  const res = await fetch(`${API}/products/${id}/end`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getOrders() {
  const res = await fetch(`${API}/orders`);
  return res.json();
}

export async function postComment(text: string, user: string) {
  const res = await fetch(`${API}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, user }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function payOrder(id: string) {
  const res = await fetch(`${API}/orders/${id}/pay`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
