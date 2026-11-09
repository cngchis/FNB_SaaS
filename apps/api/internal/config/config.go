package config

import (
	"errors"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Environment string
	HTTPAddress string
	DatabaseURL string
	JWTSecret   []byte
	AccessTTL   int
	RefreshTTL  int
	WebOrigin   string
}

func Load() (Config, error) {
	cfg := Config{
		Environment: getEnv("APP_ENV", "development"),
		HTTPAddress: getEnv("HTTP_ADDRESS", ":8080"),
		DatabaseURL: strings.TrimSpace(os.Getenv("DATABASE_URL")),
		JWTSecret:   []byte(os.Getenv("JWT_SECRET")),
		WebOrigin:   strings.TrimSpace(os.Getenv("WEB_ORIGIN")),
	}
	accessTTL, err := strconv.Atoi(getEnv("ACCESS_TOKEN_TTL_MINUTES", "15"))
	if err != nil || accessTTL < 1 || accessTTL > 1440 {
		return Config{}, errors.New("ACCESS_TOKEN_TTL_MINUTES must be between 1 and 1440")
	}
	refreshTTL, err := strconv.Atoi(getEnv("REFRESH_TOKEN_TTL_HOURS", "720"))
	if err != nil || refreshTTL < 1 || refreshTTL > 8760 {
		return Config{}, errors.New("REFRESH_TOKEN_TTL_HOURS must be between 1 and 8760")
	}
	cfg.AccessTTL, cfg.RefreshTTL = accessTTL, refreshTTL
	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	if len(cfg.JWTSecret) < 32 {
		return Config{}, errors.New("JWT_SECRET must contain at least 32 bytes")
	}
	if cfg.WebOrigin == "" {
		return Config{}, errors.New("WEB_ORIGIN is required")
	}
	return cfg, nil
}

func getEnv(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
