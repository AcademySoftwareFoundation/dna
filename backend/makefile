build:
	docker-compose -f docker-compose.yml -f docker-compose.local.yml build --no-cache

start-local:
	docker-compose -f docker-compose.yml -f docker-compose.vexa.yml -f docker-compose.debug.yml -f docker-compose.local.yml up --build

stop-local:
	docker-compose -f docker-compose.yml -f docker-compose.vexa.yml -f docker-compose.debug.yml -f docker-compose.local.yml down

logs-local:
	docker-compose -f docker-compose.yml -f docker-compose.vexa.yml -f docker-compose.debug.yml -f docker-compose.local.yml logs -f

restart-local:
	make stop-local
	make start-local

shell:
	docker-compose -f docker-compose.yml -f docker-compose.local.yml run --rm api bash

test:
	docker-compose -f docker-compose.yml -f docker-compose.local.yml run --rm api python -m pytest

test-cov:
	docker-compose -f docker-compose.yml -f docker-compose.local.yml run --rm api python -m pytest

test-cov-html:
	docker-compose -f docker-compose.yml -f docker-compose.local.yml run --rm api python -m pytest
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