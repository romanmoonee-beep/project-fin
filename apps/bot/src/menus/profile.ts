import { Menu } from '@grammyjs/menu';
import { prisma, TransactionType } from '@pr-gram/database';
import { getUserLevelConfig, calculateLevelProgress } from '@pr-gram/shared';
import type { BotContext } from '../types/context';

// Меню профиля
export const profileMenu = new Menu<BotContext>('profile')
  .text('💳 Пополнить баланс', async (ctx) => {
    const topUpText = `
💳 <b>ПОПОЛНЕНИЕ БАЛАНСА</b>

💰 Текущий баланс: <b>${ctx.user.balance} GRAM</b>

<b>Способы пополнения:</b>

⭐ <b>Telegram Stars</b>
├ 100 Stars = 1,000 GRAM
├ 450 Stars = 5,000 GRAM (+10% бонус)
├ 850 Stars = 10,000 GRAM (+15% бонус)
└ 2000 Stars = 25,000 GRAM (+25% бонус)

💎 <b>Криптовалюта</b>
├ USDT/USDC - мгновенно
├ BTC/ETH - до 30 минут
├ TON - до 10 минут
└ Минимум: $5, комиссия 3%

💳 <b>Банковские карты</b>
├ Visa/MasterCard
├ Комиссия: 5%
├ Минимум: 300 руб
└ Зачисление: до 10 минут

Выберите способ пополнения:
`;

    const topUpKeyboard = [
      [{ text: '⭐ Telegram Stars', callback_data: 'topup:stars' }],
      [{ text: '💎 Криптовалюта', callback_data: 'topup:crypto' }],
      [{ text: '💳 Банковская карта', callback_data: 'topup:card' }],
      [{ text: '🎁 Промокод', callback_data: 'topup:promo' }],
      [{ text: '⬅️ Назад в профиль', callback_data: 'menu:profile' }]
    ];

    await ctx.editMessageText(topUpText, {
      reply_markup: { inline_keyboard: topUpKeyboard },
      parse_mode: 'HTML'
    });
  }).row()
  
  .text('📊 Детальная статистика', async (ctx) => {
    try {
      const stats = await getDetailedUserStats(ctx.user.telegramId);
      
      const statsText = `
📊 <b>ДЕТАЛЬНАЯ СТАТИСТИКА</b>

📈 <b>ЗАРАБОТОК:</b>
├ Сегодня: ${stats.earnings.today} GRAM
├ За неделю: ${stats.earnings.week} GRAM
├ За месяц: ${stats.earnings.month} GRAM
└ Всего: ${stats.earnings.total} GRAM

💸 <b>ТРАТЫ:</b>
├ Сегодня: ${stats.spending.today} GRAM
├ За неделю: ${stats.spending.week} GRAM
├ За месяц: ${stats.spending.month} GRAM
└ Всего: ${stats.spending.total} GRAM

🎯 <b>ЗАДАНИЯ:</b>
├ Выполнено сегодня: ${stats.tasks.completedToday}
├ Выполнено всего: ${stats.tasks.completedTotal}
├ Создано всего: ${stats.tasks.createdTotal}
├ Средняя награда: ${stats.tasks.averageReward} GRAM
└ Процент одобрения: ${stats.tasks.approvalRate}%

👥 <b>РЕФЕРАЛЫ:</b>
├ Всего приглашено: ${stats.referrals.total}
├ Активных: ${stats.referrals.active}
├ Premium: ${stats.referrals.premium}
├ Заработано с рефералов: ${stats.referrals.earnings} GRAM
└ Средний доход с реферала: ${stats.referrals.averageEarnings} GRAM

📅 <b>АКТИВНОСТЬ:</b>
├ Дней в системе: ${stats.activity.totalDays}
├ Дней подряд: ${stats.activity.streak}
├ Лучшая серия: ${stats.activity.bestStreak}
├ Среднее время онлайн: ${stats.activity.avgOnlineTime}
└ Последняя активность: ${formatDateTime(stats.activity.lastActive)}
`;

      await ctx.editMessageText(statsText, {
        reply_markup: { 
          inline_keyboard: [
            [{ text: '📈 График заработка', callback_data: 'stats:earnings_chart' }],
            [{ text: '🎯 Анализ заданий', callback_data: 'stats:tasks_analysis' }],
            [{ text: '👥 Реферальная статистика', callback_data: 'stats:referrals' }],
            [{ text: '🔄 Обновить', callback_data: 'profile:detailed_stats' }],
            [{ text: '⬅️ Назад в профиль', callback_data: 'menu:profile' }]
          ]
        },
        parse_mode: 'HTML'
      });
    } catch (error) {
      console.error('Show detailed stats error:', error);
      await ctx.editMessageText(
        '❌ Ошибка при загрузке статистики. Попробуйте позже.',
        { reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'menu:profile' }]] } }
      );
    }
  }).row()
  
  .text('🎯 Мои задания', async (ctx) => {
    try {
      const userTasks = await getUserTasksSummary(ctx.user.telegramId);
      
      const tasksText = `
🎯 <b>МОИ ЗАДАНИЯ</b>

📊 <b>ОБЩАЯ СТАТИСТИКА:</b>
├ Всего создано: ${userTasks.total}
├ Активных: ${userTasks.active}
├ Завершенных: ${userTasks.completed}
├ Отмененных: ${userTasks.cancelled}
└ Потрачено всего: ${userTasks.totalSpent} GRAM

📈 <b>ЭФФЕКТИВНОСТЬ:</b>
├ Средняя цена клика: ${userTasks.avgCostPerExecution} GRAM
├ Конверсия выполнений: ${userTasks.conversionRate}%
├ Скорость выполнения: ${userTasks.avgCompletionTime} мин
└ Рейтинг качества: ${userTasks.qualityRating}/5 ⭐

🏆 <b>ЛУЧШИЕ ЗАДАНИЯ:</b>
${userTasks.topTasks.map((task, i) => 
  `${i + 1}. ${task.title} - ${task.completedCount}/${task.targetCount} выполнений`
).join('\n')}

📅 <b>ПОСЛЕДНЯЯ АКТИВНОСТЬ:</b>
${userTasks.recentTasks.map(task => 
  `• ${getTaskTypeIcon(task.type)} ${task.title} - ${formatDate(task.createdAt)}`
).join('\n')}
`;

      const keyboard = [
        [{ text: '📊 Управление заданиями', callback_data: 'tasks:manage' }],
        [{ text: '📈 Детальная аналитика', callback_data: 'tasks:analytics' }],
        [{ text: '📢 Создать новое задание', callback_data: 'menu:promote' }],
        [{ text: '⬅️ Назад в профиль', callback_data: 'menu:profile' }]
      ];

      await ctx.editMessageText(tasksText, {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'HTML'
      });
    } catch (error) {
      console.error('Show user tasks error:', error);
      await ctx.editMessageText(
        '❌ Ошибка при загрузке заданий. Попробуйте позже.',
        { reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'menu:profile' }]] } }
      );
    }
  }).row()
  
  .text('👥 Мои рефералы', async (ctx) => {
    try {
      const referralData = await getDetailedReferralStats(ctx.user.telegramId);
      
      const referralText = `
👥 <b>МОИ РЕФЕРАЛЫ</b>

📊 <b>ОБЩАЯ СТАТИСТИКА:</b>
├ Всего приглашено: ${referralData.total}
├ Активных (7 дней): ${referralData.active}
├ Premium рефералов: ${referralData.premium}
├ Заработано всего: ${referralData.totalEarnings} GRAM
└ Доход за месяц: ${referralData.monthlyEarnings} GRAM

💰 <b>ИСТОЧНИКИ ДОХОДА:</b>
├ Бонусы за регистрацию: ${referralData.registrationBonuses} GRAM
├ % с пополнений: ${referralData.depositCommissions} GRAM
├ % с выполнения заданий: ${referralData.taskCommissions} GRAM
└ Премиум бонусы: ${referralData.premiumBonuses} GRAM

🏆 <b>ТОП-5 РЕФЕРАЛОВ:</b>
${referralData.topReferrals.map((ref, i) => 
  `${i + 1}. ${ref.name} - ${ref.earnings} GRAM принес`
).join('\n')}

📈 <b>СТАТИСТИКА ЗА МЕСЯЦ:</b>
├ Новых рефералов: ${referralData.monthlyNew}
├ Заработок: ${referralData.monthlyEarnings} GRAM
├ Средний доход с реферала: ${referralData.avgEarningsPerReferral} GRAM
└ Конверсия в Premium: ${referralData.premiumConversion}%

🔗 <b>ВАША РЕФЕРАЛЬНАЯ ССЫЛКА:</b>
<code>https://t.me/prgram_bot?start=${ctx.user.telegramId}</code>
`;

      const keyboard = [
        [{ text: '👥 Список всех рефералов', callback_data: 'referrals:list' }],
        [{ text: '📊 Детальная аналитика', callback_data: 'referrals:analytics' }],
        [{ text: '📤 Поделиться ссылкой', callback_data: 'referrals:share' }],
        [{ text: '🎁 Реферальные акции', callback_data: 'referrals:promotions' }],
        [{ text: '⬅️ Назад в профиль', callback_data: 'menu:profile' }]
      ];

      await ctx.editMessageText(referralText, {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'HTML'
      });
    } catch (error) {
      console.error('Show referrals error:', error);
      await ctx.editMessageText(
        '❌ Ошибка при загрузке реферальной информации. Попробуйте позже.',
        { reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'menu:profile' }]] } }
      );
    }
  }).row()
  
  .text('💎 Повысить уровень', async (ctx) => {
    try {
      const currentLevel = ctx.user.level;
      const levelConfig = getUserLevelConfig(currentLevel);
      const progress = calculateLevelProgress(ctx.user.balance.toNumber(), currentLevel);
      
      const levelUpText = `
💎 <b>ПОВЫШЕНИЕ УРОВНЯ</b>

⭐ <b>ТЕКУЩИЙ УРОВЕНЬ: ${currentLevel.toUpperCase()}</b>
${getLevelEmoji(currentLevel)} ${getLevelDescription(currentLevel)}

📈 <b>ПРОГРЕСС ДО СЛЕДУЮЩЕГО УРОВНЯ:</b>
${generateProgressBar(progress.progressPercentage)} ${progress.progressPercentage}%
💰 ${ctx.user.balance} / ${progress.pointsToNext || 'MAX'} GRAM

${progress.nextLevel ? `
🎯 <b>СЛЕДУЮЩИЙ УРОВЕНЬ: ${progress.nextLevel.toUpperCase()}</b>
${getLevelEmoji(progress.nextLevel)} ${getLevelDescription(progress.nextLevel)}

💫 <b>НОВЫЕ ВОЗМОЖНОСТИ:</b>
${getLevelBenefits(progress.nextLevel)}

💡 <b>КАК ПОВЫСИТЬ УРОВЕНЬ:</b>
• Пополните баланс до ${progress.pointsToNext} GRAM
• Или выполняйте задания для накопления
• Приглашайте Premium рефералов для бонусов
` : `
🏆 <b>ВЫ ДОСТИГЛИ МАКСИМАЛЬНОГО УРОВНЯ!</b>

🎉 Поздравляем! Вы получили доступ ко всем возможностям PR GRAM Bot.

💎 <b>ВАШИ ПРЕИМУЩЕСТВА:</b>
${getLevelBenefits(currentLevel)}
`}
`;

      const keyboard = [];
      
      if (progress.nextLevel) {
        keyboard.push([{ text: '💳 Пополнить баланс', callback_data: 'topup:stars' }]);
        keyboard.push([{ text: '💰 Заработать GRAM', callback_data: 'menu:earn' }]);
        keyboard.push([{ text: '👥 Пригласить друзей', callback_data: 'referrals:share' }]);
      }
      
      keyboard.push([{ text: '📊 История уровней', callback_data: 'level:history' }]);
      keyboard.push([{ text: '⬅️ Назад в профиль', callback_data: 'menu:profile' }]);

      await ctx.editMessageText(levelUpText, {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'HTML'
      });
    } catch (error) {
      console.error('Show level up error:', error);
      await ctx.editMessageText(
        '❌ Ошибка при загрузке информации об уровне. Попробуйте позже.',
        { reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'menu:profile' }]] } }
      );
    }
  }).row()
  
  .text('💰 История транзакций', async (ctx) => {
    try {
      const transactions = await getUserTransactions(ctx.user.telegramId, 1, 10);
      
      if (transactions.length === 0) {
        await ctx.editMessageText(
          '💰 История транзакций пуста.\n\nВыполните первое задание или пополните баланс!',
          {
            reply_markup: { 
              inline_keyboard: [
                [{ text: '💰 Заработать', callback_data: 'menu:earn' }],
                [{ text: '💳 Пополнить', callback_data: 'topup:stars' }],
                [{ text: '⬅️ Назад', callback_data: 'menu:profile' }]
              ]
            }
          }
        );
        return;
      }

      let transactionsText = `💰 <b>ИСТОРИЯ ТРАНЗАКЦИЙ</b>\n\n📊 Последние 10 операций:\n\n`;
      
      transactions.forEach((tx, index) => {
        const emoji = getTransactionEmoji(tx.type);
        const sign = getTransactionSign(tx.type);
        const amount = tx.amount.toNumber();
        
        transactionsText += `${emoji} <b>${sign}${amount} GRAM</b>\n`;
        transactionsText += `   ${tx.description}\n`;
        transactionsText += `   📅 ${formatDateTime(tx.createdAt)}\n\n`;
      });

      const keyboard = [
        [{ text: '📄 Полная история', callback_data: 'transactions:full' }],
        [{ text: '📊 Статистика по типам', callback_data: 'transactions:stats' }],
        [{ text: '💾 Экспорт данных', callback_data: 'transactions:export' }],
        [{ text: '⬅️ Назад в профиль', callback_data: 'menu:profile' }]
      ];

      await ctx.editMessageText(transactionsText, {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'HTML'
      });
    } catch (error) {
      console.error('Show transactions error:', error);
      await ctx.editMessageText(
        '❌ Ошибка при загрузке истории транзакций. Попробуйте позже.',
        { reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'menu:profile' }]] } }
      );
    }
  }).row()
  
  .back('🏠 Главное меню');

// Регистрируем обработчики callback
profileMenu.register(async (ctx) => {
  const data = ctx.callbackQuery?.data;
  
  // Обработка различных callback
  if (data?.startsWith('topup:')) {
    await handleTopUpCallback(ctx, data);
    return;
  }
  
  if (data?.startsWith('stats:')) {
    await handleStatsCallback(ctx, data);
    return;
  }
  
  if (data?.startsWith('tasks:')) {
    await handleTasksCallback(ctx, data);
    return;
  }
  
  if (data?.startsWith('referrals:')) {
    await handleReferralsCallback(ctx, data);
    return;
  }
  
  if (data?.startsWith('level:')) {
    await handleLevelCallback(ctx, data);
    return;
  }
  
  if (data?.startsWith('transactions:')) {
    await handleTransactionsCallback(ctx, data);
    return;
  }

  if (data === 'profile:detailed_stats') {
    // Перезагружаем детальную статистику
    const stats = await getDetailedUserStats(ctx.user.telegramId);
    // ... (код аналогичный выше)
    await ctx.answerCallbackQuery('📊 Статистика обновлена');
    return;
  }

  // Основное меню профиля
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

  if (ctx.callbackQuery) {
    await ctx.editMessageText(profileText, {
      reply_markup: profileMenu,
      parse_mode: 'HTML'
    });
    await ctx.answerCallbackQuery();
  }
});

// Helper функции
const getLevelEmoji = (level: string): string => {
  const emojis = { bronze: '🥉', silver: '🥈', gold: '🥇', premium: '💎' };
  return emojis[level as keyof typeof emojis] || '🥉';
};

const getLevelDescription = (level: string): string => {
  const descriptions = {
    bronze: 'Базовый уровень для новичков',
    silver: '+20% к заработку, приоритетная поддержка',
    gold: '+35% к заработку, эксклюзивные задания',
    premium: '+50% к заработку, безлимитное создание заданий'
  };
  return descriptions[level as keyof typeof descriptions] || 'Неизвестный уровень';
};

const getLevelBenefits = (level: string): string => {
  const benefits = {
    bronze: '• Базовые задания\n• Реферальная программа\n• Стандартная поддержка',
    silver: '• +20% к заработку\n• До 15 заданий в день\n• Приоритетная поддержка\n• Комиссия 6%',
    gold: '• +35% к заработку\n• До 30 заданий в день\n• Эксклюзивные задания\n• Комиссия 5%\n• Расширенная аналитика',
    premium: '• +50% к заработку\n• Безлимитное создание заданий\n• Персональный менеджер\n• Комиссия 3%\n• API доступ\n• Моментальная поддержка'
  };
  return benefits[level as keyof typeof benefits] || 'Нет данных о преимуществах';
};

const generateProgressBar = (percentage: number): string => {
  const barLength = 10;
  const filledLength = Math.round((percentage / 100) * barLength);
  const emptyLength = barLength - filledLength;
  
  return '█'.repeat(filledLength) + '░'.repeat(emptyLength);
};

const getTaskTypeIcon = (type: string): string => {
  const icons = {
    subscribe: '📺',
    join_group: '👥',
    view_post: '👀',
    react_post: '👍',
    use_bot: '🤖',
    premium_boost: '⭐'
  };
  return icons[type as keyof typeof icons] || '📋';
};

const getTransactionEmoji = (type: TransactionType): string => {
  const emojis = {
    earn: '💰',
    spend: '💸',
    referral: '👥',
    bonus: '🎁',
    refund: '↩️',
    penalty: '⚠️'
  };
  return emojis[type] || '💰';
};

const getTransactionSign = (type: TransactionType): string => {
  const signs = {
    earn: '+',
    spend: '-',
    referral: '+',
    bonus: '+',
    refund: '+',
    penalty: '-'
  };
  return signs[type] || '';
};

const formatDate = (date: Date): string => {
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatDateTime = (date: Date): string => {
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Функции для работы с БД
const getDetailedUserStats = async (userId: number) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Получаем транзакции за разные периоды
    const [
      todayEarnings, weekEarnings, monthEarnings, totalEarnings,
      todaySpending, weekSpending, monthSpending, totalSpending,
      taskStats, referralStats, activityStats
    ] = await Promise.all([
      // Заработок за периоды
      prisma.transaction.aggregate({
        where: { userId, type: 'earn', createdAt: { gte: today } },
        _sum: { amount: true }
      }),
      prisma.transaction.aggregate({
        where: { userId, type: 'earn', createdAt: { gte: weekAgo } },
        _sum: { amount: true }
      }),
      prisma.transaction.aggregate({
        where: { userId, type: 'earn', createdAt: { gte: monthAgo } },
        _sum: { amount: true }
      }),
      prisma.transaction.aggregate({
        where: { userId, type: 'earn' },
        _sum: { amount: true }
      }),
      
      // Траты за периоды
      prisma.transaction.aggregate({
        where: { userId, type: 'spend', createdAt: { gte: today } },
        _sum: { amount: true }
      }),
      prisma.transaction.aggregate({
        where: { userId, type: 'spend', createdAt: { gte: weekAgo } },
        _sum: { amount: true }
      }),
      prisma.transaction.aggregate({
        where: { userId, type: 'spend', createdAt: { gte: monthAgo } },
        _sum: { amount: true }
      }),
      prisma.transaction.aggregate({
        where: { userId, type: 'spend' },
        _sum: { amount: true }
      }),

      // Статистика заданий
      getTaskStatistics(userId),
      
      // Статистика рефералов
      getReferralStatistics(userId),
      
      // Статистика активности
      getActivityStatistics(userId)
    ]);

    return {
      earnings: {
        today: todayEarnings._sum.amount?.toNumber() || 0,
        week: weekEarnings._sum.amount?.toNumber() || 0,
        month: monthEarnings._sum.amount?.toNumber() || 0,
        total: totalEarnings._sum.amount?.toNumber() || 0
      },
      spending: {
        today: Math.abs(todaySpending._sum.amount?.toNumber() || 0),
        week: Math.abs(weekSpending._sum.amount?.toNumber() || 0),
        month: Math.abs(monthSpending._sum.amount?.toNumber() || 0),
        total: Math.abs(totalSpending._sum.amount?.toNumber() || 0)
      },
      tasks: taskStats,
      referrals: referralStats,
      activity: activityStats
    };
  } catch (error) {
    console.error('Get detailed user stats error:', error);
    throw error;
  }
};

const getTaskStatistics = async (userId: number) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [completedToday, totalCompleted, totalCreated, avgReward, approvalRate] = await Promise.all([
      prisma.taskExecution.count({
        where: { 
          userId, 
          status: 'approved',
          verifiedAt: { gte: today }
        }
      }),
      
      prisma.taskExecution.count({
        where: { userId, status: 'approved' }
      }),
      
      prisma.task.count({
        where: { authorId: userId }
      }),
      
      prisma.taskExecution.aggregate({
        where: { userId, status: 'approved' },
        _avg: { rewardAmount: true }
      }),
      
      // Процент одобрения
      prisma.taskExecution.findMany({
        where: { userId },
        select: { status: true }
      })
    ]);

    const totalExecutions = approvalRate.length;
    const approvedExecutions = approvalRate.filter(e => e.status === 'approved').length;
    const approvalPercentage = totalExecutions > 0 ? Math.round((approvedExecutions / totalExecutions) * 100) : 0;

    return {
      completedToday,
      completedTotal: totalCompleted,
      createdTotal: totalCreated,
      averageReward: Math.round(avgReward._avg.rewardAmount?.toNumber() || 0),
      approvalRate: approvalPercentage
    };
  } catch (error) {
    console.error('Get task statistics error:', error);
    return {
      completedToday: 0,
      completedTotal: 0,
      createdTotal: 0,
      averageReward: 0,
      approvalRate: 0
    };
  }
};

const getReferralStatistics = async (userId: number) => {
  try {
    const [total, active, premium, earnings, avgEarnings] = await Promise.all([
      prisma.user.count({
        where: { referrerId: userId }
      }),
      
      prisma.user.count({
        where: { 
          referrerId: userId,
          updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }
      }),
      
      prisma.user.count({
        where: { referrerId: userId, isPremium: true }
      }),
      
      prisma.transaction.aggregate({
        where: { userId, type: 'referral' },
        _sum: { amount: true }
      }),
      
      prisma.transaction.aggregate({
        where: { userId, type: 'referral' },
        _avg: { amount: true }
      })
    ]);

    return {
      total,
      active,
      premium,
      earnings: earnings._sum.amount?.toNumber() || 0,
      averageEarnings: Math.round(avgEarnings._avg.amount?.toNumber() || 0)
    };
  } catch (error) {
    console.error('Get referral statistics error:', error);
    return {
      total: 0,
      active: 0,
      premium: 0,
      earnings: 0,
      averageEarnings: 0
    };
  }
};

const getActivityStatistics = async (userId: number) => {
  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: userId },
      select: { 
        createdAt: true,
        updatedAt: true,
        metadata: true
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const now = new Date();
    const createdAt = user.createdAt;
    const lastActive = user.updatedAt;
    
    const totalDays = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
    const metadata = user.metadata as any;
    
    return {
      totalDays,
      streak: metadata?.consecutiveLoginDays || 0,
      bestStreak: metadata?.bestStreak || 0,
      avgOnlineTime: '2.5 часа', // Заглушка
      lastActive
    };
  } catch (error) {
    console.error('Get activity statistics error:', error);
    return {
      totalDays: 0,
      streak: 0,
      bestStreak: 0,
      avgOnlineTime: '0 часов',
      lastActive: new Date()
    };
  }
};

const getUserTasksSummary = async (userId: number) => {
  try {
    const tasks = await prisma.task.findMany({
      where: { authorId: userId },
      include: { executions: true },
      orderBy: { createdAt: 'desc' }
    });

    const total = tasks.length;
    const active = tasks.filter(t => t.status === 'active').length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const cancelled = tasks.filter(t => t.status === 'cancelled').length;
    
    const totalSpent = tasks.reduce((sum, task) => 
      sum + (task.reward.toNumber() * task.targetCount), 0
    );
    
    const totalExecutions = tasks.reduce((sum, task) => sum + task.executions.length, 0);
    const avgCostPerExecution = totalExecutions > 0 ? Math.round(totalSpent / totalExecutions) : 0;
    
    const totalTargetExecutions = tasks.reduce((sum, task) => sum + task.targetCount, 0);
    const totalCompletedExecutions = tasks.reduce((sum, task) => sum + task.completedCount, 0);
    const conversionRate = totalTargetExecutions > 0 ? 
      Math.round((totalCompletedExecutions / totalTargetExecutions) * 100) : 0;

    const topTasks = tasks
      .sort((a, b) => b.completedCount - a.completedCount)
      .slice(0, 3)
      .map(task => ({
        title: task.title,
        completedCount: task.completedCount,
        targetCount: task.targetCount
      }));

    const recentTasks = tasks.slice(0, 5).map(task => ({
      title: task.title,
      type: task.type,
      createdAt: task.createdAt
    }));

    return {
      total,
      active,
      completed,
      cancelled,
      totalSpent,
      avgCostPerExecution,
      conversionRate,
      avgCompletionTime: 45, // Заглушка
      qualityRating: 4.2, // Заглушка
      topTasks,
      recentTasks
    };
  } catch (error) {
    console.error('Get user tasks summary error:', error);
    throw error;
  }
};

const getDetailedReferralStats = async (userId: number) => {
  try {
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const [
      referrals,
      monthlyTransactions,
      topReferrals
    ] = await Promise.all([
      prisma.user.findMany({
        where: { referrerId: userId },
        select: {
          telegramId: true,
          firstName: true,
          username: true,
          isPremium: true,
          createdAt: true,
          updatedAt: true,
          totalEarned: true
        },
        orderBy: { createdAt: 'desc' }
      }),
      
      prisma.transaction.findMany({
        where: {
          userId,
          type: 'referral',
          createdAt: { gte: monthAgo }
        }
      }),
      
      prisma.transaction.groupBy({
        by: ['metadata'],
        where: {
          userId,
          type: 'referral'
        },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 5
      })
    ]);

    const total = referrals.length;
    const active = referrals.filter(r => 
      r.updatedAt > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ).length;
    const premium = referrals.filter(r => r.isPremium).length;
    
    const totalEarnings = await prisma.transaction.aggregate({
      where: { userId, type: 'referral' },
      _sum: { amount: true }
    });
    
    const monthlyEarnings = monthlyTransactions.reduce((sum, tx) => 
      sum + tx.amount.toNumber(), 0
    );
    
    const monthlyNew = referrals.filter(r => r.createdAt >= monthAgo).length;
    
    const avgEarningsPerReferral = total > 0 ? 
      Math.round((totalEarnings._sum.amount?.toNumber() || 0) / total) : 0;
    
    const premiumConversion = total > 0 ? Math.round((premium / total) * 100) : 0;

    // Подсчет разных типов доходов (упрощенно)
    const registrationBonuses = referrals.length * 1000; // 1000 GRAM за регистрацию
    const depositCommissions = Math.round((totalEarnings._sum.amount?.toNumber() || 0) * 0.3);
    const taskCommissions = Math.round((totalEarnings._sum.amount?.toNumber() || 0) * 0.5);
    const premiumBonuses = Math.round((totalEarnings._sum.amount?.toNumber() || 0) * 0.2);

    const topReferralsData = topReferrals.slice(0, 5).map((ref, index) => ({
      name: `Реферал ${index + 1}`,
      earnings: ref._sum.amount?.toNumber() || 0
    }));

    return {
      total,
      active,
      premium,
      totalEarnings: totalEarnings._sum.amount?.toNumber() || 0,
      monthlyEarnings,
      monthlyNew,
      avgEarningsPerReferral,
      premiumConversion,
      registrationBonuses,
      depositCommissions,
      taskCommissions,
      premiumBonuses,
      topReferrals: topReferralsData
    };
  } catch (error) {
    console.error('Get detailed referral stats error:', error);
    throw error;
  }
};

const getReferralStats = async (userId: number) => {
  try {
    const [total, premium, earnings] = await Promise.all([
      prisma.user.count({
        where: { referrerId: userId }
      }),
      
      prisma.user.count({
        where: { referrerId: userId, isPremium: true }
      }),
      
      prisma.transaction.aggregate({
        where: { userId, type: 'referral' },
        _sum: { amount: true }
      })
    ]);

    return {
      total,
      premium,
      earned: earnings._sum.amount?.toNumber() || 0
    };
  } catch (error) {
    console.error('Get referral stats error:', error);
    return { total: 0, premium: 0, earned: 0 };
  }
};

const getUserTransactions = async (userId: number, page: number = 1, limit: number = 10) => {
  try {
    const skip = (page - 1) * limit;
    
    return await prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    });
  } catch (error) {
    console.error('Get user transactions error:', error);
    return [];
  }
};

// Callback handlers (заглушки для будущей реализации)
const handleTopUpCallback = async (ctx: BotContext, data: string) => {
  await ctx.answerCallbackQuery('🔄 Функция в разработке');
};

const handleStatsCallback = async (ctx: BotContext, data: string) => {
  await ctx.answerCallbackQuery('🔄 Функция в разработке');
};

const handleTasksCallback = async (ctx: BotContext, data: string) => {
  await ctx.answerCallbackQuery('🔄 Функция в разработке');
};

const handleReferralsCallback = async (ctx: BotContext, data: string) => {
  await ctx.answerCallbackQuery('🔄 Функция в разработке');
};

const handleLevelCallback = async (ctx: BotContext, data: string) => {
  await ctx.answerCallbackQuery('🔄 Функция в разработке');
};

const handleTransactionsCallback = async (ctx: BotContext, data: string) => {
  await ctx.answerCallbackQuery('🔄 Функция в разработке');
};