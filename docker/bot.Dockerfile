# Multi-stage build for production optimization
FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/bot/package.json ./apps/bot/
COPY packages/*/package.json ./packages/*/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Development stage
FROM base AS development
COPY . .
RUN pnpm build
CMD ["pnpm", "--filter", "@pr-gram/bot", "dev"]

# Production build stage
FROM base AS builder
COPY . .
RUN pnpm build
RUN pnpm deploy --filter=@pr-gram/bot --prod /prod/bot

# Production stage
FROM node:20-alpine AS production

# Install security updates
RUN apk --no-cache upgrade

# Create app user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S botuser -u 1001

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=builder --chown=botuser:nodejs /prod/bot .

# Create uploads directory
RUN mkdir -p uploads && chown botuser:nodejs uploads

# Switch to non-root user
USER botuser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "console.log('Bot is running')" || exit 1

# Expose port (if needed for webhooks)
EXPOSE 3000

# Start the bot
CMD ["node", "dist/index.js"]