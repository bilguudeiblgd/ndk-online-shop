package service

import (
	"fmt"
	"regexp"
	"strconv"
	"time"

	"live-selling/internal/domain"
	"live-selling/internal/store"
	"live-selling/internal/ws"
)

var commentRegex = regexp.MustCompile(`^(\d{1,2})\s+(\d+)`)

type LiveService struct {
	store *store.MemoryStore
	hub   *ws.Hub
}

func NewLiveService(store *store.MemoryStore, hub *ws.Hub) *LiveService {
	return &LiveService{store: store, hub: hub}
}

func (s *LiveService) CreateProduct(name, size, color string, price float64, stock int) (*domain.Product, error) {
	p, err := s.store.CreateProduct(name, size, color, price, stock)
	if err != nil {
		return nil, err
	}

	s.hub.Broadcast(domain.WSEvent{
		Type:    domain.EventNewProduct,
		Payload: p,
	})
	return p, nil
}

func (s *LiveService) GetActiveProducts() []*domain.Product {
	return s.store.GetActiveProducts()
}

func (s *LiveService) EndProduct(id string) (*domain.Product, error) {
	p, err := s.store.EndProduct(id)
	if err != nil {
		return nil, err
	}

	s.hub.Broadcast(domain.WSEvent{
		Type:    domain.EventProductEnd,
		Payload: p,
	})
	return p, nil
}

func (s *LiveService) GetOrders() []*domain.Order {
	return s.store.GetOrders()
}

func (s *LiveService) ProcessComment(text, user string) (*domain.Order, error) {
	matches := commentRegex.FindStringSubmatch(text)
	if matches == nil {
		return nil, fmt.Errorf("comment does not match claim format")
	}

	code, _ := strconv.Atoi(matches[1])
	phone := matches[2]

	product := s.store.FindProductByClaimCode(code)
	if product == nil {
		return nil, fmt.Errorf("no active product with claim code %d", code)
	}

	order, err := s.store.ReserveStock(product.ID, phone)
	if err != nil {
		if err.Error() == "sold out" {
			s.hub.Broadcast(domain.WSEvent{
				Type:    domain.EventSoldOut,
				Payload: product,
			})
		}
		return nil, err
	}

	// Broadcast stock update
	updated := s.store.GetProduct(product.ID)
	s.hub.Broadcast(domain.WSEvent{
		Type:    domain.EventStockUpdate,
		Payload: updated,
	})

	// Broadcast new order
	s.hub.Broadcast(domain.WSEvent{
		Type:    domain.EventNewOrder,
		Payload: order,
	})

	return order, nil
}

func (s *LiveService) PayOrder(id string) (*domain.Order, error) {
	return s.store.PayOrder(id)
}

func (s *LiveService) StartExpirationWorker(maxAge time.Duration, interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for range ticker.C {
			expired := s.store.ExpireOldOrders(maxAge)
			for _, o := range expired {
				s.hub.Broadcast(domain.WSEvent{
					Type:    domain.EventStockUpdate,
					Payload: s.store.GetProduct(o.ProductID),
				})
			}
		}
	}()
}
