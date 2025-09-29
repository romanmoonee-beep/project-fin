import { Menu } from '@grammyjs/menu';
import { prisma } from '@pr-gram/database';
import { TaskStatus } from '@pr-gram/database';
import { getUserLevelConfig, calculateLevelProgress } from '@pr-gram/shared';
import type { BotContext } from '../types/context';

// Главное меню
export const mainMenu = new Menu<BotContext>('main')
  .text('💰 Заработать', async (ctx) => {
    const availableTasks = await getAvailableTasksCount();
    const userLevel = ctx.user.level;
    const multiplier = getMultiplier(userLevel);
    
    const earnText = `
💰 <b>ЗАРАБОТАТЬ GRAM</b>

🔥 Доступно: <b>${availableTasks.total} заданий</b>
⭐ Ваш уровень: <b>${userLevel.toUpperCase()} (+${Math.round((multiplier - 1) * 100)}%)</b>

Выберите тип заданий для выполнения:
`;

    await ctx.editMessageText(earnText, {
      reply_markup: earnMenu,
      parse_mode: 'HTML'
    });
  }).row()
  
  .text('📢 Продвигать', async (ctx) => {
    const userTasks = await getUserTasksCount(ctx.user.telegramId);
    const userLevel = ctx.user.level;
    const commission = getCommissionRate(userLevel);
    
    const promoteText = `
📢 <b>СОЗДАТЬ ЗАДАНИЕ</b>

💰 Ваш баланс: <b>${ctx.user.balance} GRAM</b>
⭐ Уровень: <b>${userLevel.toUpperCase()}</b> (комиссия ${commission}%)

📊 Ваши задания: <b>${userTasks.active}</b> активных
💸 Потрачено сегодня: <b>${userTasks.spentToday}</b> GRAM

Выберите тип задания для создания:
`;

    await ctx.editMessageText(promoteText, {
      reply_markup: promoteMenu,
      parse_mode: 'HTML'
    });
  }).row()
  
  .text('✅ Проверка подписки', async (ctx) => {
    const subscriptionText = `
✅ <b>ПРОВЕРКА ПОДПИСКИ</b>

🤖 Добавьте бота в ваш чат как администратора
⚙️ Настройте проверку подписки на каналы
🔒 Контролируйте доступ участников

<b>Команды для настройки:</b>
• <code>/setup @channel</code> - настроить проверку
• <code>/status</code> - показать активные проверки
• <code>/unsetup</code> - отключить проверку

💡 Подробная инструкция в разделе "Помощь"
`;

    await ctx.editMessageText(subscriptionText, {
      reply_markup: subscriptionMenu,
      parse_mode: 'HTML'
    });
  }).row()
  
  .text('👤 Профиль', async (ctx) => {
    const referralStats = await getReferralStats(ctx.user.telegramId);
    const levelConfig = getUserLevelConfig(ctx.user.level);
    const levelProgress = calculateLevelProgress(ctx.user.balance.toNumber(), ctx.user.level);
    
    const profileText = `
👤 <b>ВАШ ПРОФИЛЬ</b>

🆔 ID: <code>${ctx.user.telegramId}</code>
👤 Имя: ${ctx.user.firstName || ctx.user.username || 'Не указано'}
⭐ Уровень: <b>${getLevelEmoji(ctx.user.level)} ${ctx.user.level.toUpperCase()}</b>

💰 <b>БАЛАНС:</b>
├ Доступно: <b>${ctx.user.balance} GRAM</b>
└ Заморожено: <b>${ctx.user.frozenBalance} GRAM</b>

📊 <b>СТАТИСТИКА:</b>
├ Выполнено заданий: <b>${ctx.user.tasksCompleted}</b>
├ Создано заданий: <b>${ctx.user.tasksCreated}</b>
├ Рефералов: <b>${referralStats.total}</b>
└ Всего заработано: <b>${ctx.user.totalEarned} GRAM</b>

🎯 <b>РЕФЕРАЛЬНАЯ ПРОГРАММА:</b>
├ Ваша ссылка: <code>https://t.me/prgram_bot?start=${ctx.user.telegramId}</code>
├ Приглашено: <b>${referralStats.total}</b>
├ Premium рефералов: <b>${referralStats.premium}</b>
└ Заработано с рефералов: <b>${referralStats.earned} GRAM</b>

📈 <b>ПРОГРЕСС УРОВНЯ:</b>
${generateProgressBar(levelProgress.progressPercentage)} ${levelProgress.progressPercentage}%
`;

    await ctx.editMessageText(profileText, {
      reply_markup: profileMenu,
      parse_mode: 'HTML'
    });
  })
  .text('⚙️ Настройки', async (ctx) => {
    await ctx.conversation.enter('settings');
  }).row()
  
  .text('🆘 Помощь', async (ctx) => {
    const helpText = `
🆘 <b>ПОМОЩЬ ПО БОТУ</b>

<b>💰 Как зарабатывать:</b>
1. Выберите "💰 Заработать"
2. Подберите подходящие задания
3. Выполните требования
4. Получите GRAM на баланс

<b>📢 Как продвигать:</b>
1. Выберите "📢 Продвигать"  
2. Создайте задание
3. Оплатите размещение
4. Отслеживайте выполнение

<b>✅ Проверка подписки:</b>
1. Добавьте бота в чат как админа
2. Используйте команду /setup @channel
3. Настройте автоматическую проверку

<b>🎯 Реферальная программа:</b>
• Приглашайте друзей по своей ссылке
• Получайте бонусы с их активности
• Повышайте свой уровень

<b>💎 Уровни пользователей:</b>
🥉 Bronze - базовый уровень
🥈 Silver - +20% к заработку, -1% комиссия
🥇 Gold - +35% к заработку, -2% комиссия  
💎 Premium - +50% к заработку, -4% комиссия

<b>📞 Поддержка:</b> @prgram_help
<b>📢 Новости:</b> @prgram_news
`;

    await ctx.editMessageText(helpText, {
      reply_markup: { inline_keyboard: [[{ text: '🏠 Главное меню', callback_data: 'menu:main' }]] },
      parse_mode: 'HTML'
    });
  }).row();

// Обработчик главного меню
mainMenu.register(async (ctx) => {
  const welcomeText = `
🤖 <b>PR GRAM - ПРОДВИЖЕНИЕ В TELEGRAM</b>

💰 Баланс: <b>${ctx.user.balance} GRAM</b>
⭐ Уровень: <b>${getLevelEmoji(ctx.user.level)} ${ctx.user.level.toUpperCase()}</b>

Выберите действие:
`;

  if (ctx.callbackQuery) {
    await ctx.editMessageText(welcomeText, {
      reply_markup: mainMenu,
      parse_mode: 'HTML'
    });
    await ctx.answerCallbackQuery();
  } else {
    await ctx.reply(welcomeText, {
      reply_markup: mainMenu,
      parse_mode: 'HTML'
    });
  }
});

// Импорты других меню
import { earnMenu } from './earn';
import { promoteMenu } from './promote';
import { subscriptionMenu } from './subscription';
import { profileMenu } from './profile';

// Helper функции с реальной интеграцией БД
const getMultiplier = (level: string): number => {
  const multipliers = { bronze: 1.0, silver: 1.2, gold: 1.35, premium: 1.5 };
  return multipliers[level as keyof typeof multipliers] || 1.0;
};

const getCommissionRate = (level: string): number => {
  const rates = { bronze: 7, silver: 6, gold: 5, premium: 3 };
  return rates[level as keyof typeof rates] || 7;
};

const getLevelEmoji = (level: string): string => {
  const emojis = { bronze: '🥉', silver: '🥈', gold: '🥇', premium: '💎' };
  return emojis[level as keyof typeof emojis] || '🥉';
};

// Реальные функции для работы с БД
const getAvailableTasksCount = async (): Promise<{total: number}> => {
  try {
    const total = await prisma.task.count({
      where: {
        status: TaskStatus.active,
        expiresAt: {
          OR: [
            { equals: null },
            { gt: new Date() }
          ]
        }
      }
    });
    
    return { total };
  } catch (error) {
    console.error('Get available tasks count error:', error);
    return { total: 0 };
  }
};

const getUserTasksCount = async (userId: number) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [active, spentToday] = await Promise.all([
      // Активные задания пользователя
      prisma.task.count({
        where: {
          authorId: userId,
          status: TaskStatus.active
        }
      }),
      
      // Потрачено сегодня
      prisma.task.aggregate({
        where: {
          authorId: userId,
          createdAt: {
            gte: today
          }
        },
        _sum: {
          reward: true
        }
      })
    ]);

    return {
      active,
      spentToday: spentToday._sum.reward?.toNumber() || 0
    };
  } catch (error) {
    console.error('Get user tasks count error:', error);
    return {
      active: 0,
      spentToday: 0
    };
  }
};

const getReferralStats = async (userId: number) => {
  try {
    const [totalReferrals, premiumReferrals, earnedFromReferrals] = await Promise.all([
      // Общее количество рефералов
      prisma.user.count({
        where: {
          referrerId: userId
        }
      }),
      
      // Количество премиум рефералов
      prisma.user.count({
        where: {
          referrerId: userId,
          isPremium: true
        }
      }),
      
      // Заработано с рефералов
      prisma.transaction.aggregate({
        where: {
          userId: userId,
          type: 'referral'
        },
        _sum: {
          amount: true
        }
      })
    ]);

    return {
      total: totalReferrals,
      premium: premiumReferrals,
      earned: earnedFromReferrals._sum.amount?.toNumber() || 0
    };
  } catch (error) {
    console.error('Get referral stats error:', error);
    return {
      total: 0,
      premium: 0,
      earned: 0
    };
  }
};

const generateProgressBar = (percentage: number): string => {
  const barLength = 10;
  const filledLength = Math.round((percentage / 100) * barLength);
  const emptyLength = barLength - filledLength;
  
  return '█'.repeat(filledLength) + '░'.repeat(emptyLength);
};