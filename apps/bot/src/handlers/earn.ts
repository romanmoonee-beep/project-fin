import { Composer, InlineKeyboard } from 'grammy';
import { taskService } from '../services/taskService';
import { telegramService } from '../services/telegramService';
import { TaskType } from '@pr-gram/database';
import { applyMultiplier } from '@pr-gram/shared';
import type { BotContext } from '../types/context';

export const earnHandler = new Composer<BotContext>();

// Show earn menu
earnHandler.callbackQuery('menu:earn', async (ctx) => {
  const availableTasks = await taskService.getTaskCounts();
  const userLevel = ctx.user.level;
  const multiplier = getMultiplier(userLevel);
  
  const earnText = `
💰 <b>ЗАРАБОТАТЬ</b>

🔥 Доступно: <b>${availableTasks.total} заданий</b>
⭐ Ваш уровень: <b>${userLevel} (+${Math.round((multiplier - 1) * 100)}%)</b>

Выберите тип заданий:
`;

  const keyboard = new InlineKeyboard()
    .text(`📺 Подписка на каналы\n🔥 ${availableTasks.subscribe} заданий\n💰 50-500 GRAM`, 'earn:subscribe').row()
    .text(`👥 Вступить в группы\n🔥 ${availableTasks.join_group} заданий\n💰 75-750 GRAM`, 'earn:join_group').row()
    .text(`👀 Просмотр постов\n🔥 ${availableTasks.view_post} заданий\n💰 25-200 GRAM`, 'earn:view_post').row()
    .text(`🤖 Перейти в ботов\n🔥 ${availableTasks.use_bot} заданий\n💰 100-1500 GRAM`, 'earn:use_bot').row()
    .text(`👍 Поставить реакции\n🔥 ${availableTasks.react_post} заданий\n💰 30-150 GRAM`, 'earn:react_post').row()
    .text(`⭐ Премиум буст\n🔥 ${availableTasks.premium_boost} заданий\n💰 500-2000 GRAM`, 'earn:premium_boost').row()
    .text('🏠 Главное меню', 'menu:main');

  await ctx.editMessageText(earnText, { reply_markup: keyboard });
  await ctx.answerCallbackQuery();
});

// Show tasks by type
earnHandler.callbackQuery(/^earn:(.+)$/, async (ctx) => {
  const taskType = ctx.match[1] as TaskType;
  await showTasksByType(ctx, taskType, 1);
});

// Show task details
earnHandler.callbackQuery(/^task:view:(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  await showTaskDetails(ctx, taskId);
});

// Execute task
earnHandler.callbackQuery(/^task:execute:(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  await executeTask(ctx, taskId);
});

// Check task completion
earnHandler.callbackQuery(/^task:check:(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  await checkTaskCompletion(ctx, taskId);
});

// Upload proof (for manual verification tasks)
earnHandler.callbackQuery(/^task:upload:(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  await ctx.conversation.enter('uploadTaskProof', { taskId });
});

// Pagination
earnHandler.callbackQuery(/^earn:(.+):page:(\d+)$/, async (ctx) => {
  const taskType = ctx.match[1] as TaskType;
  const page = parseInt(ctx.match[2]);
  await showTasksByType(ctx, taskType, page);
});

// Helper functions
async function showTasksByType(ctx: BotContext, taskType: TaskType, page: number) {
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
        `😔 Нет доступных заданий типа "${getTaskTypeName(taskType)}"`,
        { reply_markup: new InlineKeyboard().text('⬅️ Назад', 'menu:earn') }
      );
      return;
    }

    const boostedTasks = tasks.tasks.filter(t => t.isBoosted);
    const regularTasks = tasks.tasks.filter(t => !t.isBoosted);

    let text = `${getTaskTypeIcon(taskType)} <b>${getTaskTypeName(taskType).toUpperCase()}</b>\n\n`;
    
    if (boostedTasks.length > 0) {
      text += `🚀 <b>БУСТ ЗАДАНИЯ (топ):</b>\n\n`;
      boostedTasks.forEach(task => {
        text += formatBoostedTask(task, ctx.user.level);
      });
      text += '\n';
    }

    if (regularTasks.length > 0) {
      text += `Обычные задания:\n\n`;
      regularTasks.forEach(task => {
        text += formatRegularTask(task, ctx.user.level);
      });
    }

    const keyboard = new InlineKeyboard();
    
    // Add task buttons
    tasks.tasks.forEach(task => {
      const prefix = task.isBoosted ? '⭐ 🚀 ' : '';
      keyboard.text(
        `${prefix}${task.title.substring(0, 30)}${task.title.length > 30 ? '...' : ''}`,
        `task:view:${task.id}`
      ).row();
    });

    // Pagination
    if (tasks.totalPages > 1) {
      const paginationRow = [];
      if (tasks.hasPrev) {
        paginationRow.push({ text: '⬅️', callback_data: `earn:${taskType}:page:${page - 1}` });
      }
      paginationRow.push({ text: `${page}/${tasks.totalPages}`, callback_data: 'noop' });
      if (tasks.hasNext) {
        paginationRow.push({ text: '➡️', callback_data: `earn:${taskType}:page:${page + 1}` });
      }
      keyboard.row(...paginationRow);
    }

    keyboard.text('⬅️ Назад в заработок', 'menu:earn');

    await ctx.editMessageText(text, { reply_markup: keyboard });
    await ctx.answerCallbackQuery();

  } catch (error) {
    console.error('Show tasks by type error:', error);
    await ctx.answerCallbackQuery('❌ Ошибка при загрузке заданий');
  }
}

async function showTaskDetails(ctx: BotContext, taskId: string) {
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
    text += `👥 <b>Выполнили:</b> ${task.completedCount}/${task.targetCount}\n\n`;

    // Add instructions based on task type
    text += getTaskInstructions(task.type, task.targetUrl);

    const keyboard = new InlineKeyboard();

    // Check if user already executed this task
    if (task.executions && task.executions.length > 0) {
      const execution = task.executions[0];
      if (execution.status === 'pending') {
        text += `\n⏳ <b>Статус:</b> Ожидает проверки`;
        keyboard.text('🔄 Проверить статус', `task:check:${taskId}`);
      } else if (execution.status === 'approved') {
        text += `\n✅ <b>Статус:</b> Выполнено и одобрено`;
      } else if (execution.status === 'rejected') {
        text += `\n❌ <b>Статус:</b> Отклонено\n<i>Причина: ${execution.adminComment || 'Не указана'}</i>`;
        if (canAppeal(execution)) {
          keyboard.text('📝 Подать апелляцию', `appeal:create:${execution.id}`);
        }
      }
    } else {
      // User can execute the task
      keyboard.text('🚀 Выполнить задание', `task:execute:${taskId}`);
    }

    keyboard.row().text('ℹ️ Подробная информация', `task:info:${taskId}`);
    keyboard.row().text('⬅️ Назад к списку', `earn:${task.type}`);

    await ctx.editMessageText(text, { reply_markup: keyboard });
    await ctx.answerCallbackQuery();

  } catch (error) {
    console.error('Show task details error:', error);
    await ctx.answerCallbackQuery(`❌ ${error instanceof Error ? error.message : 'Ошибка'}`);
  }
}

async function executeTask(ctx: BotContext, taskId: string) {
  try {
    const task = await taskService.getTaskDetails(taskId);
    
    // Show execution interface based on task type
    switch (task.type) {
      case TaskType.subscribe:
      case TaskType.join_group:
      case TaskType.view_post:
      case TaskType.react_post:
        await showAutoVerificationTask(ctx, task);
        break;
      case TaskType.use_bot:
      case TaskType.premium_boost:
        await showManualVerificationTask(ctx, task);
        break;
      default:
        await ctx.answerCallbackQuery('❌ Неподдерживаемый тип задания');
    }

  } catch (error) {
    console.error('Execute task error:', error);
    await ctx.answerCallbackQuery(`❌ ${error instanceof Error ? error.message : 'Ошибка'}`);
  }
}

async function showAutoVerificationTask(ctx: BotContext, task: any) {
  const taskIcon = getTaskTypeIcon(task.type);
  const actionText = getActionText(task.type);
  const buttonText = getButtonText(task.type);

  let text = `${taskIcon} <b>ЗАДАНИЕ: ${task.title}</b>\n\n`;
  text += `📋 <b>Описание:</b>\n${task.description}\n\n`;
  text += `💰 <b>Награда:</b> ${task.reward} GRAM\n`;
  text += `⏱️ <b>Осталось:</b> ${task.expiresAt ? formatTimeLeft(task.expiresAt) : 'Без ограничений'}\n\n`;
  
  text += `💡 <b>ИНСТРУКЦИЯ:</b>\n`;
  text += `1. Нажмите кнопку "${buttonText}"\n`;
  text += `2. ${actionText}\n`;
  text += `3. Вернитесь и нажмите "Проверить"\n\n`;
  text += `❗ После выполнения действия нажмите "Проверить"`;

  const keyboard = new InlineKeyboard()
    .url(buttonText, task.targetUrl).row()
    .text('✅ Проверить', `task:check:${task.id}`)
    .text('❌ Отмена', `task:view:${task.id}`);

  await ctx.editMessageText(text, { reply_markup: keyboard });
  await ctx.answerCallbackQuery();
}

async function showManualVerificationTask(ctx: BotContext, task: any) {
  const taskIcon = getTaskTypeIcon(task.type);

  let text = `${taskIcon} <b>ЗАДАНИЕ: ${task.title}</b>\n\n`;
  text += `📋 <b>Условия выполнения:</b>\n${task.description}\n\n`;
  text += `💰 <b>Награда:</b> ${task.reward} GRAM\n`;
  text += `⚠️ <b>Блокировать ботов раньше 7 дней ЗАПРЕЩЕНО!</b>\n\n`;

  if (task.targetUrl) {
    text += `🔗 <b>Ссылка:</b> ${task.targetUrl}\n\n`;
  }

  text += `📷 После выполнения загрузите скриншот доказательства`;

  const keyboard = new InlineKeyboard();
  
  if (task.targetUrl) {
    keyboard.url('🔗 Перейти к заданию', task.targetUrl).row();
  }
  
  keyboard.text('📤 Загрузить скриншот', `task:upload:${task.id}`)
    .text('❌ Отмена', `task:view:${task.id}`);

  await ctx.editMessageText(text, { reply_markup: keyboard });
  await ctx.answerCallbackQuery();
}

async function checkTaskCompletion(ctx: BotContext, taskId: string) {
  try {
    await ctx.answerCallbackQuery('⏳ Проверяем выполнение...');

    const execution = await taskService.executeTask(
      ctx.user.telegramId,
      taskId
    );

    if (execution.status === 'approved') {
      const finalReward = applyMultiplier(execution.rewardAmount.toNumber(), ctx.user.level);
      
      const successText = `
✅ <b>ЗАДАНИЕ ВЫПОЛНЕНО!</b>

${getTaskTypeIcon(execution.task.type)} ${execution.task.title}
💰 +${finalReward} GRAM зачислено на баланс

📊 <b>Ваша статистика:</b>
├ Баланс: ${ctx.user.balance.toNumber() + finalReward} GRAM (+${finalReward})
├ Выполнено заданий: ${ctx.user.tasksCompleted + 1} (+1)
└ Заработано сегодня: ${finalReward} GRAM

🎉 Отлично! Продолжайте выполнять задания!
`;

      const keyboard = new InlineKeyboard()
        .text('💰 Больше заданий', 'menu:earn')
        .text('🏠 В главное меню', 'menu:main');

      await ctx.editMessageText(successText, { reply_markup: keyboard });

    } else if (execution.status === 'pending') {
      const pendingText = `
⏳ <b>ЗАДАНИЕ ОТПРАВЛЕНО НА ПРОВЕРКУ</b>

✅ Задание #${execution.id.slice(-6)} отправлено на проверку

⏰ <b>Статус проверки:</b>
├ Отправлено: ${formatDateTime(execution.createdAt)}
├ Автор: @${execution.task.author?.username || 'автор'}
└ Автопроверка: через ${execution.task.autoApproveHours} часов

💡 Если автор не проверит задание в течение ${execution.task.autoApproveHours} часов, оно будет автоматически засчитано и оплачено.

🔔 Вы получите уведомление о результате проверки.
`;

      const keyboard = new InlineKeyboard()
        .text('💰 Другие задания', 'menu:earn')
        .text('🏠 В главное меню', 'menu:main');

      await ctx.editMessageText(pendingText, { reply_markup: keyboard });

    } else {
      await ctx.editMessageText(
        '❌ Задание не выполнено\n\nПопробуйте еще раз или обратитесь в поддержку.',
        { reply_markup: new InlineKeyboard().text('🔄 Попробовать снова', `task:view:${taskId}`) }
      );
    }

  } catch (error) {
    console.error('Check task completion error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Ошибка проверки';
    
    await ctx.editMessageText(
      `❌ ${errorMessage}\n\nПопробуйте позже или обратитесь в поддержку.`,
      { reply_markup: new InlineKeyboard().text('🔄 Попробовать снова', `task:view:${taskId}`) }
    );
  }
}

// Utility functions
function getTaskTypeName(type: TaskType): string {
  const names = {
    [TaskType.subscribe]: 'Подписка на каналы',
    [TaskType.join_group]: 'Вступление в группы', 
    [TaskType.view_post]: 'Просмотр постов',
    [TaskType.react_post]: 'Реакции на посты',
    [TaskType.use_bot]: 'Переход в ботов',
    [TaskType.premium_boost]: 'Премиум буст'
  };
  return names[type] || 'Неизвестно';
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

function getActionText(type: TaskType): string {
  const actions = {
    [TaskType.subscribe]: 'Подпишитесь на канал',
    [TaskType.join_group]: 'Вступите в группу',
    [TaskType.view_post]: 'Просмотрите пост',
    [TaskType.react_post]: 'Поставьте реакцию на пост',
    [TaskType.use_bot]: 'Используйте бота согласно условиям',
    [TaskType.premium_boost]: 'Выполните премиум задание'
  };
  return actions[type] || 'Выполните задание';
}

function getButtonText(type: TaskType): string {
  const buttons = {
    [TaskType.subscribe]: '🔗 Подписаться на канал',
    [TaskType.join_group]: '🔗 Вступить в группу', 
    [TaskType.view_post]: '🔗 Просмотреть пост',
    [TaskType.react_post]: '🔗 Перейти к посту',
    [TaskType.use_bot]: '🔗 Перейти к боту',
    [TaskType.premium_boost]: '🔗 Выполнить задание'
  };
  return buttons[type] || '🔗 Перейти';
}

function getTaskInstructions(type: TaskType, targetUrl?: string): string {
  const baseInstructions = {
    [TaskType.subscribe]: 'Подпишитесь на канал и вернитесь для проверки',
    [TaskType.join_group]: 'Вступите в группу и вернитесь для проверки',
    [TaskType.view_post]: 'Просмотрите пост и вернитесь для проверки',
    [TaskType.react_post]: 'Поставьте реакцию на пост и вернитесь для проверки',
    [TaskType.use_bot]: 'Выполните условия задания и загрузите скриншот',
    [TaskType.premium_boost]: 'Выполните премиум задание и загрузите доказательство'
  };
  
  return baseInstructions[type] || 'Выполните задание согласно описанию';
}

function formatBoostedTask(task: any, userLevel: string): string {
  const finalReward = applyMultiplier(task.reward.toNumber(), userLevel);
  return `╔═══════════════════════════╗\n║ ⭐ 🚀 ${task.title.substring(0, 20)}${task.title.length > 20 ? '...' : ''}\n║ 💰 ${finalReward} GRAM • 👥 ${task.completedCount}/${task.targetCount}\n╚═══════════════════════════╝\n\n`;
}

function formatRegularTask(task: any, userLevel: string): string {
  const finalReward = applyMultiplier(task.reward.toNumber(), userLevel);
  return `┌─────────────────────────┐\n│ ${task.title.substring(0, 25)}${task.title.length > 25 ? '...' : ''}\n│ 💰 ${finalReward} GRAM\n│ 👥 ${task.completedCount}/${task.targetCount}\n└─────────────────────────┘\n\n`;
}

function getMultiplier(level: string): number {
  const multipliers = { bronze: 1.0, silver: 1.2, gold: 1.35, premium: 1.5 };
  return multipliers[level as keyof typeof multipliers] || 1.0;
}

function formatTimeLeft(expiresAt: Date): string {
  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();
  
  if (diff <= 0) return 'Истекло';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) return `${days} дн. ${hours} ч.`;
  return `${hours} ч.`;
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

function canAppeal(execution: any): boolean {
  // User can appeal within 24 hours of rejection
  if (!execution.verifiedAt) return false;
  const hoursSinceRejection = (Date.now() - execution.verifiedAt.getTime()) / (1000 * 60 * 60);
  return hoursSinceRejection < 24;
}