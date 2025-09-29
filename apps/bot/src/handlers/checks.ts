import { Composer, InlineKeyboard } from 'grammy';
import { checkService } from '../services/checkService';
import { BOT_CONSTANTS } from '../config';
import type { BotContext } from '../types/context';

export const checkHandler = new Composer<BotContext>();

// Show checks menu
checkHandler.callbackQuery('menu:checks', async (ctx) => {
  const balance = ctx.user.balance;
  
  const checksText = `
💳 <b>СИСТЕМА ЧЕКОВ</b>

Отправляйте GRAM монеты через специальные чеки прямо в сообщениях Telegram.

💰 <b>Ваш баланс:</b> ${balance} GRAM

💡 <b>Типы чеков:</b>
`;

  const keyboard = new InlineKeyboard()
    .text('👤 Персональный чек\nДля одного получателя', 'checks:create:personal').row()
    .text('👥 Мульти-чек\nДля нескольких человек', 'checks:create:multi').row()
    .text('🎁 Подарочный чек\nС красивым оформлением', 'checks:create:gift').row()
    .text('🔐 Защищенный чек\nС паролем', 'checks:create:protected').row()
    .text('📊 Мои чеки', 'checks:my_checks')
    .text('📈 Статистика', 'checks:statistics')
    .text('🏠 Главное меню', 'menu:main');

  await ctx.editMessageText(checksText, { 
    reply_markup: keyboard,
    parse_mode: 'HTML' 
  });
  await ctx.answerCallbackQuery();
});

// Create check handlers
checkHandler.callbackQuery(/^checks:create:(.+)$/, async (ctx) => {
  const checkType = ctx.match[1];
  
  // Validate check type
  const validTypes = ['personal', 'multi', 'gift', 'protected'];
  if (!validTypes.includes(checkType)) {
    await ctx.answerCallbackQuery('❌ Неверный тип чека');
    return;
  }

  // Start check creation conversation
  ctx.session.checkData = { type: checkType };
  await ctx.conversation.enter('createCheck');
});

// Show user's checks
checkHandler.callbackQuery('checks:my_checks', async (ctx) => {
  await showMyChecks(ctx);
});

// Show user's checks
async function showMyChecks(ctx: BotContext, page = 1) {
  try {
    const checks = await checkService.getUserChecks(ctx.user.telegramId, page, 10);

    if (checks.checks.length === 0) {
      await ctx.editMessageText(
        '📊 У вас пока нет созданных чеков.\n\nИспользуйте кнопки меню для создания первого чека.',
        { reply_markup: new InlineKeyboard().text('⬅️ Назад', 'menu:checks') }
      );
      return;
    }

    let text = `📊 <b>МОИ ЧЕКИ</b>\n\nВсего: ${checks.total} | Страница: ${page}/${checks.totalPages}\n\n`;
    
    checks.checks.forEach((check, index) => {
      const statusEmoji = check.isActive ? '🟢' : '🔴';
      const typeEmoji = getCheckTypeEmoji(check.design?.emoji || '💰');
      
      text += `${statusEmoji} ${typeEmoji} <b>${check.comment || 'Чек без комментария'}</b>\n`;
      text += `├ Сумма: ${check.amount} GRAM\n`;
      text += `├ Активации: ${check.currentActivations}/${check.maxActivations}\n`;
      text += `├ Создан: ${formatDate(check.createdAt)}\n`;
      if (check.expiresAt) {
        text += `├ Истекает: ${formatDate(check.expiresAt)}\n`;
      }
      text += `└ ID: #${check.id.slice(-6)}\n\n`;
    });

    const keyboard = new InlineKeyboard();
    
    // Add check management buttons
    checks.checks.forEach((check, index) => {
      const statusIcon = check.isActive ? '🟢' : '🔴';
      const title = check.comment || `Чек #${check.id.slice(-6)}`;
      keyboard.text(
        `${statusIcon} ${title.substring(0, 25)}${title.length > 25 ? '...' : ''}`,
        `check:manage:${check.id}`
      ).row();
    });

    // Pagination
    if (checks.totalPages > 1) {
      const paginationRow = [];
      if (checks.hasPrev) {
        paginationRow.push({ text: '⬅️', callback_data: `checks:my_checks:${page - 1}` });
      }
      paginationRow.push({ text: `${page}/${checks.totalPages}`, callback_data: 'noop' });
      if (checks.hasNext) {
        paginationRow.push({ text: '➡️', callback_data: `checks:my_checks:${page + 1}` });
      }
      keyboard.row(...paginationRow);
    }

    keyboard.text('➕ Создать чек', 'menu:checks')
      .text('🏠 Главное меню', 'menu:main');

    await ctx.editMessageText(text, { 
      reply_markup: keyboard,
      parse_mode: 'HTML' 
    });
    await ctx.answerCallbackQuery();

  } catch (error) {
    console.error('Show my checks error:', error);
    await ctx.answerCallbackQuery('❌ Ошибка при загрузке чеков');
  }
}

// Pagination for my checks
checkHandler.callbackQuery(/^checks:my_checks:(\d+)$/, async (ctx) => {
  const page = parseInt(ctx.match[1]);
  await showMyChecks(ctx, page);
});

// Check management
checkHandler.callbackQuery(/^check:manage:(.+)$/, async (ctx) => {
  const checkId = ctx.match[1];
  await showCheckManagement(ctx, checkId);
});

// Show check management interface
async function showCheckManagement(ctx: BotContext, checkId: string) {
  try {
    const check = await checkService.getCheckDetails(checkId);
    
    if (check.createdBy !== ctx.user.telegramId) {
      await ctx.answerCallbackQuery('❌ Это не ваш чек');
      return;
    }

    const statusEmoji = check.isActive ? '🟢' : '🔴';
    const typeEmoji = getCheckTypeEmoji(check.design?.emoji || '💰');
    
    let text = `${statusEmoji} <b>УПРАВЛЕНИЕ ЧЕКОМ</b>\n\n`;
    text += `${typeEmoji} <b>${check.comment || 'Чек без комментария'}</b>\n\n`;
    
    text += `📋 <b>Информация:</b>\n`;
    text += `├ Сумма: ${check.amount} GRAM\n`;
    text += `├ Активации: ${check.currentActivations}/${check.maxActivations}\n`;
    text += `├ Оставшиеся: ${check.maxActivations - check.currentActivations}\n`;
    text += `├ Статус: ${check.isActive ? 'Активен' : 'Неактивен'}\n`;
    text += `├ Защищен паролем: ${check.password ? 'Да' : 'Нет'}\n`;
    text += `├ Создан: ${formatDate(check.createdAt)}\n`;
    if (check.expiresAt) {
      text += `├ Истекает: ${formatDate(check.expiresAt)}\n`;
    }
    text += `└ ID: #${check.id.slice(-6)}\n\n`;

    if (check.activations && check.activations.length > 0) {
      text += `👥 <b>Последние активации:</b>\n`;
      check.activations.slice(0, 3).forEach((activation, index) => {
        const userInfo = activation.user?.username ? `@${activation.user.username}` : activation.user?.firstName || 'Пользователь';
        text += `├ ${userInfo}: ${activation.amount} GRAM\n`;
      });
      if (check.activations.length > 3) {
        text += `└ ...и еще ${check.activations.length - 3}\n\n`;
      } else {
        text += '\n';
      }
    }

    const keyboard = new InlineKeyboard()
      .text('📊 Статистика', `check:stats:${checkId}`)
      .text('👥 Активации', `check:activations:${checkId}`).row();

    if (check.isActive && check.currentActivations < check.maxActivations) {
      keyboard.text('📤 Поделиться', `check:share:${checkId}`)
        .text('⏸️ Приостановить', `check:pause:${checkId}`).row();
    } else if (!check.isActive) {
      keyboard.text('▶️ Активировать', `check:activate:${checkId}`);
    }

    if (check.currentActivations === 0) {
      keyboard.text('❌ Удалить', `check:delete:${checkId}`).row();
    }

    keyboard.text('⬅️ К моим чекам', 'checks:my_checks:1');

    await ctx.editMessageText(text, { 
      reply_markup: keyboard,
      parse_mode: 'HTML' 
    });
    await ctx.answerCallbackQuery();

  } catch (error) {
    console.error('Check management error:', error);
    await ctx.answerCallbackQuery(`❌ ${error instanceof Error ? error.message : 'Ошибка'}`);
  }
}

// Check statistics
checkHandler.callbackQuery(/^check:stats:(.+)$/, async (ctx) => {
  const checkId = ctx.match[1];
  
  try {
    const check = await checkService.getCheckDetails(checkId);
    const stats = await checkService.getCheckStatistics(checkId);
    
    if (check.createdBy !== ctx.user.telegramId) {
      await ctx.answerCallbackQuery('❌ Это не ваш чек');
      return;
    }

    const typeEmoji = getCheckTypeEmoji(check.design?.emoji || '💰');
    
    let text = `📊 <b>СТАТИСТИКА ЧЕКА</b>\n\n`;
    text += `${typeEmoji} <b>${check.comment || 'Чек без комментария'}</b>\n\n`;
    
    text += `📈 <b>Основные метрики:</b>\n`;
    text += `├ Всего активаций: ${check.currentActivations}/${check.maxActivations}\n`;
    text += `├ Выдано GRAM: ${check.currentActivations * check.amount}\n`;
    text += `├ Оставшаяся сумма: ${(check.maxActivations - check.currentActivations) * check.amount}\n`;
    text += `├ Процент использования: ${Math.round((check.currentActivations / check.maxActivations) * 100)}%\n`;
    
    if (stats) {
      text += `├ Просмотры: ${stats.views || 0}\n`;
      text += `├ Клики: ${stats.clicks || 0}\n`;
      if (stats.views > 0) {
        text += `├ CTR: ${Math.round((stats.clicks / stats.views) * 100)}%\n`;
      }
      if (stats.clicks > 0) {
        text += `├ Конверсия: ${Math.round((check.currentActivations / stats.clicks) * 100)}%\n`;
      }
    }
    
    text += `└ Среднее время активации: ${stats?.averageActivationTime || 0} сек\n\n`;

    if (stats?.topCountries && stats.topCountries.length > 0) {
      text += `🌍 <b>Топ стран:</b>\n`;
      stats.topCountries.slice(0, 3).forEach((country, index) => {
        text += `├ ${country.country}: ${country.activations} (${country.percentage}%)\n`;
      });
      text += '\n';
    }

    const keyboard = new InlineKeyboard()
      .text('👥 Посмотреть активации', `check:activations:${checkId}`)
      .text('⬅️ Назад', `check:manage:${checkId}`);

    await ctx.editMessageText(text, { 
      reply_markup: keyboard,
      parse_mode: 'HTML' 
    });
    await ctx.answerCallbackQuery();

  } catch (error) {
    console.error('Check stats error:', error);
    await ctx.answerCallbackQuery('❌ Ошибка при загрузке статистики');
  }
});

// Check activations
checkHandler.callbackQuery(/^check:activations:(.+)$/, async (ctx) => {
  const checkId = ctx.match[1];
  await showCheckActivations(ctx, checkId, 1);
});

// Show check activations with pagination
async function showCheckActivations(ctx: BotContext, checkId: string, page = 1) {
  try {
    const check = await checkService.getCheckDetails(checkId);
    
    if (check.createdBy !== ctx.user.telegramId) {
      await ctx.answerCallbackQuery('❌ Это не ваш чек');
      return;
    }

    const activations = await checkService.getCheckActivations(checkId, page, 10);

    if (activations.activations.length === 0) {
      await ctx.editMessageText(
        '👥 Пока нет активаций для этого чека',
        { reply_markup: new InlineKeyboard().text('⬅️ Назад', `check:manage:${checkId}`) }
      );
      return;
    }

    const typeEmoji = getCheckTypeEmoji(check.design?.emoji || '💰');
    
    let text = `👥 <b>АКТИВАЦИИ ЧЕКА</b>\n\n`;
    text += `${typeEmoji} <b>${check.comment || 'Чек без комментария'}</b>\n`;
    text += `Страница: ${page}/${activations.totalPages}\n\n`;

    activations.activations.forEach((activation, index) => {
      const userInfo = activation.user?.username ? `@${activation.user.username}` : activation.user?.firstName || 'Пользователь';
      const location = activation.location?.country ? ` (${activation.location.country})` : '';
      
      text += `💰 <b>${userInfo}</b>${location}\n`;
      text += `├ Сумма: ${activation.amount} GRAM\n`;
      text += `├ Дата: ${formatDateTime(activation.activatedAt)}\n`;
      if (activation.ipAddress) {
        text += `└ IP: ${activation.ipAddress.substring(0, 10)}...\n\n`;
      } else {
        text += '\n';
      }
    });

    const keyboard = new InlineKeyboard();

    // Pagination
    if (activations.totalPages > 1) {
      const paginationRow = [];
      if (activations.hasPrev) {
        paginationRow.push({ text: '⬅️', callback_data: `check:activations:${checkId}:${page - 1}` });
      }
      paginationRow.push({ text: `${page}/${activations.totalPages}`, callback_data: 'noop' });
      if (activations.hasNext) {
        paginationRow.push({ text: '➡️', callback_data: `check:activations:${checkId}:${page + 1}` });
      }
      keyboard.row(...paginationRow);
    }

    keyboard.text('📊 Статистика', `check:stats:${checkId}`)
      .text('⬅️ Назад', `check:manage:${checkId}`);

    await ctx.editMessageText(text, { 
      reply_markup: keyboard,
      parse_mode: 'HTML' 
    });
    await ctx.answerCallbackQuery();

  } catch (error) {
    console.error('Check activations error:', error);
    await ctx.answerCallbackQuery('❌ Ошибка при загрузке активаций');
  }
}

// Activations pagination
checkHandler.callbackQuery(/^check:activations:(.+):(\d+)$/, async (ctx) => {
  const checkId = ctx.match[1];
  const page = parseInt(ctx.match[2]);
  await showCheckActivations(ctx, checkId, page);
});

// Check actions
checkHandler.callbackQuery(/^check:(share|pause|activate|delete):(.+)$/, async (ctx) => {
  const action = ctx.match[1];
  const checkId = ctx.match[2];
  
  try {
    const check = await checkService.getCheckDetails(checkId);
    
    if (check.createdBy !== ctx.user.telegramId) {
      await ctx.answerCallbackQuery('❌ Это не ваш чек');
      return;
    }

    switch (action) {
      case 'share':
        await shareCheck(ctx, check);
        return;
      case 'pause':
        await checkService.updateCheck(checkId, { isActive: false });
        await ctx.answerCallbackQuery('⏸️ Чек приостановлен');
        break;
      case 'activate':
        await checkService.updateCheck(checkId, { isActive: true });
        await ctx.answerCallbackQuery('▶️ Чек активирован');
        break;
      case 'delete':
        // Confirm deletion
        const confirmKeyboard = new InlineKeyboard()
          .text('✅ Да, удалить', `check:confirm_delete:${checkId}`)
          .text('❌ Нет, оставить', `check:manage:${checkId}`);
        
        await ctx.editMessageText(
          '⚠️ <b>ПОДТВЕРЖДЕНИЕ УДАЛЕНИЯ</b>\n\nВы уверены, что хотите удалить чек?\n\n' +
          '• Действие необратимо\n' +
          '• Неиспользованные средства не возвращаются',
          { 
            reply_markup: confirmKeyboard,
            parse_mode: 'HTML'
          }
        );
        return;
    }

    // Refresh check management view
    await showCheckManagement(ctx, checkId);

  } catch (error) {
    console.error('Check action error:', error);
    await ctx.answerCallbackQuery(`❌ ${error instanceof Error ? error.message : 'Ошибка'}`);
  }
});

// Share check
async function shareCheck(ctx: BotContext, check: any) {
  const typeEmoji = getCheckTypeEmoji(check.design?.emoji || '💰');
  const checkUrl = `https://t.me/prgram_bot?start=check_${check.id}`;
  
  let shareText = `${typeEmoji} <b>ПОДЕЛИТЬСЯ ЧЕКОМ</b>\n\n`;
  shareText += `💰 <b>Сумма:</b> ${check.amount} GRAM\n`;
  shareText += `👥 <b>Активаций:</b> ${check.currentActivations}/${check.maxActivations}\n`;
  if (check.comment) {
    shareText += `💬 <b>Комментарий:</b> ${check.comment}\n`;
  }
  shareText += `\n🔗 <b>Ссылка для активации:</b>\n<code>${checkUrl}</code>\n\n`;
  shareText += `📤 <b>Готовое сообщение для отправки:</b>\n\n`;
  
  const readyMessage = `${typeEmoji} ${check.comment || 'Чек на получение GRAM'}\n\n` +
    `💰 Сумма: ${check.amount} GRAM\n` +
    `👥 Доступно активаций: ${check.maxActivations - check.currentActivations}\n\n` +
    `🎁 Получить: ${checkUrl}`;
  
  shareText += `<code>${readyMessage}</code>`;

  const keyboard = new InlineKeyboard()
    .url('📤 Отправить в чат', `https://t.me/share/url?url=${encodeURIComponent(checkUrl)}&text=${encodeURIComponent(readyMessage)}`)
    .text('📋 Скопировать ссылку', `copy:${checkUrl}`).row()
    .text('⬅️ Назад', `check:manage:${check.id}`);

  await ctx.editMessageText(shareText, { 
    reply_markup: keyboard,
    parse_mode: 'HTML' 
  });
  await ctx.answerCallbackQuery('📤 Готово к отправке');
}

// Confirm check deletion
checkHandler.callbackQuery(/^check:confirm_delete:(.+)$/, async (ctx) => {
  const checkId = ctx.match[1];
  
  try {
    await checkService.deleteCheck(checkId, ctx.user.telegramId);

    await ctx.editMessageText(
      `✅ <b>ЧЕК УДАЛЕН</b>\n\n` +
      `Чек #${checkId.slice(-6)} успешно удален.\n\n` +
      `💡 Неиспользованные средства остаются заблокированными согласно правилам платформы.`,
      { 
        reply_markup: new InlineKeyboard().text('📊 Мои чеки', 'checks:my_checks:1'),
        parse_mode: 'HTML'
      }
    );
    
    await ctx.answerCallbackQuery('✅ Чек удален');

  } catch (error) {
    console.error('Check deletion error:', error);
    await ctx.answerCallbackQuery(`❌ ${error instanceof Error ? error.message : 'Ошибка'}`);
  }
});

// Show check statistics
checkHandler.callbackQuery('checks:statistics', async (ctx) => {
  await showCheckStatistics(ctx);
});

// Show user's check statistics
async function showCheckStatistics(ctx: BotContext) {
  try {
    const userStats = await checkService.getUserCheckStatistics(ctx.user.telegramId);
    
    let text = `📈 <b>СТАТИСТИКА ЧЕКОВ</b>\n\n`;
    
    text += `📊 <b>Общие показатели:</b>\n`;
    text += `├ Всего создано чеков: ${userStats.totalChecks}\n`;
    text += `├ Активных чеков: ${userStats.activeChecks}\n`;
    text += `├ Общая сумма: ${userStats.totalAmount} GRAM\n`;
    text += `├ Выдано через чеки: ${userStats.totalDistributed} GRAM\n`;
    text += `├ Всего активаций: ${userStats.totalActivations}\n`;
    text += `└ Средняя сумма чека: ${Math.round(userStats.averageAmount)} GRAM\n\n`;
    
    if (userStats.popularDesigns && userStats.popularDesigns.length > 0) {
      text += `🎨 <b>Популярные дизайны:</b>\n`;
      userStats.popularDesigns.slice(0, 3).forEach((design, index) => {
        text += `├ ${design.emoji} ${design.color}: ${design.count} чеков\n`;
      });
      text += '\n';
    }
    
    if (userStats.dailyStats && userStats.dailyStats.length > 0) {
      text += `📅 <b>За последние дни:</b>\n`;
      userStats.dailyStats.slice(-3).forEach(day => {
        text += `├ ${day.date}: ${day.checksCreated} чеков, ${day.activations} активаций\n`;
      });
    }

    const keyboard = new InlineKeyboard()
      .text('📊 Мои чеки', 'checks:my_checks:1')
      .text('➕ Создать чек', 'menu:checks')
      .text('🏠 Главное меню', 'menu:main');

    await ctx.editMessageText(text, { 
      reply_markup: keyboard,
      parse_mode: 'HTML' 
    });
    await ctx.answerCallbackQuery();

  } catch (error) {
    console.error('Check statistics error:', error);
    await ctx.answerCallbackQuery('❌ Ошибка при загрузке статистики');
  }
}

// Handle check activation from start parameter
checkHandler.callbackQuery(/^activate_check:(.+)$/, async (ctx) => {
  const checkId = ctx.match[1];
  await activateCheck(ctx, checkId);
});

// Activate check
async function activateCheck(ctx: BotContext, checkId: string) {
  try {
    const check = await checkService.getCheckDetails(checkId);
    
    if (!check.isActive) {
      await ctx.answerCallbackQuery('❌ Чек неактивен');
      return;
    }

    if (check.currentActivations >= check.maxActivations) {
      await ctx.answerCallbackQuery('❌ Все активации использованы');
      return;
    }

    if (check.expiresAt && check.expiresAt < new Date()) {
      await ctx.answerCallbackQuery('❌ Срок действия чека истек');
      return;
    }

    // Check if user already activated this check
    const hasActivated = await checkService.hasUserActivatedCheck(checkId, ctx.user.telegramId);
    if (hasActivated) {
      await ctx.answerCallbackQuery('❌ Вы уже использовали этот чек');
      return;
    }

    if (check.password) {
      // Start password entry conversation
      ctx.session.checkData = { checkId, action: 'activate' };
      await ctx.conversation.enter('activateCheck');
      return;
    }

    // Activate check without password
    const result = await checkService.activateCheck(checkId, ctx.user.telegramId);
    
    if (result.success) {
      const typeEmoji = getCheckTypeEmoji(check.design?.emoji || '💰');
      
      const successText = `
🎉 <b>ЧЕК АКТИВИРОВАН!</b>

${typeEmoji} ${check.comment || 'Чек без комментария'}

💰 +${result.amount} GRAM зачислено на ваш баланс

📊 <b>Ваш баланс:</b> ${ctx.user.balance.toNumber() + result.amount} GRAM

🎁 Спасибо за использование чека!
`;

      const keyboard = new InlineKeyboard()
        .text('💰 Заработать еще', 'menu:earn')
        .text('🏠 Главное меню', 'menu:main');

      await ctx.editMessageText(successText, { 
        reply_markup: keyboard,
        parse_mode: 'HTML' 
      });
      await ctx.answerCallbackQuery('🎉 Чек активирован!');
    } else {
      await ctx.answerCallbackQuery(`❌ ${result.message}`);
    }

  } catch (error) {
    console.error('Check activation error:', error);
    await ctx.answerCallbackQuery(`❌ ${error instanceof Error ? error.message : 'Ошибка активации'}`);
  }
}

// Handle copy actions
checkHandler.callbackQuery(/^copy:(.+)$/, async (ctx) => {
  const textToCopy = ctx.match[1];
  await ctx.answerCallbackQuery(`📋 Скопируйте: ${textToCopy}`, { show_alert: true });
});

// Utility functions
function getCheckTypeEmoji(emoji: string): string {
  // Validate emoji or use default
  const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/;
  return emojiRegex.test(emoji) ? emoji : '💰';
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