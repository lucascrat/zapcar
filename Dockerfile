# syntax=docker/dockerfile:1

# =============================================================================
# Build - variaveis VITE_* sao lidas em tempo de BUILD (Vite as embute no
# bundle). Precisam chegar como --build-arg; no Coolify, marque cada variavel
# como "Available at Buildtime" para isso acontecer automaticamente.
# =============================================================================
FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SUPABASE_SCHEMA
ARG VITE_GOOGLE_MAPS_API_KEY
ARG VITE_MAPBOX_TOKEN
ARG VITE_EFI_CLIENT_ID
ARG VITE_EFI_CLIENT_SECRET
ARG VITE_EFI_ACCOUNT_CODE
ARG VITE_ADMOB_BANNER_ID
ARG VITE_ADMOB_INTERSTITIAL_ID
ARG VITE_ADMOB_NATIVE_ID
ARG VITE_ADMOB_REWARDED_ID

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_SUPABASE_SCHEMA=$VITE_SUPABASE_SCHEMA \
    VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY \
    VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN \
    VITE_EFI_CLIENT_ID=$VITE_EFI_CLIENT_ID \
    VITE_EFI_CLIENT_SECRET=$VITE_EFI_CLIENT_SECRET \
    VITE_EFI_ACCOUNT_CODE=$VITE_EFI_ACCOUNT_CODE \
    VITE_ADMOB_BANNER_ID=$VITE_ADMOB_BANNER_ID \
    VITE_ADMOB_INTERSTITIAL_ID=$VITE_ADMOB_INTERSTITIAL_ID \
    VITE_ADMOB_NATIVE_ID=$VITE_ADMOB_NATIVE_ID \
    VITE_ADMOB_REWARDED_ID=$VITE_ADMOB_REWARDED_ID

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# =============================================================================
# Runtime - nginx serve o build estatico e faz o proxy do gateway de
# pagamento, reproduzindo o rewrite que hoje vive no vercel.json.
# =============================================================================
FROM nginx:alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
