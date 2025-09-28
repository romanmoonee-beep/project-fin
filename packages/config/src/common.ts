import { z } from 'zod';

// Environment enum
export enum Environment {
  DEVELOPMENT = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production',
  TEST = 'test'
}

// Common configuration schema
export const commonConfigSchema = z.object({
  NODE_ENV: z.nativeEnum(Environment).default(Environment.DEVELOPMENT),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  
  // Database
  DATABASE_URL: z.string().url(),
  DATABASE_LOG_QUERIES: z.boolean().default(false),
  
  // Redis
  REDIS_URL: z.string().url(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.number().default(0),
  
  // Security
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),
  
  // External APIs
  TELEGRAM_API_URL: z.string().url().default('https://api.telegram.org'),
  
  // Rate limiting
  RATE_LIMIT_ENABLED: z.boolean().default(true),
  RATE_LIMIT_WINDOW_MS: z.number().default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.number().default(100),
  
  // CORS
  CORS_ORIGIN: z.string().or(z.array(z.string())).default('*'),
  CORS_CREDENTIALS: z.boolean().default(true),
  
  // File uploads
  MAX_FILE_SIZE: z.number().default(20 * 1024 * 1024), // 20MB
  ALLOWED_FILE_TYPES: z.array(z.string()).default(['image/jpeg', 'image/png', 'image/webp']),
  
  // Monitoring
  SENTRY_DSN: z.string().optional(),
  PROMETHEUS_ENABLED: z.boolean().default(false),
  PROMETHEUS_PORT: z.number().default(9090),
  
  // Health checks
  HEALTH_CHECK_ENABLED: z.boolean().default(true),
  HEALTH_CHECK_INTERVAL: z.number().default(30000), // 30 seconds
});

export type CommonConfig = z.infer<typeof commonConfigSchema>;

// Load and validate common configuration
export const loadCommonConfig = (): CommonConfig => {
  const config = {
    NODE_ENV: process.env.NODE_ENV,
    LOG_LEVEL: process.env.LOG_LEVEL,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_LOG_QUERIES: process.env.DATABASE_LOG_QUERIES === 'true',
    REDIS_URL: process.env.REDIS_URL,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    REDIS_DB: process.env.REDIS_DB ? parseInt(process.env.REDIS_DB) : undefined,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    TELEGRAM_API_URL: process.env.TELEGRAM_API_URL,
    RATE_LIMIT_ENABLED: process.env.RATE_LIMIT_ENABLED !== 'false',
    RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS ? parseInt(process.env.RATE_LIMIT_WINDOW_MS) : undefined,
    RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) : undefined,
    CORS_ORIGIN: process.env.CORS_ORIGIN ? (process.env.CORS_ORIGIN.includes(',') ? process.env.CORS_ORIGIN.split(',') : process.env.CORS_ORIGIN) : undefined,
    CORS_CREDENTIALS: process.env.CORS_CREDENTIALS !== 'false',
    MAX_FILE_SIZE: process.env.MAX_FILE_SIZE ? parseInt(process.env.MAX_FILE_SIZE) : undefined,
    ALLOWED_FILE_TYPES: process.env.ALLOWED_FILE_TYPES ? process.env.ALLOWED_FILE_TYPES.split(',') : undefined,
    SENTRY_DSN: process.env.SENTRY_DSN,
    PROMETHEUS_ENABLED: process.env.PROMETHEUS_ENABLED === 'true',
    PROMETHEUS_PORT: process.env.PROMETHEUS_PORT ? parseInt(process.env.PROMETHEUS_PORT) : undefined,
    HEALTH_CHECK_ENABLED: process.env.HEALTH_CHECK_ENABLED !== 'false',
    HEALTH_CHECK_INTERVAL: process.env.HEALTH_CHECK_INTERVAL ? parseInt(process.env.HEALTH_CHECK_INTERVAL) : undefined,
  };

  try {
    return commonConfigSchema.parse(config);
  } catch (error) {
    console.error('❌ Invalid configuration:', error);
    process.exit(1);
  }
};

// Configuration validation utility
export const validateConfig = <T>(schema: z.ZodSchema<T>, data: unknown): T => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Configuration validation failed:');
      error.errors.forEach((err) => {
        console.error(`  ${err.path.join('.')}: ${err.message}`);
      });
    } else {
      console.error('❌ Unexpected configuration error:', error);
    }
    process.exit(1);
  }
};

// Environment helpers
export const isDevelopment = (env: Environment = Environment.DEVELOPMENT): boolean => 
  env === Environment.DEVELOPMENT;

export const isProduction = (env: Environment): boolean => 
  env === Environment.PRODUCTION;

export const isTest = (env: Environment): boolean => 
  env === Environment.TEST;

export const isStaging = (env: Environment): boolean => 
  env === Environment.STAGING;