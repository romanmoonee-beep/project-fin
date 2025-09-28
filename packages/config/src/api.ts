import { z } from 'zod';
import { commonConfigSchema, validateConfig } from './common';

// API-specific configuration schema
export const apiConfigSchema = commonConfigSchema.extend({
  // Server
  API_PORT: z.number().default(3001),
  API_HOST: z.string().default('0.0.0.0'),
  API_PREFIX: z.string().default('/api/v1'),
  
  // Security
  API_RATE_LIMIT_ANONYMOUS: z.number().default(100), // requests per 15 minutes
  API_RATE_LIMIT_AUTHENTICATED: z.number().default(1000),
  API_RATE_LIMIT_ADMIN: z.number().default(10000),
  
  // JWT
  JWT_ACCESS_TOKEN_TTL: z.number().default(15 * 60), // 15 minutes
  JWT_REFRESH_TOKEN_TTL: z.number().default(7 * 24 * 60 * 60), // 7 days
  JWT_ISSUER: z.string().default('pr-gram-api'),
  JWT_AUDIENCE: z.string().default('pr-gram-users'),
  
  // Swagger/OpenAPI
  SWAGGER_ENABLED: z.boolean().default(true),
  SWAGGER_PATH: z.string().default('/docs'),
  SWAGGER_TITLE: z.string().default('PR GRAM API'),
  SWAGGER_VERSION: z.string().default('1.0.0'),
  
  // WebSocket
  WEBSOCKET_ENABLED: z.boolean().default(true),
  WEBSOCKET_PATH: z.string().default('/ws'),
  WEBSOCKET_CORS_ORIGIN: z.string().or(z.array(z.string())).default('*'),
  
  // File uploads
  UPLOAD_MAX_SIZE: z.number().default(20 * 1024 * 1024), // 20MB
  UPLOAD_MAX_FILES: z.number().default(10),
  UPLOAD_ALLOWED_TYPES: z.array(z.string()).default([
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4'
  ]),
  UPLOAD_DESTINATION: z.string().default('./uploads'),
  
  // External services
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'Telegram bot token is required'),
  TELEGRAM_WEBHOOK_URL: z.string().url().optional(),
  
  // Payment systems
  STARS_WEBHOOK_SECRET: z.string().optional(),
  PAYMENT_PROVIDER_API_KEY: z.string().optional(),
  
  // Email service
  EMAIL_ENABLED: z.boolean().default(false),
  EMAIL_SMTP_HOST: z.string().optional(),
  EMAIL_SMTP_PORT: z.number().optional(),
  EMAIL_SMTP_USER: z.string().optional(),
  EMAIL_SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  
  // Analytics
  ANALYTICS_ENABLED: z.boolean().default(true),
  ANALYTICS_BATCH_SIZE: z.number().default(100),
  ANALYTICS_FLUSH_INTERVAL: z.number().default(10000), // 10 seconds
  
  // Background jobs
  QUEUE_ENABLED: z.boolean().default(true),
  QUEUE_CONCURRENCY: z.number().default(5),
  QUEUE_MAX_ATTEMPTS: z.number().default(3),
  QUEUE_DELAY_EXPONENTIAL: z.boolean().default(true),
  
  // Cache
  CACHE_ENABLED: z.boolean().default(true),
  CACHE_DEFAULT_TTL: z.number().default(300), // 5 minutes
  CACHE_MAX_SIZE: z.number().default(1000),
  
  // Request validation
  REQUEST_SIZE_LIMIT: z.string().default('10mb'),
  REQUEST_TIMEOUT: z.number().default(30000), // 30 seconds
  
  // Response compression
  COMPRESSION_ENABLED: z.boolean().default(true),
  COMPRESSION_LEVEL: z.number().min(1).max(9).default(6),
  
  // Trust proxy
  TRUST_PROXY: z.boolean().default(false),
  PROXY_TRUST_HOP_COUNT: z.number().default(1),
  
  // Graceful shutdown
  GRACEFUL_SHUTDOWN_TIMEOUT: z.number().default(10000), // 10 seconds
  
  // Development
  API_DEBUG_MODE: z.boolean().default(false),
  API_LOG_REQUESTS: z.boolean().default(false),
  API_LOG_RESPONSES: z.boolean().default(false),
});

export type ApiConfig = z.infer<typeof apiConfigSchema>;

// Load and validate API configuration
export const loadApiConfig = (): ApiConfig => {
  const config = {
    // Common config
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => 
        ['NODE_ENV', 'LOG_LEVEL', 'DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'].includes(key)
      )
    ),
    
    // API-specific config
    API_PORT: process.env.API_PORT ? parseInt(process.env.API_PORT) : undefined,
    API_HOST: process.env.API_HOST,
    API_PREFIX: process.env.API_PREFIX,
    
    API_RATE_LIMIT_ANONYMOUS: process.env.API_RATE_LIMIT_ANONYMOUS ? 
      parseInt(process.env.API_RATE_LIMIT_ANONYMOUS) : undefined,
    API_RATE_LIMIT_AUTHENTICATED: process.env.API_RATE_LIMIT_AUTHENTICATED ? 
      parseInt(process.env.API_RATE_LIMIT_AUTHENTICATED) : undefined,
    API_RATE_LIMIT_ADMIN: process.env.API_RATE_LIMIT_ADMIN ? 
      parseInt(process.env.API_RATE_LIMIT_ADMIN) : undefined,
    
    JWT_ACCESS_TOKEN_TTL: process.env.JWT_ACCESS_TOKEN_TTL ? 
      parseInt(process.env.JWT_ACCESS_TOKEN_TTL) : undefined,
    JWT_REFRESH_TOKEN_TTL: process.env.JWT_REFRESH_TOKEN_TTL ? 
      parseInt(process.env.JWT_REFRESH_TOKEN_TTL) : undefined,
    JWT_ISSUER: process.env.JWT_ISSUER,
    JWT_AUDIENCE: process.env.JWT_AUDIENCE,
    
    SWAGGER_ENABLED: process.env.SWAGGER_ENABLED !== 'false',
    SWAGGER_PATH: process.env.SWAGGER_PATH,
    SWAGGER_TITLE: process.env.SWAGGER_TITLE,
    SWAGGER_VERSION: process.env.SWAGGER_VERSION,
    
    WEBSOCKET_ENABLED: process.env.WEBSOCKET_ENABLED !== 'false',
    WEBSOCKET_PATH: process.env.WEBSOCKET_PATH,
    WEBSOCKET_CORS_ORIGIN: process.env.WEBSOCKET_CORS_ORIGIN ? 
      (process.env.WEBSOCKET_CORS_ORIGIN.includes(',') ? 
        process.env.WEBSOCKET_CORS_ORIGIN.split(',') : 
        process.env.WEBSOCKET_CORS_ORIGIN) : undefined,
    
    UPLOAD_MAX_SIZE: process.env.UPLOAD_MAX_SIZE ? 
      parseInt(process.env.UPLOAD_MAX_SIZE) : undefined,
    UPLOAD_MAX_FILES: process.env.UPLOAD_MAX_FILES ? 
      parseInt(process.env.UPLOAD_MAX_FILES) : undefined,
    UPLOAD_ALLOWED_TYPES: process.env.UPLOAD_ALLOWED_TYPES ? 
      process.env.UPLOAD_ALLOWED_TYPES.split(',') : undefined,
    UPLOAD_DESTINATION: process.env.UPLOAD_DESTINATION,
    
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_WEBHOOK_URL: process.env.TELEGRAM_WEBHOOK_URL,
    
    STARS_WEBHOOK_SECRET: process.env.STARS_WEBHOOK_SECRET,
    PAYMENT_PROVIDER_API_KEY: process.env.PAYMENT_PROVIDER_API_KEY,
    
    EMAIL_ENABLED: process.env.EMAIL_ENABLED === 'true',
    EMAIL_SMTP_HOST: process.env.EMAIL_SMTP_HOST,
    EMAIL_SMTP_PORT: process.env.EMAIL_SMTP_PORT ? 
      parseInt(process.env.EMAIL_SMTP_PORT) : undefined,
    EMAIL_SMTP_USER: process.env.EMAIL_SMTP_USER,
    EMAIL_SMTP_PASS: process.env.EMAIL_SMTP_PASS,
    EMAIL_FROM: process.env.EMAIL_FROM,
    
    ANALYTICS_ENABLED: process.env.ANALYTICS_ENABLED !== 'false',
    ANALYTICS_BATCH_SIZE: process.env.ANALYTICS_BATCH_SIZE ? 
      parseInt(process.env.ANALYTICS_BATCH_SIZE) : undefined,
    ANALYTICS_FLUSH_INTERVAL: process.env.ANALYTICS_FLUSH_INTERVAL ? 
      parseInt(process.env.ANALYTICS_FLUSH_INTERVAL) : undefined,
    
    QUEUE_ENABLED: process.env.QUEUE_ENABLED !== 'false',
    QUEUE_CONCURRENCY: process.env.QUEUE_CONCURRENCY ? 
      parseInt(process.env.QUEUE_CONCURRENCY) : undefined,
    QUEUE_MAX_ATTEMPTS: process.env.QUEUE_MAX_ATTEMPTS ? 
      parseInt(process.env.QUEUE_MAX_ATTEMPTS) : undefined,
    QUEUE_DELAY_EXPONENTIAL: process.env.QUEUE_DELAY_EXPONENTIAL !== 'false',
    
    CACHE_ENABLED: process.env.CACHE_ENABLED !== 'false',
    CACHE_DEFAULT_TTL: process.env.CACHE_DEFAULT_TTL ? 
      parseInt(process.env.CACHE_DEFAULT_TTL) : undefined,
    CACHE_MAX_SIZE: process.env.CACHE_MAX_SIZE ? 
      parseInt(process.env.CACHE_MAX_SIZE) : undefined,
    
    REQUEST_SIZE_LIMIT: process.env.REQUEST_SIZE_LIMIT,
    REQUEST_TIMEOUT: process.env.REQUEST_TIMEOUT ? 
      parseInt(process.env.REQUEST_TIMEOUT) : undefined,
    
    COMPRESSION_ENABLED: process.env.COMPRESSION_ENABLED !== 'false',
    COMPRESSION_LEVEL: process.env.COMPRESSION_LEVEL ? 
      parseInt(process.env.COMPRESSION_LEVEL) : undefined,
    
    TRUST_PROXY: process.env.TRUST_PROXY === 'true',
    PROXY_TRUST_HOP_COUNT: process.env.PROXY_TRUST_HOP_COUNT ? 
      parseInt(process.env.PROXY_TRUST_HOP_COUNT) : undefined,
    
    GRACEFUL_SHUTDOWN_TIMEOUT: process.env.GRACEFUL_SHUTDOWN_TIMEOUT ? 
      parseInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT) : undefined,
    
    API_DEBUG_MODE: process.env.API_DEBUG_MODE === 'true',
    API_LOG_REQUESTS: process.env.API_LOG_REQUESTS === 'true',
    API_LOG_RESPONSES: process.env.API_LOG_RESPONSES === 'true',
  };

  return validateConfig(apiConfigSchema, config);
};