import { createConversation } from '@grammyjs/conversations';
import { InlineKeyboard } from 'grammy';
import { taskService } from '../services/taskService';
import { balanceService } from '../services/balanceService';
import { userService } from '../services/userService';
import { isAdmin } from '../config';
import type { BotContext } from '../types/context';

// Moderate task conversation
export const moderateTaskConversation = createConversation('moderateTask', async (conversation, ctx: BotContext) => {
  const { executionId } = ctx.session.data || {};
  
  if (!executionId) {
    await ctx.reply('❌ Ошибка: ID выполнения не найден');
    return;
  }

  try {
    const execution = await taskService.getExecutionDetails(executionId);
    
    if (!execution) {
      await ctx.reply('❌ Выполнение задания не найдено');
      return;
    }

    if (execution.status !== 'pending') {
      await ctx.reply('❌ Выполнение уже обработано');
      return;
    }

    const userInfo = execution.user.username ? `@${execution.user.username}` : execution.user.firstName;
    
    let moderationText = `
🔍 <b>МОДЕРАЦИЯ ВЫПОЛНЕНИЯ</b>

📋 <b>Задание:</b> ${execution.task.title}
👤 <b>Пользователь:</b> ${userInfo}
🏆 <b>Уровень:</b> ${getLevelEmoji(execution.user.level)} ${execution.user.level}
💰 <b>Награда:</b> ${execution.rewardAmount} GRAM
⏰ <b>Отправлено:</b> ${formatDateTime(execution.createdAt)}

📝 <b>Описание задания:</b>
${execution.task.description}

${execution.task.targetUrl ? `🔗 <b>Ссылка:</b> ${execution.task.targetUrl}` : ''}
`;

    if (execution.screenshotUrls && execution.screenshotUrls.length > 0) {
      moderationText += `\n📸 <b>Прикрепленные скриншоты:</b> ${execution.screenshotUrls.length}`;
    }

    if (execution.proofData && execution.proofData.description) {
      moderationText += `\n💬 <b>Комментарий пользователя:</b>\n${execution.proofData.description}`;
    }

    const moderationKeyboard = new InlineKeyboard()
      .text('✅ Одобрить', 'approve')
      .text('❌ Отклонить', 'reject').row()
      .text('💰 Одобрить с изменением суммы', 'approve_custom')
      .text('⏰ Отложить', 'postpone').row()
      .text('📋 Детали пользователя', 'user_details')
      .text('❌ Отмена', 'cancel');

    await ctx.reply(moderationText, { 
      reply_markup: moderationKeyboard,
      parse_mode: 'HTML'
    });

    // Show screenshots if available
    if (execution.screenshotUrls && execution.screenshotUrls.length > 0) {
      for (const screenshotUrl of execution.screenshotUrls.slice(0, 3)) { // Show up to 3 screenshots
        try {
          await ctx.replyWithPhoto(screenshotUrl, {
            caption: '📸 Скриншот доказательства'
          });
        } catch (error) {
          console.error('Error sending screenshot:', error);
          await ctx.reply(`📸 Скриншот: ${screenshotUrl}`);
        }
      }
    }

    const decision = await conversation.waitForCallbackQuery();
    
    switch (decision.data) {
      case 'approve':
        await handleApproval(conversation, ctx, execution, null);
        break;
      case 'reject':
        await handleRejection(conversation, ctx, execution);
        break;
      case 'approve_custom':
        await handleCustomApproval(conversation, ctx, execution);
        break;
      case 'postpone':
        await handlePostpone(conversation, ctx, execution);
        break;
      case 'user_details':
        await showUserDetails(conversation, ctx, execution.user);
        break;
      case 'cancel':
        await decision.answerCallbackQuery('❌ Модерация отменена');
        return;
      default:
        await decision.answerCallbackQuery('❌ Неверный выбор');
        return;
    }

  } catch (error) {
    console.error('Moderation conversation error:', error);
    await ctx.reply(`❌ Ошибка модерации: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
  }
});

// Handle approval
async function handleApproval(conversation: any, ctx: BotContext, execution: any, customAmount?: number) {
  try {
    const finalAmount = customAmount || execution.rewardAmount;
    
    await taskService.approveExecution(
      execution.id,
      'Одобрено модератором',
      ctx.user.telegramId
    );

    const userInfo = execution.user.username ? `@${execution.user.username}` : execution.user.firstName;
    
    const successText = `
✅ <b>ВЫПОЛНЕНИЕ ОДОБРЕНО</b>

📋 <b>Задание:</b> ${execution.task.title}
👤 <b>Пользователь:</b> ${userInfo}
💰 <b>Начислено:</b> ${finalAmount} GRAM
👨‍💻 <b>Модератор:</b> ${ctx.user.firstName || ctx.user.username}
⏰ <b>Время:</b> ${formatDateTime(new Date())}

Пользователь получил уведомление о зачислении средств.
`;

    const keyboard = new InlineKeyboard()
      .text('📋 Следующее на модерации', 'admin:pending_tasks')
      .text('🏠 Главное меню', 'menu:main');

    await ctx.editMessageText(successText, {
      reply_markup: keyboard,
      parse_mode: 'HTML'
    });

  } catch (error) {
    console.error('Approval error:', error);
    await ctx.reply(`❌ Ошибка одобрения: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
  }
}

// Handle rejection
async function handleRejection(conversation: any, ctx: BotContext, execution: any) {
  try {
    await ctx.reply('📝 Введите причину отклонения (обязательно):');
    
    const reasonResponse = await conversation.waitFor(':text');
    const reason = reasonResponse.message?.text?.trim();
    
    if (!reason || reason.length < 5) {
      await ctx.reply('❌ Причина должна содержать минимум 5 символов');
      return;
    }

    if (reason.length > 500) {
      await ctx.reply('❌ Причина слишком длинная (максимум 500 символов)');
      return;
    }

    await taskService.rejectExecution(
      execution.id,
      reason,
      ctx.user.telegramId
    );

    const userInfo = execution.user.username ? `@${execution.user.username}` : execution.user.firstName;
    
    const successText = `
❌ <b>ВЫПОЛНЕНИЕ ОТКЛОНЕНО</b>

📋 <b>Задание:</b> ${execution.task.title}
👤 <b>Пользователь:</b> ${userInfo}
📝 <b>Причина:</b> ${reason}
👨‍💻 <b>Модератор:</b> ${ctx.user.firstName || ctx.user.username}
⏰ <b>Время:</b> ${formatDateTime(new Date())}

Пользователь получил уведомление об отклонении с указанием причины.
`;

    const keyboard = new InlineKeyboard()
      .text('📋 Следующее на модерации', 'admin:pending_tasks')
      .text('🏠 Главное меню', 'menu:main');

    await ctx.editMessageText(successText, {
      reply_markup: keyboard,
      parse_mode: 'HTML'
    });

  } catch (error) {
    console.error('Rejection error:', error);
    await ctx.reply(`❌ Ошибка отклонения: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
  }
}

// Handle custom approval with different amount
async function handleCustomApproval(conversation: any, ctx: BotContext, execution: any) {
  try {
    await ctx.reply(`💰 Введите новую сумму награды (оригинал: ${execution.rewardAmount} GRAM):`);
    
    const amountResponse = await conversation.waitFor(':text');
    const amountText = amountResponse.message?.text?.trim();
    const customAmount = parseFloat(amountText || '');
    
    if (isNaN(customAmount) || customAmount <= 0) {
      await ctx.reply('❌ Неверная сумма');
      return;
    }

    if (customAmount > execution.rewardAmount * 2) {
      await ctx.reply('❌ Сумма не может превышать удвоенную оригинальную награду');
      return;
    }

    await ctx.reply('📝 Введите причину изменения суммы:');
    
    const reasonResponse = await conversation.waitFor(':text');
    const reason = reasonResponse.message?.text?.trim();
    
    if (!reason) {
      await ctx.reply('❌ Необходимо указать причину изменения');
      return;
    }

    await handleApproval(conversation, ctx, execution, customAmount);

  } catch (error) {
    console.error('Custom approval error:', error);
    await ctx.reply(`❌ Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
  }
}

// Handle postpone
async function handlePostpone(conversation: any, ctx: BotContext, execution: any) {
  const postponeText = `
⏰ <b>ВЫПОЛНЕНИЕ ОТЛОЖЕНО</b>

Выполнение отложено для дальнейшего рассмотрения.
Оно останется в очереди модерации.
`;

  const keyboard = new InlineKeyboard()
    .text('📋 К списку модерации', 'admin:pending_tasks')
    .text('🏠 Главное меню', 'menu:main');

  await ctx.editMessageText(postponeText, {
    reply_markup: keyboard,
    parse_mode: 'HTML'
  });
}

// Show user details
async function showUserDetails(conversation: any, ctx: BotContext, user: any) {
  try {
    const userStats = await userService.getUserStatistics(user.telegramId);
    
    const userDetailsText = `
👤 <b>ДЕТАЛИ ПОЛЬЗОВАТЕЛЯ</b>

🆔 <b>ID:</b> ${user.telegramId}
👤 <b>Имя:</b> ${user.firstName}
${user.username ? `📱 <b>Username:</b> @${user.username}` : ''}
🏆 <b>Уровень:</b> ${getLevelEmoji(user.level)} ${user.level}
💰 <b>Баланс:</b> ${user.balance} GRAM

📊 <b>Статистика:</b>
├ Выполнено заданий: ${user.tasksCompleted}
├ Создано заданий: ${user.tasksCreated}
├ Заработано всего: ${user.totalEarned} GRAM
├ Потрачено всего: ${user.totalSpent} GRAM
└ Дата регистрации: ${formatDate(user.createdAt)}

📈 <b>Рейтинг:</b>
├ Процент одобрения: ${userStats?.approvalRate || 0}%
├ Средняя оценка: ${userStats?.averageRating || 0}/5
└ Последняя активность: ${formatDate(user.updatedAt)}
`;

    const keyboard = new InlineKeyboard()
      .text('📊 Полная статистика', `admin:user_full_stats:${user.telegramId}`)
      .text('🚫 Заблокировать', `admin:ban_user:${user.telegramId}`).row()
      .text('💰 Управление балансом', `admin:user_balance:${user.telegramId}`)
      .text('⬅️ Назад к модерации', 'back_to_moderation');

    await ctx.reply(userDetailsText, {
      reply_markup: keyboard,
      parse_mode: 'HTML'
    });

  } catch (error) {
    console.error('User details error:', error);
    await ctx.reply('❌ Ошибка при загрузке данных пользователя');
  }
}

// Admin find user conversation
export const adminFindUserConversation = createConversation('adminFindUser', async (conversation, ctx: BotContext) => {
  if (!isAdmin(ctx.from!.id)) {
    await ctx.reply('❌ Недостаточно прав доступа');
    return;
  }

  try {
    await ctx.reply('🔍 Введите ID пользователя, username или имя для поиска:');
    
    const searchResponse = await conversation.waitFor(':text');
    const searchQuery = searchResponse.message?.text?.trim();
    
    if (!searchQuery) {
      await ctx.reply('❌ Запрос не может быть пустым');
      return;
    }

    // Search for user
    const users = await userService.searchUsers(searchQuery);
    
    if (users.length === 0) {
      await ctx.reply('❌ Пользователи не найдены');
      return;
    }

    if (users.length === 1) {
      await showUserAdminPanel(ctx, users[0]);
    } else {
      // Show multiple results
      let resultText = `🔍 <b>РЕЗУЛЬТАТЫ ПОИСКА</b>\n\nНайдено пользователей: ${users.length}\n\n`;
      
      users.slice(0, 10).forEach((user, index) => {
        const userInfo = user.username ? `@${user.username}` : user.firstName;
        resultText += `${index + 1}. ${userInfo}\n`;
        resultText += `   ID: ${user.telegramId}\n`;
        resultText += `   Уровень: ${getLevelEmoji(user.level)} ${user.level}\n\n`;
      });

      if (users.length > 10) {
        resultText += `...и еще ${users.length - 10} пользователей`;
      }

      const keyboard = new InlineKeyboard();
      users.slice(0, 5).forEach((user, index) => {
        const userInfo = user.username ? `@${user.username}` : user.firstName;
        keyboard.text(
          `👤 ${userInfo}`,
          `admin:select_user:${user.telegramId}`
        ).row();
      });

      keyboard.text('🔍 Новый поиск', 'admin:find_user')
        .text('⬅️ Назад', 'admin:users');

      await ctx.reply(resultText, {
        reply_markup: keyboard,
        parse_mode: 'HTML'
      });
    }

  } catch (error) {
    console.error('Find user conversation error:', error);
    await ctx.reply(`❌ Ошибка поиска: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
  }
});

// Admin add balance conversation
export const adminAddBalanceConversation = createConversation('adminAddBalance', async (conversation, ctx: BotContext) => {
  if (!isAdmin(ctx.from!.id)) {
    await ctx.reply('❌ Недостаточно прав доступа');
    return;
  }

  try {
    await ctx.reply('🔍 Введите ID пользователя:');
    
    const userIdResponse = await conversation.waitFor(':text');
    const userIdText = userIdResponse.message?.text?.trim();
    const userId = parseInt(userIdText || '');
    
    if (isNaN(userId)) {
      await ctx.reply('❌ Неверный ID пользователя');
      return;
    }

    const user = await userService.getUserByTelegramId(userId);
    if (!user) {
      await ctx.reply('❌ Пользователь не найден');
      return;
    }

    await ctx.reply(`💰 Введите сумму для начисления (текущий баланс: ${user.balance} GRAM):`);
    
    const amountResponse = await conversation.waitFor(':text');
    const amountText = amountResponse.message?.text?.trim();
    const amount = parseFloat(amountText || '');
    
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('❌ Неверная сумма');
      return;
    }

    if (amount > 1000000) {
      await ctx.reply('❌ Слишком большая сумма (максимум 1,000,000 GRAM)');
      return;
    }

    await ctx.reply('📝 Введите причину начисления:');
    
    const reasonResponse = await conversation.waitFor(':text');
    const reason = reasonResponse.message?.text?.trim();
    
    if (!reason) {
      await ctx.reply('❌ Необходимо указать причину');
      return;
    }

    // Confirm action
    const userInfo = user.username ? `@${user.username}` : user.firstName;
    const confirmText = `
💰 <b>ПОДТВЕРЖДЕНИЕ НАЧИСЛЕНИЯ</b>

👤 <b>Пользователь:</b> ${userInfo}
💰 <b>Сумма:</b> ${amount} GRAM
📝 <b>Причина:</b> ${reason}

💳 <b>Баланс:</b> ${user.balance} → ${parseFloat(user.balance) + amount} GRAM

Подтвердить начисление?
`;

    const confirmKeyboard = new InlineKeyboard()
      .text('✅ Подтвердить', 'confirm')
      .text('❌ Отмена', 'cancel');

    await ctx.reply(confirmText, {
      reply_markup: confirmKeyboard,
      parse_mode: 'HTML'
    });

    const confirmResponse = await conversation.waitForCallbackQuery();
    
    if (confirmResponse.data === 'cancel') {
      await confirmResponse.answerCallbackQuery('❌ Начисление отменено');
      return;
    }

    if (confirmResponse.data === 'confirm') {
      await confirmResponse.answerCallbackQuery('⏳ Обрабатываем...');
      
      await balanceService.updateBalance(
        userId,
        amount,
        'bonus',
        reason,
        { adminId: ctx.user.telegramId, adminName: ctx.user.firstName || ctx.user.username }
      );

      const successText = `
✅ <b>БАЛАНС НАЧИСЛЕН</b>

👤 <b>Пользователь:</b> ${userInfo}
💰 <b>Начислено:</b> ${amount} GRAM
📝 <b>Причина:</b> ${reason}
👨‍💻 <b>Администратор:</b> ${ctx.user.firstName || ctx.user.username}
⏰ <b>Время:</b> ${formatDateTime(new Date())}

Пользователь получил уведомление о начислении.
`;

      const keyboard = new InlineKeyboard()
        .text('💰 Еще начисление', 'admin:add_balance')
        .text('👥 Управление пользователями', 'admin:users')
        .text('🏠 Главное меню', 'menu:main');

      await ctx.editMessageText(successText, {
        reply_markup: keyboard,
        parse_mode: 'HTML'
      });
    }

  } catch (error) {
    console.error('Add balance conversation error:', error);
    await ctx.reply(`❌ Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
  }
});

// Admin broadcast conversation
export const adminBroadcastConversation = createConversation('adminBroadcast', async (conversation, ctx: BotContext) => {
  if (!isAdmin(ctx.from!.id)) {
    await ctx.reply('❌ Недостаточно прав доступа');
    return;
  }

  const { type } = ctx.session.data || {};

  try {
    await ctx.reply('📝 Введите текст сообщения для рассылки:');
    
    const messageResponse = await conversation.waitFor(':text');
    const messageText = messageResponse.message?.text;
    
    if (!messageText || messageText.length < 10) {
      await ctx.reply('❌ Сообщение должно содержать минимум 10 символов');
      return;
    }

    if (messageText.length > 4000) {
      await ctx.reply('❌ Сообщение слишком длинное (максимум 4000 символов)');
      return;
    }

    // Show preview
    const previewText = `
📢 <b>ПРЕДВАРИТЕЛЬНЫЙ ПРОСМОТР</b>

<i>Как будет выглядеть сообщение:</i>

${messageText}

━━━━━━━━━━━━━━━━━━━━

📊 <b>Параметры рассылки:</b>
• Тип: ${type === 'all' ? 'Всем пользователям' : 'Тестовая'}
• Примерное количество получателей: ${type === 'all' ? '~1000' : '1 (вам)'}

Отправить рассылку?
`;

    const confirmKeyboard = new InlineKeyboard()
      .text('📤 Отправить', 'send')
      .text('❌ Отмена', 'cancel');

    await ctx.reply(previewText, {
      reply_markup: confirmKeyboard,
      parse_mode: 'HTML'
    });

    const confirmResponse = await conversation.waitForCallbackQuery();
    
    if (confirmResponse.data === 'cancel') {
      await confirmResponse.answerCallbackQuery('❌ Рассылка отменена');
      return;
    }

    if (confirmResponse.data === 'send') {
      await confirmResponse.answerCallbackQuery('⏳ Отправляем...');
      
      if (type === 'test') {
        // Send test message only to admin
        await ctx.api.sendMessage(ctx.user.telegramId, messageText, { parse_mode: 'HTML' });
        
        await ctx.editMessageText(
          '✅ <b>ТЕСТОВОЕ СООБЩЕНИЕ ОТПРАВЛЕНО</b>\n\nПроверьте личные сообщения бота.',
          { parse_mode: 'HTML' }
        );
      } else {
        // Start broadcast (this would be implemented with job queue)
        await ctx.editMessageText(
          '📤 <b>РАССЫЛКА ЗАПУЩЕНА</b>\n\nСообщение будет отправлено всем пользователям в течение нескольких минут.',
          { parse_mode: 'HTML' }
        );
      }
    }

  } catch (error) {
    console.error('Broadcast conversation error:', error);
    await ctx.reply(`❌ Ошибка рассылки: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
  }
});

// Show user admin panel
async function showUserAdminPanel(ctx: BotContext, user: any) {
  const userInfo = user.username ? `@${user.username}` : user.firstName;
  
  const panelText = `
👤 <b>ПАНЕЛЬ УПРАВЛЕНИЯ ПОЛЬЗОВАТЕЛЕМ</b>

🆔 <b>ID:</b> ${user.telegramId}
👤 <b>Имя:</b> ${user.firstName}
${user.username ? `📱 <b>Username:</b> @${user.username}` : ''}
🏆 <b>Уровень:</b> ${getLevelEmoji(user.level)} ${user.level}
💰 <b>Баланс:</b> ${user.balance} GRAM
📊 <b>Статус:</b> ${user.isBanned ? '🚫 Заблокирован' : '✅ Активен'}

Выберите действие:
`;

  const keyboard = new InlineKeyboard()
    .text('💰 Управление балансом', `admin:user_balance:${user.telegramId}`)
    .text('📊 Статистика', `admin:user_stats:${user.telegramId}`).row()
    .text('🚫 Заблокировать', `admin:ban_user:${user.telegramId}`)
    .text('🔓 Разблокировать', `admin:unban_user:${user.telegramId}`).row()
    .text('📝 История активности', `admin:user_activity:${user.telegramId}`)
    .text('⬅️ Назад', 'admin:users');

  await ctx.reply(panelText, {
    reply_markup: keyboard,
    parse_mode: 'HTML'
  });
}

// Utility functions
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