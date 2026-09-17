DOCKER_COMPOSE := $(shell command -v docker-compose 2>/dev/null || echo "docker compose")

# Vexa stack — server-side bot transcription (pulls Vexa images).
COMPOSE_LOCAL_VEXA := -f docker-compose.yml -f docker-compose.vexa.yml -f docker-compose.debug.yml -f docker-compose.local.yml -f docker-compose.local.vexa.yml

# Extension stack — browser extension + WhisperLive (no Vexa images).
COMPOSE_LOCAL_EXTENSION := -f docker-compose.yml -f docker-compose.debug.yml -f docker-compose.local.yml -f docker-compose.whisperlive.yml

# Backward-compatible alias for the Vexa stack.
COMPOSE_LOCAL := $(COMPOSE_LOCAL_VEXA)

# If start-local fails with: blob sha256:... input/output error — Docker's local
# image store is damaged. Run: make docker-fix-api-image, restart Docker Desktop,
# then make start-local-vexa. If it still fails: Docker → Troubleshoot → Clean/Purge
# data, or check disk space.

.PHONY: start-local-vexa start-local-vexa-detached stop-local-vexa logs-local-vexa restart-local-vexa build-vexa \
	start-local-extension start-local-extension-detached stop-local-extension logs-local-extension restart-local-extension build-extension \
	start-local stop-local logs-local restart-local build docker-fix-api-image shell test test-cov test-cov-html venv-lint format-python seed-mock-db inject-transcript

# ── Vexa stack ────────────────────────────────────────────────────────────────

start-local-vexa:
	$(DOCKER_COMPOSE) $(COMPOSE_LOCAL_VEXA) up --build

start-local-vexa-detached:
	$(DOCKER_COMPOSE) $(COMPOSE_LOCAL_VEXA) up --build -d --force-recreate --remove-orphans

stop-local-vexa:
	$(DOCKER_COMPOSE) $(COMPOSE_LOCAL_VEXA) down

logs-local-vexa:
	$(DOCKER_COMPOSE) $(COMPOSE_LOCAL_VEXA) logs -f

restart-local-vexa:
	$(MAKE) stop-local-vexa
	$(MAKE) start-local-vexa

build-vexa:
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.vexa.yml -f docker-compose.local.yml -f docker-compose.local.vexa.yml build --no-cache

# ── Extension stack (no Vexa) ─────────────────────────────────────────────────

start-local-extension:
	$(DOCKER_COMPOSE) $(COMPOSE_LOCAL_EXTENSION) up --build

start-local-extension-detached:
	$(DOCKER_COMPOSE) $(COMPOSE_LOCAL_EXTENSION) up --build -d --force-recreate --remove-orphans

stop-local-extension:
	$(DOCKER_COMPOSE) $(COMPOSE_LOCAL_EXTENSION) down

logs-local-extension:
	$(DOCKER_COMPOSE) $(COMPOSE_LOCAL_EXTENSION) logs -f

restart-local-extension:
	$(MAKE) stop-local-extension
	$(MAKE) start-local-extension

build-extension:
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.local.yml -f docker-compose.whisperlive.yml build --no-cache

# ── Backward-compatible aliases (Vexa stack) ──────────────────────────────────

start-local: start-local-vexa

stop-local: stop-local-vexa

logs-local: logs-local-vexa

restart-local: restart-local-vexa

build: build-vexa

# ── Shared / utility targets ──────────────────────────────────────────────────

docker-fix-api-image:
	-$(DOCKER_COMPOSE) $(COMPOSE_LOCAL_VEXA) down
	-docker rmi backend-api 2>/dev/null || true
	@echo "Removed backend-api if present. Restart Docker Desktop, then: make start-local-vexa"

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

inject-transcript:
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.local.yml run --rm \
		-v "$(abspath $(FILE)):/tmp/inject_input.json:ro" \
		-v "$(abspath ../scripts/inject_transcript.py):/tmp/inject_transcript.py:ro" \
		api python /tmp/inject_transcript.py /tmp/inject_input.json $(if $(DRYRUN),--dry-run,)
