package store

import (
	"time"

	"live-selling/internal/domain"
)

// Store is the interface both MemoryStore and PostgresStore implement.
type Store interface {
	CreateProduct(name, size, color string, price float64, stock int) (*domain.Product, error)
	GetActiveProducts() []*domain.Product
	GetProduct(id string) *domain.Product
	EndProduct(id string) (*domain.Product, error)
	FindProductByClaimCode(code int) *domain.Product
	ReserveStock(productID, userName, phone string) (*domain.Order, error)
	GetOrders() []*domain.Order
	PayOrder(id string) (*domain.Order, error)
	ExpireOldOrders(maxAge time.Duration) []*domain.Order
}
