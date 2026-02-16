DOCKER_COMPOSE := $(shell command -v docker-compose 2>/dev/null || echo "docker compose")

build:
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.local.yml build --no-cache

start-local:
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.vexa.yml -f docker-compose.debug.yml -f docker-compose.local.yml -f docker-compose.local.vexa.yml up --build

stop-local:
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.vexa.yml -f docker-compose.debug.yml -f docker-compose.local.yml -f docker-compose.local.vexa.yml down

logs-local:
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.vexa.yml -f docker-compose.debug.yml -f docker-compose.local.yml -f docker-compose.local.vexa.yml logs -f

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
