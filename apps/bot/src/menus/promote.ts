import { Menu } from '@grammyjs/menu';
import { prisma, TaskStatus } from '@pr-gram/database';
import { taskService } from '../services/taskService';
import { TaskType } from '@pr-gram/database';
import { TASK_TYPE_CONFIG, getCommissionRate } from '@pr-gram/shared';
import type { BotContext } from '../types/context';

// Меню продвижения
export const promoteMenu = new Menu<BotContext>('promote')
  .text('📺 Подписка на канал\n💰 50-500 GRAM за задание', async (ctx) => {
    await ctx.conversation.enter('createTask', { taskType: TaskType.subscribe });
  }).row()
  
  .text('👥 Вступление в группу\n💰 75-750 GRAM за задание', async (ctx) => {
    await ctx.conversation.enter('createTask', { taskType: TaskType.join_group });
  }).row()
  
  .text('👀 Просмотр поста\n💰 25-200 GRAM за задание', async (ctx) => {
    await ctx.conversation.enter('createTask', { taskType: TaskType.view_post });
  }).row()
  
  .text('🤖 Переход в бота\n💰 100-1500 GRAM за задание', async (ctx) => {
    await ctx.conversation.enter('createTask', { taskType: TaskType.use_bot });
  }).row()
  
  .text('👍 Реакция на пост\n💰 30-150 GRAM за задание', async (ctx) => {
    await ctx.conversation.enter('createTask', { taskType: TaskType.react_post });
  }).row()
  
  .text('⭐ Премиум буст\n💰 500-2000 GRAM за задание', async (ctx) => {
    await ctx.conversation.enter('createTask', { taskType: TaskType.premium_boost });
  }).row()
  
  .text('🎯 Мои задания', async (ctx) => {
    try {
      const userTasks = await taskService.getUserTasks(ctx.user.telegramId, undefined, 1, 10);
      
      if (userTasks.tasks.length === 0) {
        await ctx.editMessageText(
          '📋 У вас пока нет созданных заданий.\n\nСоздайте первое задание для продвижения!',
          {
            reply_markup: { 
              inline_keyboard: [
                [{ text: '📢 Создать задание', callback_data: 'menu:promote' }],
                [{ text: '🏠 Главное меню', callback_data: 'menu:main' }]
              ]
            }
          }
        );
        return;
      }

      let tasksText = `🎯 <b>МОИ ЗАДАНИЯ</b>\n\n📊 Всего: ${userTasks.total} | Страница: ${userTasks.page}/${userTasks.totalPages}\n\n`;
      
      userTasks.tasks.forEach((task, index) => {
        const icon = getTaskTypeIcon(task.type);
        const statusEmoji = getStatusEmoji(task.status);
        const progress = `${task.completedCount}/${task.targetCount}`;
        
        tasksText += `${statusEmoji} ${icon} <b>${task.title}</b>\n`;
        tasksText += `   💰 ${task.reward} GRAM • 👥 ${progress}\n`;
        tasksText += `   📅 ${formatDate(task.createdAt)}\n\n`;
      });

      const keyboard = [];
      
      // Task action buttons
      userTasks.tasks.forEach((task, index) => {
        keyboard.push([
          { text: `📊 ${task.title.substring(0, 25)}...`, callback_data: `task_stats:${task.id}` }
        ]);
      });

      // Pagination
      if (userTasks.totalPages > 1) {
        const paginationRow = [];
        if (userTasks.hasPrev) {
          paginationRow.push({ text: '⬅️', callback_data: `my_tasks:page:${userTasks.page - 1}` });
        }
        paginationRow.push({ text: `${userTasks.page}/${userTasks.totalPages}`, callback_data: 'noop' });
        if (userTasks.hasNext) {
          paginationRow.push({ text: '➡️', callback_data: `my_tasks:page:${userTasks.page + 1}` });
        }
        keyboard.push(paginationRow);
      }

      keyboard.push([{ text: '⬅️ Назад к продвижению', callback_data: 'menu:promote' }]);

      await ctx.editMessageText(tasksText, {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'HTML'
      });
    } catch (error) {
      console.error('Show my tasks error:', error);
      await ctx.editMessageText(
        '❌ Ошибка при загрузке ваших заданий. Попробуйте позже.',
        { reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'menu:promote' }]] } }
      );
    }
  }).row()
  
  .text('📊 Статистика', async (ctx) => {
    try {
      const stats = await getUserTaskStats(ctx.user.telegramId);
      
      const statsText = `
📊 <b>СТАТИСТИКА ПРОДВИЖЕНИЯ</b>

📈 <b>Сегодня:</b>
├ Создано: <b>${stats.today.created}</b> заданий
├ Потрачено: <b>${stats.today.spent}</b> GRAM
└ Выполнений: <b>${stats.today.executions}</b>

📈 <b>За неделю:</b>
├ Создано: <b>${stats.week.created}</b> заданий
├ Потрачено: <b>${stats.week.spent}</b> GRAM
└ Выполнений: <b>${stats.week.executions}</b>

📈 <b>За месяц:</b>
├ Создано: <b>${stats.month.created}</b> заданий
├ Потрачено: <b>${stats.month.spent}</b> GRAM
└ Выполнений: <b>${stats.month.executions}</b>

🏆 <b>Лучший тип заданий:</b>
${stats.bestType.name} - <b>${stats.bestType.count}</b> заданий

💳 <b>Комиссия уровня:</b> ${getCommissionRate(ctx.user.level)}%
💰 <b>Общий бюджет:</b> ${stats.totalBudget} GRAM
`;

      await ctx.editMessageText(statsText, {
        reply_markup: { 
          inline_keyboard: [
            [{ text: '🔄 Обновить', callback_data: 'promote:stats' }],
            [{ text: '⬅️ Назад к продвижению', callback_data: 'menu:promote' }]
          ]
        },
        parse_mode: 'HTML'
      });
    } catch (error) {
      console.error('Show promotion stats error:', error);
      await ctx.editMessageText(
        '❌ Ошибка при загрузке статистики. Попробуйте позже.',
        { reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'menu:promote' }]] } }
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

// Обработчик callback для статистики
promoteMenu.register(async (ctx) => {
  if (ctx.callbackQuery?.data === 'promote:stats') {
    try {
      const stats = await getUserTaskStats(ctx.user.telegramId);
      
      const statsText = `
📊 <b>СТАТИСТИКА ПРОДВИЖЕНИЯ</b>

📈 <b>Сегодня:</b>
├ Создано: <b>${stats.today.created}</b> заданий
├ Потрачено: <b>${stats.today.spent}</b> GRAM
└ Выполнений: <b>${stats.today.executions}</b>

📈 <b>За неделю:</b>
├ Создано: <b>${stats.week.created}</b> заданий
├ Потрачено: <b>${stats.week.spent}</b> GRAM
└ Выполнений: <b>${stats.week.executions}</b>

📈 <b>За месяц:</b>
├ Создано: <b>${stats.month.created}</b> заданий
├ Потрачено: <b>${stats.month.spent}</b> GRAM
└ Выполнений: <b>${stats.month.executions}</b>

🏆 <b>Лучший тип заданий:</b>
${stats.bestType.name} - <b>${stats.bestType.count}</b> заданий

💳 <b>Комиссия уровня:</b> ${getCommissionRate(ctx.user.level)}%
💰 <b>Общий бюджет:</b> ${stats.totalBudget} GRAM
`;

      await ctx.editMessageText(statsText, {
        reply_markup: { 
          inline_keyboard: [
            [{ text: '🔄 Обновить', callback_data: 'promote:stats' }],
            [{ text: '⬅️ Назад к продвижению', callback_data: 'menu:promote' }]
          ]
        },
        parse_mode: 'HTML'
      });
      
      await ctx.answerCallbackQuery('📊 Статистика обновлена');
    } catch (error) {
      console.error('Update promotion stats error:', error);
      await ctx.answerCallbackQuery('❌ Ошибка при обновлении статистики');
    }
    return;
  }

  // Основное меню продвижения
  const userLevel = ctx.user.level;
  const commission = getCommissionRate(userLevel);
  const balance = ctx.user.balance;
  
  const promoteText = `
📢 <b>СОЗДАТЬ ЗАДАНИЕ</b>

💰 Ваш баланс: <b>${balance} GRAM</b>
⭐ Уровень: <b>${userLevel.toUpperCase()}</b> (комиссия ${commission}%)

Выберите тип задания:
`;

  if (ctx.callbackQuery) {
    await ctx.editMessageText(promoteText, {
      reply_markup: promoteMenu,
      parse_mode: 'HTML'
    });
    await ctx.answerCallbackQuery();
  }
});

// Helper функции
const getTaskTypeIcon = (type: TaskType): string => {
  return TASK_TYPE_CONFIG[type]?.icon || '📋';
};

const getStatusEmoji = (status: string): string => {
  const emojis = {
    active: '🟢',
    completed: '✅',
    paused: '⏸️',
    cancelled: '❌',
    expired: '⏰',
    draft: '📝'
  };
  return emojis[status as keyof typeof emojis] || '🔘';
};

const getLevelEmoji = (level: string): string => {
  const emojis = { bronze: '🥉', silver: '🥈', gold: '🥇', premium: '💎' };
  return emojis[level as keyof typeof emojis] || '🥉';
};

const formatDate = (date: Date): string => {
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Реальная функция для получения статистики пользователя с БД
const getUserTaskStats = async (userId: number) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Получаем все задания пользователя
    const [allTasks, todayTasks, weekTasks, monthTasks] = await Promise.all([
      prisma.task.findMany({
        where: { authorId: userId },
        include: { executions: true }
      }),
      prisma.task.findMany({
        where: { 
          authorId: userId,
          createdAt: { gte: today }
        },
        include: { executions: true }
      }),
      prisma.task.findMany({
        where: { 
          authorId: userId,
          createdAt: { gte: weekAgo }
        },
        include: { executions: true }
      }),
      prisma.task.findMany({
        where: { 
          authorId: userId,
          createdAt: { gte: monthAgo }
        },
        include: { executions: true }
      })
    ]);

    // Функция для подсчета потраченных средств
    const calculateSpent = (tasksList: any[]) => {
      return tasksList.reduce((sum, task) => {
        return sum + (task.reward.toNumber() * task.targetCount);
      }, 0);
    };

    // Функция для подсчета выполнений
    const calculateExecutions = (tasksList: any[]) => {
      return tasksList.reduce((sum, task) => sum + task.completedCount, 0);
    };

    // Находим самый популярный тип заданий
    const typeStats = allTasks.reduce((acc: any, task) => {
      acc[task.type] = (acc[task.type] || 0) + 1;
      return acc;
    }, {});

    const bestType = Object.entries(typeStats).reduce((best: any, [type, count]) => {
      if (count > best.count) {
        return { 
          type, 
          count, 
          name: TASK_TYPE_CONFIG[type as TaskType]?.name || type 
        };
      }
      return best;
    }, { type: '', count: 0, name: 'Нет данных' });

    return {
      today: {
        created: todayTasks.length,
        spent: calculateSpent(todayTasks),
        executions: calculateExecutions(todayTasks)
      },
      week: {
        created: weekTasks.length,
        spent: calculateSpent(weekTasks),
        executions: calculateExecutions(weekTasks)
      },
      month: {
        created: monthTasks.length,
        spent: calculateSpent(monthTasks),
        executions: calculateExecutions(monthTasks)
      },
      bestType,
      totalBudget: calculateSpent(allTasks)
    };
  } catch (error) {
    console.error('Get user task stats error:', error);
    // Возвращаем пустую статистику в случае ошибки
    return {
      today: { created: 0, spent: 0, executions: 0 },
      week: { created: 0, spent: 0, executions: 0 },
      month: { created: 0, spent: 0, executions: 0 },
      bestType: { type: '', count: 0, name: 'Нет данных' },
      totalBudget: 0
    };
  }
};