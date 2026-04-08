package store

import (
	"sync"
	"testing"
)

func TestConcurrentReservations_NoOverselling(t *testing.T) {
	s := NewMemoryStore()

	// Create product with stock=5
	p, err := s.CreateProduct("Test Shirt", "M", "Blue", 25.0, 5)
	if err != nil {
		t.Fatal(err)
	}

	// Fire 50 concurrent reservations
	var wg sync.WaitGroup
	successes := 0
	var mu sync.Mutex

	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			_, err := s.ReserveStock(p.ID, "TestUser", "090000000")
			if err == nil {
				mu.Lock()
				successes++
				mu.Unlock()
			}
		}(i)
	}

	wg.Wait()

	if successes != 5 {
		t.Errorf("expected 5 successful reservations, got %d", successes)
	}

	product := s.GetProduct(p.ID)
	if product.Reserved != 5 {
		t.Errorf("expected reserved=5, got %d", product.Reserved)
	}

	orders := s.GetOrders()
	if len(orders) != 5 {
		t.Errorf("expected 5 orders, got %d", len(orders))
	}
}

func TestClaimCodeReuse(t *testing.T) {
	s := NewMemoryStore()

	p1, _ := s.CreateProduct("P1", "S", "Red", 10, 1)
	code1 := p1.ClaimCode

	// End product -> code should be released
	s.EndProduct(p1.ID)

	// The code should now be available for reuse
	if _, exists := s.activeClaimCodes[code1]; exists {
		t.Error("claim code should have been released")
	}
}
