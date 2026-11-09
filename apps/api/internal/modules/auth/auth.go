package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/cngchis/FNB_SaaS/apps/api/internal/config"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/database"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/dbgen"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
)

type Claims struct {
	TenantID     string `json:"tenant_id"`
	StoreID      string `json:"store_id"`
	MembershipID string `json:"membership_id"`
	Role         string `json:"role"`
	SessionID    string `json:"sid"`
	jwt.RegisteredClaims
}

type Identity struct {
	UserID       string
	TenantID     string
	StoreID      string
	MembershipID string
	Role         string
	SessionID    string
}

type Handler struct {
	pool *pgxpool.Pool
	cfg  config.Config
}

func RegisterRoutes(router gin.IRoutes, pool *pgxpool.Pool, cfg config.Config) {
	handler := &Handler{pool: pool, cfg: cfg}
	router.POST("/login", handler.login)
	router.POST("/refresh", handler.refresh)
	router.POST("/logout", Authenticate(pool, cfg.JWTSecret), handler.logout)
}

type loginRequest struct {
	TenantSlug string `json:"tenant_slug" binding:"required,min=3,max=64"`
	Email      string `json:"email" binding:"required,email,max=254"`
	Password   string `json:"password" binding:"required,min=1,max=128"`
	StoreID    string `json:"store_id" binding:"omitempty,uuid"`
}

type refreshRequest struct {
	TenantSlug   string `json:"tenant_slug" binding:"required,min=3,max=64"`
	RefreshToken string `json:"refresh_token" binding:"required,min=32,max=256"`
}

type userRow struct {
	UserID, Email, DisplayName, PasswordHash string
	MembershipID, RoleSlug, RoleName         string
}

type storeRow struct {
	ID, Name, Slug string
}

func (h *Handler) login(c *gin.Context) {
	var request loginRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "invalid_request", "Check the login details and try again.")
		return
	}
	tenantID, err := tenantIDForSlug(c.Request.Context(), h.pool, request.TenantSlug)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(c, http.StatusInternalServerError, "authentication_unavailable", "Unable to verify this account right now.")
			return
		}
		httpx.Fail(c, http.StatusUnauthorized, "invalid_credentials", "The tenant, email, or password is incorrect.")
		return
	}
	var user userRow
	var stores []storeRow
	err = database.WithTenantTx(c.Request.Context(), h.pool, tenantID, func(tx pgx.Tx) error {
		queries := dbgen.New(tx)
		identity, err := queries.GetLoginIdentity(c.Request.Context(), dbgen.GetLoginIdentityParams{TenantID: tenantID, Email: request.Email})
		if err != nil {
			return err
		}
		user = userRow{
			UserID: identity.UserID, Email: identity.Email, DisplayName: identity.DisplayName,
			PasswordHash: identity.PasswordHash, MembershipID: identity.MembershipID,
			RoleSlug: identity.MembershipRole, RoleName: identity.RoleName,
		}
		storeRows, err := queries.ListMembershipStores(c.Request.Context(), dbgen.ListMembershipStoresParams{TenantID: tenantID, MembershipID: user.MembershipID})
		if err != nil {
			return err
		}
		for _, store := range storeRows {
			stores = append(stores, storeRow{ID: store.ID, Name: store.Name, Slug: store.Slug})
		}
		return nil
	})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		httpx.Fail(c, http.StatusInternalServerError, "authentication_unavailable", "Unable to verify this account right now.")
		return
	}
	if err != nil || bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(request.Password)) != nil {
		httpx.Fail(c, http.StatusUnauthorized, "invalid_credentials", "The tenant, email, or password is incorrect.")
		return
	}
	storeID, ok := chooseStore(stores, request.StoreID)
	if !ok {
		httpx.Fail(c, http.StatusForbidden, "store_access_denied", "This account does not have access to the selected store.")
		return
	}
	refreshToken, err := randomToken()
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "token_generation_failed", "Unable to start a secure session.")
		return
	}
	var sessionID string
	err = database.WithTenantTx(c.Request.Context(), h.pool, tenantID, func(tx pgx.Tx) error {
		return tx.QueryRow(c.Request.Context(), `
			INSERT INTO auth_sessions (tenant_id, user_id, membership_id, store_id, refresh_token_hash, expires_at)
			VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::text`,
			tenantID, user.UserID, user.MembershipID, storeID, hashToken(refreshToken), time.Now().Add(time.Duration(h.cfg.RefreshTTL)*time.Hour)).Scan(&sessionID)
	})
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "session_create_failed", "Unable to start a secure session.")
		return
	}
	h.writeTokenResponse(c, Identity{UserID: user.UserID, TenantID: tenantID, StoreID: storeID, MembershipID: user.MembershipID, Role: user.RoleSlug, SessionID: sessionID}, refreshToken, user.Email, user.DisplayName, stores)
}

func (h *Handler) refresh(c *gin.Context) {
	var request refreshRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "invalid_request", "Check the refresh token details and try again.")
		return
	}
	tenantID, err := tenantIDForSlug(c.Request.Context(), h.pool, request.TenantSlug)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(c, http.StatusInternalServerError, "authentication_unavailable", "Unable to refresh this session right now.")
			return
		}
		httpx.Fail(c, http.StatusUnauthorized, "invalid_refresh_token", "The refresh token is invalid or expired.")
		return
	}
	newRefreshToken, err := randomToken()
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "token_generation_failed", "Unable to refresh this session.")
		return
	}
	var identity Identity
	var email, displayName string
	var stores []storeRow
	err = database.WithTenantTx(c.Request.Context(), h.pool, tenantID, func(tx pgx.Tx) error {
		if err := tx.QueryRow(c.Request.Context(), `
			SELECT s.id::text, s.user_id::text, s.membership_id::text, s.store_id::text,
			       u.email, u.display_name, m.role_slug
			FROM auth_sessions s
			JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL
			JOIN memberships m ON m.id = s.membership_id AND m.tenant_id = s.tenant_id AND m.status = 'active' AND m.deleted_at IS NULL
			WHERE s.tenant_id = $1 AND s.refresh_token_hash = $2
			  AND s.revoked_at IS NULL AND s.expires_at > now()
			FOR UPDATE OF s`, tenantID, hashToken(request.RefreshToken)).
			Scan(&identity.SessionID, &identity.UserID, &identity.MembershipID, &identity.StoreID, &email, &displayName, &identity.Role); err != nil {
			return err
		}
		identity.TenantID = tenantID
		rows, err := tx.Query(c.Request.Context(), `SELECT st.id::text, st.name, st.slug FROM membership_stores ms JOIN stores st ON st.id = ms.store_id AND st.tenant_id = ms.tenant_id WHERE ms.tenant_id = $1 AND ms.membership_id = $2 ORDER BY st.name`, tenantID, identity.MembershipID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var store storeRow
			if err := rows.Scan(&store.ID, &store.Name, &store.Slug); err != nil {
				return err
			}
			stores = append(stores, store)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		if _, err := tx.Exec(c.Request.Context(), `UPDATE auth_sessions SET refresh_token_hash = $3 WHERE tenant_id = $1 AND id = $2`, tenantID, identity.SessionID, hashToken(newRefreshToken)); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		httpx.Fail(c, http.StatusUnauthorized, "invalid_refresh_token", "The refresh token is invalid or expired.")
		return
	}
	h.writeTokenResponse(c, identity, newRefreshToken, email, displayName, stores)
}

func (h *Handler) logout(c *gin.Context) {
	identity, ok := CurrentIdentity(c)
	if !ok {
		httpx.Fail(c, http.StatusUnauthorized, "unauthorized", "Sign in to continue.")
		return
	}
	err := database.WithTenantTx(c.Request.Context(), h.pool, identity.TenantID, func(tx pgx.Tx) error {
		_, err := tx.Exec(c.Request.Context(), `UPDATE auth_sessions SET revoked_at = now() WHERE tenant_id = $1 AND id = $2 AND revoked_at IS NULL`, identity.TenantID, identity.SessionID)
		return err
	})
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "logout_failed", "Unable to close this session.")
		return
	}
	httpx.Success(c, http.StatusOK, gin.H{"logged_out": true})
}

func (h *Handler) writeTokenResponse(c *gin.Context, identity Identity, refreshToken, email, displayName string, stores []storeRow) {
	accessToken, expiresAt, err := h.issueAccessToken(identity)
	if err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "token_generation_failed", "Unable to start a secure session.")
		return
	}
	httpx.Success(c, http.StatusOK, gin.H{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
		"token_type":    "Bearer",
		"expires_at":    expiresAt,
		"user":          gin.H{"id": identity.UserID, "email": email, "display_name": displayName, "role": identity.Role},
		"tenant_id":     identity.TenantID,
		"store_id":      identity.StoreID,
		"stores":        stores,
	})
}

func (h *Handler) issueAccessToken(identity Identity) (string, time.Time, error) {
	now := time.Now()
	expiresAt := now.Add(time.Duration(h.cfg.AccessTTL) * time.Minute)
	claims := Claims{
		TenantID: identity.TenantID, StoreID: identity.StoreID, MembershipID: identity.MembershipID,
		Role: identity.Role, SessionID: identity.SessionID,
		RegisteredClaims: jwt.RegisteredClaims{Subject: identity.UserID, IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(expiresAt), NotBefore: jwt.NewNumericDate(now), ID: identity.SessionID, Issuer: "fnb-saas-api"},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(h.cfg.JWTSecret)
	return signed, expiresAt, err
}

func Authenticate(pool *pgxpool.Pool, secret []byte) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := strings.TrimSpace(c.GetHeader("Authorization"))
		if !strings.HasPrefix(header, "Bearer ") {
			httpx.Fail(c, http.StatusUnauthorized, "unauthorized", "Sign in to continue.")
			c.Abort()
			return
		}
		token, err := jwt.ParseWithClaims(strings.TrimSpace(strings.TrimPrefix(header, "Bearer ")), &Claims{}, func(token *jwt.Token) (any, error) {
			if token.Method != jwt.SigningMethodHS256 {
				return nil, errors.New("unexpected signing method")
			}
			return secret, nil
		}, jwt.WithIssuer("fnb-saas-api"), jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
		if err != nil || token == nil || !token.Valid {
			httpx.Fail(c, http.StatusUnauthorized, "invalid_token", "The access token is invalid or expired.")
			c.Abort()
			return
		}
		claims, ok := token.Claims.(*Claims)
		if !ok || claims.Subject == "" || claims.TenantID == "" || claims.StoreID == "" || claims.SessionID == "" {
			httpx.Fail(c, http.StatusUnauthorized, "invalid_token", "The access token is invalid or expired.")
			c.Abort()
			return
		}
		identity := Identity{UserID: claims.Subject, TenantID: claims.TenantID, StoreID: claims.StoreID, MembershipID: claims.MembershipID, Role: claims.Role, SessionID: claims.SessionID}
		var currentRole string
		err = database.WithTenantTx(c.Request.Context(), pool, identity.TenantID, func(tx pgx.Tx) error {
			return tx.QueryRow(c.Request.Context(), `
				SELECT m.role_slug
				FROM auth_sessions s
				JOIN memberships m ON m.id = s.membership_id AND m.tenant_id = s.tenant_id
				JOIN membership_stores ms ON ms.tenant_id = s.tenant_id AND ms.membership_id = s.membership_id AND ms.store_id = s.store_id
			WHERE s.tenant_id = $1 AND s.id = $2 AND s.user_id = $3 AND s.store_id = $4
			  AND s.revoked_at IS NULL AND s.expires_at > now() AND m.status = 'active' AND m.deleted_at IS NULL`,
				identity.TenantID, identity.SessionID, identity.UserID, identity.StoreID).Scan(&currentRole)
		})
		if err != nil {
			if !errors.Is(err, pgx.ErrNoRows) {
				httpx.Fail(c, http.StatusInternalServerError, "session_check_failed", "Unable to verify this session right now.")
				c.Abort()
				return
			}
			httpx.Fail(c, http.StatusUnauthorized, "session_expired", "This session is no longer active.")
			c.Abort()
			return
		}
		identity.Role = currentRole
		c.Set("identity", identity)
		c.Next()
	}
}

func RequireRoles(roles ...string) gin.HandlerFunc {
	allowed := make(map[string]struct{}, len(roles))
	for _, role := range roles {
		allowed[role] = struct{}{}
	}
	return func(c *gin.Context) {
		identity, ok := CurrentIdentity(c)
		if !ok {
			httpx.Fail(c, http.StatusUnauthorized, "unauthorized", "Sign in to continue.")
			c.Abort()
			return
		}
		if _, ok := allowed[identity.Role]; !ok {
			httpx.Fail(c, http.StatusForbidden, "forbidden", "You do not have permission to perform this action.")
			c.Abort()
			return
		}
		c.Next()
	}
}

func CurrentIdentity(c *gin.Context) (Identity, bool) {
	value, ok := c.Get("identity")
	if !ok {
		return Identity{}, false
	}
	identity, ok := value.(Identity)
	return identity, ok
}

func tenantIDForSlug(ctx context.Context, pool *pgxpool.Pool, slug string) (string, error) {
	tenant, err := dbgen.New(pool).GetTenantBySlug(ctx, strings.TrimSpace(slug))
	return tenant.ID, err
}

func chooseStore(stores []storeRow, requested string) (string, bool) {
	if len(stores) == 0 {
		return "", false
	}
	if requested == "" {
		return stores[0].ID, true
	}
	for _, store := range stores {
		if store.ID == requested {
			return store.ID, true
		}
	}
	return "", false
}

func randomToken() (string, error) {
	buffer := make([]byte, 48)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}

func hashToken(token string) []byte {
	digest := sha256.Sum256([]byte(token))
	return digest[:]
}
