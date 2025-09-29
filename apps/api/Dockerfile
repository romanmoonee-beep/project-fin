# Multi-stage build for production
FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package.json files
COPY package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/*/package.json ./packages/*/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Development stage
FROM base AS development

# Copy source code
COPY . .

# Generate Prisma client
RUN pnpm --filter @pr-gram/database db:generate

# Build packages
RUN pnpm build

# Start in development mode
CMD ["pnpm", "--filter", "@pr-gram/api", "dev"]

# Production build stage  
FROM base AS builder

# Copy source code
COPY . .

# Generate Prisma client
RUN pnpm --filter @pr-gram/database db:generate

# Build the application
RUN pnpm build

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Production stage
FROM node:20-alpine AS production

# Install security updates
RUN apk --no-cache upgrade && \
    apk add --no-cache tini

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S apiuser -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=apiuser:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=apiuser:nodejs /app/packages/*/dist ./packages/*/dist
COPY --from=builder --chown=apiuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=apiuser:nodejs /app/packages/database/prisma ./packages/database/prisma

# Create directories
RUN mkdir -p uploads logs && \
    chown -R apiuser:nodejs uploads logs

# Switch to non-root user
USER apiuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e " \
    const http = require('http'); \
    const options = { \
      hostname: 'localhost', \
      port: process.env.API_PORT || 3001, \
      path: '/health', \
      timeout: 5000 \
    }; \
    http.get(options, (res) => { \
      if (res.statusCode === 200) process.exit(0); \
      else process.exit(1); \
    }).on('error', () => process.exit(1));"

# Expose port
EXPOSE 3001

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the API server
CMD ["node", "dist/index.js"]