import { Menu } from '@grammyjs/menu';
import { prisma, TaskStatus, TaskType, ExecutionStatus } from '@pr-gram/database';
import { taskService } from '../services/taskService';
import { TASK_TYPE_CONFIG, applyMultiplier } from '@pr-gram/shared';
import type { BotContext } from '../types/context';

// Меню заработка
export const earnMenu = new Menu<BotContext>('earn')
  .text('📺 Подписка на каналы\n🔥 Доступно заданий\n💰 50-500 GRAM', async (ctx) => {
    await showTasksByType(ctx, TaskType.subscribe, 1);
  }).row()
  
  .text('👥 Вступить в группы\n🔥 Доступно заданий\n💰 75-750 GRAM', async (ctx) => {
    await showTasksByType(ctx, TaskType.join_group, 1);
  }).row()
  
  .text('👀 Просмотр постов\n🔥 Доступно заданий\n💰 25-200 GRAM', async (ctx) => {
    await showTasksByType(ctx, TaskType.view_post, 1);
  }).row()
  
  .text('🤖 Перейти в ботов\n🔥 Доступно заданий\n💰 100-1500 GRAM', async (ctx) => {
    await showTasksByType(ctx, TaskType.use_bot, 1);
  }).row()
  
  .text('👍 Поставить реакции\n🔥 Доступно заданий\n💰 30-150 GRAM', async (ctx) => {
    await showTasksByType(ctx, TaskType.react_post, 1);
  }).row()
  
  .text('⭐ Премиум буст\n🔥 Доступно заданий\n💰 500-2000 GRAM', async (ctx) => {
    await showTasksByType(ctx, TaskType.premium_boost, 1);
  }).row()
  
  .text('📊 Моя статистика', async (ctx) => {
    try {
      const stats = await getUserEarningStats(ctx.user.telegramId);
      
      const statsText = `
📊 <b>СТАТИСТИКА ЗАРАБОТКА</b>

📈 <b>Сегодня:</b>
├ Выполнено: <b>${stats.today.completed}</b> заданий
├ Заработано: <b>${stats.today.earned}</b> GRAM
└ В процессе: <b>${stats.today.pending}</b> заданий

📈 <b>За неделю:</b>
├ Выполнено: <b>${stats.week.completed}</b> заданий
├ Заработано: <b>${stats.week.earned}</b> GRAM
└ Средний доход: <b>${Math.round(stats.week.earned / 7)}</b> GRAM/день

📈 <b>За месяц:</b>
├ Выполнено: <b>${stats.month.completed}</b> заданий
├ Заработано: <b>${stats.month.earned}</b> GRAM
└ Средний доход: <b>${Math.round(stats.month.earned / 30)}</b> GRAM/день

🏆 <b>Лучший тип заданий:</b>
${stats.bestType.name} - <b>${stats.bestType.count}</b> выполнений

⭐ <b>Множитель уровня:</b> x${getMultiplier(ctx.user.level)}
💎 <b>Следующий уровень:</b> ${getNextLevel(ctx.user.level)}

📈 <b>ПРОГРЕСС:</b>
├ Процент одобрения: ${stats.approvalRate}%
├ Средняя награда: ${stats.averageReward} GRAM
├ Время выполнения: ${stats.averageTime} мин
└ Рейтинг исполнителя: ${stats.rating}/5 ⭐
`;

      await ctx.editMessageText(statsText, {
        reply_markup: { 
          inline_keyboard: [
            [{ text: '📈 График заработка', callback_data: 'earn:chart' }],
            [{ text: '🎯 Анализ по типам', callback_data: 'earn:analysis' }],
            [{ text: '🔄 Обновить', callback_data: 'earn:stats' }],
            [{ text: '⬅️ Назад к заработку', callback_data: 'menu:earn' }]
          ]
        },
        parse_mode: 'HTML'
      });
    } catch (error) {
      console.error('Show earning stats error:', error);
      await ctx.editMessageText(
        '❌ Ошибка при загрузке статистики. Попробуйте позже.',
        { reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'menu:earn' }]] } }
      );
    }
  }).row()
  
  .text('🎯 Мои выполнения', async (ctx) => {
    try {
      const executions = await getUserExecutions(ctx.user.telegramId, 1, 10);
      
      if (executions.executions.length === 0) {
        await ctx.editMessageText(
          '🎯 У вас пока нет выполненных заданий.\n\nВыберите задание и начните зарабатывать!',
          {
            reply_markup: { 
              inline_keyboard: [
                [{ text: '💰 Найти задания', callback_data: 'menu:earn' }],
                [{ text: '🏠 Главное меню', callback_data: 'menu:main' }]
              ]
            }
          }
        );
        return;
      }

      let executionsText = `🎯 <b>МОИ ВЫПОЛНЕНИЯ</b>\n\n📊 Всего: ${executions.total} | Страница: ${executions.page}/${executions.totalPages}\n\n`;
      
      executions.executions.forEach((execution, index) => {
        const task = execution.task;
        const icon = getTaskTypeIcon(task.type);
        const statusEmoji = getExecutionStatusEmoji(execution.status);
        
        executionsText += `${statusEmoji} ${icon} <b>${task.title}</b>\n`;
        executionsText += `   💰 ${execution.rewardAmount} GRAM\n`;
        executionsText += `   📅 ${formatDate(execution.createdAt)}\n`;
        
        if (execution.status === ExecutionStatus.pending) {
          executionsText += `   ⏳ Ожидает проверки\n`;
        } else if (execution.status === ExecutionStatus.rejected && execution.adminComment) {
          executionsText += `   💬 ${execution.adminComment}\n`;
        }
        executionsText += '\n';
      });

      const keyboard = [];
      
      // Пагинация
      if (executions.totalPages > 1) {
        const paginationRow = [];
        if (executions.hasPrev) {
          paginationRow.push({ text: '⬅️', callback_data: `executions:page:${executions.page - 1}` });
        }
        paginationRow.push({ text: `${executions.page}/${executions.totalPages}`, callback_data: 'noop' });
        if (executions.hasNext) {
          paginationRow.push({ text: '➡️', callback_data: `executions:page:${executions.page + 1}` });
        }
        keyboard.push(paginationRow);
      }

      keyboard.push([
        { text: '🔍 Фильтр по статусу', callback_data: 'executions:filter' },
        { text: '📊 Статистика', callback_data: 'earn:stats' }
      ]);
      keyboard.push([{ text: '⬅️ Назад к заработку', callback_data: 'menu:earn' }]);

      await ctx.editMessageText(executionsText, {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'HTML'
      });
    } catch (error) {
      console.error('Show user executions error:', error);
      await ctx.editMessageText(
        '❌ Ошибка при загрузке выполнений. Попробуйте позже.',
        { reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'menu:earn' }]] } }
      );
    }
  }).row()
  
  .back('🏠 Главное меню', async (ctx) => {
    const mainText = `
🤖 <b>PR GRAM - ПРОДВИЖЕНИЕ В TELEGRAM</b>

💰 Баланс: <b>${ctx.user.balance} GRAM</b>
⭐ Уровень: <b>${getLevelEmoji(ctx.user.level)} ${ctx.user.level.toUpperCase()}</b>

Выберите действие:
`;

    await ctx.editMessageText(mainText, {
      reply_markup: ctx.menu,
      parse_mode: 'HTML'
    });
  });

// Обработчик callback для обновления данных
earnMenu.register(async (ctx) => {
  const data = ctx.callbackQuery?.data;
  
  if (data === 'earn:stats') {
    try {
      const stats = await getUserEarningStats(ctx.user.telegramId);
      // Перезагружаем статистику (код аналогичный выше)
      await ctx.answerCallbackQuery('📊 Статистика обновлена');
    } catch (error) {
      await ctx.answerCallbackQuery('❌ Ошибка при обновлении статистики');
    }
    return;
  }

  if (data?.startsWith('task_type:')) {
    const taskType = data.replace('task_type:', '') as TaskType;
    await showTasksByType(ctx, taskType, 1);
    return;
  }

  if (data?.startsWith('task_page:')) {
    const [type, page] = data.replace('task_page:', '').split(':');
    await showTasksByType(ctx, type as TaskType, parseInt(page));
    return;
  }

  if (data?.startsWith('task_view:')) {
    const taskId = data.replace('task_view:', '');
    await showTaskDetails(ctx, taskId);
    return;
  }

  if (data?.startsWith('executions:')) {
    await handleExecutionsCallback(ctx, data);
    return;
  }

  // Основное меню заработка
  const availableTasks = await getTaskCounts();
  const userLevel = ctx.user.level;
  const multiplier = getMultiplier(userLevel);
  
  const earnText = `
💰 <b>ЗАРАБОТАТЬ GRAM</b>

🔥 Доступно: <b>${availableTasks.total} заданий</b>
⭐ Ваш уровень: <b>${userLevel.toUpperCase()} (+${Math.round((multiplier - 1) * 100)}%)</b>

Выберите тип заданий:
`;

  if (ctx.callbackQuery) {
    await ctx.editMessageText(earnText, {
      reply_markup: earnMenu,
      parse_mode: 'HTML'
    });
    await ctx.answerCallbackQuery();
  }
});

// Функция показа заданий по типу
const showTasksByType = async (ctx: BotContext, taskType: TaskType, page: number) => {
  try {
    const tasks = await taskService.getAvailableTasks(
      ctx.user.telegramId,
      ctx.user.level,
      taskType,
      page,
      10
    );

    if (tasks.tasks.length === 0) {
      await ctx.editMessageText(
        `😔 Нет доступных заданий типа "${getTaskTypeName(taskType)}".\n\nПопробуйте другой тип заданий или зайдите позже.`,
        { 
          reply_markup: { 
            inline_keyboard: [
              [{ text: '⬅️ Назад к заработку', callback_data: 'menu:earn' }]
            ]
          }
        }
      );
      return;
    }

    const boostedTasks = tasks.tasks.filter(t => t.isBoosted);
    const regularTasks = tasks.tasks.filter(t => !t.isBoosted);

    let text = `${getTaskTypeIcon(taskType)} <b>${getTaskTypeName(taskType).toUpperCase()}</b>\n\n`;
    text += `📊 Найдено: ${tasks.total} заданий | Страница: ${page}/${tasks.totalPages}\n\n`;
    
    if (boostedTasks.length > 0) {
      text += `🚀 <b>БУСТ ЗАДАНИЯ (приоритет):</b>\n\n`;
      boostedTasks.forEach(task => {
        text += formatBoostedTask(task, ctx.user.level);
      });
      text += '\n';
    }

    if (regularTasks.length > 0) {
      text += `📋 <b>Обычные задания:</b>\n\n`;
      regularTasks.forEach(task => {
        text += formatRegularTask(task, ctx.user.level);
      });
    }

    const keyboard = [];
    
    // Кнопки заданий
    tasks.tasks.forEach(task => {
      const prefix = task.isBoosted ? '⭐ 🚀 ' : '';
      const title = task.title.length > 25 ? task.title.substring(0, 25) + '...' : task.title;
      keyboard.push([{
        text: `${prefix}${title}`,
        callback_data: `task_view:${task.id}`
      }]);
    });

    // Пагинация
    if (tasks.totalPages > 1) {
      const paginationRow = [];
      if (tasks.hasPrev) {
        paginationRow.push({ text: '⬅️', callback_data: `task_page:${taskType}:${page - 1}` });
      }
      paginationRow.push({ text: `${page}/${tasks.totalPages}`, callback_data: 'noop' });
      if (tasks.hasNext) {
        paginationRow.push({ text: '➡️', callback_data: `task_page:${taskType}:${page + 1}` });
      }
      keyboard.push(paginationRow);
    }

    keyboard.push([{ text: '⬅️ Назад к заработку', callback_data: 'menu:earn' }]);

    await ctx.editMessageText(text, {
      reply_markup: { inline_keyboard: keyboard },
      parse_mode: 'HTML'
    });

  } catch (error) {
    console.error('Show tasks by type error:', error);
    await ctx.answerCallbackQuery('❌ Ошибка при загрузке заданий');
  }
};

// Функция показа деталей задания
const showTaskDetails = async (ctx: BotContext, taskId: string) => {
  try {
    const task = await taskService.getTaskDetails(taskId, ctx.user.telegramId);
    const userLevel = ctx.user.level;
    const finalReward = applyMultiplier(task.reward.toNumber(), userLevel);

    const taskIcon = getTaskTypeIcon(task.type);
    const timeLeft = task.expiresAt ? formatTimeLeft(task.expiresAt) : 'Без ограничений';

    let text = `${taskIcon} <b>ЗАДАНИЕ: ${task.title}</b>\n\n`;
    text += `📋 <b>Описание:</b>\n${task.description}\n\n`;
    text += `💰 <b>Награда:</b> ${finalReward} GRAM\n`;
    text += `⏱️ <b>Осталось:</b> ${timeLeft}\n`;
    text += `👥 <b>Выполнили:</b> ${task.completedCount}/${task.targetCount}\n`;
    text += `👤 <b>Автор:</b> @${task.author?.username || 'неизвестен'}\n\n`;

    // Инструкции по выполнению
    text += getTaskInstructions(task.type, task.targetUrl);

    const keyboard = [];

    // Проверяем, выполнял ли пользователь это задание
    if (task.executions && task.executions.length > 0) {
      const execution = task.executions[0];
      if (execution.status === ExecutionStatus.pending) {
        text += `\n⏳ <b>Статус:</b> Ожидает проверки`;
        keyboard.push([{ text: '🔄 Проверить статус', callback_data: `task_check:${taskId}` }]);
      } else if (execution.status === ExecutionStatus.approved) {
        text += `\n✅ <b>Статус:</b> Выполнено и одобрено`;
        text += `\n💰 Получено: ${execution.rewardAmount} GRAM`;
      } else if (execution.status === ExecutionStatus.rejected) {
        text += `\n❌ <b>Статус:</b> Отклонено`;
        if (execution.adminComment) {
          text += `\n💬 Причина: ${execution.adminComment}`;
        }
        if (canAppeal(execution)) {
          keyboard.push([{ text: '📝 Подать апелляцию', callback_data: `appeal:${execution.id}` }]);
        }
      }
    } else {
      // Пользователь может выполнить задание
      keyboard.push([{ text: '🚀 Выполнить задание', callback_data: `task_execute:${taskId}` }]);
    }

    keyboard.push([{ text: 'ℹ️ Подробности', callback_data: `task_info:${taskId}` }]);
    keyboard.push([{ text: '⬅️ Назад к списку', callback_data: `task_type:${task.type}` }]);

    await ctx.editMessageText(text, {
      reply_markup: { inline_keyboard: keyboard },
      parse_mode: 'HTML'
    });

  } catch (error) {
    console.error('Show task details error:', error);
    await ctx.answerCallbackQuery(`❌ ${error instanceof Error ? error.message : 'Ошибка'}`);
  }
};

// Helper функции
const getMultiplier = (level: string): number => {
  const multipliers = { bronze: 1.0, silver: 1.2, gold: 1.35, premium: 1.5 };
  return multipliers[level as keyof typeof multipliers] || 1.0;
};

const getLevelEmoji = (level: string): string => {
  const emojis = { bronze: '🥉', silver: '🥈', gold: '🥇', premium: '💎' };
  return emojis[level as keyof typeof emojis] || '🥉';
};

const getNextLevel = (currentLevel: string): string => {
  const levels = { bronze: 'Silver', silver: 'Gold', gold: 'Premium', premium: 'MAX' };
  return levels[currentLevel as keyof typeof levels] || 'Unknown';
};

const getTaskTypeName = (type: TaskType): string => {
  const names = {
    [TaskType.subscribe]: 'Подписка на каналы',
    [TaskType.join_group]: 'Вступление в группы', 
    [TaskType.view_post]: 'Просмотр постов',
    [TaskType.react_post]: 'Реакции на посты',
    [TaskType.use_bot]: 'Переход в ботов',
    [TaskType.premium_boost]: 'Премиум буст'
  };
  return names[type] || 'Неизвестно';
};

const getTaskTypeIcon = (type: TaskType): string => {
  return TASK_TYPE_CONFIG[type]?.icon || '📋';
};

const getExecutionStatusEmoji = (status: ExecutionStatus): string => {
  const emojis = {
    [ExecutionStatus.pending]: '⏳',
    [ExecutionStatus.approved]: '✅',
    [ExecutionStatus.rejected]: '❌',
    [ExecutionStatus.expired]: '⏰'
  };
  return emojis[status] || '❓';
};

const formatDate = (date: Date): string => {
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatTimeLeft = (expiresAt: Date): string => {
  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();
  
  if (diff <= 0) return 'Истекло';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) return `${days} дн. ${hours} ч.`;
  return `${hours} ч.`;
};

const formatBoostedTask = (task: any, userLevel: string): string => {
  const finalReward = applyMultiplier(task.reward.toNumber(), userLevel);
  return `╔═══════════════════════════╗\n║ ⭐ 🚀 ${task.title.substring(0, 20)}${task.title.length > 20 ? '...' : ''}\n║ 💰 ${finalReward} GRAM • 👥 ${task.completedCount}/${task.targetCount}\n╚═══════════════════════════╝\n\n`;
};

const formatRegularTask = (task: any, userLevel: string): string => {
  const finalReward = applyMultiplier(task.reward.toNumber(), userLevel);
  return `┌─────────────────────────┐\n│ ${task.title.substring(0, 25)}${task.title.length > 25 ? '...' : ''}\n│ 💰 ${finalReward} GRAM\n│ 👥 ${task.completedCount}/${task.targetCount}\n└─────────────────────────┘\n\n`;
};

const getTaskInstructions = (type: TaskType, targetUrl?: string): string => {
  const instructions = {
    [TaskType.subscribe]: '📺 Подпишитесь на канал и вернитесь для проверки',
    [TaskType.join_group]: '👥 Вступите в группу и вернитесь для проверки',
    [TaskType.view_post]: '👀 Просмотрите пост и вернитесь для проверки',
    [TaskType.react_post]: '👍 Поставьте реакцию на пост и вернитесь для проверки',
    [TaskType.use_bot]: '🤖 Выполните условия задания и загрузите скриншот',
    [TaskType.premium_boost]: '⭐ Выполните премиум задание и загрузите доказательство'
  };
  
  let text = '💡 <b>ИНСТРУКЦИЯ:</b>\n';
  text += instructions[type] || 'Выполните задание согласно описанию';
  
  if (targetUrl) {
    text += `\n\n🔗 <b>Ссылка:</b> ${targetUrl}`;
  }
  
  return text;
};

const canAppeal = (execution: any): boolean => {
  if (!execution.verifiedAt) return false;
  const hoursSinceRejection = (Date.now() - execution.verifiedAt.getTime()) / (1000 * 60 * 60);
  return hoursSinceRejection < 24;
};

// Функции для работы с БД
const getTaskCounts = async () => {
  try {
    const [total, subscribeTasks, joinGroupTasks, viewPostTasks, useBotTasks, reactPostTasks, premiumBoostTasks] = await Promise.all([
      prisma.task.count({
        where: {
          status: TaskStatus.active,
          expiresAt: {
            OR: [
              { equals: null },
              { gt: new Date() }
            ]
          }
        }
      }),
      prisma.task.count({
        where: {
          type: TaskType.subscribe,
          status: TaskStatus.active,
          expiresAt: { OR: [{ equals: null }, { gt: new Date() }] }
        }
      }),
      prisma.task.count({
        where: {
          type: TaskType.join_group,
          status: TaskStatus.active,
          expiresAt: { OR: [{ equals: null }, { gt: new Date() }] }
        }
      }),
      prisma.task.count({
        where: {
          type: TaskType.view_post,
          status: TaskStatus.active,
          expiresAt: { OR: [{ equals: null }, { gt: new Date() }] }
        }
      }),
      prisma.task.count({
        where: {
          type: TaskType.use_bot,
          status: TaskStatus.active,
          expiresAt: { OR: [{ equals: null }, { gt: new Date() }] }
        }
      }),
      prisma.task.count({
        where: {
          type: TaskType.react_post,
          status: TaskStatus.active,
          expiresAt: { OR: [{ equals: null }, { gt: new Date() }] }
        }
      }),
      prisma.task.count({
        where: {
          type: TaskType.premium_boost,
          status: TaskStatus.active,
          expiresAt: { OR: [{ equals: null }, { gt: new Date() }] }
        }
      })
    ]);

    return {
      total,
      subscribe: subscribeTasks,
      join_group: joinGroupTasks,
      view_post: viewPostTasks,
      use_bot: useBotTasks,
      react_post: reactPostTasks,
      premium_boost: premiumBoostTasks
    };
  } catch (error) {
    console.error('Get task counts error:', error);
    return {
      total: 0,
      subscribe: 0,
      join_group: 0,
      view_post: 0,
      use_bot: 0,
      react_post: 0,
      premium_boost: 0
    };
  }
};

const getUserEarningStats = async (userId: number) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      todayStats, weekStats, monthStats, 
      bestTypeStats, approvalStats, avgRewardStats
    ] = await Promise.all([
      // Статистика за сегодня
      Promise.all([
        prisma.taskExecution.count({
          where: { 
            userId, 
            status: ExecutionStatus.approved,
            verifiedAt: { gte: today }
          }
        }),
        prisma.taskExecution.aggregate({
          where: { 
            userId, 
            status: ExecutionStatus.approved,
            verifiedAt: { gte: today }
          },
          _sum: { rewardAmount: true }
        }),
        prisma.taskExecution.count({
          where: { 
            userId, 
            status: ExecutionStatus.pending,
            createdAt: { gte: today }
          }
        })
      ]),

      // Статистика за неделю
      Promise.all([
        prisma.taskExecution.count({
          where: { 
            userId, 
            status: ExecutionStatus.approved,
            verifiedAt: { gte: weekAgo }
          }
        }),
        prisma.taskExecution.aggregate({
          where: { 
            userId, 
            status: ExecutionStatus.approved,
            verifiedAt: { gte: weekAgo }
          },
          _sum: { rewardAmount: true }
        })
      ]),

      // Статистика за месяц
      Promise.all([
        prisma.taskExecution.count({
          where: { 
            userId, 
            status: ExecutionStatus.approved,
            verifiedAt: { gte: monthAgo }
          }
        }),
        prisma.taskExecution.aggregate({
          where: { 
            userId, 
            status: ExecutionStatus.approved,
            verifiedAt: { gte: monthAgo }
          },
          _sum: { rewardAmount: true }
        })
      ]),

      // Лучший тип заданий
      prisma.taskExecution.groupBy({
        by: ['task'],
        where: { 
          userId, 
          status: ExecutionStatus.approved 
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 1
      }),

      // Процент одобрения
      Promise.all([
        prisma.taskExecution.count({ where: { userId } }),
        prisma.taskExecution.count({ 
          where: { userId, status: ExecutionStatus.approved } 
        })
      ]),

      // Средняя награда
      prisma.taskExecution.aggregate({
        where: { userId, status: ExecutionStatus.approved },
        _avg: { rewardAmount: true }
      })
    ]);

    // Получаем информацию о лучшем типе задания
    let bestType = { name: 'Нет данных', count: 0 };
    if (bestTypeStats.length > 0) {
      const taskInfo = await prisma.task.findUnique({
        where: { id: bestTypeStats[0].task },
        select: { type: true }
      });
      if (taskInfo) {
        bestType = {
          name: getTaskTypeName(taskInfo.type),
          count: bestTypeStats[0]._count.id
        };
      }
    }

    const totalExecutions = approvalStats[0];
    const approvedExecutions = approvalStats[1];
    const approvalRate = totalExecutions > 0 ? Math.round((approvedExecutions / totalExecutions) * 100) : 0;

    return {
      today: {
        completed: todayStats[0],
        earned: todayStats[1]._sum.rewardAmount?.toNumber() || 0,
        pending: todayStats[2]
      },
      week: {
        completed: weekStats[0],
        earned: weekStats[1]._sum.rewardAmount?.toNumber() || 0
      },
      month: {
        completed: monthStats[0],
        earned: monthStats[1]._sum.rewardAmount?.toNumber() || 0
      },
      bestType,
      approvalRate,
      averageReward: Math.round(avgRewardStats._avg.rewardAmount?.toNumber() || 0),
      averageTime: 25, // Заглушка
      rating: 4.3 // Заглушка
    };
  } catch (error) {
    console.error('Get user earning stats error:', error);
    return {
      today: { completed: 0, earned: 0, pending: 0 },
      week: { completed: 0, earned: 0 },
      month: { completed: 0, earned: 0 },
      bestType: { name: 'Нет данных', count: 0 },
      approvalRate: 0,
      averageReward: 0,
      averageTime: 0,
      rating: 0
    };
  }
};

const getUserExecutions = async (userId: number, page: number = 1, limit: number = 10) => {
  try {
    const skip = (page - 1) * limit;
    
    const [executions, total] = await Promise.all([
      prisma.taskExecution.findMany({
        where: { userId },
        include: {
          task: {
            select: {
              title: true,
              type: true,
              reward: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.taskExecution.count({
        where: { userId }
      })
    ]);

    return {
      executions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1
    };
  } catch (error) {
    console.error('Get user executions error:', error);
    return {
      executions: [],
      total: 0,
      page: 1,
      totalPages: 1,
      hasNext: false,
      hasPrev: false
    };
  }
};

// Callback handler для выполнений
const handleExecutionsCallback = async (ctx: BotContext, data: string) => {
  const action = data.replace('executions:', '');
  
  if (action.startsWith('page:')) {
    const page = parseInt(action.replace('page:', ''));
    // Перезагружаем список выполнений для указанной страницы
    const executions = await getUserExecutions(ctx.user.telegramId, page, 10);
    // ... (код отображения аналогичный выше)
    await ctx.answerCallbackQuery();
  } else {
    await ctx.answerCallbackQuery('🔄 Функция в разработке');
  }
};