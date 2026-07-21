# ===================================================================
# nic-sms-frontend — React + Vite, multi-stage build served by nginx
# ===================================================================
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies first (cached layer)
COPY package.json package-lock.json ./
RUN npm ci

# Build the static bundle
COPY . .
# Deploy-time API base. MUST default to "/api" so nginx proxies to esms-core.
# NOTE: api.ts uses `?? "/api"`, which only falls back on undefined — an EMPTY
# string would slip through and make the app call "/auth/login" directly
# (bypassing the proxy), so the default here must be "/api", never blank.
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# ---- Runtime image ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
