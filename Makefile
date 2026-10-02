.PHONY: help up down reset seed logs ps psql

help: ## List available targets
	@grep -E '^[a-z]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-6s %s\n", $$1, $$2}'

up: ## Build and start Postgres + API, wait until healthy
	docker compose up --build -d --wait

down: ## Stop the stack, keep the database data
	docker compose down

reset: ## Wipe the database volume and start fresh
	docker compose down -v
	docker compose up --build -d --wait

seed: ## Reset the database schema and reload the seed data (stack must be up)
	docker compose exec api pnpm db:reset

logs: ## Follow API and Postgres logs
	docker compose logs -f api db

ps: ## Show container status
	docker compose ps

psql: ## Open a psql shell in the Postgres container
	docker compose exec db psql -U procurely -d procurely
