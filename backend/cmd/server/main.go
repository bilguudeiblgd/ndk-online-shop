package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"live-selling/internal/api"
	"live-selling/internal/service"
	"live-selling/internal/store"
	"live-selling/internal/ws"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func main() {
	var dataStore store.Store

	if dbURL := os.Getenv("DATABASE_URL"); dbURL != "" {
		pg, err := store.NewPostgresStore(dbURL)
		if err != nil {
			log.Fatalf("Postgres холбогдож чадсангүй: %v", err)
		}
		dataStore = pg
		log.Println("Postgres-д холбогдлоо")
	} else {
		dataStore = store.NewMemoryStore()
		log.Println("In-memory store ашиглаж байна")
	}

	hub := ws.NewHub()
	svc := service.NewLiveService(dataStore, hub)
	handlers := api.NewHandlers(svc)
	excelHandlers := api.NewExcelHandlers()

	svc.StartExpirationWorker(10*time.Minute, 30*time.Second)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "http://localhost:3001", "*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type"},
		AllowCredentials: true,
	}))

	// REST API
	r.Post("/products/live", handlers.CreateProduct)
	r.Get("/products/active", handlers.GetActiveProducts)
	r.Post("/products/{id}/end", handlers.EndProduct)
	r.Get("/orders", handlers.GetOrders)
	r.Post("/comments", handlers.PostComment)
	r.Post("/webhook", handlers.Webhook)
	r.Post("/orders/{id}/pay", handlers.PayOrder)

	// Excel filter
	r.Post("/excel/filter", excelHandlers.FilterExcel)

	// WebSocket
	r.Get("/ws", hub.HandleWS)

	log.Println("Server :8080 дээр ажиллаж байна")
	if err := http.ListenAndServe(":8080", r); err != nil {
		log.Fatal(err)
	}
}
