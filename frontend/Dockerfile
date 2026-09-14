# Stage 1: Build the application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files including lock file
COPY package.json package-lock.json ./
COPY packages/core/package*.json ./packages/core/
COPY packages/app/package*.json ./packages/app/

# Use npm install (not ci) so Rollup/Vite optional native bindings are resolved for the
# container platform (linux/amd64 in CI). npm ci can fail with MODULE_NOT_FOUND for
# @rollup/rollup-linux-*-musl due to optional dependency resolution (npm/cli#4828).
RUN npm install --include=dev || (sleep 30 && npm install --include=dev) || (sleep 60 && npm install --include=dev)
# Copy source code
COPY packages/core/ ./packages/core/
COPY packages/app/ ./packages/app/

# Build arguments for API URLs and authentication (baked into the static build)
ARG VITE_API_BASE_URL
ARG VITE_WS_URL
ARG VITE_AUTH_PROVIDER=google
ARG VITE_GOOGLE_CLIENT_ID

# Set environment variables for build
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_AUTH_PROVIDER=$VITE_AUTH_PROVIDER
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

# Build the application (vite handles transpilation, skip tsc type checking)
WORKDIR /app/packages/app
RUN npx vite build

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built files from builder stage
COPY --from=builder /app/packages/app/dist /usr/share/nginx/html

# Expose port 8080 (Cloud Run expects this)
EXPOSE 8080

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
