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
  --build-arg VITE_API_BASE_URL=https://dna-backend-<PROJECT_NUMBER>.us-central1.run.app \
  --build-arg VITE_WS_URL=wss://dna-backend-<PROJECT_NUMBER>.us-central1.run.app/ws \
  --build-arg VITE_GOOGLE_CLIENT_ID=<your-google-client-id>.apps.googleusercontent.com \
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
5. **Get Google Client ID** - Retrieves Google OAuth Client ID from Secret Manager for build
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

Prints deployment URLs to the GitHub Actions summary page and confirms security settings.

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
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID for authentication |

### Adding/Updating Secrets

```bash
# Add a new secret
echo -n "secret-value" | gcloud secrets create SECRET_NAME --data-file=-

# Update an existing secret
echo -n "new-value" | gcloud secrets versions add SECRET_NAME --data-file=-
```

---

## Authentication Setup

DNA uses Google OAuth for authentication. Users sign in with their Google accounts, and the backend validates Google tokens.

### Google Cloud Console Setup

1. **Create OAuth Client ID:**
   - Go to [Google Cloud Console > APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)
   - Click "Create Credentials" > "OAuth 2.0 Client ID"
   - Select "Web application" type
   - Add authorized JavaScript origins:
     - Production: `https://dna-frontend-<PROJECT_NUMBER>.us-central1.run.app`
     - Local development: `http://localhost:5173`
   - Save the Client ID

2. **Store the Client ID in Secret Manager:**
   ```bash
   echo -n "YOUR_CLIENT_ID.apps.googleusercontent.com" | \
     gcloud secrets create GOOGLE_CLIENT_ID --data-file=-
   ```

3. **Configure OAuth Consent Screen:**
   - Go to "OAuth consent screen" in Cloud Console
   - For internal use: Select "Internal" user type
   - For external use: Select "External" and add test users or publish the app

### Security Features

| Feature | Setting |
|---------|---------|
| Authentication | Google OAuth (ID tokens or access tokens) |
| CORS | Allow-all in production (re-enable origin restriction when ready) |
| API Documentation | Disabled in production (`DISABLE_DOCS=true`) |
| Security Headers | X-Content-Type-Options, X-Frame-Options, HSTS |

### Local Development

For local development, use the **noop** auth provider so you can sign in with any email and the backend does not validate tokens. Set this in your `docker-compose.local.yml` (the example file already does):

```yaml
# docker-compose.local.yml – noop provider for local dev
environment:
  - AUTH_PROVIDER=none
```

Set the frontend to match: `VITE_AUTH_PROVIDER=none` in the app `.env` (see `packages/app/.env.example`).

To test with Google auth locally:
1. Set `AUTH_PROVIDER=google` in docker-compose.local.yml
2. Add `GOOGLE_CLIENT_ID=your-client-id`
3. Set `VITE_AUTH_PROVIDER=google` and `VITE_GOOGLE_CLIENT_ID` in the frontend
4. Ensure `http://localhost:5173` is in your OAuth client's authorized origins

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
| `AUTH_PROVIDER` | `none` (noop) for local dev; `google` for production |
| `CORS_ALLOWED_ORIGINS` | Comma-separated list of allowed origins |

### Frontend (Build-time)

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Backend API URL |
| `VITE_WS_URL` | WebSocket URL |
| `VITE_AUTH_PROVIDER` | `none` for local (noop/email sign-in); `google` for Google OAuth |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth Client ID (required when `VITE_AUTH_PROVIDER=google`) |

---

## Security

### API Protection

The backend API is protected by:

1. **Google OAuth** - All protected endpoints require a valid Google Bearer token
2. **CORS** - Only allows requests from whitelisted origins (browser-enforced)
3. **Security Headers** - X-Frame-Options, X-Content-Type-Options, HSTS, etc.

### Authentication Flow

```
Frontend (browser) ──────────────────────────────────────▶ Backend
                    Headers:
                    - Origin: https://dna-frontend-xxx.run.app
                    - Authorization: Bearer <google-oauth-token>
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
| CORS errors | Production currently allows all origins (`CORS_ALLOWED_ORIGINS=*`). To restrict to the frontend: `gcloud run services update dna-backend --region us-central1 --update-env-vars="CORS_ALLOWED_ORIGINS=https://YOUR-FRONTEND-URL"` (no trailing slash). |
| 401 Unauthorized | Verify Google OAuth is configured correctly and token is valid |

### Force Redeployment

```bash
# Redeploy with the same image (useful after secret changes)
gcloud run services update dna-backend --region us-central1
gcloud run services update dna-frontend --region us-central1
```
