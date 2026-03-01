FROM node:alpine3.20 AS base
WORKDIR /app

# --- Dependencies stage ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- Build stage ---
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# --- Production dependencies stage ---
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Runtime stage ---
FROM base AS runtime
RUN addgroup -S bot && adduser -S bot -G bot
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER bot
CMD ["node", "dist/main.js"]

# --- Development stage ---
FROM deps AS development
COPY . .
CMD ["npm", "run", "dev"]
