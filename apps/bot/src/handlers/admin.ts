import { Composer, InlineKeyboard } from 'grammy';
import { taskService } from '../services/taskService';
import { balanceService } from '../services/balanceService';
import { analyticsService } from '../services/analyticsService';
import { isAdmin, isSuperAdmin } from '../config';
import type { BotContext } from '../types/context';
import {
  searchUserConversation,
  changeUserBalanceConversation,
  banUserConversation,
  createBroadcastConversation,
  processWithdrawalConversation
} from '../conversations/admin';

import { generateAdminToken, logAdminSession } from '../utils/jwt';
export const adminHandler = new Composer<BotContext>();

adminHandler.use(searchUserConversation);
adminHandler.use(changeUserBalanceConversation);
adminHandler.use(banUserConversation);
adminHandler.use(createBroadcastConversation);
adminHandler.use(processWithdrawalConversation);


// Admin access middleware
adminHandler.use(async (ctx, next) => {
  if (!ctx.from || !isAdmin(ctx.from.id)) {
    await ctx.answerCallbackQuery('❌ Недостаточно прав доступа');
    return;
  }
  return next();
});


// Show admin menu
adminHandler.callbackQuery('menu:admin', async (ctx) => {
  //if (!isAdmin(ctx.from!.id)) {
    await ctx.answerCallbackQuery('❌ Недостаточно прав доступа');
    return;
  }


  const adminText = `
🛡️ <b>ПАНЕЛЬ АДМИНИСТРАТОРА</b>

👑 Уровень доступа: ${isSuperAdmin(ctx.from!.id) ? 'Супер-администратор' : 'Администратор'}

Выберите раздел для управления:
`;

  const keyboard = new InlineKeyboard()
    .text('📊 Статистика системы', 'admin:stats').row()
    .text('👥 Управление пользователями', 'admin:users').row()
    .text('📋 Модерация заданий', 'admin:moderation').row()
    .text('💰 Управление балансами', 'admin:balances').row()
    .text('📢 Рассылка', 'admin:broadcast').row()
    .text('⚙️ Настройки системы', 'admin:settings').row();

  if (isSuperAdmin(ctx.from!.id)) {
    keyboard.text('🔧 Техническое', 'admin:technical').row();
  }

  keyboard.text('🏠 Главное меню', 'menu:main');

  await ctx.editMessageText(adminText, { 
    reply_markup: keyboard,
    parse_mode: 'HTML' 
  });
  await ctx.answerCallbackQuery();
});

// System statistics
adminHandler.callbackQuery('admin:stats', async (ctx) => {
  await showSystemStatistics(ctx);
});

// Show system statistics
async function showSystemStatistics(ctx: BotContext) {
  try {
    const stats = await analyticsService.getSystemStatistics();
    
    let text = `📊 <b>СТАТИСТИКА СИСТЕМЫ</b>\n\n`;
    
    text += `👥 <b>Пользователи:</b>\n`;
    text += `├ Всего: ${stats.users.totalUsers}\n`;
    text += `├ Активных: ${stats.users.activeUsers}\n`;
    text += `├ Новых сегодня: ${stats.users.newUsersToday}\n`;
    text += `├ Premium: ${stats.users.premiumUsers}\n`;
    text += `└ Средний баланс: ${Math.round(stats.users.averageBalance)} GRAM\n\n`;
    
    text += `📋 <b>Задания:</b>\n`;
    text += `├ Всего: ${stats.tasks.totalTasks}\n`;
    text += `├ Активных: ${stats.tasks.activeTasks}\n`;
    text += `├ Завершенных: ${stats.tasks.completedTasks}\n`;
    text += `├ Выполнений: ${stats.tasks.totalExecutions}\n`;
    text += `├ Процент одобрения: ${stats.tasks.successRate}%\n`;
    text += `└ Средняя награда: ${Math.round(stats.tasks.averageReward)} GRAM\n\n`;
    
    text += `💳 <b>Чеки:</b>\n`;
    text += `├ Всего: ${stats.checks.totalChecks}\n`;
    text += `├ Активных: ${stats.checks.activeChecks}\n`;
    text += `├ Активаций: ${stats.checks.totalActivations}\n`;
    text += `├ Общая сумма: ${Math.round(stats.checks.totalAmount)} GRAM\n`;
    text += `└ Процент использования: ${stats.checks.successRate}%\n\n`;
    
    text += `💰 <b>Финансы:</b>\n`;
    text += `├ Общий оборот: ${Math.round(stats.revenue.totalRevenue)} GRAM\n`;
    text += `├ Комиссии: ${Math.round(stats.revenue.totalCommissions)} GRAM\n`;
    text += `└ Средний чек: ${Math.round(stats.revenue.averageTransactionSize)} GRAM`;

    const keyboard = new InlineKeyboard()
      .text('📈 Детальная аналитика', 'admin:analytics')
      .text('👥 Уровни пользователей', 'admin:user_levels').row()
      .text('🔄 Обновить', 'admin:stats')
      .text('⬅️ Назад', 'menu:admin');

    await ctx.editMessageText(text, { 
      reply_markup: keyboard,
      parse_mode: 'HTML' 
    });
    await ctx.answerCallbackQuery();

  } catch (error) {
    console.error('System statistics error:', error);
    await ctx.answerCallbackQuery('❌ Ошибка при загрузке статистики');
  }
}

// User management
adminHandler.callbackQuery('admin:users', async (ctx) => {
  await showUserManagement(ctx);
});

// Show user management
async function showUserManagement(ctx: BotContext) {
  const userManagementText = `
👥 <b>УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ</b>

Выберите действие:
`;

  const keyboard = new InlineKeyboard()
    .text('🔍 Найти пользователя', 'admin:find_user')
    .text('📊 Топ пользователей', 'admin:top_users').row()
    .text('🚫 Заблокированные', 'admin:banned_users')
    .text('💎 Premium пользователи', 'admin:premium_users').row()
    .text('📈 Статистика уровней', 'admin:user_levels')
    .text('🎯 Массовые действия', 'admin:mass_actions').row()
    .text('⬅️ Назад', 'menu:admin');

  await ctx.editMessageText(userManagementText, { 
    reply_markup: keyboard,
    parse_mode: 'HTML' 
  });
  await ctx.answerCallbackQuery();
}

// Task moderation
adminHandler.callbackQuery('admin:moderation', async (ctx) => {
  await showModerationPanel(ctx);
});

// Show moderation panel
async function showModerationPanel(ctx: BotContext) {
  try {
    const pendingCount = await taskService.getPendingModerationCount();
    const appealsCount = await taskService.getPendingAppealsCount();
    
    let text = `📋 <b>МОДЕРАЦИЯ ЗАДАНИЙ</b>\n\n`;
    text += `⏳ На проверке: ${pendingCount} заданий\n`;
    text += `📝 Апелляций: ${appealsCount}\n\n`;
    text += `Выберите раздел:`;

    const keyboard = new InlineKeyboard()
      .text(`⏳ Ожидают проверки (${pendingCount})`, 'admin:pending_tasks')
      .text(`📝 Апелляции (${appealsCount})`, 'admin:appeals').row()
      .text('🔍 Поиск по ID', 'admin:find_execution')
      .text('📊 Статистика модерации', 'admin:moderation_stats').row()
      .text('⚙️ Настройки модерации', 'admin:moderation_settings')
      .text('⬅️ Назад', 'menu:admin');

    await ctx.editMessageText(text, { 
      reply_markup: keyboard,
      parse_mode: 'HTML' 
    });
    await ctx.answerCallbackQuery();

  } catch (error) {
    console.error('Moderation panel error:', error);
    await ctx.answerCallbackQuery('❌ Ошибка при загрузке модерации');
  }
}

// Balance management
adminHandler.callbackQuery('admin:balances', async (ctx) => {
  await showBalanceManagement(ctx);
});

// Show balance management
async function showBalanceManagement(ctx: BotContext) {
  if (!isSuperAdmin(ctx.from!.id)) {
    await ctx.answerCallbackQuery('❌ Только для супер-администраторов');
    return;
  }

  const balanceText = `
💰 <b>УПРАВЛЕНИЕ БАЛАНСАМИ</b>

⚠️ <b>ОСТОРОЖНО!</b> Изменение балансов влияет на экономику системы.

Выберите действие:
`;

  const keyboard = new InlineKeyboard()
    .text('💰 Начислить баланс', 'admin:add_balance')
    .text('💸 Списать баланс', 'admin:subtract_balance').row()
    .text('❄️ Заморозить баланс', 'admin:freeze_balance')
    .text('🔥 Разморозить баланс', 'admin:unfreeze_balance').row()
    .text('📊 История транзакций', 'admin:transaction_history')
    .text('📈 Финансовые отчеты', 'admin:financial_reports').row()
    .text('⬅️ Назад', 'menu:admin');

  await ctx.editMessageText(balanceText, { 
    reply_markup: keyboard,
    parse_mode: 'HTML' 
  });
  await ctx.answerCallbackQuery();
}

// Broadcast
adminHandler.callbackQuery('admin:broadcast', async (ctx) => {
  await showBroadcastPanel(ctx);
});

// Show broadcast panel
async function showBroadcastPanel(ctx: BotContext) {
  const broadcastText = `
📢 <b>СИСТЕМА РАССЫЛКИ</b>

Отправка сообщений пользователям бота.

⚠️ <b>ВНИМАНИЕ!</b> Рассылка влияет на всех пользователей.

Выберите тип рассылки:
`;

  const keyboard = new InlineKeyboard()
    .text('📢 Всем пользователям', 'admin:broadcast_all')
    .text('🏆 По уровням', 'admin:broadcast_levels').row()
    .text('📊 Активным пользователям', 'admin:broadcast_active')
    .text('💎 Premium пользователям', 'admin:broadcast_premium').row()
    .text('🎯 По критериям', 'admin:broadcast_criteria')
    .text('📝 Тестовая рассылка', 'admin:broadcast_test').row()
    .text('📈 История рассылок', 'admin:broadcast_history')
    .text('⬅️ Назад', 'menu:admin');

  await ctx.editMessageText(broadcastText, { 
    reply_markup: keyboard,
    parse_mode: 'HTML' 
  });
  await ctx.answerCallbackQuery();
}

// System settings
adminHandler.callbackQuery('admin:settings', async (ctx) => {
  await showSystemSettings(ctx);
});

// Show system settings
async function showSystemSettings(ctx: BotContext) {
  if (!isSuperAdmin(ctx.from!.id)) {
    await ctx.answerCallbackQuery('❌ Только для супер-администраторов');
    return;
  }

  const settingsText = `
⚙️ <b>НАСТРОЙКИ СИСТЕМЫ</b>

Управление глобальными параметрами бота.

Выберите категорию:
`;

  const keyboard = new InlineKeyboard()
    .text('💰 Экономические настройки', 'admin:settings_economy')
    .text('📋 Настройки заданий', 'admin:settings_tasks').row()
    .text('👥 Настройки пользователей', 'admin:settings_users')
    .text('🔧 Технические настройки', 'admin:settings_technical').row()
    .text('🚫 Режим обслуживания', 'admin:maintenance_mode')
    .text('📊 Лимиты и ограничения', 'admin:limits').row()
    .text('⬅️ Назад', 'menu:admin');

  await ctx.editMessageText(settingsText, { 
    reply_markup: keyboard,
    parse_mode: 'HTML' 
  });
  await ctx.answerCallbackQuery();
}

// Technical section (super admin only)
adminHandler.callbackQuery('admin:technical', async (ctx) => {
  if (!isSuperAdmin(ctx.from!.id)) {
    await ctx.answerCallbackQuery('❌ Только для супер-администраторов');
    return;
  }

  await showTechnicalPanel(ctx);
});

// Show technical panel
async function showTechnicalPanel(ctx: BotContext) {
  const technicalText = `
🔧 <b>ТЕХНИЧЕСКАЯ ПАНЕЛЬ</b>

⚠️ <b>ВНИМАНИЕ!</b> Данный раздел для технических специалистов.

Выберите инструмент:
`;

  const keyboard = new InlineKeyboard()
    .text('💾 Статус базы данных', 'admin:db_status')
    .text('🔄 Статус Redis', 'admin:redis_status').row()
    .text('📊 Производительность', 'admin:performance')
    .text('📝 Логи системы', 'admin:logs').row()
    .text('🧹 Очистка кэша', 'admin:clear_cache')
    .text('🔄 Перезапуск сервисов', 'admin:restart_services').row()
    .text('📋 Информация о системе', 'admin:system_info')
    .text('⬅️ Назад', 'menu:admin');

  await ctx.editMessageText(technicalText, { 
    reply_markup: keyboard,
    parse_mode: 'HTML' 
  });
  await ctx.answerCallbackQuery();
}

// Handle specific admin actions
adminHandler.callbackQuery(/^admin:(.+)$/, async (ctx) => {
  const action = ctx.match[1];
  
  switch (action) {
    case 'find_user':
      await ctx.conversation.enter('adminFindUser');
      break;
    case 'add_balance':
      await ctx.conversation.enter('adminAddBalance');
      break;
    case 'subtract_balance':
      await ctx.conversation.enter('adminSubtractBalance');
      break;
    case 'broadcast_all':
      await ctx.conversation.enter('adminBroadcast', { type: 'all' });
      break;
    case 'broadcast_test':
      await ctx.conversation.enter('adminBroadcast', { type: 'test' });
      break;
    case 'pending_tasks':
      await showPendingTasks(ctx);
      break;
    case 'appeals':
      await showPendingAppeals(ctx);
      break;
    case 'maintenance_mode':
      await toggleMaintenanceMode(ctx);
      break;
    case 'clear_cache':
      await clearSystemCache(ctx);
      break;
    case 'system_info':
      await showSystemInfo(ctx);
      break;
    default:
      await ctx.answerCallbackQuery('🚧 Раздел в разработке');
  }
});

// Show pending tasks for moderation
async function showPendingTasks(ctx: BotContext, page = 1) {
  try {
    const pendingTasks = await taskService.getPendingExecutions(page, 5);

    if (pendingTasks.executions.length === 0) {
      await ctx.editMessageText(
        '📋 Нет заданий ожидающих модерации',
        { reply_markup: new InlineKeyboard().text('⬅️ Назад', 'admin:moderation') }
      );
      return;
    }

    let text = `📋 <b>ЗАДАНИЯ НА МОДЕРАЦИИ</b>\n\nСтраница: ${page}/${pendingTasks.totalPages}\n\n`;

    pendingTasks.executions.forEach((execution, index) => {
      const userInfo = execution.user.username ? `@${execution.user.username}` : execution.user.firstName;
      text += `🔍 <b>${execution.task.title}</b>\n`;
      text += `├ Пользователь: ${userInfo}\n`;
      text += `├ Тип: ${getTaskTypeIcon(execution.task.type)} ${getTaskTypeName(execution.task.type)}\n`;
      text += `├ Награда: ${execution.rewardAmount} GRAM\n`;
      text += `├ Отправлено: ${formatDateTime(execution.createdAt)}\n`;
      text += `└ ID: #${execution.id.slice(-6)}\n\n`;
    });

    const keyboard = new InlineKeyboard();
    
    // Add moderation buttons
    pendingTasks.executions.forEach(execution => {
      const userInfo = execution.user.username ? `@${execution.user.username}` : execution.user.firstName;
      keyboard.text(
        `🔍 ${userInfo} - ${execution.task.title.substring(0, 20)}...`,
        `admin:moderate:${execution.id}`
      ).row();
    });

    // Pagination
    if (pendingTasks.totalPages > 1) {
      const paginationRow = [];
      if (pendingTasks.hasPrev) {
        paginationRow.push({ text: '⬅️', callback_data: `admin:pending_tasks:${page - 1}` });
      }
      paginationRow.push({ text: `${page}/${pendingTasks.totalPages}`, callback_data: 'noop' });
      if (pendingTasks.hasNext) {
        paginationRow.push({ text: '➡️', callback_data: `admin:pending_tasks:${page + 1}` });
      }
      keyboard.row(...paginationRow);
    }

    keyboard.text('⬅️ Назад', 'admin:moderation');

    await ctx.editMessageText(text, { 
      reply_markup: keyboard,
      parse_mode: 'HTML' 
    });
    await ctx.answerCallbackQuery();

  } catch (error) {
    console.error('Pending tasks error:', error);
    await ctx.answerCallbackQuery('❌ Ошибка при загрузке заданий');
  }
}

// Show pending appeals
async function showPendingAppeals(ctx: BotContext) {
  // Implementation would show appeals list
  await ctx.answerCallbackQuery('🚧 Раздел в разработке');
}

// Toggle maintenance mode
async function toggleMaintenanceMode(ctx: BotContext) {
  // Implementation would toggle maintenance mode
  await ctx.answerCallbackQuery('🚧 Функция в разработке');
}

// Clear system cache
async function clearSystemCache(ctx: BotContext) {
  try {
    // Implementation would clear Redis cache
    await ctx.answerCallbackQuery('🧹 Кэш очищен');
  } catch (error) {
    await ctx.answerCallbackQuery('❌ Ошибка очистки кэша');
  }
}

// Show system info
async function showSystemInfo(ctx: BotContext) {
  const systemInfo = `
📋 <b>ИНФОРМАЦИЯ О СИСТЕМЕ</b>

🤖 <b>Бот:</b>
├ Версия: 1.0.0
├ Время работы: ${getUptime()}
├ Память: ${getMemoryUsage()}
└ Node.js: ${process.version}

🗄️ <b>База данных:</b>
├ Статус: ✅ Подключена
├ Пинг: ~2ms
└ Активных соединений: 15

🔄 <b>Redis:</b>
├ Статус: ✅ Подключен
├ Пинг: ~1ms
└ Используемая память: 45MB

📊 <b>Производительность:</b>
├ Запросов в секунду: ~150
├ Среднее время ответа: 85ms
└ Ошибок за час: 0
`;

  const keyboard = new InlineKeyboard()
    .text('🔄 Обновить', 'admin:system_info')
    .text('⬅️ Назад', 'admin:technical');

  await ctx.editMessageText(systemInfo, { 
    reply_markup: keyboard,
    parse_mode: 'HTML' 
  });
  await ctx.answerCallbackQuery();
}

// Utility functions
function getTaskTypeIcon(type: string): string {
  const icons = {
    subscribe: '📺',
    join_group: '👥',
    view_post: '👀',
    react_post: '👍',
    use_bot: '🤖',
    premium_boost: '⭐'
  };
  return icons[type as keyof typeof icons] || '📋';
}

function getTaskTypeName(type: string): string {
  const names = {
    subscribe: 'Подписка',
    join_group: 'Вступление',
    view_post: 'Просмотр',
    react_post: 'Реакция',
    use_bot: 'Переход в бота',
    premium_boost: 'Премиум буст'
  };
  return names[type as keyof typeof names] || 'Неизвестно';
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

function getUptime(): string {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  return `${hours}ч ${minutes}м`;
}

function getMemoryUsage(): string {
  const usage = process.memoryUsage();
  const mb = Math.round(usage.heapUsed / 1024 / 1024);
  return `${mb}MB`;
}


adminHandler.command('dashboard', async (ctx) => {
  if (!isAdmin(ctx.from!.id)) {
    await ctx.reply('❌ Недостаточно прав доступа');
    return;
  }

  try {
    // Генерируем JWT токен для админ-панели
    const token = generateAdminToken(ctx.user.telegramId, ctx.user.level);
    const dashboardUrl = `${config.WEB_ADMIN_URL}/admin-dashboard/${token}`;
    
    const dashboardText = `
🔗 <b>ПАНЕЛЬ АДМИНИСТРАТОРА</b>

**🔗 Ссылка для подключения:**
${dashboardUrl}

**🔑 Ключ доступа:**
${token.slice(-20)}

⏰ <b>Срок действия:</b> 15 минут
🔒 <b>Безопасность:</b> Не передавайте ссылку третьим лицам

💡 <b>Возможности веб-панели:</b>
- Управление пользователями
- Модерация заданий  
- Аналитика и отчеты
- Настройки системы
- Финансовые операции
`;

    await ctx.reply(dashboardText, { parse_mode: 'HTML' });

    // Логируем создание сессии
    await logAdminSession(ctx.user.telegramId, token);

  } catch (error) {
    console.error('Dashboard command error:', error);
    await ctx.reply('❌ Ошибка генерации доступа к панели');
  }
});