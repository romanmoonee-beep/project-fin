import { NextFunction } from 'grammy';
import { config } from '../config';
import { prisma } from '@pr-gram/database';
import type { BotContext } from '../types/context';

export const loggingMiddleware = async (ctx: BotContext, next: NextFunction) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  // Add request metadata to context
  ctx.requestId = requestId;
  ctx.startTime = startTime;

  // Log incoming request
  if (config.BOT_DEBUG_MODE) {
    console.log(`[${requestId}] Incoming request:`, {
      userId: ctx.from?.id,
      chatId: ctx.chat?.id,
      type: getRequestType(ctx),
      text: ctx.message?.text || ctx.callbackQuery?.data,
      timestamp: new Date().toISOString()
    });
  }

  try {
    await next();

    // Log successful completion
    const duration = Date.now() - startTime;
    
    if (config.BOT_DEBUG_MODE) {
      console.log(`[${requestId}] Request completed in ${duration}ms`);
    }

    // Log user activity to database (async, don't wait)
    if (ctx.user && shouldLogActivity(ctx)) {
      setImmediate(async () => {
        try {
          await logUserActivity(ctx, duration, 'success');
        } catch (error) {
          console.error('Failed to log user activity:', error);
        }
      });
    }

  } catch (error) {
    // Log error
    const duration = Date.now() - startTime;
    
    console.error(`[${requestId}] Request failed after ${duration}ms:`, error);

    // Log failed activity to database (async, don't wait)
    if (ctx.user) {
      setImmediate(async () => {
        try {
          await logUserActivity(ctx, duration, 'error', error);
        } catch (logError) {
          console.error('Failed to log error activity:', logError);
        }
      });
    }

    throw error; // Re-throw for error middleware
  }
};

// Generate unique request ID
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Get request type for logging
function getRequestType(ctx: BotContext): string {
  if (ctx.message) {
    if (ctx.message.text?.startsWith('/')) {
      return 'command';
    }
    return 'message';
  }
  
  if (ctx.callbackQuery) {
    return 'callback_query';
  }
  
  if (ctx.inlineQuery) {
    return 'inline_query';
  }
  
  return 'unknown';
}

// Check if we should log this activity
function shouldLogActivity(ctx: BotContext): boolean {
  const type = getRequestType(ctx);
  
  // Always log commands and callback queries
  if (type === 'command' || type === 'callback_query') {
    return true;
  }
  
  // Log important messages
  if (type === 'message') {
    const text = ctx.message?.text?.toLowerCase() || '';
    
    // Log if message contains important keywords
    const importantKeywords = [
      'help', 'помощь', 'start', 'menu', 'меню',
      'баланс', 'задание', 'выполнить', 'создать'
    ];
    
    return importantKeywords.some(keyword => text.includes(keyword));
  }
  
  return false;
}

// Log user activity to database
async function logUserActivity(
  ctx: BotContext, 
  duration: number, 
  status: 'success' | 'error',
  error?: unknown
) {
  try {
    const activityType = getActivityType(ctx);
    const description = getActivityDescription(ctx);
    
    const metadata = {
      requestId: ctx.requestId,
      duration,
      status,
      request: {
        type: getRequestType(ctx),
        chatId: ctx.chat?.id,
        chatType: ctx.chat?.type,
        messageText: ctx.message?.text,
        callbackData: ctx.callbackQuery?.data,
        timestamp: new Date().toISOString()
      },
      ...(error && {
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          name: error instanceof Error ? error.name : 'UnknownError'
        }
      })
    };

    await prisma.userActivity.create({
      data: {
        userId: ctx.user.telegramId,
        type: activityType,
        description,
        metadata
      }
    });

  } catch (dbError) {
    console.error('Database logging error:', dbError);
  }
}

// Get activity type for database
function getActivityType(ctx: BotContext): string {
  const requestType = getRequestType(ctx);
  
  if (requestType === 'command') {
    const command = ctx.message?.text?.split(' ')[0]?.toLowerCase();
    switch (command) {
      case '/start':
        return 'bot_started';
      case '/help':
        return 'help_requested';
      case '/menu':
        return 'menu_opened';
      case '/profile':
        return 'profile_viewed';
      default:
        return 'command_executed';
    }
  }
  
  if (requestType === 'callback_query') {
    const data = ctx.callbackQuery?.data;
    if (data?.startsWith('menu:')) {
      return 'menu_navigated';
    } else if (data?.startsWith('task:')) {
      return 'task_interacted';
    } else if (data?.startsWith('check:')) {
      return 'check_interacted';
    }
    return 'button_clicked';
  }
  
  if (requestType === 'message') {
    return 'message_sent';
  }
  
  return 'unknown_activity';
}

// Get activity description
function getActivityDescription(ctx: BotContext): string {
  const requestType = getRequestType(ctx);
  
  if (requestType === 'command') {
    const command = ctx.message?.text?.split(' ')[0];
    return `Выполнена команда: ${command}`;
  }
  
  if (requestType === 'callback_query') {
    const data = ctx.callbackQuery?.data;
    return `Нажата кнопка: ${data}`;
  }
  
  if (requestType === 'message') {
    const text = ctx.message?.text;
    if (text && text.length > 50) {
      return `Отправлено сообщение: ${text.substring(0, 50)}...`;
    }
    return `Отправлено сообщение: ${text}`;
  }
  
  return 'Неизвестная активность';
}

// Performance monitoring middleware
export const performanceMiddleware = async (ctx: BotContext, next: NextFunction) => {
  const startTime = process.hrtime.bigint();
  const startMemory = process.memoryUsage();

  try {
    await next();
  } finally {
    const endTime = process.hrtime.bigint();
    const endMemory = process.memoryUsage();
    
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;

    // Log performance metrics if enabled
    if (config.BOT_DEBUG_MODE) {
      console.log(`Performance [${ctx.requestId}]:`, {
        duration: `${duration.toFixed(2)}ms`,
        memoryDelta: `${(memoryDelta / 1024 / 1024).toFixed(2)}MB`,
        heapUsed: `${(endMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`
      });
    }

    // Log slow requests
    if (duration > 5000) { // 5 seconds
      console.warn(`Slow request detected [${ctx.requestId}]:`, {
        duration: `${duration.toFixed(2)}ms`,
        userId: ctx.user?.telegramId,
        type: getRequestType(ctx),
        text: ctx.message?.text || ctx.callbackQuery?.data
      });
    }

    // Log high memory usage
    if (memoryDelta > 50 * 1024 * 1024) { // 50MB
      console.warn(`High memory usage detected [${ctx.requestId}]:`, {
        memoryDelta: `${(memoryDelta / 1024 / 1024).toFixed(2)}MB`,
        userId: ctx.user?.telegramId,
        type: getRequestType(ctx)
      });
    }
  }
};

// Request correlation middleware (for tracking requests across services)
export const correlationMiddleware = async (ctx: BotContext, next: NextFunction) => {
  // Add correlation ID for request tracking
  const correlationId = ctx.requestId || generateRequestId();
  
  // Store in context for other services to use
  ctx.correlationId = correlationId;
  
  // Add to any outgoing HTTP requests (if you make any)
  if (process.env.NODE_ENV === 'development') {
    console.log(`[${correlationId}] Processing request from user ${ctx.from?.id}`);
  }
  
  await next();
};

// Audit middleware for sensitive operations
export const auditMiddleware = async (ctx: BotContext, next: NextFunction) => {
  const sensitiveOperations = [
    'admin:', 'balance:', 'task:approve', 'task:reject', 
    'check:create', 'user:ban', 'settings:'
  ];
  
  const callbackData = ctx.callbackQuery?.data;
  const messageText = ctx.message?.text;
  
  // Check if this is a sensitive operation
  const isSensitive = sensitiveOperations.some(op => 
    callbackData?.startsWith(op) || messageText?.includes(op)
  );
  
  if (isSensitive && ctx.user) {
    // Log audit trail before operation
    const auditData = {
      userId: ctx.user.telegramId,
      type: 'sensitive_operation',
      description: `Попытка выполнения операции: ${callbackData || messageText}`,
      metadata: {
        operation: callbackData || messageText,
        userLevel: ctx.user.level,
        isAdmin: ctx.isAdmin,
        isSuperAdmin: ctx.isSuperAdmin,
        chatId: ctx.chat?.id,
        timestamp: new Date().toISOString(),
        requestId: ctx.requestId
      }
    };

    try {
      await prisma.userActivity.create({ data: auditData });
    } catch (error) {
      console.error('Audit logging failed:', error);
    }
  }
  
  await next();
};