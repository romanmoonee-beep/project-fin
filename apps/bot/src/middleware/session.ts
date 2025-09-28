import { session } from 'grammy';
import { freeStorage } from '@grammyjs/storage-free';
import Redis from 'ioredis';
import { config } from '../config';
import type { BotContext, SessionData } from '../types/context';

// Redis storage adapter
class RedisStorage {
  private redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl);
  }

  async read(key: string): Promise<SessionData | undefined> {
    try {
      const data = await this.redis.get(`session:${key}`);
      return data ? JSON.parse(data) : undefined;
    } catch (error) {
      console.error('Redis read error:', error);
      return undefined;
    }
  }

  async write(key: string, value: SessionData): Promise<void> {
    try {
      await this.redis.setex(
        `session:${key}`,
        config.BOT_SESSION_TTL,
        JSON.stringify(value)
      );
    } catch (error) {
      console.error('Redis write error:', error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(`session:${key}`);
    } catch (error) {
      console.error('Redis delete error:', error);
    }
  }
}

// Create storage instance
const storage = config.REDIS_URL 
  ? new RedisStorage(config.REDIS_URL)
  : freeStorage<SessionData>(config.BOT_TOKEN);

// Initial session data
const initial = (): SessionData => ({
  step: 'idle',
  data: {},
});

// Session key generator
const getSessionKey = (ctx: BotContext): string => {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  
  if (!userId) {
    throw new Error('User ID not found in context');
  }
  
  // Use chat ID for group chats, user ID for private chats
  return ctx.chat?.type === 'private' ? `user_${userId}` : `chat_${chatId}_user_${userId}`;
};

// Create session middleware
export const sessionMiddleware = session({
  initial,
  storage,
  getSessionKey,
});

// Session helper functions
export const clearSession = async (ctx: BotContext): Promise<void> => {
  ctx.session = initial();
};

export const setSessionStep = (ctx: BotContext, step: string, data?: Record<string, any>): void => {
  ctx.session.step = step;
  if (data) {
    ctx.session.data = { ...ctx.session.data, ...data };
  }
};

export const getSessionStep = (ctx: BotContext): string => {
  return ctx.session.step || 'idle';
};

export const getSessionData = (ctx: BotContext, key?: string): any => {
  if (key) {
    return ctx.session.data?.[key];
  }
  return ctx.session.data || {};
};

export const setSessionData = (ctx: BotContext, key: string, value: any): void => {
  if (!ctx.session.data) {
    ctx.session.data = {};
  }
  ctx.session.data[key] = value;
};

export const removeSessionData = (ctx: BotContext, key: string): void => {
  if (ctx.session.data) {
    delete ctx.session.data[key];
  }
};

export const hasSessionData = (ctx: BotContext, key: string): boolean => {
  return ctx.session.data && key in ctx.session.data;
};