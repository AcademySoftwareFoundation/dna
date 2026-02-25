# DNA Deployment Guide

This document describes how to deploy the DNA application to Google Cloud Platform (GCP) Cloud Run.
This is for demo deployment of the app to showcase the functionality of the app.

Internal deployments are handled by the studio's adopting the app. It is not intended for production use.
Any production deployment playbook examples would be greatly appreciated! 

## Quick Reference

| Service | URL |
|---------|-----|
| Frontend | https://dna-frontend-560815273032.us-central1.run.app |
| Backend API | https://dna-backend-560815273032.us-central1.run.app/ |

## Deployment Methods

### 1. Automated Deployment (Recommended)

Push a Git tag to trigger the CI/CD pipeline:

```bash
# Create and push a version tag
git tag v1.0.0
git push origin v1.0.0
```

The pipeline automatically:
1. Builds the backend Docker image
2. Deploys the backend to Cloud Run
3. Builds the frontend Docker image (with API configuration baked in)
4. Deploys the frontend to Cloud Run

**Monitor the deployment:**
- GitHub Actions: https://github.com/AcademySoftwareFoundation/dna/actions

### 2. Manual Deployment

For manual deployment without triggering the CI/CD pipeline:

#### Backend

```bash
cd backend

# Build the image
docker build -t us-central1-docker.pkg.dev/<PROJECT_ID>/dna/dna-backend:latest .

# Push to Artifact Registry
docker push us-central1-docker.pkg.dev/<PROJECT_ID>/dna/dna-backend:latest

# Deploy to Cloud Run
gcloud run deploy dna-backend \
  --image us-central1-docker.pkg.dev/<PROJECT_ID>/dna/dna-backend:latest \
  --region us-central1 \
  --platform managed
```

#### Frontend

```bash
cd frontend

# Build the image with required build args
docker build \
  --build-arg VITE_API_BASE_URL=https://dna-api.spadjv.org \
  --build-arg VITE_WS_URL=wss://dna-api.spadjv.org/ws \
  --build-arg VITE_API_KEY=<your-api-key> \
  -t us-central1-docker.pkg.dev/<PROJECT_ID>/dna/dna-frontend:latest .

# Push to Artifact Registry
docker push us-central1-docker.pkg.dev/<PROJECT_ID>/dna/dna-frontend:latest

# Deploy to Cloud Run
gcloud run deploy dna-frontend \
  --image us-central1-docker.pkg.dev/<PROJECT_ID>/dna/dna-frontend:latest \
  --region us-central1 \
  --platform managed
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GitHub Actions                                │
│                    (Triggered on v* tags)                           │
└─────────────────────┬───────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    GCP Cloud Run (us-central1)                       │
│  ┌────────────────────────┐      ┌────────────────────────┐         │
│  │    dna-frontend        │      │    dna-backend         │         │
│  │    (nginx + static)    │─────▶│    (FastAPI + uvicorn) │         │
│  │    Port: 8080          │      │    Port: 8000          │         │
│  └────────────────────────┘      └───────────┬────────────┘         │
│                                              │                       │
└──────────────────────────────────────────────┼───────────────────────┘
                                               │
                      ┌────────────────────────┼────────────────────────┐
                      │                        │                        │
                      ▼                        ▼                        ▼
              ┌──────────────┐      ┌──────────────┐        ┌──────────────┐
              │ MongoDB Atlas│      │   ShotGrid   │        │   OpenAI     │
              │  (Storage)   │      │  (ProdTrack) │        │    (LLM)     │
              └──────────────┘      └──────────────┘        └──────────────┘
```

## CI/CD Pipeline Details

### Workflow Trigger

The deployment workflow (`deploy-gcp.yml`) triggers on pushes of tags matching `v*`:

```yaml
on:
  push:
    tags:
      - 'v*'
```

### Pipeline Jobs

#### 1. Deploy Backend (`deploy-backend`)

**Steps:**
1. **Checkout code** - Fetches the repository at the tagged commit
2. **Authenticate to GCP** - Uses Workload Identity Federation (no service account keys)
3. **Set up Cloud SDK** - Configures `gcloud` CLI
4. **Configure Docker** - Authenticates to Artifact Registry
5. **Build and push image** - Creates Docker image tagged with Git tag version
6. **Deploy to Cloud Run** - Deploys with:
   - Secrets injected from GCP Secret Manager
   - Environment variables for configuration
   - Scale-to-zero configuration (min-instances: 0)

**Cloud Run Configuration:**
| Setting | Value |
|---------|-------|
| CPU | 1 |
| Memory | 512Mi |
| Min Instances | 0 (scale-to-zero) |
| Max Instances | 3 |
| Concurrency | 80 |
| Timeout | 300s |

#### 2. Deploy Frontend (`deploy-frontend`)

**Depends on:** `deploy-backend` (runs after backend succeeds)

**Steps:**
1. **Checkout code** - Fetches the repository
2. **Authenticate to GCP** - Uses Workload Identity Federation
3. **Set up Cloud SDK** - Configures `gcloud` CLI
4. **Configure Docker** - Authenticates to Artifact Registry
5. **Get API Key** - Retrieves API key from Secret Manager for build
6. **Build and push image** - Multi-stage build:
   - Stage 1: Node.js builds the Vite application
   - Stage 2: nginx serves the static files
7. **Deploy to Cloud Run** - Deploys the static frontend

**Cloud Run Configuration:**
| Setting | Value |
|---------|-------|
| CPU | 1 |
| Memory | 256Mi |
| Min Instances | 0 (scale-to-zero) |
| Max Instances | 2 |
| Concurrency | 80 |
| Timeout | 60s |

#### 3. Summary (`summary`)

Prints deployment URLs to the GitHub Actions summary page.

---

## Docker Images

### Backend Dockerfile

The backend uses a single-stage Python image:

- **Base:** `python:3.11-slim`
- **Framework:** FastAPI with uvicorn
- **Port:** 8000

### Frontend Dockerfile

The frontend uses a multi-stage build:

1. **Builder stage:** `node:20-alpine`
   - Installs dependencies
   - Builds the Vite application with baked-in environment variables
   
2. **Production stage:** `nginx:alpine`
   - Serves static files
   - Handles SPA routing (all routes → `index.html`)
   - Port: 8080

---

## Secret Management

All secrets are stored in GCP Secret Manager and injected at runtime:

| Secret | Description |
|--------|-------------|
| `MONGODB_URL` | MongoDB Atlas connection string |
| `SHOTGRID_URL` | ShotGrid server URL |
| `SHOTGRID_API_KEY` | ShotGrid API key |
| `SHOTGRID_SCRIPT_NAME` | ShotGrid script name |
| `OPENAI_API_KEY` | OpenAI API key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `VEXA_API_URL` | Vexa transcription service URL |
| `VEXA_API_KEY` | Vexa API key |
| `API_KEY` | Frontend-to-backend API key |

### Adding/Updating Secrets

```bash
# Add a new secret
echo -n "secret-value" | gcloud secrets create SECRET_NAME --data-file=-

# Update an existing secret
echo -n "new-value" | gcloud secrets versions add SECRET_NAME --data-file=-
```

---

## GitHub Secrets Required

The following secrets must be configured in GitHub repository settings:

| Secret | Description |
|--------|-------------|
| `GCP_PROJECT_ID` | GCP project ID |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity Federation provider |
| `GCP_SERVICE_ACCOUNT` | GCP service account email |

---

## Environment Variables

### Backend

| Variable | Value |
|----------|-------|
| `PYTHONUNBUFFERED` | 1 |
| `STORAGE_PROVIDER` | mongodb |
| `PRODTRACK_PROVIDER` | shotgrid |
| `LLM_PROVIDER` | openai |
| `CORS_ALLOWED_ORIGINS` | Comma-separated list of allowed origins |

### Frontend (Build-time)

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Backend API URL |
| `VITE_WS_URL` | WebSocket URL |
| `VITE_API_KEY` | API key for backend authentication |

---

## Security

### API Protection

The backend API is protected by:

1. **CORS** - Only allows requests from whitelisted origins (browser-enforced)
2. **API Key Middleware** - Requires `X-API-Key` header for all endpoints except `/health`

### Authentication Flow

```
Frontend (browser) ──────────────────────────────────────▶ Backend
                    Headers:
                    - Origin: https://dna.spadjv.org
                    - X-API-Key: <baked-in-key>
```

---

## Troubleshooting

### Check Deployment Status

```bash
# List Cloud Run services
gcloud run services list --region us-central1

# View service details
gcloud run services describe dna-backend --region us-central1
gcloud run services describe dna-frontend --region us-central1

# View logs
gcloud run services logs read dna-backend --region us-central1
gcloud run services logs read dna-frontend --region us-central1
```

### Common Issues

| Issue | Solution |
|-------|----------|
| 403 on deployment | Ensure service account has `roles/run.admin` and `roles/secretmanager.secretAccessor` |
| Image not found | Verify Artifact Registry repository exists and image was pushed |
| Cold start slow | Expected with scale-to-zero; first request takes ~5-10s |
| CORS errors | Check `CORS_ALLOWED_ORIGINS` includes the requesting domain |
| 401 Unauthorized | Verify API key is correctly baked into frontend build |

### Force Redeployment

```bash
# Redeploy with the same image (useful after secret changes)
gcloud run services update dna-backend --region us-central1
gcloud run services update dna-frontend --region us-central1
```
