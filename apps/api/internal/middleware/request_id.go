package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"
)

const RequestIDKey = "request_id"

func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := strings.TrimSpace(c.GetHeader("X-Request-ID"))
		if len(id) == 0 || len(id) > 96 {
			bytes := make([]byte, 16)
			if _, err := rand.Read(bytes); err != nil {
				id = "request-id-unavailable"
			} else {
				id = hex.EncodeToString(bytes)
			}
		}
		c.Set(RequestIDKey, id)
		c.Header("X-Request-ID", id)
		c.Next()
	}
}

func AccessLog(logger zerolog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		started := time.Now()
		c.Next()
		logger.Info().
			Str("request_id", RequestIDFrom(c)).
			Str("method", c.Request.Method).
			Str("path", c.FullPath()).
			Int("status", c.Writer.Status()).
			Dur("duration", time.Since(started)).
			Msg("http request")
	}
}

func CORS(allowedOrigin string) gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" && origin != allowedOrigin {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "origin_not_allowed", "message": "Request origin is not allowed."}})
			return
		}
		if origin != "" {
			c.Header("Access-Control-Allow-Origin", allowedOrigin)
			c.Header("Vary", "Origin")
			c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-ID, Idempotency-Key")
			c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		}
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func RequestIDFrom(c *gin.Context) string {
	value, _ := c.Get(RequestIDKey)
	id, _ := value.(string)
	return id
}
