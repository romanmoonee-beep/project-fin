import { NextFunction } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { config } from '../config';
import { notificationService } from '../services/notificationService';
import { prisma } from '@pr-gram/database';
import type { BotContext } from '../types/context';

export const errorMiddleware = async (ctx: BotContext, next: NextFunction) => {
  try {
    await next();
  } catch (error) {
    console.error('Bot error:', error);

    // Log error to database if possible
    try {
      if (ctx.user) {
        await logError(ctx, error);
      }
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }

    // Determine error type and response
    let errorMessage = '❌ Произошла ошибка. Попробуйте позже.';
    let shouldReply = true;

    if (error instanceof Error) {
      // Handle known error types
      if (error.message.includes('недостаточно средств')) {
        errorMessage = '💰 Недостаточно средств на балансе для выполнения операции.';
      } else if (error.message.includes('не найдено') || error.message.includes('not found')) {
        errorMessage = '🔍 Запрашиваемый ресурс не найден.';
      } else if (error.message.includes('доступ') || error.message.includes('права')) {
        errorMessage = '🔒 Недостаточно прав для выполнения операции.';
      } else if (error.message.includes('превышен лимит') || error.message.includes('rate limit')) {
        errorMessage = '⏱️ Превышен лимит запросов. Попробуйте через несколько минут.';
        shouldReply = false; // Don't spam user with rate limit messages
      } else if (error.message.includes('истек') || error.message.includes('expired')) {
        errorMessage = '⏰ Время выполнения операции истекло.';
      } else if (error.message.includes('уже выполнено') || error.message.includes('already')) {
        errorMessage = '✋ Операция уже была выполнена ранее.';
      } else if (error.message.includes('validation') || error.message.includes('валидация')) {
        errorMessage = '📝 Неверные данные. Проверьте правильность ввода.';
      } else if (error.message.includes('timeout')) {
        errorMessage = '⏱️ Превышено время ожидания. Попробуйте еще раз.';
      } else if (error.message.includes('network') || error.message.includes('connection')) {
        errorMessage = '🌐 Проблемы с сетью. Попробуйте позже.';
      } else {
        // Generic error with hint
        errorMessage = `❌ ${error.message}`;
      }
    }

    // Reply to user if appropriate
    if (shouldReply) {
      try {
        const keyboard = new InlineKeyboard()
          .text('🏠 Главное меню', 'menu:main')
          .text('🆘 Поддержка', 'support');

        if (ctx.callbackQuery) {
          await ctx.answerCallbackQuery(errorMessage);
          
          // Also edit message for serious errors
          if (!error?.message?.includes('лимит') && !error?.message?.includes('rate limit')) {
            await ctx.editMessageText(
              `${errorMessage}\n\nЕсли проблема повторяется, обратитесь в поддержку.`,
              { reply_markup: keyboard }
            );
          }
        } else {
          await ctx.reply(
            `${errorMessage}\n\nЕсли проблема повторяется, обратитесь в поддержку.`,
            { reply_markup: keyboard }
          );
        }
      } catch (replyError) {
        console.error('Failed to send error message:', replyError);
        
        // Try to answer callback query at least
        if (ctx.callbackQuery) {
          try {
            await ctx.answerCallbackQuery('❌ Произошла ошибка');
          } catch (callbackError) {
            console.error('Failed to answer callback query:', callbackError);
          }
        }
      }
    }

    // Notify admins for critical errors
    if (shouldNotifyAdmins(error)) {
      try {
        await notifyAdmins(ctx, error);
      } catch (notifyError) {
        console.error('Failed to notify admins:', notifyError);
      }
    }
  }
};

// Log error to database
async function logError(ctx: BotContext, error: unknown) {
  try {
    const errorData = {
      userId: ctx.user.telegramId,
      type: 'bot_error',
      description: `Ошибка в боте: ${error instanceof Error ? error.message : 'Unknown error'}`,
      metadata: {
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          name: error instanceof Error ? error.name : 'UnknownError'
        },
        context: {
          chatId: ctx.chat?.id,
          chatType: ctx.chat?.type,
          messageText: ctx.message?.text,
          callbackData: ctx.callbackQuery?.data,
          command: ctx.message?.text?.split(' ')[0],
          userId: ctx.user.telegramId,
          username: ctx.user.username
        },
        timestamp: new Date().toISOString(),
        userAgent: 'TelegramBot',
        botVersion: '1.0.0'
      }
    };

    await prisma.userActivity.create({
      data: errorData
    });
  } catch (logError) {
    console.error('Error logging failed:', logError);
  }
}

// Check if admins should be notified
function shouldNotifyAdmins(error: unknown): boolean {
  if (!error || !(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  
  // Don't notify for common user errors
  const commonErrors = [
    'недостаточно средств',
    'не найдено',
    'уже выполнено',
    'превышен лимит',
    'rate limit',
    'истек',
    'expired',
    'validation',
    'валидация',
    'неверный ввод'
  ];

  for (const commonError of commonErrors) {
    if (message.includes(commonError)) {
      return false;
    }
  }

  // Notify for database, network, and system errors
  const criticalErrors = [
    'database',
    'connection',
    'timeout',
    'internal',
    'system',
    'prisma',
    'redis',
    'crash',
    'fatal'
  ];

  for (const criticalError of criticalErrors) {
    if (message.includes(criticalError)) {
      return true;
    }
  }

  return false;
}

// Notify admins about critical errors
async function notifyAdmins(ctx: BotContext, error: unknown) {
  const adminIds = config.BOT_ADMIN_IDS;
  
  if (adminIds.length === 0) {
    return;
  }

  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  const errorStack = error instanceof Error ? error.stack : undefined;
  
  const adminNotification = `
🚨 <b>КРИТИЧЕСКАЯ ОШИБКА БОТА</b>

👤 <b>Пользователь:</b> ${ctx.user?.username || ctx.user?.firstName || 'Unknown'} (${ctx.user?.telegramId})
💬 <b>Чат:</b> ${ctx.chat?.id} (${ctx.chat?.type})
📝 <b>Сообщение:</b> ${ctx.message?.text || ctx.callbackQuery?.data || 'N/A'}

❌ <b>Ошибка:</b> ${errorMessage}

🕐 <b>Время:</b> ${new Date().toLocaleString('ru-RU')}
`;

  try {
    await notificationService.sendBulkNotifications(
      adminIds,
      'Критическая ошибка бота',
      adminNotification,
      'system_message',
      {
        error: errorMessage,
        stack: errorStack,
        userId: ctx.user?.telegramId,
        chatId: ctx.chat?.id,
        timestamp: new Date().toISOString()
      }
    );
  } catch (notifyError) {
    console.error('Failed to notify admins:', notifyError);
  }
}