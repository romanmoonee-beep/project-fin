import { Composer, InlineKeyboard } from 'grammy';
import { taskService } from '../services/taskService';
import { TASK_TYPE_CONFIG } from '@pr-gram/shared';
import { TaskType } from '@pr-gram/database';
import type { BotContext } from '../types/context';

export const promoteHandler = new Composer<BotContext>();

// Show promote menu
promoteHandler.callbackQuery('menu:promote', async (ctx) => {
  const userLevel = ctx.user.level;
  const commissionRate = getCommissionRate(userLevel);
  const balance = ctx.user.balance;
  
  const promoteText = `
📢 <b>СОЗДАТЬ ЗАДАНИЕ</b>

💰 Ваш баланс: <b>${balance} GRAM</b>
🏆 Уровень: <b>${userLevel} (комиссия ${commissionRate}%)</b>

Выберите тип задания для создания:
`;

  const keyboard = new InlineKeyboard()
    .text(`📺 Подписка на канал\n💰 ${TASK_TYPE_CONFIG.subscribe.minReward}-${TASK_TYPE_CONFIG.subscribe.maxReward} GRAM за задание`, 'promote:subscribe').row()
    .text(`👥 Вступление в группу\n💰 ${TASK_TYPE_CONFIG.join_group.minReward}-${TASK_TYPE_CONFIG.join_group.maxReward} GRAM за задание`, 'promote:join_group').row()
    .text(`👀 Просмотр поста\n💰 ${TASK_TYPE_CONFIG.view_post.minReward}-${TASK_TYPE_CONFIG.view_post.maxReward} GRAM за задание`, 'promote:view_post').row()
    .text(`🤖 Переход в бота\n💰 ${TASK_TYPE_CONFIG.use_bot.minReward}-${TASK_TYPE_CONFIG.use_bot.maxReward} GRAM`, 'promote:use_bot').row()
    .text(`👍 Реакция на пост\n💰 ${TASK_TYPE_CONFIG.react_post.minReward}-${TASK_TYPE_CONFIG.react_post.maxReward} GRAM за задание`, 'promote:react_post').row()
    .text(`⭐ Премиум буст\n💰 ${TASK_TYPE_CONFIG.premium_boost.minReward}-${TASK_TYPE_CONFIG.premium_boost.maxReward} GRAM`, 'promote:premium_boost').row()
    .text('📊 Мои задания', 'promote:my_tasks')
    .text('🏠 Главное меню', 'menu:main');

  await ctx.editMessageText(promoteText, { 
    reply_markup: keyboard,
    parse_mode: 'HTML' 
  });
  await ctx.answerCallbackQuery();
});

// Start task creation
promoteHandler.callbackQuery(/^promote:(.+)$/, async (ctx) => {
  const taskType = ctx.match[1];
  
  if (taskType === 'my_tasks') {
    await showMyTasks(ctx);
    return;
  }

  // Validate task type
  if (!Object.values(TaskType).includes(taskType as TaskType)) {
    await ctx.answerCallbackQuery('❌ Неверный тип задания');
    return;
  }

  // Start task creation conversation
  ctx.session.taskData = { type: taskType };
  await ctx.conversation.enter('createTask');
});

// Show user's tasks
async function showMyTasks(ctx: BotContext, page = 1) {
  try {
    const tasks = await taskService.getUserTasks(ctx.user.telegramId, undefined, page, 10);

    if (tasks.tasks.length === 0) {
      await ctx.editMessageText(
        '📊 У вас пока нет созданных заданий.\n\nИспользуйте кнопки меню для создания первого задания.',
        { reply_markup: new InlineKeyboard().text('⬅️ Назад', 'menu:promote') }
      );
      return;
    }

    let text = `📊 <b>МОИ ЗАДАНИЯ</b>\n\nВсего: ${tasks.total} | Страница: ${page}/${tasks.totalPages}\n\n`;
    
    tasks.tasks.forEach((task, index) => {
      const statusEmoji = getTaskStatusEmoji(task.status);
      text += `${statusEmoji} <b>${task.title}</b>\n`;
      text += `├ Тип: ${getTaskTypeIcon(task.type)} ${getTaskTypeName(task.type)}\n`;
      text += `├ Награда: ${task.reward} GRAM\n`;
      text += `├ Прогресс: ${task.completedCount}/${task.targetCount}\n`;
      text += `└ Создано: ${formatDate(task.createdAt)}\n\n`;
    });

    const keyboard = new InlineKeyboard();
    
    // Add task detail buttons
    tasks.tasks.forEach((task, index) => {
      keyboard.text(
        `${getTaskStatusEmoji(task.status)} ${task.title.substring(0, 25)}${task.title.length > 25 ? '...' : ''}`,
        `task:manage:${task.id}`
      ).row();
    });

    // Pagination
    if (tasks.totalPages > 1) {
      const paginationRow = [];
      if (tasks.hasPrev) {
        paginationRow.push({ text: '⬅️', callback_data: `promote:my_tasks:${page - 1}` });
      }
      paginationRow.push({ text: `${page}/${tasks.totalPages}`, callback_data: 'noop' });
      if (tasks.hasNext) {
        paginationRow.push({ text: '➡️', callback_data: `promote:my_tasks:${page + 1}` });
      }
      keyboard.row(...paginationRow);
    }

    keyboard.text('➕ Создать задание', 'menu:promote')
      .text('🏠 Главное меню', 'menu:main');

    await ctx.editMessageText(text, { 
      reply_markup: keyboard,
      parse_mode: 'HTML' 
    });
    await ctx.answerCallbackQuery();

  } catch (error) {
    console.error('Show my tasks error:', error);
    await ctx.answerCallbackQuery('❌ Ошибка при загрузке заданий');
  }
}

// Pagination for my tasks
promoteHandler.callbackQuery(/^promote:my_tasks:(\d+)$/, async (ctx) => {
  const page = parseInt(ctx.match[1]);
  await showMyTasks(ctx, page);
});

// Task management
promoteHandler.callbackQuery(/^task:manage:(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  await showTaskManagement(ctx, taskId);
});

// Show task management interface
async function showTaskManagement(ctx: BotContext, taskId: string) {
  try {
    const task = await taskService.getTaskDetails(taskId);
    
    if (task.authorId !== ctx.user.telegramId) {
      await ctx.answerCallbackQuery('❌ Это не ваше задание');
      return;
    }

    const stats = await taskService.getTaskStatistics(taskId);
    const statusEmoji = getTaskStatusEmoji(task.status);
    
    let text = `${statusEmoji} <b>УПРАВЛЕНИЕ ЗАДАНИЕМ</b>\n\n`;
    text += `${getTaskTypeIcon(task.type)} <b>${task.title}</b>\n\n`;
    text += `📋 <b>Информация:</b>\n`;
    text += `├ Тип: ${getTaskTypeName(task.type)}\n`;
    text += `├ Награда: ${task.reward} GRAM\n`;
    text += `├ Прогресс: ${task.completedCount}/${task.targetCount}\n`;
    text += `├ Статус: ${getTaskStatusText(task.status)}\n`;
    text += `└ Создано: ${formatDate(task.createdAt)}\n\n`;
    
    if (stats) {
      text += `📊 <b>Статистика:</b>\n`;
      text += `├ Выполнений: ${stats.totalExecutions}\n`;
      text += `├ Одобрено: ${stats.approvedExecutions}\n`;
      text += `├ Отклонено: ${stats.rejectedExecutions}\n`;
      text += `├ На проверке: ${stats.pendingExecutions}\n`;
      text += `├ Процент одобрения: ${stats.approvalRate}%\n`;
      text += `├ Прогресс: ${stats.completionRate}%\n`;
      text += `├ Потрачено: ${stats.spentAmount} GRAM\n`;
      text += `└ Остаток бюджета: ${stats.remainingBudget} GRAM\n\n`;
    }

    const keyboard = new InlineKeyboard()
      .text('📊 Статистика', `task:stats:${taskId}`)
      .text('📝 Выполнения', `task:executions:${taskId}`).row();

    if (task.status === 'active') {
      keyboard.text('⏸️ Приостановить', `task:pause:${taskId}`)
        .text('❌ Отменить', `task:cancel:${taskId}`).row();
    } else if (task.status === 'paused') {
      keyboard.text('▶️ Возобновить', `task:resume:${taskId}`)
        .text('❌ Отменить', `task:cancel:${taskId}`).row();
    }

    keyboard.text('⬅️ К моим заданиям', 'promote:my_tasks:1');

    await ctx.editMessageText(text, { 
      reply_markup: keyboard,
      parse_mode: 'HTML' 
    });
    await ctx.answerCallbackQuery();

  } catch (error) {
    console.error('Task management error:', error);
    await ctx.answerCallbackQuery(`❌ ${error instanceof Error ? error.message : 'Ошибка'}`);
  }
}

// Task statistics
promoteHandler.callbackQuery(/^task:stats:(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  
  try {
    const task = await taskService.getTaskDetails(taskId);
    const stats = await taskService.getTaskStatistics(taskId);
    
    if (task.authorId !== ctx.user.telegramId) {
      await ctx.answerCallbackQuery('❌ Это не ваше задание');
      return;
    }

    let text = `📊 <b>ДЕТАЛЬНАЯ СТАТИСТИКА</b>\n\n`;
    text += `${getTaskTypeIcon(task.type)} <b>${task.title}</b>\n\n`;
    
    text += `📈 <b>Основные метрики:</b>\n`;
    text += `├ Всего выполнений: ${stats.totalExecutions}\n`;
    text += `├ Одобрено: ${stats.approvedExecutions} (${stats.approvalRate}%)\n`;
    text += `├ Отклонено: ${stats.rejectedExecutions}\n`;
    text += `├ На проверке: ${stats.pendingExecutions}\n`;
    text += `└ Завершенность: ${stats.completionRate}%\n\n`;
    
    text += `💰 <b>Финансы:</b>\n`;
    text += `├ Потрачено: ${stats.spentAmount} GRAM\n`;
    text += `├ Остаток бюджета: ${stats.remainingBudget} GRAM\n`;
    text += `└ Общий бюджет: ${stats.spentAmount + stats.remainingBudget} GRAM\n\n`;
    
    if (stats.averageCompletionTimeMs > 0) {
      const avgTime = Math.round(stats.averageCompletionTimeMs / 1000 / 60); // minutes
      text += `⏱️ <b>Время:</b>\n`;
      text += `├ Среднее время выполнения: ${avgTime} мин\n`;
      
      if (stats.estimatedCompletion) {
        text += `└ Примерное завершение: ${formatDate(stats.estimatedCompletion)}\n\n`;
      }
    }

    const keyboard = new InlineKeyboard()
      .text('📝 Посмотреть выполнения', `task:executions:${taskId}`)
      .text('⬅️ Назад', `task:manage:${taskId}`);

    await ctx.editMessageText(text, { 
      reply_markup: keyboard,
      parse_mode: 'HTML' 
    });
    await ctx.answerCallbackQuery();

  } catch (error) {
    console.error('Task stats error:', error);
    await ctx.answerCallbackQuery('❌ Ошибка при загрузке статистики');
  }
});

// Task executions
promoteHandler.callbackQuery(/^task:executions:(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  await showTaskExecutions(ctx, taskId, 1);
});

// Show task executions with pagination
async function showTaskExecutions(ctx: BotContext, taskId: string, page = 1) {
  try {
    const task = await taskService.getTaskDetails(taskId);
    
    if (task.authorId !== ctx.user.telegramId) {
      await ctx.answerCallbackQuery('❌ Это не ваше задание');
      return;
    }

    const executions = await taskService.getTaskExecutions(taskId, undefined, page, 5);

    if (executions.executions.length === 0) {
      await ctx.editMessageText(
        '📝 Пока нет выполнений для этого задания',
        { reply_markup: new InlineKeyboard().text('⬅️ Назад', `task:manage:${taskId}`) }
      );
      return;
    }

    let text = `📝 <b>ВЫПОЛНЕНИЯ ЗАДАНИЯ</b>\n\n`;
    text += `${getTaskTypeIcon(task.type)} <b>${task.title}</b>\n`;
    text += `Страница: ${page}/${executions.totalPages}\n\n`;

    executions.executions.forEach((execution, index) => {
      const statusEmoji = getExecutionStatusEmoji(execution.status);
      const userInfo = execution.user.username ? `@${execution.user.username}` : execution.user.firstName;
      
      text += `${statusEmoji} <b>${userInfo}</b>\n`;
      text += `├ Уровень: ${getLevelEmoji(execution.user.level)} ${execution.user.level}\n`;
      text += `├ Статус: ${getExecutionStatusText(execution.status)}\n`;
      text += `├ Награда: ${execution.rewardAmount} GRAM\n`;
      text += `└ Дата: ${formatDateTime(execution.createdAt)}\n\n`;
    });

    const keyboard = new InlineKeyboard();
    
    // Add execution detail buttons for pending ones
    executions.executions
      .filter(e => e.status === 'pending')
      .forEach(execution => {
        const userInfo = execution.user.username ? `@${execution.user.username}` : execution.user.firstName;
        keyboard.text(
          `🔍 ${userInfo}`,
          `execution:moderate:${execution.id}`
        ).row();
      });

    // Pagination
    if (executions.totalPages > 1) {
      const paginationRow = [];
      if (executions.hasPrev) {
        paginationRow.push({ text: '⬅️', callback_data: `task:executions:${taskId}:${page - 1}` });
      }
      paginationRow.push({ text: `${page}/${executions.totalPages}`, callback_data: 'noop' });
      if (executions.hasNext) {
        paginationRow.push({ text: '➡️', callback_data: `task:executions:${taskId}:${page + 1}` });
      }
      keyboard.row(...paginationRow);
    }

    keyboard.text('⬅️ Назад', `task:manage:${taskId}`);

    await ctx.editMessageText(text, { 
      reply_markup: keyboard,
      parse_mode: 'HTML' 
    });
    await ctx.answerCallbackQuery();

  } catch (error) {
    console.error('Task executions error:', error);
    await ctx.answerCallbackQuery('❌ Ошибка при загрузке выполнений');
  }
}

// Execution pagination
promoteHandler.callbackQuery(/^task:executions:(.+):(\d+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  const page = parseInt(ctx.match[2]);
  await showTaskExecutions(ctx, taskId, page);
});

// Moderate execution
promoteHandler.callbackQuery(/^execution:moderate:(.+)$/, async (ctx) => {
  const executionId = ctx.match[1];
  await ctx.conversation.enter('moderateTask', { executionId });
});

// Task actions
promoteHandler.callbackQuery(/^task:(pause|resume|cancel):(.+)$/, async (ctx) => {
  const action = ctx.match[1];
  const taskId = ctx.match[2];
  
  try {
    const task = await taskService.getTaskDetails(taskId);
    
    if (task.authorId !== ctx.user.telegramId) {
      await ctx.answerCallbackQuery('❌ Это не ваше задание');
      return;
    }

    switch (action) {
      case 'pause':
        await taskService.updateTaskStatus(taskId, 'paused', ctx.user.telegramId);
        await ctx.answerCallbackQuery('⏸️ Задание приостановлено');
        break;
      case 'resume':
        await taskService.updateTaskStatus(taskId, 'active', ctx.user.telegramId);
        await ctx.answerCallbackQuery('▶️ Задание возобновлено');
        break;
      case 'cancel':
        // Confirm cancellation
        const confirmKeyboard = new InlineKeyboard()
          .text('✅ Да, отменить', `task:confirm_cancel:${taskId}`)
          .text('❌ Нет, оставить', `task:manage:${taskId}`);
        
        await ctx.editMessageText(
          '⚠️ <b>ПОДТВЕРЖДЕНИЕ ОТМЕНЫ</b>\n\nВы уверены, что хотите отменить задание?\n\n' +
          '• Все ожидающие выполнения будут отклонены\n' +
          '• Часть средств будет возвращена (комиссия 10%)\n' +
          '• Действие необратимо',
          { 
            reply_markup: confirmKeyboard,
            parse_mode: 'HTML'
          }
        );
        return;
    }

    // Refresh task management view
    await showTaskManagement(ctx, taskId);

  } catch (error) {
    console.error('Task action error:', error);
    await ctx.answerCallbackQuery(`❌ ${error instanceof Error ? error.message : 'Ошибка'}`);
  }
});

// Confirm task cancellation
promoteHandler.callbackQuery(/^task:confirm_cancel:(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  
  try {
    const cancelledTask = await taskService.cancelTask(
      taskId, 
      ctx.user.telegramId, 
      'Отменено автором'
    );

    await ctx.editMessageText(
      `✅ <b>ЗАДАНИЕ ОТМЕНЕНО</b>\n\n` +
      `${getTaskTypeIcon(cancelledTask.type)} <b>${cancelledTask.title}</b>\n\n` +
      `📊 Результат отмены:\n` +
      `├ Выполнено до отмены: ${cancelledTask.completedCount}/${cancelledTask.targetCount}\n` +
      `├ Возвращено на баланс: ${cancelledTask.metadata?.cancellation?.refundAmount || 0} GRAM\n` +
      `└ Комиссия за отмену: 10%\n\n` +
      `Все ожидающие выполнения отклонены.`,
      { 
        reply_markup: new InlineKeyboard().text('📊 Мои задания', 'promote:my_tasks:1'),
        parse_mode: 'HTML'
      }
    );
    
    await ctx.answerCallbackQuery('✅ Задание отменено');

  } catch (error) {
    console.error('Task cancellation error:', error);
    await ctx.answerCallbackQuery(`❌ ${error instanceof Error ? error.message : 'Ошибка'}`);
  }
});

// Utility functions
function getTaskStatusEmoji(status: string): string {
  const emojis = {
    active: '🟢',
    paused: '🟡',
    completed: '✅',
    cancelled: '❌',
    expired: '⏰'
  };
  return emojis[status as keyof typeof emojis] || '❓';
}

function getTaskStatusText(status: string): string {
  const texts = {
    active: 'Активное',
    paused: 'Приостановлено',
    completed: 'Завершено',
    cancelled: 'Отменено',
    expired: 'Истекло'
  };
  return texts[status as keyof typeof texts] || 'Неизвестно';
}

function getExecutionStatusEmoji(status: string): string {
  const emojis = {
    pending: '🟡',
    approved: '✅',
    rejected: '❌',
    expired: '⏰'
  };
  return emojis[status as keyof typeof emojis] || '❓';
}

function getExecutionStatusText(status: string): string {
  const texts = {
    pending: 'На проверке',
    approved: 'Одобрено',
    rejected: 'Отклонено',
    expired: 'Истекло'
  };
  return texts[status as keyof typeof texts] || 'Неизвестно';
}

function getTaskTypeIcon(type: TaskType): string {
  const icons = {
    [TaskType.subscribe]: '📺',
    [TaskType.join_group]: '👥',
    [TaskType.view_post]: '👀',
    [TaskType.react_post]: '👍',
    [TaskType.use_bot]: '🤖',
    [TaskType.premium_boost]: '⭐'
  };
  return icons[type] || '📋';
}

function getTaskTypeName(type: TaskType): string {
  const names = {
    [TaskType.subscribe]: 'Подписка на канал',
    [TaskType.join_group]: 'Вступление в группу',
    [TaskType.view_post]: 'Просмотр поста',
    [TaskType.react_post]: 'Реакция на пост',
    [TaskType.use_bot]: 'Переход в бота',
    [TaskType.premium_boost]: 'Премиум буст'
  };
  return names[type] || 'Неизвестно';
}

function getCommissionRate(userLevel: string): number {
  const rates = {
    bronze: 7,
    silver: 6,
    gold: 5,
    premium: 3
  };
  return rates[userLevel as keyof typeof rates] || 7;
}

function getLevelEmoji(level: string): string {
  const emojis = {
    bronze: '🥉',
    silver: '🥈',
    gold: '🥇',
    premium: '💎'
  };
  return emojis[level as keyof typeof emojis] || '🥉';
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}