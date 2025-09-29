import { NextFunction } from 'grammy';
import { isAdmin, isSuperAdmin } from '../config';
import type { BotContext } from '../types/context';

// Admin access middleware
export const adminMiddleware = async (ctx: BotContext, next: NextFunction) => {
  if (!ctx.from || !isAdmin(ctx.from.id)) {
    await ctx.reply('❌ Недостаточно прав доступа');
    return;
  }
  return next();
};

// Super admin access middleware
export const superAdminMiddleware = async (ctx: BotContext, next: NextFunction) => {
  if (!ctx.from || !isSuperAdmin(ctx.from.id)) {
    await ctx.reply('❌ Только для супер-администраторов');
    return;
  }
  return next();
};

// Admin context enhancer - adds admin flags to context
export const adminContextMiddleware = async (ctx: BotContext, next: NextFunction) => {
  if (ctx.from) {
    ctx.isAdmin = isAdmin(ctx.from.id);
    ctx.isSuperAdmin = isSuperAdmin(ctx.from.id);
  }
  return next();
};

// Command rate limit bypass for admins
export const adminRateLimitBypass = async (ctx: BotContext, next: NextFunction) => {
  if (ctx.from && isAdmin(ctx.from.id)) {
    // Skip rate limiting for admins
    return next();
  }
  return next();
};