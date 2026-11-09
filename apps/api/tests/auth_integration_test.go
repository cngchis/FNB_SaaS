package tests

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

type tokenResponse struct {
	Data struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		TenantID     string `json:"tenant_id"`
		StoreID      string `json:"store_id"`
		User         struct {
			ID   string `json:"id"`
			Role string `json:"role"`
		} `json:"user"`
	} `json:"data"`
}

// TestAuthLifecycle exercises a running API without logging passwords or tokens.
func TestAuthLifecycle(t *testing.T) {
	tenant := os.Getenv("AUTH_TEST_TENANT")
	email := os.Getenv("AUTH_TEST_EMAIL")
	password := os.Getenv("AUTH_TEST_PASSWORD")
	if tenant == "" || email == "" || password == "" {
		t.Skip("set AUTH_TEST_TENANT, AUTH_TEST_EMAIL, and AUTH_TEST_PASSWORD to test a running API")
	}
	baseURL := strings.TrimRight(os.Getenv("AUTH_TEST_BASE_URL"), "/")
	if baseURL == "" {
		baseURL = "http://localhost:8080"
	}
	client := &http.Client{Timeout: 10 * time.Second}
	var activeAccessToken string
	t.Cleanup(func() {
		if activeAccessToken == "" {
			return
		}
		request, err := http.NewRequest(http.MethodPost, baseURL+"/api/v1/auth/logout", nil)
		if err != nil {
			t.Errorf("prepare session cleanup: %v", err)
			return
		}
		request.Header.Set("Authorization", "Bearer "+activeAccessToken)
		response, err := client.Do(request)
		if err != nil {
			t.Errorf("clean up test session: %v", err)
			return
		}
		defer response.Body.Close()
		if response.StatusCode != http.StatusOK && response.StatusCode != http.StatusUnauthorized {
			t.Errorf("session cleanup returned HTTP %d", response.StatusCode)
		}
	})

	authRequest(t, client, baseURL, http.MethodGet, "/api/v1/me", "", nil, http.StatusUnauthorized, nil)
	var login tokenResponse
	authRequest(t, client, baseURL, http.MethodPost, "/api/v1/auth/login", "", map[string]string{
		"tenant_slug": tenant, "email": email, "password": password,
	}, http.StatusOK, &login)
	activeAccessToken = login.Data.AccessToken
	if activeAccessToken == "" || login.Data.RefreshToken == "" || login.Data.User.ID == "" || login.Data.TenantID == "" || login.Data.StoreID == "" {
		t.Fatal("login response is missing tokens or identity context")
	}
	checkIdentity := func(accessToken string) {
		var identity struct {
			Data struct {
				UserID   string `json:"user_id"`
				TenantID string `json:"tenant_id"`
				StoreID  string `json:"store_id"`
				Role     string `json:"role"`
			} `json:"data"`
		}
		authRequest(t, client, baseURL, http.MethodGet, "/api/v1/me", accessToken, nil, http.StatusOK, &identity)
		if identity.Data.UserID != login.Data.User.ID || identity.Data.TenantID != login.Data.TenantID || identity.Data.StoreID != login.Data.StoreID || identity.Data.Role != login.Data.User.Role {
			t.Fatal("authenticated identity differs from login context")
		}
	}
	checkIdentity(activeAccessToken)
	authorizedStatus := http.StatusForbidden
	if login.Data.User.Role == "owner" || login.Data.User.Role == "manager" {
		authorizedStatus = http.StatusOK
	}
	authRequest(t, client, baseURL, http.MethodGet, "/api/v1/admin/access-check", activeAccessToken, nil, authorizedStatus, nil)

	var refreshed tokenResponse
	authRequest(t, client, baseURL, http.MethodPost, "/api/v1/auth/refresh", "", map[string]string{
		"tenant_slug": tenant, "refresh_token": login.Data.RefreshToken,
	}, http.StatusOK, &refreshed)
	if refreshed.Data.AccessToken != "" {
		activeAccessToken = refreshed.Data.AccessToken
	}
	if refreshed.Data.AccessToken == "" || refreshed.Data.RefreshToken == "" || refreshed.Data.RefreshToken == login.Data.RefreshToken {
		t.Fatal("refresh did not return an access token and rotate the refresh token")
	}
	checkIdentity(activeAccessToken)
	authRequest(t, client, baseURL, http.MethodPost, "/api/v1/auth/refresh", "", map[string]string{
		"tenant_slug": tenant, "refresh_token": login.Data.RefreshToken,
	}, http.StatusUnauthorized, nil)

	authRequest(t, client, baseURL, http.MethodPost, "/api/v1/auth/logout", activeAccessToken, nil, http.StatusOK, nil)
	activeAccessToken = ""
	for _, accessToken := range []string{login.Data.AccessToken, refreshed.Data.AccessToken} {
		authRequest(t, client, baseURL, http.MethodGet, "/api/v1/me", accessToken, nil, http.StatusUnauthorized, nil)
	}
	authRequest(t, client, baseURL, http.MethodPost, "/api/v1/auth/refresh", "", map[string]string{
		"tenant_slug": tenant, "refresh_token": refreshed.Data.RefreshToken,
	}, http.StatusUnauthorized, nil)
}

func authRequest(t *testing.T, client *http.Client, baseURL, method, path, accessToken string, payload any, expectedStatus int, output any) {
	t.Helper()
	var body bytes.Buffer
	if payload != nil {
		if err := json.NewEncoder(&body).Encode(payload); err != nil {
			t.Fatalf("encode request for %s: %v", path, err)
		}
	}
	request, err := http.NewRequest(method, baseURL+path, &body)
	if err != nil {
		t.Fatalf("prepare request for %s: %v", path, err)
	}
	request.Header.Set("Content-Type", "application/json")
	if accessToken != "" {
		request.Header.Set("Authorization", "Bearer "+accessToken)
	}
	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("request to %s failed: %v", path, err)
	}
	defer response.Body.Close()
	if response.StatusCode != expectedStatus {
		t.Fatalf("%s %s returned HTTP %d; want %d", method, path, response.StatusCode, expectedStatus)
	}
	if output != nil {
		if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(output); err != nil {
			t.Fatalf("decode response from %s: %v", path, err)
		}
	} else {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 1<<20))
	}
}
