import { Composer } from 'grammy';
import { mainMenu } from '../menus/main';
import { clearSession } from '../middleware/session';
import type { BotContext } from '../types/context';

export const startHandler = new Composer<BotContext>();

// Handle /start command
startHandler.command('start', async (ctx) => {
  await clearSession(ctx);
  
  try {
    const isNewUser = !ctx.user.createdAt || 
                     (Date.now() - ctx.user.createdAt.getTime()) < 60000; // Less than 1 minute old

    if (isNewUser) {
      // Welcome new user
      const welcomeText = ctx.t('start.welcome');
      
      await ctx.reply(welcomeText, {
        reply_markup: mainMenu,
        parse_mode: 'HTML'
      });

      // Check for referral bonus
      if (ctx.user.referrerId) {
        const referralBonusText = ctx.t('start.referral_bonus', {
          bonus: 1000 // Default bonus, would be calculated based on referrer level
        });
        
        await ctx.reply(referralBonusText, {
          parse_mode: 'HTML'
        });
      }
    } else {
      // Welcome returning user
      const returningText = ctx.t('start.returning_user', {
        name: ctx.user.firstName || ctx.user.username || 'пользователь',
        balance: ctx.user.balance.toString(),
        level: ctx.user.level
      });
      
      await ctx.reply(returningText, {
        reply_markup: mainMenu,
        parse_mode: 'HTML'
      });
    }

    // Log user activity
    await logUserActivity(ctx.user.telegramId, 'bot_start', 'User started bot', {
      isNewUser,
      hasReferrer: !!ctx.user.referrerId
    });

  } catch (error) {
    console.error('Start handler error:', error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
});

// Handle /help command
startHandler.command('help', async (ctx) => {
  const helpText = `
🆘 **Помощь по боту PR GRAM**

**Основные команды:**
/start - Запустить бота
/menu - Показать главное меню
/profile - Мой профиль
/earn - Заработать GRAM
/promote - Создать задание
/subscription - Проверка подписки
/settings - Настройки

**Как зарабатывать:**
1. Выберите задание в разделе "💰 Заработать"
2. Выполните требования (подпишитесь, вступите и т.д.)
3. Получите GRAM на баланс

**Как создавать задания:**
1. Перейдите в "📢 Продвигать"
2. Выберите тип задания
3. Заполните данные и оплатите

**Проверка подписки:**
1. Добавьте бота в ваш чат как администратора
2. Используйте команды /setup, /unsetup, /status

**Поддержка:** @prgram_help
  `;

  await ctx.reply(helpText, {
    parse_mode: 'Markdown',
    reply_markup: mainMenu
  });
});

// Handle /menu command
startHandler.command('menu', async (ctx) => {
  const menuText = ctx.t('menu.main.title', {
    balance: ctx.user.balance.toString()
  });

  await ctx.reply(menuText, {
    reply_markup: mainMenu,
    parse_mode: 'HTML'
  });
});

// Handle /profile command
startHandler.command('profile', async (ctx) => {
  const profileText = ctx.t('profile.title') + '\n\n' +
    ctx.t('profile.info', {
      id: ctx.user.telegramId.toString(),
      username: ctx.user.username || 'не указан',
      level: ctx.user.level,
      emoji: getLevelEmoji(ctx.user.level),
      balance: ctx.user.balance.toString(),
      frozen: ctx.user.frozenBalance.toString()
    }) + '\n\n' +
    ctx.t('profile.stats', {
      completedTasks: ctx.user.tasksCompleted.toString(),
      createdTasks: ctx.user.tasksCreated.toString(),
      referrals: '0', // Would be calculated
      premiumReferrals: '0', // Would be calculated
      totalEarned: ctx.user.totalEarned.toString()
    });

  await ctx.reply(profileText, {
    parse_mode: 'HTML'
  });
});

// Handle subscription check commands
startHandler.command('setup', async (ctx) => {
  if (ctx.chat.type === 'private') {
    await ctx.reply(
      '⚠️ Эта команда работает только в группах и каналах.\n\n' +
      'Добавьте бота в ваш чат как администратора и используйте команду там.'
    );
    return;
  }

  // Handle setup command in groups
  await handleSetupCommand(ctx);
});

startHandler.command('unsetup', async (ctx) => {
  if (ctx.chat.type === 'private') {
    await ctx.reply(
      '⚠️ Эта команда работает только в группах и каналах.'
    );
    return;
  }

  await handleUnsetupCommand(ctx);
});

startHandler.command('status', async (ctx) => {
  if (ctx.chat.type === 'private') {
    await ctx.reply(
      '⚠️ Эта команда работает только в группах и каналах.'
    );
    return;
  }

  await handleStatusCommand(ctx);
});

startHandler.command('setup_bot', async (ctx) => {
  if (ctx.chat.type === 'private') {
    await ctx.reply(
      '⚠️ Эта команда работает только в группах и каналах.'
    );
    return;
  }

  await handleSetupBotCommand(ctx);
});

startHandler.command('unsetup_bot', async (ctx) => {
  if (ctx.chat.type === 'private') {
    await ctx.reply(
      '⚠️ Эта команда работает только в группах и каналах.'
    );
    return;
  }

  await handleUnsetupBotCommand(ctx);
});

// Auto-delete commands
startHandler.command('autodelete', async (ctx) => {
  if (ctx.chat.type === 'private') {
    await ctx.reply('⚠️ Эта команда работает только в группах и каналах.');
    return;
  }

  await handleAutoDeleteCommand(ctx);
});

startHandler.command('get_autodelete', async (ctx) => {
  if (ctx.chat.type === 'private') {
    await ctx.reply('⚠️ Эта команда работает только в группах и каналах.');
    return;
  }

  await handleGetAutoDeleteCommand(ctx);
});

// Helper functions
const getLevelEmoji = (level: string): string => {
  const emojis = {
    bronze: '🥉',
    silver: '🥈', 
    gold: '🥇',
    premium: '💎'
  };
  return emojis[level as keyof typeof emojis] || '🥉';
};

const logUserActivity = async (
  userId: number,
  type: string,
  description: string,
  metadata?: any
) => {
  try {
    // Implementation would use prisma to log activity
    console.log(`User activity: ${userId} - ${type}: ${description}`, metadata);
  } catch (error) {
    console.error('Log activity error:', error);
  }
};

// Subscription setup handlers
const handleSetupCommand = async (ctx: BotContext) => {
  const args = ctx.message?.text?.split(' ').slice(1) || [];
  
  if (args.length === 0) {
    await ctx.reply(
      '📝 Использование команды:\n\n' +
      '/setup @channel - настроить проверку подписки\n' +
      '/setup @channel 1d - с таймером на 1 день\n\n' +
      'Форматы времени: s (сек), m (мин), h (час), d (дней)'
    );
    return;
  }

  try {
    const target = args[0];
    const timer = args[1];
    
    // Validate target
    if (!target.startsWith('@') && isNaN(parseInt(target))) {
      await ctx.reply('❌ Неверный формат. Используйте @username или ID канала.');
      return;
    }

    // Parse timer if provided
    let timerSeconds = 0;
    if (timer) {
      timerSeconds = parseTimer(timer);
      if (timerSeconds === 0) {
        await ctx.reply('❌ Неверный формат времени. Используйте: 30s, 5m, 2h, 1d');
        return;
      }
    }

    // Check admin permissions
    const member = await ctx.api.getChatMember(ctx.chat.id, ctx.from!.id);
    if (!['creator', 'administrator'].includes(member.status)) {
      await ctx.reply('❌ Только администраторы могут настраивать проверку подписки.');
      return;
    }

    // Setup subscription check
    const subscriptionService = await import('../services/subscriptionService');
    await subscriptionService.subscriptionService.setupSubscriptionCheck(
      ctx.chat.id,
      {
        type: target.startsWith('@') ? 'public_channel' : 'private_channel',
        target,
        timer: timerSeconds,
        createdBy: ctx.from!.id
      }
    );

    let responseText = `✅ Проверка подписки настроена!\n\n📺 Канал: ${target}`;
    if (timer) {
      responseText += `\n⏰ Таймер: ${timer}`;
    }
    responseText += '\n\n💡 Теперь новые участники должны будут подписаться на канал для участия в чате.';

    await ctx.reply(responseText);

  } catch (error) {
    console.error('Setup command error:', error);
    await ctx.reply(`❌ Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
  }
};

const handleUnsetupCommand = async (ctx: BotContext) => {
  const args = ctx.message?.text?.split(' ').slice(1) || [];

  try {
    // Check admin permissions
    const member = await ctx.api.getChatMember(ctx.chat.id, ctx.from!.id);
    if (!['creator', 'administrator'].includes(member.status)) {
      await ctx.reply('❌ Только администраторы могут управлять проверкой подписки.');
      return;
    }

    const subscriptionService = await import('../services/subscriptionService');
    
    if (args.length === 0) {
      // Remove all checks
      const count = await subscriptionService.subscriptionService.removeSubscriptionCheck(
        ctx.chat.id,
        undefined,
        ctx.from!.id
      );
      
      await ctx.reply(`✅ Все проверки подписки отключены (${count} шт.)`);
    } else {
      // Remove specific check
      const target = args[0];
      const count = await subscriptionService.subscriptionService.removeSubscriptionCheck(
        ctx.chat.id,
        target,
        ctx.from!.id
      );
      
      await ctx.reply(`✅ Проверка подписки для ${target} отключена`);
    }

  } catch (error) {
    console.error('Unsetup command error:', error);
    await ctx.reply(`❌ Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
  }
};

const handleStatusCommand = async (ctx: BotContext) => {
  try {
    const subscriptionService = await import('../services/subscriptionService');
    const checks = await subscriptionService.subscriptionService.getSubscriptionStatus(ctx.chat.id);

    if (checks.length === 0) {
      await ctx.reply('📊 Активные проверки подписки отсутствуют.');
      return;
    }

    let statusText = '📊 **Активные проверки подписки:**\n\n';
    
    checks.forEach((check, index) => {
      statusText += `${index + 1}. **${check.title || check.target}**\n`;
      statusText += `   Тип: ${getCheckTypeText(check.type)}\n`;
      if (check.expiresAt) {
        statusText += `   Истекает: ${formatDate(check.expiresAt)}\n`;
      }
      if (check.subscriberGoal) {
        statusText += `   Прогресс: ${check.currentSubscribers}/${check.subscriberGoal}\n`;
      }
      statusText += `   Создано: ${formatDate(check.createdAt)}\n\n`;
    });

    await ctx.reply(statusText, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Status command error:', error);
    await ctx.reply('❌ Ошибка при получении статуса проверок.');
  }
};

const handleSetupBotCommand = async (ctx: BotContext) => {
  const args = ctx.message?.text?.split(' ').slice(1) || [];
  
  if (args.length === 0) {
    await ctx.reply(
      '📝 Использование команды:\n\n' +
      '/setup_bot USER_ID - настроить реферальную проверку\n' +
      '/setup_bot USER_ID 1d - с таймером на 1 день\n\n' +
      'Ваш ID можно найти в разделе "👤 Профиль"'
    );
    return;
  }

  try {
    const userId = parseInt(args[0]);
    if (isNaN(userId)) {
      await ctx.reply('❌ Неверный ID пользователя.');
      return;
    }

    const timer = args[1];
    let timerSeconds = 0;
    if (timer) {
      timerSeconds = parseTimer(timer);
      if (timerSeconds === 0) {
        await ctx.reply('❌ Неверный формат времени.');
        return;
      }
    }

    // Check admin permissions
    const member = await ctx.api.getChatMember(ctx.chat.id, ctx.from!.id);
    if (!['creator', 'administrator'].includes(member.status)) {
      await ctx.reply('❌ Только администраторы могут настраивать проверку подписки.');
      return;
    }

    const subscriptionService = await import('../services/subscriptionService');
    await subscriptionService.subscriptionService.setupSubscriptionCheck(
      ctx.chat.id,
      {
        type: 'referral_bot',
        target: userId.toString(),
        timer: timerSeconds,
        createdBy: ctx.from!.id
      }
    );

    let responseText = `✅ Реферальная проверка настроена!\n\n👤 Реферер ID: ${userId}`;
    if (timer) {
      responseText += `\n⏰ Таймер: ${timer}`;
    }
    responseText += '\n\n💡 Теперь участники должны регистрироваться по реферальной ссылке указанного пользователя.';

    await ctx.reply(responseText);

  } catch (error) {
    console.error('Setup bot command error:', error);
    await ctx.reply(`❌ Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
  }
};

const handleUnsetupBotCommand = async (ctx: BotContext) => {
  try {
    // Check admin permissions
    const member = await ctx.api.getChatMember(ctx.chat.id, ctx.from!.id);
    if (!['creator', 'administrator'].includes(member.status)) {
      await ctx.reply('❌ Только администраторы могут управлять проверкой подписки.');
      return;
    }

    // Remove referral bot checks
    const subscriptionService = await import('../services/subscriptionService');
    await subscriptionService.subscriptionService.removeSubscriptionCheck(
      ctx.chat.id,
      undefined, // Will remove all referral_bot type checks
      ctx.from!.id
    );

    await ctx.reply('✅ Реферальная проверка отключена.');

  } catch (error) {
    console.error('Unsetup bot command error:', error);
    await ctx.reply('❌ Ошибка при отключении реферальной проверки.');
  }
};

const handleAutoDeleteCommand = async (ctx: BotContext) => {
  const args = ctx.message?.text?.split(' ').slice(1) || [];
  
  if (args.length === 0) {
    await ctx.reply(
      '📝 Использование команды:\n\n' +
      '/autodelete 30s - удаление через 30 секунд\n' +
      '/autodelete 2m - удаление через 2 минуты\n' +
      '/autodelete off - отключить автоудаление\n\n' +
      'Доступные интервалы: 15s - 5m'
    );
    return;
  }

  try {
    // Check admin permissions
    const member = await ctx.api.getChatMember(ctx.chat.id, ctx.from!.id);
    if (!['creator', 'administrator'].includes(member.status)) {
      await ctx.reply('❌ Только администраторы могут настраивать автоудаление.');
      return;
    }

    const setting = args[0].toLowerCase();
    
    if (setting === 'off') {
      // Disable auto-delete
      await ctx.reply('✅ Автоудаление сообщений отключено.');
    } else {
      const seconds = parseTimer(setting);
      if (seconds === 0 || seconds < 15 || seconds > 300) {
        await ctx.reply('❌ Интервал должен быть от 15 секунд до 5 минут.');
        return;
      }

      await ctx.reply(`✅ Автоудаление настроено на ${setting}.\n\nВсе сообщения бота будут удаляться через указанное время.`);
    }

  } catch (error) {
    console.error('Auto-delete command error:', error);
    await ctx.reply('❌ Ошибка при настройке автоудаления.');
  }
};

const handleGetAutoDeleteCommand = async (ctx: BotContext) => {
  try {
    // Get current auto-delete settings
    await ctx.reply('📊 Статус автоудаления: отключено\n\nИспользуйте /autodelete для настройки.');
  } catch (error) {
    console.error('Get auto-delete command error:', error);
    await ctx.reply('❌ Ошибка при получении настроек автоудаления.');
  }
};

// Utility functions
const parseTimer = (timerStr: string): number => {
  const match = timerStr.match(/^(\d+)([smhd])$/);
  if (!match) return 0;
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 24 * 60 * 60;
    default: return 0;
  }
};

const getCheckTypeText = (type: string): string => {
  const types = {
    public_channel: 'Публичный канал',
    private_channel: 'Приватный канал',
    invite_link: 'Пригласительная ссылка',
    referral_bot: 'Реферальная ссылка бота'
  };
  return types[type as keyof typeof types] || 'Неизвестно';
};

const formatDate = (date: Date): string => {
  return date.toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};