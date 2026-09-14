FROM node:22-alpine AS builder

WORKDIR /app

# Install openssl for Prisma on alpine
RUN apk add --no-cache openssl

# Copy root and workspaces
COPY package*.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/

# Install dependencies
RUN npm install

# Copy source
COPY shared ./shared
COPY backend ./backend
COPY database ./database

# Generate Prisma client
RUN npx prisma generate --schema=database/prisma/schema.prisma

# Build shared first, then backend
RUN npm run build --workspace=shared
RUN npm run build --workspace=backend

FROM node:22-alpine AS runner
WORKDIR /app

# Install openssl for Prisma
RUN apk add --no-cache openssl

ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/shared/package.json ./shared/
COPY --from=builder /app/backend/package.json ./backend/

COPY --from=builder /app/database ./database
RUN npm install --production
RUN npx prisma generate --schema=database/prisma/schema.prisma

# Copy compiled files
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/backend/dist ./backend/dist
COPY docs/api/openapi.yaml ./docs/api/openapi.yaml
COPY --from=builder /app/backend/scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh

RUN chmod +x ./scripts/docker-entrypoint.sh

# The port is dynamic based on role, defaulting to 3000
EXPOSE 3000 3001 3002

ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
