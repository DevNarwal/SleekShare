# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Copy application source
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build the NestJS application
RUN npm run build

# Prune development dependencies
RUN npm prune --production

# Stage 2: Runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

# Copy production node_modules, generated Prisma Client, and compiled files
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Expose production port
EXPOSE 3001

# Run migrations and start the NestJS server in production mode
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]
