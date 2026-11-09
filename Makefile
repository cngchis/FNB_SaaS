COMPOSE = docker compose --env-file deploy/.env -f deploy/docker-compose.yml

.PHONY: up down logs migrate-up migrate-down bootstrap api-run api-build api-test migrate-up-local migrate-down-local bootstrap-local sqlc

up:
	$(COMPOSE) up --build

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f api database

migrate-up:
	$(COMPOSE) --profile tools run --rm migrate

migrate-down:
	$(COMPOSE) run --rm --entrypoint /bin/sh migrate -c '/goose -dir /app/migrations postgres "$$MIGRATIONS_DATABASE_URL" down'

bootstrap:
	$(COMPOSE) --profile tools run --rm bootstrap

api-run:
	cd apps/api && go run ./cmd/api

api-build:
	cd apps/api && go build ./...

api-test:
	cd apps/api && go test ./...

migrate-up-local:
	cd apps/api && goose -dir migrations postgres "$$MIGRATIONS_DATABASE_URL" up

migrate-down-local:
	cd apps/api && goose -dir migrations postgres "$$MIGRATIONS_DATABASE_URL" down

bootstrap-local:
	cd apps/api && go run ./cmd/bootstrap

sqlc:
	cd apps/api && go run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.29.0 generate -f sqlc.yaml
