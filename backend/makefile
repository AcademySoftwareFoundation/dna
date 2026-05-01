DOCKER_COMPOSE := $(shell command -v docker-compose 2>/dev/null || echo "docker compose")

COMPOSE_LOCAL := -f docker-compose.yml -f docker-compose.vexa.yml -f docker-compose.debug.yml -f docker-compose.local.yml -f docker-compose.local.vexa.yml

# If start-local fails with: blob sha256:... input/output error — Docker’s local
# image store is damaged. Run: make docker-fix-api-image, restart Docker Desktop,
# then make start-local. If it still fails: Docker → Troubleshoot → Clean/Purge
# data, or check disk space.

docker-fix-api-image:
	-$(DOCKER_COMPOSE) $(COMPOSE_LOCAL) down
	-docker rmi backend-api 2>/dev/null || true
	@echo "Removed backend-api if present. Restart Docker Desktop, then: make start-local"

build:
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.vexa.yml -f docker-compose.local.yml -f docker-compose.local.vexa.yml build --no-cache

start-local:
	$(DOCKER_COMPOSE) $(COMPOSE_LOCAL) up --build

stop-local:
	$(DOCKER_COMPOSE) $(COMPOSE_LOCAL) down

logs-local:
	$(DOCKER_COMPOSE) $(COMPOSE_LOCAL) logs -f

restart-local:
	make stop-local
	make start-local

shell:
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.local.yml run --rm api bash

test:
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.local.yml run --rm api python -m pytest

test-cov:
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.local.yml run --rm api python -m pytest

test-cov-html:
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.local.yml run --rm api python -m pytest
	@echo "Coverage report available at htmlcov/index.html"

venv-lint:
	@if [ ! -d ".venv-lint" ]; then \
		echo "Creating virtual environment for linting..."; \
		python3 -m venv .venv-lint; \
		.venv-lint/bin/pip install --upgrade pip; \
		.venv-lint/bin/pip install black isort; \
	else \
		echo "Virtual environment already exists."; \
	fi

format-python: venv-lint
	.venv-lint/bin/black src/ tests/
	.venv-lint/bin/isort src/ tests/

seed-mock-db:
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.local.yml run --rm api python -m dna.prodtrack_providers.mock_data.seed_db --project-id 124 --url https://aswf.shotgrid.autodesk.com --script-name DNA_local_testing --api-key '$(SHOTGRID_API_KEY)'

start-mongo:
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.local.yml up -d mongo
