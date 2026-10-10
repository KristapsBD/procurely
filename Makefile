.PHONY: help up down prune reset seed logs ps psql env

# Every checkout gets its own stack: the Compose project name and the host ports derive
# from a checksum of this checkout's absolute path, so two checkouts never share containers,
# volumes or ports, and the same checkout gets the same values on every run.
# COMPOSE_PROJECT_NAME, API_PORT and DB_PORT set in the environment win over the derived values.
# `make env` also exports STACK_CHECKOUT, so a shell that loaded one checkout's values cannot
# drive another checkout's commands at that stack.
ifneq ($(STACK_CHECKOUT),)
ifneq ($(STACK_CHECKOUT),$(CURDIR))
$(error This shell holds the stack values of $(STACK_CHECKOUT) (from make env). Open a new shell, or run: unset STACK_CHECKOUT COMPOSE_PROJECT_NAME API_PORT DB_PORT DATABASE_URL DIRECT_URL)
endif
endif
STACK_ID := $(shell printf '%s' '$(CURDIR)' | cksum | cut -d' ' -f1)
STACK_SLOT := $(shell expr $(STACK_ID) % 10000)
COMPOSE_PROJECT_NAME ?= procurely-$(STACK_ID)
API_PORT ?= $(shell expr 10000 + $(STACK_SLOT))
DB_PORT ?= $(shell expr 20000 + $(STACK_SLOT))
export COMPOSE_PROJECT_NAME API_PORT DB_PORT
STACK_SUMMARY = $(COMPOSE_PROJECT_NAME): API http://localhost:$(API_PORT), Postgres localhost:$(DB_PORT)

help: ## List available targets
	@grep -E '^[a-z]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-6s %s\n", $$1, $$2}'

up: ## Build and start Postgres + API, wait until healthy
	docker compose up --build -d --wait
	@echo "$(STACK_SUMMARY)"

down: ## Stop the stack, keep the database data
	docker compose down

prune: ## List leftover procurely stacks; APPLY=1 removes the listed ones
	@APPLY='$(APPLY)' bash '$(CURDIR)/scripts/prune-stacks.sh'

reset: ## Wipe the database volume and start fresh
	docker compose down -v
	docker compose up --build -d --wait
	@echo "$(STACK_SUMMARY)"

seed: ## Reset the database schema and reload the seed data (stack must be up)
	docker compose exec api pnpm db:reset

logs: ## Follow API and Postgres logs
	docker compose logs -f api db

ps: ## Show container status
	docker compose ps

psql: ## Open a psql shell in the Postgres container
	docker compose exec db psql -U procurely -d procurely

env: ## Print this checkout's stack name, ports and database URLs as shell exports
	@echo "export STACK_CHECKOUT='$(CURDIR)' COMPOSE_PROJECT_NAME=$(COMPOSE_PROJECT_NAME) API_PORT=$(API_PORT) DB_PORT=$(DB_PORT)"
	@echo "export DATABASE_URL=postgresql://procurely_api:procurely_api@localhost:$(DB_PORT)/procurely"
	@echo "export DIRECT_URL=postgresql://procurely:procurely@localhost:$(DB_PORT)/procurely"
