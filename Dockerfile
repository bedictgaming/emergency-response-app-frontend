FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG CDN_ASSET_PREFIX=
ENV CDN_ASSET_PREFIX=$CDN_ASSET_PREFIX
RUN npm run build

FROM nginx:1.29-alpine
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV PUBLIC_API_ORIGIN=$NEXT_PUBLIC_API_URL
ARG CDN_ASSET_PREFIX=
ENV PUBLIC_ASSET_ORIGIN=$CDN_ASSET_PREFIX
COPY --from=build /app/out /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
