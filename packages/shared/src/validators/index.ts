import { z } from 'zod';
import { UserLevel, TaskType, CheckType, LanguageCode } from '../enums';

// Common validators
export const telegramIdSchema = z.number().int().positive();
export const telegramUsernameSchema = z.string().regex(/^@?[a-zA-Z0-9_]{5,32}$/);
export const urlSchema = z.string().url();
export const emailSchema = z.string().email();

// User validators
export const createUserSchema = z.object({
  telegramId: telegramIdSchema,
  username: z.string().optional(),
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().min(1).max(255).optional(),
  languageCode: z.nativeEnum(LanguageCode).default(LanguageCode.RU),
  referrerId: telegramIdSchema.optional(),
});

export const updateUserSchema = z.object({
  username: z.string().optional(),
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().min(1).max(255).optional(),
  languageCode: z.nativeEnum(LanguageCode).optional(),
  settings: z.record(z.any()).optional(),
});

export const userFilterSchema = z.object({
  level: z.nativeEnum(UserLevel).optional(),
  isPremium: z.boolean().optional(),
  hasBalance: z.boolean().optional(),
  registeredAfter: z.date().optional(),
  registeredBefore: z.date().optional(),
  search: z.string().min(1).optional(),
});

// Task validators
export const createTaskSchema = z.object({
  type: z.nativeEnum(TaskType),
  title: z.string().min(3).max(255),
  description: z.string().min(10).max(1000),
  reward: z.number().min(10).max(10000),
  targetCount: z.number().min(1).max(10000),
  targetUrl: urlSchema.optional(),
  targetChatId: telegramIdSchema.optional(),
  conditions: z.record(z.any()).default({}),
  autoApproveHours: z.number().min(1).max(168).default(24), // 1 hour to 7 days
  minUserLevel: z.nativeEnum(UserLevel).default(UserLevel.BRONZE),
  expiresAt: z.date().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(3).max(255).optional(),
  description: z.string().min(10).max(1000).optional(),
  reward: z.number().min(10).max(10000).optional(),
  targetCount: z.number().min(1).max(10000).optional(),
  autoApproveHours: z.number().min(1).max(168).optional(),
  minUserLevel: z.nativeEnum(UserLevel).optional(),
  expiresAt: z.date().optional(),
});

export const taskFilterSchema = z.object({
  type: z.nativeEnum(TaskType).optional(),
  authorId: telegramIdSchema.optional(),
  minReward: z.number().min(0).optional(),
  maxReward: z.number().min(0).optional(),
  minUserLevel: z.nativeEnum(UserLevel).optional(),
  isBoosted: z.boolean().optional(),
  search: z.string().min(1).optional(),
});

// Task execution validators
export const executeTaskSchema = z.object({
  taskId: z.string().cuid(),
  screenshotUrls: z.array(urlSchema).max(5).default([]),
  proofData: z.record(z.any()).default({}),
});

export const moderateTaskSchema = z.object({
  executionId: z.string().cuid(),
  action: z.enum(['approve', 'reject']),
  comment: z.string().max(500).optional(),
  rewardAmount: z.number().min(0).optional(),
});

// Check validators
export const createCheckSchema = z.object({
  amount: z.number().min(10).max(100000),
  maxActivations: z.number().min(1).max(10000),
  password: z.string().min(1).max(50).optional(),
  comment: z.string().max(500).optional(),
  imageUrl: urlSchema.optional(),
  conditions: z.record(z.any()).default({}),
  design: z.record(z.any()).default({}),
  expiresAt: z.date().optional(),
});

export const activateCheckSchema = z.object({
  checkId: z.string().cuid(),
  password: z.string().optional(),
});

// Subscription check validators
export const createSubscriptionCheckSchema = z.object({
  chatId: telegramIdSchema,
  targetChatId: telegramIdSchema.optional(),
  targetUsername: telegramUsernameSchema.optional(),
  inviteLink: urlSchema.optional(),
  setupType: z.nativeEnum(CheckType),
  autoDeleteTimer: z.number().min(15).max(300).optional(), // 15 seconds to 5 minutes
  expiresAt: z.date().optional(),
  subscriberGoal: z.number().min(1).max(100000).optional(),
});

// Pagination validators
export const paginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
});

// Sort validators
export const sortSchema = z.object({
  field: z.string(),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

// Search validators
export const searchSchema = z.object({
  query: z.string().min(1).optional(),
  filters: z.record(z.any()).optional(),
  sort: sortSchema.optional(),
  pagination: paginationSchema.optional(),
});

// File upload validators
export const fileUploadSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().regex(/^(image|video)\//),
  size: z.number().max(20 * 1024 * 1024), // 20MB
});

// Telegram data validators
export const telegramInitDataSchema = z.object({
  query_id: z.string().optional(),
  user: z.string().optional(),
  auth_date: z.string(),
  hash: z.string(),
});

export const telegramUserSchema = z.object({
  id: telegramIdSchema,
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
  is_premium: z.boolean().optional(),
});

// Webhook validators
export const telegramWebhookSchema = z.object({
  update_id: z.number(),
  message: z.object({
    message_id: z.number(),
    from: telegramUserSchema,
    chat: z.object({
      id: z.number(),
      type: z.enum(['private', 'group', 'supergroup', 'channel']),
      title: z.string().optional(),
      username: z.string().optional(),
    }),
    date: z.number(),
    text: z.string().optional(),
  }).optional(),
  callback_query: z.object({
    id: z.string(),
    from: telegramUserSchema,
    message: z.any().optional(),
    data: z.string().optional(),
  }).optional(),
});

// API response validators
export const apiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
  errors: z.array(z.string()).optional(),
});

// Rate limit validators
export const rateLimitSchema = z.object({
  requests: z.number().min(1),
  windowMs: z.number().min(1000), // Minimum 1 second
  skipSuccessfulRequests: z.boolean().default(false),
  skipFailedRequests: z.boolean().default(false),
});

// Configuration validators
export const configSchema = z.object({
  database: z.object({
    url: z.string().url(),
    logQueries: z.boolean().default(false),
  }),
  redis: z.object({
    url: z.string().url(),
    password: z.string().optional(),
    db: z.number().default(0),
  }),
  jwt: z.object({
    secret: z.string().min(32),
    refreshSecret: z.string().min(32),
    accessTokenTtl: z.number().default(15 * 60), // 15 minutes
    refreshTokenTtl: z.number().default(7 * 24 * 60 * 60), // 7 days
  }),
  bot: z.object({
    token: z.string().min(1),
    username: z.string().optional(),
    webhookUrl: z.string().url().optional(),
  }),
});

// Validation helper functions
export const validateTelegramId = (id: unknown): number => {
  const result = telegramIdSchema.safeParse(id);
  if (!result.success) {
    throw new Error('Invalid Telegram ID');
  }
  return result.data;
};

export const validateTelegramUsername = (username: unknown): string => {
  const result = telegramUsernameSchema.safeParse(username);
  if (!result.success) {
    throw new Error('Invalid Telegram username');
  }
  return result.data;
};

export const validateUrl = (url: unknown): string => {
  const result = urlSchema.safeParse(url);
  if (!result.success) {
    throw new Error('Invalid URL');
  }
  return result.data;
};

export const validateEmail = (email: unknown): string => {
  const result = emailSchema.safeParse(email);
  if (!result.success) {
    throw new Error('Invalid email');
  }
  return result.data;
};

// Validation middleware helper
export const createValidator = <T>(schema: z.ZodSchema<T>) => {
  return (data: unknown): T => {
    const result = schema.safeParse(data);
    if (!result.success) {
      throw new Error(`Validation error: ${result.error.errors.map(e => e.message).join(', ')}`);
    }
    return result.data;
  };
};