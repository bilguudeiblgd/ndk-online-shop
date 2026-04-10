package store

import (
	"database/sql"
	"fmt"
	"math/rand"
	"time"

	"live-selling/internal/domain"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
)

type PostgresStore struct {
	db *sql.DB
}

func NewPostgresStore(connStr string) (*PostgresStore, error) {
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, fmt.Errorf("postgres connect: %w", err)
	}
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("postgres ping: %w", err)
	}
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)

	s := &PostgresStore{db: db}
	if err := s.migrate(); err != nil {
		return nil, fmt.Errorf("postgres migrate: %w", err)
	}
	return s, nil
}

func (s *PostgresStore) migrate() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS products (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			size TEXT DEFAULT '',
			color TEXT DEFAULT '',
			price DOUBLE PRECISION NOT NULL,
			image_url TEXT DEFAULT '',
			stock INT NOT NULL,
			reserved INT DEFAULT 0,
			claim_code INT NOT NULL,
			status TEXT DEFAULT 'LIVE',
			created_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS orders (
			id TEXT PRIMARY KEY,
			product_id TEXT NOT NULL REFERENCES products(id),
			user_name TEXT DEFAULT '',
			phone TEXT NOT NULL,
			status TEXT DEFAULT 'RESERVED',
			created_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_products_status ON products(status)`,
		`CREATE INDEX IF NOT EXISTS idx_products_claim_code ON products(claim_code) WHERE status = 'LIVE'`,
		`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`,
	}
	for _, q := range queries {
		if _, err := s.db.Exec(q); err != nil {
			return fmt.Errorf("migration failed: %w\nquery: %s", err, q)
		}
	}
	return nil
}

func (s *PostgresStore) CreateProduct(name, size, color string, price float64, stock int) (*domain.Product, error) {
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
		ImageURL:  "",
		Stock:     stock,
		Reserved:  0,
		ClaimCode: code,
		Status:    domain.ProductStatusLive,
		CreatedAt: time.Now(),
	}

	_, err = s.db.Exec(
		`INSERT INTO products (id, name, size, color, price, image_url, stock, reserved, claim_code, status, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		p.ID, p.Name, p.Size, p.Color, p.Price, p.ImageURL, p.Stock, p.Reserved, p.ClaimCode, p.Status, p.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert product: %w", err)
	}
	return p, nil
}

func (s *PostgresStore) generateClaimCode() (int, error) {
	// Get active claim codes
	rows, err := s.db.Query(`SELECT claim_code FROM products WHERE status = 'LIVE'`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	used := make(map[int]bool)
	for rows.Next() {
		var code int
		rows.Scan(&code)
		used[code] = true
	}
	if len(used) >= 100 {
		return 0, fmt.Errorf("no available claim codes")
	}

	for {
		code := rand.Intn(100)
		if !used[code] {
			return code, nil
		}
	}
}

func (s *PostgresStore) GetActiveProducts() []*domain.Product {
	rows, err := s.db.Query(
		`SELECT id, name, size, color, price, image_url, stock, reserved, claim_code, status, created_at
		 FROM products WHERE status = 'LIVE' ORDER BY created_at DESC`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	return scanProducts(rows)
}

func (s *PostgresStore) GetProduct(id string) *domain.Product {
	row := s.db.QueryRow(
		`SELECT id, name, size, color, price, image_url, stock, reserved, claim_code, status, created_at
		 FROM products WHERE id = $1`, id)
	p := &domain.Product{}
	err := row.Scan(&p.ID, &p.Name, &p.Size, &p.Color, &p.Price, &p.ImageURL, &p.Stock, &p.Reserved, &p.ClaimCode, &p.Status, &p.CreatedAt)
	if err != nil {
		return nil
	}
	return p
}

func (s *PostgresStore) EndProduct(id string) (*domain.Product, error) {
	res, err := s.db.Exec(`UPDATE products SET status = 'ENDED' WHERE id = $1 AND status = 'LIVE'`, id)
	if err != nil {
		return nil, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, fmt.Errorf("product not found or already ended")
	}
	return s.GetProduct(id), nil
}

func (s *PostgresStore) FindProductByClaimCode(code int) *domain.Product {
	row := s.db.QueryRow(
		`SELECT id, name, size, color, price, image_url, stock, reserved, claim_code, status, created_at
		 FROM products WHERE claim_code = $1 AND status = 'LIVE'`, code)
	p := &domain.Product{}
	err := row.Scan(&p.ID, &p.Name, &p.Size, &p.Color, &p.Price, &p.ImageURL, &p.Stock, &p.Reserved, &p.ClaimCode, &p.Status, &p.CreatedAt)
	if err != nil {
		return nil
	}
	return p
}

func (s *PostgresStore) ReserveStock(productID, userName, phone string) (*domain.Order, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// Lock the product row
	var stock, reserved int
	var status string
	err = tx.QueryRow(
		`SELECT stock, reserved, status FROM products WHERE id = $1 FOR UPDATE`, productID,
	).Scan(&stock, &reserved, &status)
	if err != nil {
		return nil, fmt.Errorf("product not found")
	}
	if status != string(domain.ProductStatusLive) {
		return nil, fmt.Errorf("product not live")
	}
	if stock-reserved <= 0 {
		return nil, fmt.Errorf("sold out")
	}

	// Increment reserved
	_, err = tx.Exec(`UPDATE products SET reserved = reserved + 1 WHERE id = $1`, productID)
	if err != nil {
		return nil, err
	}

	// Create order
	order := &domain.Order{
		ID:        uuid.New().String(),
		ProductID: productID,
		UserName:  userName,
		Phone:     phone,
		Status:    domain.OrderStatusReserved,
		CreatedAt: time.Now(),
	}
	_, err = tx.Exec(
		`INSERT INTO orders (id, product_id, user_name, phone, status, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
		order.ID, order.ProductID, order.UserName, order.Phone, order.Status, order.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return order, tx.Commit()
}

func (s *PostgresStore) GetOrders() []*domain.Order {
	rows, err := s.db.Query(
		`SELECT id, product_id, user_name, phone, status, created_at FROM orders ORDER BY created_at DESC`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	return scanOrders(rows)
}

func (s *PostgresStore) PayOrder(id string) (*domain.Order, error) {
	res, err := s.db.Exec(`UPDATE orders SET status = 'PAID' WHERE id = $1 AND status = 'RESERVED'`, id)
	if err != nil {
		return nil, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, fmt.Errorf("order not found or not in RESERVED status")
	}

	row := s.db.QueryRow(`SELECT id, product_id, user_name, phone, status, created_at FROM orders WHERE id = $1`, id)
	o := &domain.Order{}
	row.Scan(&o.ID, &o.ProductID, &o.UserName, &o.Phone, &o.Status, &o.CreatedAt)
	return o, nil
}

func (s *PostgresStore) ExpireOldOrders(maxAge time.Duration) []*domain.Order {
	cutoff := time.Now().Add(-maxAge)

	rows, err := s.db.Query(
		`UPDATE orders SET status = 'EXPIRED'
		 WHERE status = 'RESERVED' AND created_at < $1
		 RETURNING id, product_id, user_name, phone, status, created_at`, cutoff)
	if err != nil {
		return nil
	}
	defer rows.Close()

	expired := scanOrders(rows)

	// Release reserved stock for each expired order
	for _, o := range expired {
		s.db.Exec(`UPDATE products SET reserved = reserved - 1 WHERE id = $1`, o.ProductID)
	}

	return expired
}

func scanProducts(rows *sql.Rows) []*domain.Product {
	var result []*domain.Product
	for rows.Next() {
		p := &domain.Product{}
		rows.Scan(&p.ID, &p.Name, &p.Size, &p.Color, &p.Price, &p.ImageURL, &p.Stock, &p.Reserved, &p.ClaimCode, &p.Status, &p.CreatedAt)
		result = append(result, p)
	}
	return result
}

func scanOrders(rows *sql.Rows) []*domain.Order {
	var result []*domain.Order
	for rows.Next() {
		o := &domain.Order{}
		rows.Scan(&o.ID, &o.ProductID, &o.UserName, &o.Phone, &o.Status, &o.CreatedAt)
		result = append(result, o)
	}
	return result
}
