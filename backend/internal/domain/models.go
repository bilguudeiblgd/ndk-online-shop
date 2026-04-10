package domain

import "time"

type ProductStatus string

const (
	ProductStatusLive  ProductStatus = "LIVE"
	ProductStatusEnded ProductStatus = "ENDED"
)

type OrderStatus string

const (
	OrderStatusReserved OrderStatus = "RESERVED"
	OrderStatusPaid     OrderStatus = "PAID"
	OrderStatusExpired  OrderStatus = "EXPIRED"
)

type Product struct {
	ID        string        `json:"id"`
	Name      string        `json:"name"`
	Size      string        `json:"size"`
	Color     string        `json:"color"`
	Price     float64       `json:"price"`
	ImageURL  string        `json:"imageUrl"`
	Stock     int           `json:"stock"`
	Reserved  int           `json:"reserved"`
	ClaimCode int           `json:"claimCode"`
	Status    ProductStatus `json:"status"`
	CreatedAt time.Time     `json:"createdAt"`
}

type Order struct {
	ID        string      `json:"id"`
	ProductID string      `json:"productId"`
	UserName  string      `json:"userName"`
	Phone     string      `json:"phone"`
	Status    OrderStatus `json:"status"`
	CreatedAt time.Time   `json:"createdAt"`
}

type Comment struct {
	ID        string    `json:"id"`
	Text      string    `json:"text"`
	User      string    `json:"user"`
	CreatedAt time.Time `json:"createdAt"`
}

// Events sent over WebSocket
type EventType string

const (
	EventNewProduct  EventType = "NEW_PRODUCT"
	EventStockUpdate EventType = "STOCK_UPDATE"
	EventNewOrder    EventType = "NEW_ORDER"
	EventSoldOut     EventType = "SOLD_OUT"
	EventProductEnd  EventType = "PRODUCT_END"
)

type WSEvent struct {
	Type    EventType   `json:"type"`
	Payload interface{} `json:"payload"`
}
