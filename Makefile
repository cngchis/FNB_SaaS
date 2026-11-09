COMPOSE = docker compose --env-file deploy/.env -f deploy/docker-compose.yml

.PHONY: up down logs migrate-up migrate-down bootstrap api-build api-test sqlc

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

api-build:
	cd apps/api && go build ./...

api-test:
	cd apps/api && go test ./...

sqlc:
	cd apps/api && sqlc generate -f sqlc.yaml
