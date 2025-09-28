import { z } from 'zod';
import { commonConfigSchema, validateConfig } from './common';

// Bot-specific configuration schema
export const botConfigSchema = commonConfigSchema.extend({
  // Telegram Bot
  BOT_TOKEN: z.string().min(1, 'Bot token is required'),
  BOT_USERNAME: z.string().optional(),
  BOT_WEBHOOK_URL: z.string().url().optional(),
  BOT_WEBHOOK_SECRET: z.string().optional(),
  
  // Bot settings
  BOT_ADMIN_IDS: z.array(z.number()).default([]),
  BOT_SUPER_ADMIN_ID: z.number().optional(),
  BOT_COMMAND_PREFIX: z.string().default('/'),
  BOT_SESSION_TTL: z.number().default(3600), // 1 hour
  
  // Rate limiting for bot
  BOT_RATE_LIMIT_COMMANDS: z.number().default(30), // commands per minute
  BOT_RATE_LIMIT_MESSAGES: z.number().default(60), // messages per minute
  BOT_RATE_LIMIT_TASKS: z.number().default(10), // tasks per minute
  
  // Task verification
  TASK_AUTO_APPROVE_HOURS: z.number().default(24),
  TASK_VERIFICATION_TIMEOUT: z.number().default(120), // 2 minutes
  TASK_MAX_RETRIES: z.number().default(3),
  
  // Subscription checks
  SUBSCRIPTION_CHECK_TIMEOUT: z.number().default(30), // 30 seconds
  SUBSCRIPTION_CHECK_CACHE_TTL: z.number().default(300), // 5 minutes
  SUBSCRIPTION_MAX_CHECKS_PER_CHAT: z.number().default(5),
  
  // File handling
  BOT_MAX_FILE_SIZE: z.number().default(20 * 1024 * 1024), // 20MB
  BOT_ALLOWED_FILE_TYPES: z.array(z.string()).default(['image/jpeg', 'image/png', 'image/webp']),
  
  // Notifications
  NOTIFICATION_ENABLED: z.boolean().default(true),
  NOTIFICATION_BATCH_SIZE: z.number().default(100),
  NOTIFICATION_DELAY_MS: z.number().default(1000),
  
  // Anti-spam
  ANTI_SPAM_ENABLED: z.boolean().default(true),
  ANTI_SPAM_MESSAGE_LIMIT: z.number().default(10), // messages per minute
  ANTI_SPAM_BAN_DURATION: z.number().default(3600), // 1 hour
  
  // Webhook mode
  WEBHOOK_ENABLED: z.boolean().default(false),
  WEBHOOK_PORT: z.number().default(3000),
  WEBHOOK_PATH: z.string().default('/webhook'),
  
  // Development
  BOT_POLLING_TIMEOUT: z.number().default(30),
  BOT_DEBUG_MODE: z.boolean().default(false),
  BOT_GRACEFUL_SHUTDOWN_TIMEOUT: z.number().default(10000), // 10 seconds
  
  // Telegram API
  TELEGRAM_API_TIMEOUT: z.number().default(30000), // 30 seconds
  TELEGRAM_API_RETRIES: z.number().default(3),
  TELEGRAM_API_RATE_LIMIT: z.number().default(30), // requests per second
  
  // Channels and chats
  DEFAULT_LANGUAGE: z.string().default('ru'),
  SUPPORT_CHAT_ID: z.number().optional(),
  LOGS_CHAT_ID: z.number().optional(),
  ANNOUNCEMENTS_CHAT_ID: z.number().optional(),
});

export type BotConfig = z.infer<typeof botConfigSchema>;

// Load and validate bot configuration
export const loadBotConfig = (): BotConfig => {
  const config = {
    // Common config
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => 
        ['NODE_ENV', 'LOG_LEVEL', 'DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'].includes(key)
      )
    ),
    
    // Bot-specific config
    BOT_TOKEN: process.env.BOT_TOKEN,
    BOT_USERNAME: process.env.BOT_USERNAME,
    BOT_WEBHOOK_URL: process.env.BOT_WEBHOOK_URL,
    BOT_WEBHOOK_SECRET: process.env.BOT_WEBHOOK_SECRET,
    
    BOT_ADMIN_IDS: process.env.BOT_ADMIN_IDS ? 
      process.env.BOT_ADMIN_IDS.split(',').map(id => parseInt(id.trim())) : 
      undefined,
    BOT_SUPER_ADMIN_ID: process.env.BOT_SUPER_ADMIN_ID ? 
      parseInt(process.env.BOT_SUPER_ADMIN_ID) : 
      undefined,
    BOT_COMMAND_PREFIX: process.env.BOT_COMMAND_PREFIX,
    BOT_SESSION_TTL: process.env.BOT_SESSION_TTL ? 
      parseInt(process.env.BOT_SESSION_TTL) : 
      undefined,
    
    BOT_RATE_LIMIT_COMMANDS: process.env.BOT_RATE_LIMIT_COMMANDS ? 
      parseInt(process.env.BOT_RATE_LIMIT_COMMANDS) : 
      undefined,
    BOT_RATE_LIMIT_MESSAGES: process.env.BOT_RATE_LIMIT_MESSAGES ? 
      parseInt(process.env.BOT_RATE_LIMIT_MESSAGES) : 
      undefined,
    BOT_RATE_LIMIT_TASKS: process.env.BOT_RATE_LIMIT_TASKS ? 
      parseInt(process.env.BOT_RATE_LIMIT_TASKS) : 
      undefined,
    
    TASK_AUTO_APPROVE_HOURS: process.env.TASK_AUTO_APPROVE_HOURS ? 
      parseInt(process.env.TASK_AUTO_APPROVE_HOURS) : 
      undefined,
    TASK_VERIFICATION_TIMEOUT: process.env.TASK_VERIFICATION_TIMEOUT ? 
      parseInt(process.env.TASK_VERIFICATION_TIMEOUT) : 
      undefined,
    TASK_MAX_RETRIES: process.env.TASK_MAX_RETRIES ? 
      parseInt(process.env.TASK_MAX_RETRIES) : 
      undefined,
    
    SUBSCRIPTION_CHECK_TIMEOUT: process.env.SUBSCRIPTION_CHECK_TIMEOUT ? 
      parseInt(process.env.SUBSCRIPTION_CHECK_TIMEOUT) : 
      undefined,
    SUBSCRIPTION_CHECK_CACHE_TTL: process.env.SUBSCRIPTION_CHECK_CACHE_TTL ? 
      parseInt(process.env.SUBSCRIPTION_CHECK_CACHE_TTL) : 
      undefined,
    SUBSCRIPTION_MAX_CHECKS_PER_CHAT: process.env.SUBSCRIPTION_MAX_CHECKS_PER_CHAT ? 
      parseInt(process.env.SUBSCRIPTION_MAX_CHECKS_PER_CHAT) : 
      undefined,
    
    BOT_MAX_FILE_SIZE: process.env.BOT_MAX_FILE_SIZE ? 
      parseInt(process.env.BOT_MAX_FILE_SIZE) : 
      undefined,
    BOT_ALLOWED_FILE_TYPES: process.env.BOT_ALLOWED_FILE_TYPES ? 
      process.env.BOT_ALLOWED_FILE_TYPES.split(',') : 
      undefined,
    
    NOTIFICATION_ENABLED: process.env.NOTIFICATION_ENABLED !== 'false',
    NOTIFICATION_BATCH_SIZE: process.env.NOTIFICATION_BATCH_SIZE ? 
      parseInt(process.env.NOTIFICATION_BATCH_SIZE) : 
      undefined,
    NOTIFICATION_DELAY_MS: process.env.NOTIFICATION_DELAY_MS ? 
      parseInt(process.env.NOTIFICATION_DELAY_MS) : 
      undefined,
    
    ANTI_SPAM_ENABLED: process.env.ANTI_SPAM_ENABLED !== 'false',
    ANTI_SPAM_MESSAGE_LIMIT: process.env.ANTI_SPAM_MESSAGE_LIMIT ? 
      parseInt(process.env.ANTI_SPAM_MESSAGE_LIMIT) : 
      undefined,
    ANTI_SPAM_BAN_DURATION: process.env.ANTI_SPAM_BAN_DURATION ? 
      parseInt(process.env.ANTI_SPAM_BAN_DURATION) : 
      undefined,
    
    WEBHOOK_ENABLED: process.env.WEBHOOK_ENABLED === 'true',
    WEBHOOK_PORT: process.env.WEBHOOK_PORT ? 
      parseInt(process.env.WEBHOOK_PORT) : 
      undefined,
    WEBHOOK_PATH: process.env.WEBHOOK_PATH,
    
    BOT_POLLING_TIMEOUT: process.env.BOT_POLLING_TIMEOUT ? 
      parseInt(process.env.BOT_POLLING_TIMEOUT) : 
      undefined,
    BOT_DEBUG_MODE: process.env.BOT_DEBUG_MODE === 'true',
    BOT_GRACEFUL_SHUTDOWN_TIMEOUT: process.env.BOT_GRACEFUL_SHUTDOWN_TIMEOUT ? 
      parseInt(process.env.BOT_GRACEFUL_SHUTDOWN_TIMEOUT) : 
      undefined,
    
    TELEGRAM_API_TIMEOUT: process.env.TELEGRAM_API_TIMEOUT ? 
      parseInt(process.env.TELEGRAM_API_TIMEOUT) : 
      undefined,
    TELEGRAM_API_RETRIES: process.env.TELEGRAM_API_RETRIES ? 
      parseInt(process.env.TELEGRAM_API_RETRIES) : 
      undefined,
    TELEGRAM_API_RATE_LIMIT: process.env.TELEGRAM_API_RATE_LIMIT ? 
      parseInt(process.env.TELEGRAM_API_RATE_LIMIT) : 
      undefined,
    
    DEFAULT_LANGUAGE: process.env.DEFAULT_LANGUAGE,
    SUPPORT_CHAT_ID: process.env.SUPPORT_CHAT_ID ? 
      parseInt(process.env.SUPPORT_CHAT_ID) : 
      undefined,
    LOGS_CHAT_ID: process.env.LOGS_CHAT_ID ? 
      parseInt(process.env.LOGS_CHAT_ID) : 
      undefined,
    ANNOUNCEMENTS_CHAT_ID: process.env.ANNOUNCEMENTS_CHAT_ID ? 
      parseInt(process.env.ANNOUNCEMENTS_CHAT_ID) : 
      undefined,
  };

  return validateConfig(botConfigSchema, config);
};

// Bot configuration constants
export const BOT_CONSTANTS = {
  COMMANDS: {
    START: 'start',
    HELP: 'help',
    MENU: 'menu',
    PROFILE: 'profile',
    EARN: 'earn',
    PROMOTE: 'promote',
    SUBSCRIPTION: 'subscription',
    SETTINGS: 'settings',
    SUPPORT: 'support',
    CANCEL: 'cancel',
  },
  
  CALLBACK_DATA: {
    MENU_MAIN: 'menu_main',
    MENU_EARN: 'menu_earn',
    MENU_PROMOTE: 'menu_promote',
    MENU_PROFILE: 'menu_profile',
    MENU_SUBSCRIPTION: 'menu_subscription',
    MENU_SETTINGS: 'menu_settings',
    TASK_CREATE: 'task_create',
    TASK_EXECUTE: 'task_execute',
    CHECK_CREATE: 'check_create',
    CHECK_ACTIVATE: 'check_activate',
  },
  
  SESSION_KEYS: {
    USER_STEP: 'user_step',
    TASK_DATA: 'task_data',
    CHECK_DATA: 'check_data',
    SUBSCRIPTION_DATA: 'subscription_data',
    TEMP_DATA: 'temp_data',
  },
  
  CACHE_KEYS: {
    USER_PROFILE: 'user_profile',
    TASK_LIST: 'task_list',
    CHECK_LIST: 'check_list',
    SUBSCRIPTION_CHECKS: 'subscription_checks',
    RATE_LIMIT: 'rate_limit',
  },
} as const;