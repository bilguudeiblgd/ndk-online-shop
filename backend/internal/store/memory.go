package store

import (
	"fmt"
	"math/rand"
	"sync"
	"time"

	"live-selling/internal/domain"

	"github.com/google/uuid"
)

type MemoryStore struct {
	mu               sync.RWMutex
	products         map[string]*domain.Product
	activeClaimCodes map[int]string // code → productID
	orders           map[string]*domain.Order
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		products:         make(map[string]*domain.Product),
		activeClaimCodes: make(map[int]string),
		orders:           make(map[string]*domain.Order),
	}
}

func (s *MemoryStore) CreateProduct(name, size, color string, price float64, stock int) (*domain.Product, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	code, err := s.generateClaimCode()
	if err != nil {
		return nil, err
	}

	p := &domain.Product{
		ID:        uuid.New().String(),
		Name:      name,
		Size:      size,
		Color:     color,
		Price:     price,
		Stock:     stock,
		Reserved:  0,
		ClaimCode: code,
		Status:    domain.ProductStatusLive,
		CreatedAt: time.Now(),
	}

	s.products[p.ID] = p
	s.activeClaimCodes[code] = p.ID
	return p, nil
}

func (s *MemoryStore) generateClaimCode() (int, error) {
	if len(s.activeClaimCodes) >= 100 {
		return 0, fmt.Errorf("no available claim codes (all 100 in use)")
	}

	for {
		code := rand.Intn(100)
		if _, exists := s.activeClaimCodes[code]; !exists {
			return code, nil
		}
	}
}

func (s *MemoryStore) GetActiveProducts() []*domain.Product {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*domain.Product
	for _, p := range s.products {
		if p.Status == domain.ProductStatusLive {
			result = append(result, p)
		}
	}
	return result
}

func (s *MemoryStore) GetProduct(id string) *domain.Product {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.products[id]
}

func (s *MemoryStore) EndProduct(id string) (*domain.Product, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	p, ok := s.products[id]
	if !ok {
		return nil, fmt.Errorf("product not found")
	}
	if p.Status == domain.ProductStatusEnded {
		return nil, fmt.Errorf("product already ended")
	}

	p.Status = domain.ProductStatusEnded
	delete(s.activeClaimCodes, p.ClaimCode)
	return p, nil
}

func (s *MemoryStore) FindProductByClaimCode(code int) *domain.Product {
	s.mu.RLock()
	defer s.mu.RUnlock()

	productID, ok := s.activeClaimCodes[code]
	if !ok {
		return nil
	}
	return s.products[productID]
}

// ReserveStock atomically reserves one unit and creates an order.
// Returns the order or an error if sold out.
func (s *MemoryStore) ReserveStock(productID, userName, phone string) (*domain.Order, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	p, ok := s.products[productID]
	if !ok {
		return nil, fmt.Errorf("product not found")
	}
	if p.Status != domain.ProductStatusLive {
		return nil, fmt.Errorf("product not live")
	}
	if p.Stock-p.Reserved <= 0 {
		return nil, fmt.Errorf("sold out")
	}

	p.Reserved++

	order := &domain.Order{
		ID:        uuid.New().String(),
		ProductID: productID,
		UserName:  userName,
		Phone:     phone,
		Status:    domain.OrderStatusReserved,
		CreatedAt: time.Now(),
	}
	s.orders[order.ID] = order

	return order, nil
}

func (s *MemoryStore) GetOrders() []*domain.Order {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*domain.Order
	for _, o := range s.orders {
		result = append(result, o)
	}
	return result
}

func (s *MemoryStore) PayOrder(id string) (*domain.Order, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	o, ok := s.orders[id]
	if !ok {
		return nil, fmt.Errorf("order not found")
	}
	if o.Status != domain.OrderStatusReserved {
		return nil, fmt.Errorf("order not in RESERVED status")
	}
	o.Status = domain.OrderStatusPaid
	return o, nil
}

func (s *MemoryStore) ExpireOldOrders(maxAge time.Duration) []*domain.Order {
	s.mu.Lock()
	defer s.mu.Unlock()

	cutoff := time.Now().Add(-maxAge)
	var expired []*domain.Order

	for _, o := range s.orders {
		if o.Status == domain.OrderStatusReserved && o.CreatedAt.Before(cutoff) {
			o.Status = domain.OrderStatusExpired
			// Release reserved stock
			if p, ok := s.products[o.ProductID]; ok {
				p.Reserved--
			}
			expired = append(expired, o)
		}
	}
	return expired
}
