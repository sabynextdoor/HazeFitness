# syntax=docker/dockerfile:1

# ------------------------------------------------------------------
# Stage 1 — build the React (Vite) frontend into static assets
# ------------------------------------------------------------------
FROM node:20-alpine AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ------------------------------------------------------------------
# Stage 2 — production runtime (Express API + static SPA host)
# ------------------------------------------------------------------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY backend/ ./
COPY database/ /app/database/
COPY --from=frontend-build /build/dist /app/frontend/dist

EXPOSE 4000
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1

CMD ["node", "server.js"]
