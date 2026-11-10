package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/cngchis/FNB_SaaS/apps/api/internal/config"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/database"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/middleware"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/auth"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/customer"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/pos"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/product"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/room"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
)

func main() {
	if err := run(); err != nil {
		log.Error().Err(err).Msg("API stopped")
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	zerolog.TimeFieldFormat = time.RFC3339Nano
	logger := zerolog.New(os.Stdout).With().Timestamp().Logger()
	if cfg.Environment != "production" {
		logger = logger.Level(zerolog.DebugLevel)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	pool, err := database.Open(ctx, cfg.DatabaseURL)
	cancel()
	if err != nil {
		return err
	}
	defer pool.Close()

	metrics := middleware.NewRequestMetrics()
	router := gin.New()
	router.Use(gin.CustomRecovery(func(c *gin.Context, recovered any) {
		logger.Error().Str("request_id", middleware.RequestIDFrom(c)).Interface("panic", recovered).Msg("request panic")
		httpx.Fail(c, http.StatusInternalServerError, "internal_error", "An unexpected error occurred.")
		c.Abort()
	}))
	router.Use(middleware.RequestID(), middleware.CORS(cfg.WebOrigin), middleware.AccessLog(logger), metrics.Middleware())
	router.GET("/healthz", func(c *gin.Context) { httpx.Success(c, http.StatusOK, gin.H{"status": "ok"}) })
	router.GET("/readyz", func(c *gin.Context) {
		if err := pool.Ping(c.Request.Context()); err != nil {
			httpx.Fail(c, http.StatusServiceUnavailable, "database_unavailable", "The database is not ready.")
			return
		}
		httpx.Success(c, http.StatusOK, gin.H{"status": "ready"})
	})
	router.GET("/metrics", func(c *gin.Context) {
		c.Data(http.StatusOK, "text/plain; version=0.0.4; charset=utf-8", []byte(metrics.Prometheus()))
	})

	api := router.Group("/api/v1")
	auth.RegisterRoutes(api.Group("/auth"), pool, cfg)
	secured := api.Group("", auth.Authenticate(pool, cfg.JWTSecret))
	product.RegisterRoutes(secured, pool)
	customer.RegisterRoutes(secured, pool)
	room.RegisterRoutes(secured, pool)
	pos.RegisterRoutes(secured, pool)
	api.GET("/me", auth.Authenticate(pool, cfg.JWTSecret), func(c *gin.Context) {
		identity, ok := auth.CurrentIdentity(c)
		if !ok {
			httpx.Fail(c, http.StatusUnauthorized, "unauthorized", "Sign in to continue.")
			return
		}
		httpx.Success(c, http.StatusOK, gin.H{"user_id": identity.UserID, "tenant_id": identity.TenantID, "store_id": identity.StoreID, "membership_id": identity.MembershipID, "role": identity.Role})
	})
	api.GET("/admin/access-check", auth.Authenticate(pool, cfg.JWTSecret), auth.RequireRoles("owner", "manager"), func(c *gin.Context) {
		httpx.Success(c, http.StatusOK, gin.H{"access": "granted"})
	})

	server := &http.Server{Addr: cfg.HTTPAddress, Handler: router, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 20 * time.Second, IdleTimeout: 60 * time.Second}
	serverErrors := make(chan error, 1)
	go func() {
		logger.Info().Str("address", cfg.HTTPAddress).Msg("API listening")
		if err := server.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			serverErrors <- err
		}
		close(serverErrors)
	}()

	shutdown, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	select {
	case err := <-serverErrors:
		return err
	case <-shutdown.Done():
	}
	ctx, cancel = context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		return err
	}
	return nil
}
