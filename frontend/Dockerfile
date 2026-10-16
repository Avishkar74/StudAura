# Node 24: the locked dependencies (vitest, jsdom, undici, supabase-js) need Node >= 24.15 on the
# 24 line, and .npmrc makes `npm ci` refuse to run on anything else. Keep in step with
# frontend/.nvmrc and "engines" in package.json.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# Dev server used by docker compose (hot reload via bind-mounted src/).
FROM deps AS dev
COPY . .
RUN chown -R node:node /app
USER node
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM deps AS build
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
# Empty = same origin (the reverse proxy or Ingress routes /api to the backend).
ARG VITE_API_BASE_URL=
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_API_BASE_URL=$VITE_API_BASE_URL
COPY . .
RUN npm run build

# Unprivileged nginx: runs as non-root and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.30-alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
