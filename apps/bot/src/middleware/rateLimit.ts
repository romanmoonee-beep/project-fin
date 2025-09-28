import { NextFunction } from 'grammy';
import Redis from 'ioredis';
import { config, BOT_CONSTANTS } from '../config';
import type { BotContext } from '../types/context';

// Redis instance for rate limiting
const redis = new Redis(config.REDIS_URL);

// Rate limit types
interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessful?: boolean;
  skipFailed?: boolean;
}

// Rate limit configurations
const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  commands: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: BOT_CONSTANTS.RATE_LIMITS.COMMANDS_PER_MINUTE,
  },
  messages: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: BOT_CONSTANTS.RATE_LIMITS.MESSAGES_PER_MINUTE,
  },
  tasks: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: BOT_CONSTANTS.RATE_LIMITS.TASKS_PER_MINUTE,
  },
  uploads: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: BOT_CONSTANTS.RATE_LIMITS.FILE_UPLOADS_PER_HOUR,
  },
};

// Rate limit middleware factory
export const createRateLimitMiddleware = (type: keyof typeof RATE_LIMIT_CONFIGS) => {
  const config = RATE_LIMIT_CONFIGS[type];
  
  return async (ctx: BotContext, next: NextFunction) => {
    if (!ctx.from) {
      return next();
    }

    const userId = ctx.from.id;
    const isAdminUser = ctx.isAdmin || ctx.isSuperAdmin;
    
    // Skip rate limiting for admins
    if (isAdminUser) {
      return next();
    }

    try {
      const isAllowed = await checkRateLimit(userId, type, config);
      
      if (!isAllowed) {
        await ctx.reply(
          '⚠️ Превышен лимит запросов. Попробуйте через несколько минут.',
          { reply_to_message_id: ctx.message?.message_id }
        );
        return;
      }

      await next();
      
      // Increment counter after successful processing (if not skipping successful)
      if (!config.skipSuccessful) {
        await incrementRateLimit(userId, type, config);
      }
      
    } catch (error) {
      console.error('Rate limit middleware error:', error);
      
      // Don't increment on error (if not skipping failed)
      if (!config.skipFailed) {
        await incrementRateLimit(userId, type, config);
      }
      
      throw error;
    }
  };
};

// Check if request is within rate limit
const checkRateLimit = async (
  userId: number,
  type: string,
  config: RateLimitConfig
): Promise<boolean> => {
  const key = `rate_limit:${type}:${userId}`;
  const window = Math.floor(Date.now() / config.windowMs);
  const windowKey = `${key}:${window}`;
  
  try {
    const current = await redis.get(windowKey);
    const currentCount = current ? parseInt(current) : 0;
    
    return currentCount < config.maxRequests;
  } catch (error) {
    console.error('Rate limit check error:', error);
    return true; // Allow request on error
  }
};

// Increment rate limit counter
const incrementRateLimit = async (
  userId: number,
  type: string,
  config: RateLimitConfig
): Promise<void> => {
  const key = `rate_limit:${type}:${userId}`;
  const window = Math.floor(Date.now() / config.windowMs);
  const windowKey = `${key}:${window}`;
  
  try {
    const pipeline = redis.pipeline();
    pipeline.incr(windowKey);
    pipeline.expire(windowKey, Math.ceil(config.windowMs / 1000));
    await pipeline.exec();
  } catch (error) {
    console.error('Rate limit increment error:', error);
  }
};

// Get rate limit status
export const getRateLimitStatus = async (
  userId: number,
  type: string
): Promise<{
  remaining: number;
  resetTime: number;
  isLimited: boolean;
}> => {
  const config = RATE_LIMIT_CONFIGS[type];
  if (!config) {
    return { remaining: 0, resetTime: 0, isLimited: false };
  }

  const key = `rate_limit:${type}:${userId}`;
  const window = Math.floor(Date.now() / config.windowMs);
  const windowKey = `${key}:${window}`;
  
  try {
    const current = await redis.get(windowKey);
    const currentCount = current ? parseInt(current) : 0;
    const remaining = Math.max(0, config.maxRequests - currentCount);
    const resetTime = (window + 1) * config.windowMs;
    const isLimited = currentCount >= config.maxRequests;
    
    return { remaining, resetTime, isLimited };
  } catch (error) {
    console.error('Get rate limit status error:', error);
    return { remaining: config.maxRequests, resetTime: 0, isLimited: false };
  }
};

// Clear rate limit for user
export const clearRateLimit = async (userId: number, type?: string): Promise<void> => {
  try {
    if (type) {
      const pattern = `rate_limit:${type}:${userId}:*`;
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } else {
      const pattern = `rate_limit:*:${userId}:*`;
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
  } catch (error) {
    console.error('Clear rate limit error:', error);
  }
};

// Anti-spam middleware for messages
export const antiSpamMiddleware = async (ctx: BotContext, next: NextFunction) => {
  if (!ctx.from || !ctx.message) {
    return next();
  }

  const userId = ctx.from.id;
  const isAdminUser = ctx.isAdmin || ctx.isSuperAdmin;
  
  // Skip anti-spam for admins
  if (isAdminUser) {
    return next();
  }

  try {
    // Check for rapid message sending
    const isSpamming = await checkSpamming(userId);
    
    if (isSpamming) {
      // Temporary ban user
      await banUser(userId, 3600); // 1 hour ban
      
      await ctx.reply(
        '🚫 Обнаружен спам. Вы временно заблокированы на 1 час.',
        { reply_to_message_id: ctx.message.message_id }
      );
      
      return;
    }

    await recordMessage(userId);
    return next();
    
  } catch (error) {
    console.error('Anti-spam middleware error:', error);
    return next();
  }
};

// Check if user is spamming
const checkSpamming = async (userId: number): Promise<boolean> => {
  const key = `spam_check:${userId}`;
  const windowMs = 60 * 1000; // 1 minute
  const maxMessages = config.ANTI_SPAM_MESSAGE_LIMIT;
  
  try {
    const messages = await redis.lrange(key, 0, -1);
    const now = Date.now();
    const recentMessages = messages
      .map(ts => parseInt(ts))
      .filter(ts => now - ts < windowMs);
    
    return recentMessages.length >= maxMessages;
  } catch (error) {
    console.error('Spam check error:', error);
    return false;
  }
};

// Record message timestamp
const recordMessage = async (userId: number): Promise<void> => {
  const key = `spam_check:${userId}`;
  const now = Date.now();
  
  try {
    const pipeline = redis.pipeline();
    pipeline.lpush(key, now.toString());
    pipeline.ltrim(key, 0, 19); // Keep only last 20 messages
    pipeline.expire(key, 3600); // Expire in 1 hour
    await pipeline.exec();
  } catch (error) {
    console.error('Record message error:', error);
  }
};

// Ban user temporarily
const banUser = async (userId: number, durationSeconds: number): Promise<void> => {
  const key = `banned:${userId}`;
  
  try {
    await redis.setex(key, durationSeconds, Date.now().toString());
  } catch (error) {
    console.error('Ban user error:', error);
  }
};

// Check if user is banned
export const isUserBanned = async (userId: number): Promise<boolean> => {
  const key = `banned:${userId}`;
  
  try {
    const banTime = await redis.get(key);
    return banTime !== null;
  } catch (error) {
    console.error('Check ban error:', error);
    return false;
  }
};

// Unban user
export const unbanUser = async (userId: number): Promise<void> => {
  const key = `banned:${userId}`;
  
  try {
    await redis.del(key);
  } catch (error) {
    console.error('Unban user error:', error);
  }
};

// Pre-defined rate limit middlewares
export const commandRateLimit = createRateLimitMiddleware('commands');
export const messageRateLimit = createRateLimitMiddleware('messages');
export const taskRateLimit = createRateLimitMiddleware('tasks');
export const uploadRateLimit = createRateLimitMiddleware('uploads');