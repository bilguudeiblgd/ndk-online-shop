package main

import (
	"log"
	"net/http"
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
	memStore := store.NewMemoryStore()
	hub := ws.NewHub()
	svc := service.NewLiveService(memStore, hub)
	handlers := api.NewHandlers(svc)

	// Start order expiration worker (expire after 10 minutes, check every 30s)
	svc.StartExpirationWorker(10*time.Minute, 30*time.Second)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "http://localhost:3001"},
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
	r.Post("/orders/{id}/pay", handlers.PayOrder)

	// WebSocket
	r.Get("/ws", hub.HandleWS)

	log.Println("Server starting on :8080")
	if err := http.ListenAndServe(":8080", r); err != nil {
		log.Fatal(err)
	}
}
