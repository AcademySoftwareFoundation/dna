---
name: run-tests
description: Run and verify tests for the DNA project. Use when making code changes, running tests, checking coverage, or when the user asks to test changes. Covers both backend (pytest via Docker) and frontend (Vitest) testing workflows.
---

# Run Tests

## Quick Reference

| Component | Command | Working Directory |
|-----------|---------|-------------------|
| Backend | `make test` | `backend/` |
| Frontend (all) | `npm run test-ci` | `frontend/` |
| Frontend (watch) | `npm run test` | `frontend/` |

## Backend Testing

Backend uses pytest with pytest-cov, running inside Docker.

```bash
cd backend
make test
```

### Coverage Commands

```bash
make test-cov          # Run with coverage
make test-cov-html     # Generate HTML coverage report (htmlcov/index.html)
```

### Coverage Requirement

**Backend tests must maintain at least 90% coverage.**

### After Backend Changes

Always run `make format-python` after making backend changes:

```bash
cd backend
make format-python
```

## Frontend Testing

Frontend uses Vitest for both `@dna/core` and `@dna/app` packages.

### Run All Tests

```bash
cd frontend
npm run test-ci    # Single run, no watch (preferred for verification)
npm run test       # Watch mode (for development)
```

### Run with Coverage

```bash
npm run test:coverage
```

### Run Specific Package

```bash
npm run test --workspace=@dna/core
npm run test --workspace=@dna/app
```

## Test File Conventions

| Component | Pattern | Location |
|-----------|---------|----------|
| Backend | `test_*.py` | `backend/tests/` |
| Frontend | `*.test.ts` or `*.test.tsx` | Alongside source or in `__tests__/` |

## Workflow

When making changes:

1. Make your code changes
2. Run the appropriate tests:
   - Backend changes: `make test` from `backend/`
   - Frontend changes: `npm run test-ci` from `frontend/`
3. Fix any failing tests
4. For backend: run `make format-python`
5. Verify coverage meets requirements (90% for backend)
