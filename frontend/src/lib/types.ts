export interface Product {
  id: string;
  name: string;
  size: string;
  color: string;
  price: number;
  stock: number;
  reserved: number;
  claimCode: number;
  status: "LIVE" | "ENDED";
  createdAt: string;
}

export interface Order {
  id: string;
  productId: string;
  phone: string;
  status: "RESERVED" | "PAID" | "EXPIRED";
  createdAt: string;
}

export type EventType =
  | "NEW_PRODUCT"
  | "STOCK_UPDATE"
  | "NEW_ORDER"
  | "SOLD_OUT"
  | "PRODUCT_END";

export interface WSEvent {
  type: EventType;
  payload: unknown;
}
