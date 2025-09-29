import { createConversation } from '@grammyjs/conversations';
import { InlineKeyboard } from 'grammy';
import { adminService } from '../services/adminService';
import { withdrawalService } from '../services/withdrawalService';
import { broadcastService } from '../services/broadcastService';
import { UserLevel } from '@pr-gram/database';
import type { BotContext } from '../types/context';

// Поиск пользователя
export const searchUserConversation = createConversation('searchUser', async (conversation, ctx: BotContext) => {
  await ctx.reply('🔍 Введите Telegram ID или username пользователя:');
  
  const response = await conversation.waitFor(':text');
  const searchQuery = response.message?.text?.trim();
  
  if (!searchQuery) {
    await ctx.reply('❌ Поиск отменен');
    return;
  }
  
  try {
    let userId: number;
    
    if (searchQuery.startsWith('@')) {
      // Поиск по username
      const username = searchQuery.slice(1);
      const user = await adminService.findUserByUsername(username);
      if (!user) {
        await ctx.reply('❌ Пользователь не найден');
        return;
      }
      userId = user.telegramId;
    } else if (!isNaN(Number(searchQuery))) {
      // Поиск по ID
      userId = Number(searchQuery);
    } else {
      await ctx.reply('❌ Неверный формат. Введите ID или @username');
      return;
    }
    
    const user = await adminService.getUserInfo(userId);
    if (!user) {
      await ctx.reply('❌ Пользователь не найден');
      return;
    }
    
    const userText = `
👤 <b>ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ</b>

🆔 <b>ID:</b> ${user.telegramId}
👤 <b>Имя:</b> ${user.firstName || 'Не указано'}
📱 <b>Username:</b> ${user.username ? '@' + user.username : 'Не указан'}
🏆 <b>Уровень:</b> ${getLevelEmoji(user.level)} ${user.level}
💰 <b>Баланс:</b> ${user.balance} GRAM
💎 <b>Заморожено:</b> ${user.frozenBalance} GRAM
📅 <b>Регистрация:</b> ${formatDate(user.createdAt)}
📊 <b>Статус:</b> ${user.metadata?.banned ? '🚫 Заблокирован' : '✅ Активен'}

📈 <b>Статистика:</b>
├ Выполнено заданий: ${user.tasksCompleted}
├ Создано заданий: ${user.tasksCreated}
├ Всего заработал: ${user.totalEarned} GRAM
└ Всего потратил: ${user.totalSpent} GRAM
`;

    const keyboard = new InlineKeyboard()
      .text('💰 Изменить баланс', `admin:change_balance:${userId}`)
      .text('🚫 Заблокировать', `admin:ban_user:${userId}`).row()
      .text('📊 Подробная статистика', `admin:user_stats:${userId}`)
      .text('📝 История', `admin:user_history:${userId}`).row()
      .text('🏠 Админ меню', 'admin:main');
    
    await ctx.reply(userText, { 
      reply_markup: keyboard,
      parse_mode: 'HTML' 
    });
    
  } catch (error) {
    console.error('Search user error:', error);
    await ctx.reply('❌ Ошибка при поиске пользователя');
  }
});

// Изменение баланса пользователя
export const changeUserBalanceConversation = createConversation('changeUserBalance', async (conversation, ctx: BotContext) => {
  await ctx.reply('💰 Введите Telegram ID пользователя:');
  
  const userResponse = await conversation.waitFor(':text');
  const userIdText = userResponse.message?.text?.trim();
  
  if (!userIdText || isNaN(Number(userIdText))) {
    await ctx.reply('❌ Неверный ID пользователя');
    return;
  }
  
  const userId = Number(userIdText);
  
  await ctx.reply('💰 Введите сумму изменения баланса (с + для пополнения, - для списания):');
  
  const amountResponse = await conversation.waitFor(':text');
  const amountText = amountResponse.message?.text?.trim();
  
  if (!amountText) {
    await ctx.reply('❌ Сумма не указана');
    return;
  }
  
  const amount = parseFloat(amountText);
  if (isNaN(amount)) {
    await ctx.reply('❌ Неверная сумма');
    return;
  }
  
  await ctx.reply('📝 Введите причину изменения баланса:');
  
  const reasonResponse = await conversation.waitFor(':text');
  const reason = reasonResponse.message?.text?.trim();
  
  if (!reason) {
    await ctx.reply('❌ Причина не указана');
    return;
  }
  
  try {
    const result = await adminService.updateUserBalance(
      userId,
      amount,
      reason,
      ctx.user.telegramId
    );
    
    const operationType = amount > 0 ? 'пополнен' : 'списан';
    await ctx.reply(
      `✅ Баланс пользователя ${operationType} на ${Math.abs(amount)} GRAM\n\n` +
      `💰 Новый баланс: ${result.newBalance} GRAM\n` +
      `📝 Причина: ${reason}`
    );
    
  } catch (error) {
    console.error('Change balance error:', error);
    await ctx.reply(`❌ Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
  }
});

// Блокировка пользователя
export const banUserConversation = createConversation('banUser', async (conversation, ctx: BotContext) => {
  await ctx.reply('🚫 Введите Telegram ID пользователя для блокировки:');
  
  const userResponse = await conversation.waitFor(':text');
  const userIdText = userResponse.message?.text?.trim();
  
  if (!userIdText || isNaN(Number(userIdText))) {
    await ctx.reply('❌ Неверный ID пользователя');
    return;
  }
  
  const userId = Number(userIdText);
  
  await ctx.reply('📝 Введите причину блокировки:');
  
  const reasonResponse = await conversation.waitFor(':text');
  const reason = reasonResponse.message?.text?.trim();
  
  if (!reason) {
    await ctx.reply('❌ Причина не указана');
    return;
  }
  
  await ctx.reply('⏰ Введите длительность блокировки в часах (или 0 для перманентной блокировки):');
  
  const durationResponse = await conversation.waitFor(':text');
  const durationText = durationResponse.message?.text?.trim();
  
  let duration: number | undefined;
  if (durationText && durationText !== '0') {
    duration = parseFloat(durationText);
    if (isNaN(duration) || duration < 0) {
      await ctx.reply('❌ Неверная длительность');
      return;
    }
  }
  
  try {
    await adminService.banUser(userId, reason, ctx.user.telegramId, duration);
    
    const durationText = duration 
      ? `на ${duration} часов` 
      : 'навсегда';
    
    await ctx.reply(
      `✅ Пользователь заблокирован ${durationText}\n\n` +
      `👤 ID: ${userId}\n` +
      `📝 Причина: ${reason}`
    );
    
  } catch (error) {
    console.error('Ban user error:', error);
    await ctx.reply(`❌ Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
  }
});

// Создание рассылки
export const createBroadcastConversation = createConversation('createBroadcast', async (conversation, ctx: BotContext) => {
  let broadcastData: any = {};
  
  // Выбор аудитории
  await ctx.reply(
    '👥 Выберите аудиторию для рассылки:',
    {
      reply_markup: new InlineKeyboard()
        .text('🌍 Всем пользователям', 'broadcast:all')
        .text('🥉 Bronze', 'broadcast:bronze').row()
        .text('🥈 Silver', 'broadcast:silver')
        .text('🥇 Gold', 'broadcast:gold').row()
        .text('💎 Premium', 'broadcast:premium')
        .text('⚙️ Настроить фильтры', 'broadcast:custom').row()
        .text('❌ Отмена', 'broadcast:cancel')
    }
  );
  
  const audienceResponse = await conversation.waitForCallbackQuery();
  const audienceData = audienceResponse.callbackQuery.data;
  
  if (audienceData === 'broadcast:cancel') {
    await audienceResponse.answerCallbackQuery('❌ Рассылка отменена');
    return;
  }
  
  // Настройка фильтров
  if (audienceData === 'broadcast:all') {
    broadcastData.filters = {};
  } else if (audienceData === 'broadcast:custom') {
    // Здесь можно добавить дополнительные фильтры
    broadcastData.filters = {};
  } else {
    const level = audienceData.replace('broadcast:', '') as UserLevel;
    broadcastData.filters = { levels: [level] };
  }
  
  await audienceResponse.answerCallbackQuery();
  
  // Ввод текста сообщения
  await ctx.editMessageText('📝 Введите текст сообщения для рассылки:');
  
  const messageResponse = await conversation.waitFor(':text');
  const messageText = messageResponse.message?.text;
  
  if (!messageText) {
    await ctx.reply('❌ Текст сообщения не указан');
    return;
  }
  
  broadcastData.message = {
    text: messageText,
    parseMode: 'HTML'
  };
  
  // Предварительный просмотр
  const targetUsers = await broadcastService.getUsersForBroadcast(broadcastData.filters);
  
  await ctx.reply(
    `📋 <b>ПРЕДВАРИТЕЛЬНЫЙ ПРОСМОТР РАССЫЛКИ</b>\n\n` +
    `👥 <b>Получателей:</b> ${targetUsers.length}\n` +
    `📨 <b>Сообщение:</b>\n${messageText}\n\n` +
    `Подтвердите отправку:`,
    {
      reply_markup: new InlineKeyboard()
        .text('✅ Отправить', 'broadcast:confirm')
        .text('🧪 Тест мне', 'broadcast:test')
        .text('❌ Отмена', 'broadcast:cancel'),
      parse_mode: 'HTML'
    }
  );
  
  const confirmResponse = await conversation.waitForCallbackQuery();
  const confirmData = confirmResponse.callbackQuery.data;
  
  if (confirmData === 'broadcast:cancel') {
    await confirmResponse.answerCallbackQuery('❌ Рассылка отменена');
    return;
  }
  
  if (confirmData === 'broadcast:test') {
    // Тестовая отправка
    await confirmResponse.answerCallbackQuery('🧪 Отправляю тест...');
    
    try {
      await broadcastService.sendTestMessage(
        broadcastData.message,
        [ctx.user.telegramId]
      );
      await ctx.reply('✅ Тестовое сообщение отправлено!');
    } catch (error) {
      await ctx.reply('❌ Ошибка при отправке теста');
    }
    return;
  }
  
  if (confirmData === 'broadcast:confirm') {
    await confirmResponse.answerCallbackQuery('📤 Запускаю рассылку...');
    
    try {
      const result = await broadcastService.sendBroadcast(
        broadcastData.message,
        broadcastData.filters,
        ctx.user.telegramId
      );
      
      await ctx.editMessageText(
        `✅ <b>РАССЫЛКА ЗАПУЩЕНА</b>\n\n` +
        `📊 <b>Статистика:</b>\n` +
        `├ Всего пользователей: ${result.totalUsers}\n` +
        `├ Отправлено: ${result.sentCount}\n` +
        `├ Ошибки: ${result.failedCount}\n` +
        `└ Заблокировавших бота: ${result.blockedCount}\n\n` +
        `🆔 ID рассылки: ${result.id}`,
        { parse_mode: 'HTML' }
      );
      
    } catch (error) {
      console.error('Broadcast error:', error);
      await ctx.reply(`❌ Ошибка при запуске рассылки: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    }
  }
});

// Обработка заявок на вывод
export const processWithdrawalConversation = createConversation('processWithdrawal', async (conversation, ctx: BotContext) => {
  const callbackData = ctx.callbackQuery?.data;
  if (!callbackData) return;
  
  const [, action, requestId] = callbackData.split(':');
  
  if (action === 'approve') {
    await ctx.reply('💬 Введите комментарий для одобрения (необязательно):');
    
    const commentResponse = await conversation.waitFor(':text');
    const comment = commentResponse.message?.text?.trim();
    
    try {
      await withdrawalService.approveWithdrawal(requestId, ctx.user.telegramId, comment);
      await ctx.reply('✅ Заявка на вывод одобрена');
    } catch (error) {
      await ctx.reply(`❌ Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    }
  } else if (action === 'reject') {
    await ctx.reply('📝 Введите причину отклонения:');
    
    const reasonResponse = await conversation.waitFor(':text');
    const reason = reasonResponse.message?.text?.trim();
    
    if (!reason) {
      await ctx.reply('❌ Причина не указана');
      return;
    }
    
    try {
      await withdrawalService.rejectWithdrawal(requestId, ctx.user.telegramId, reason);
      await ctx.reply('✅ Заявка на вывод отклонена');
    } catch (error) {
      await ctx.reply(`❌ Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    }
  }
});

// Утилиты
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