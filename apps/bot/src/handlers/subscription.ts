import { Composer, InlineKeyboard } from 'grammy';
import { subscriptionService } from '../services/subscriptionService';
import type { BotContext } from '../types/context';

export const subscriptionHandler = new Composer<BotContext>();

// Show subscription menu
subscriptionHandler.callbackQuery('menu:subscription', async (ctx) => {
  const subscriptionText = `
✅ <b>ПРОВЕРКА ПОДПИСКИ</b>

Настройте обязательную подписку на каналы/чаты для участников вашего сообщества.

📋 <b>ИНСТРУКЦИЯ:</b>
▸ Шаг 1: Добавьте бота в ваш чат с правами администратора
▸ Шаг 2: Добавьте бота в админы канала/чата, на который хотите установить проверку  
▸ Шаг 3: Используйте соответствующие команды

💡 <b>Типы проверок:</b>
`;

  const keyboard = new InlineKeyboard()
    .text('🏛️ Публичные каналы/чаты', 'subscription:public').row()
    .text('🔒 Приватные каналы/чаты', 'subscription:private').row()
    .text('🔗 По пригласительной ссылке', 'subscription:invite').row()
    .text('🎯 Реферальная система PR GRAM', 'subscription:referral').row()
    .text('⌛ Автоудаление сообщений', 'subscription:autodelete').row()
    .text('📊 Мои проверки', 'subscription:my_checks')
    .text('🏠 Главное меню', 'menu:main');

  await ctx.editMessageText(subscriptionText, { 
    reply_markup: keyboard,
    parse_mode: 'HTML' 
  });
  await ctx.answerCallbackQuery();
});

// Public channels setup guide
subscriptionHandler.callbackQuery('subscription:public', async (ctx) => {
  const publicText = `
🏛️ <b>ПУБЛИЧНЫЕ КАНАЛЫ/ЧАТЫ</b>

Настройка проверки подписки на публичные каналы с открытыми ссылками.

📝 <b>КОМАНДЫ ДЛЯ ВАШЕГО ЧАТА:</b>

┌── ОСНОВНЫЕ ──┐
<code>/setup @channel</code> - добавить проверку подписки
<code>/unsetup @channel</code> - убрать конкретную проверку
<code>/unsetup</code> - убрать все проверки
<code>/status</code> - показать активные проверки

┌── С ТАЙМЕРОМ ──┐
<code>/setup @channel 1d</code> - проверка на 1 день
<code>/setup @channel 5h</code> - проверка на 5 часов
<code>/setup @channel 30m</code> - проверка на 30 минут

🕒 <b>Форматы времени:</b>
s - секунды | m - минуты | h - часы | d - дни

📝 <b>ПРИМЕР ИСПОЛЬЗОВАНИЯ:</b>
1. Добавьте бота @prgram_bot в ваш чат как админа
2. Напишите: <code>/setup @your_channel</code>
3. Новые участники должны будут подписаться

⚠️ <b>Лимит:</b> 5 одновременных проверок
`;

  const keyboard = new InlineKeyboard()
    .text('📋 Создать проверку', 'subscription:create:public')
    .text('⬅️ Назад', 'menu:subscription');

  await ctx.editMessageText(publicText, { 
    reply_markup: keyboard,
    parse_mode: 'HTML' 
  });
  await ctx.answerCallbackQuery();
});

// Private channels setup guide
subscriptionHandler.callbackQuery('subscription:private', async (ctx) => {
  const privateText = `
🔒 <b>ПРИВАТНЫЕ КАНАЛЫ/ЧАТЫ</b>

Настройка проверки подписки на приватные каналы/чаты.

📝 <b>КОМАНДЫ ДЛЯ ВАШЕГО ЧАТА:</b>

┌── ОСНОВНЫЕ ──┐
<code>/setup -100123456789</code> - добавить проверку по ID
<code>/unsetup -100123456789</code> - убрать проверку
<code>/status</code> - показать активные проверки

┌── С ТАЙМЕРОМ ──┐
<code>/setup -100123456789 1d</code> - проверка на 1 день
<code>/setup -100123456789 12h</code> - проверка на 12 часов

🔍 <b>КАК ПОЛУЧИТЬ ID КАНАЛА:</b>
1. Добавьте бота в приватный канал как админа
2. Перешлите любое сообщение из канала в @userinfobot
3. Скопируйте ID канала (начинается с -100)

💡 <b>ВАЖНО:</b>
• Бот должен быть админом в приватном канале
• ID канала всегда начинается с -100
• Бот проверяет участие пользователя в канале
`;

  const keyboard = new InlineKeyboard()
    .text('📋 Создать проверку', 'subscription:create:private')
    .text('⬅️ Назад', 'menu:subscription');

  await ctx.editMessageText(privateText, { 
    reply_markup: keyboard,
    parse_mode: 'HTML' 
  });
  await ctx.answerCallbackQuery();
});

// Invite link setup guide
subscriptionHandler.callbackQuery('subscription:invite', async (ctx) => {
  const inviteText = `
🔗 <b>ПРИГЛАСИТЕЛЬНАЯ ССЫЛКА</b>

Настройка проверки подписки через пригласительную ссылку с подсчетом подписчиков.

📝 <b>КОМАНДЫ ДЛЯ ВАШЕГО ЧАТА:</b>

┌── ОСНОВНЫЕ ──┐
<code>/setup_invite -100123456789 https://t.me/+AbCdEf 1000</code>
├ ID канала
├ Пригласительная ссылка  
└ Цель подписчиков (опционально)

┌── С ТАЙМЕРОМ ──┐
<code>/setup_invite -100123456789 https://t.me/+AbCdEf 1000 7d</code>

🎯 <b>ОСОБЕННОСТИ:</b>
• Подсчет новых подписчиков через ссылку
• Автоматическое отключение при достижении цели
• Статистика переходов и подписок
• Возможность установить таймер

📊 <b>СТАТИСТИКА:</b>
• Количество переходов по ссылке
• Количество новых подписчиков
• Процент конверсии
• Прогресс к цели
`;

  const keyboard = new InlineKeyboard()
    .text('📋 Создать проверку', 'subscription:create:invite')
    .text('⬅️ Назад', 'menu:subscription');

  await ctx.editMessageText(inviteText, { 
    reply_markup: keyboard,
    parse_mode: 'HTML' 
  });
  await ctx.answerCallbackQuery();
});

// Referral system setup guide
subscriptionHandler.callbackQuery('subscription:referral', async (ctx) => {
  const referralText = `
🎯 <b>РЕФЕРАЛЬНАЯ СИСТЕМА PR GRAM</b>

Добавьте обязательную подписку через вашу реферальную ссылку PR GRAM!

💰 <b>ВЫ БУДЕТЕ ПОЛУЧАТЬ:</b>
• 1000 GRAM – за каждого привлеченного реферала
• +5% – от суммы пополнений ваших рефералов
• +3% – от выполнения заданий вашими рефералами

📝 <b>НАСТРОЙКА:</b>
▸ Шаг 1: Добавьте бота в ваш чат с правами админа
▸ Шаг 2: Используйте команду /setup_bot с вашим ID

┌── КОМАНДЫ ──┐
<code>/setup_bot ${ctx.user.telegramId}</code> - включить реферальную ОП
<code>/setup_bot ${ctx.user.telegramId} 1d</code> - с таймером на 1 день
<code>/unsetup_bot</code> - отключить реферальную ОП

📊 <b>ВАШ ID:</b> <code>${ctx.user.telegramId}</code>
🔗 <b>Ваша реф. ссылка:</b>
<code>https://t.me/prgram_bot?start=${ctx.user.referralCode}</code>
`;

  const keyboard = new InlineKeyboard()
    .text('📋 Копировать ID', `copy:${ctx.user.telegramId}`)
    .text('🔗 Копировать ссылку', `copy:https://t.me/prgram_bot?start=${ctx.user.referralCode}`).row()
    .text('📋 Создать проверку', 'subscription:create:referral')
    .text('⬅️ Назад', 'menu:subscription');

  await ctx.editMessageText(referralText, { 
    reply_markup: keyboard,
    parse_mode: 'HTML' 
  });
  await ctx.answerCallbackQuery();
});

// Auto-delete setup guide
subscriptionHandler.callbackQuery('subscription:autodelete', async (ctx) => {
  const autoDeleteText = `
⌛ <b>АВТОУДАЛЕНИЕ СООБЩЕНИЙ</b>

Настройка автоматического удаления сообщений бота через заданное время.

📝 <b>КОМАНДЫ ДЛЯ ВАШЕГО ЧАТА:</b>

┌── НАСТРОЙКА ──┐
<code>/autodelete 30s</code> - удаление через 30 секунд
<code>/autodelete 2m</code> - удаление через 2 минуты  
<code>/autodelete 5m</code> - удаление через 5 минут
<code>/autodelete off</code> - отключить автоудаление

┌── ИНФОРМАЦИЯ ──┐
<code>/get_autodelete</code> - текущие настройки

🕒 <b>ДОСТУПНЫЕ ИНТЕРВАЛЫ:</b>
• Минимум: 15 секунд
• Максимум: 5 минут
• Форматы: s (секунды), m (минуты)

💡 <b>ПРИМЕНЕНИЕ:</b>
• Автоудаление работает для всех сообщений бота
• Исключение: важные системные уведомления
• Помогает поддерживать чистоту чата
• Уменьшает спам от проверок подписки
`;

  const keyboard = new InlineKeyboard()
    .text('📋 Настроить автоудаление', 'subscription:create:autodelete')
    .text('⬅️ Назад', 'menu:subscription');

  await ctx.editMessageText(autoDeleteText, { 
    reply_markup: keyboard,
    parse_mode: 'HTML' 
  });
  await ctx.answerCallbackQuery();
});

// Show user's subscription checks
subscriptionHandler.callbackQuery('subscription:my_checks', async (ctx) => {
  await showMySubscriptionChecks(ctx);
});

// Show user's subscription checks
async function showMySubscriptionChecks(ctx: BotContext) {
  try {
    // This would get checks created by the user across all chats they admin
    // For now, we'll show a placeholder
    const myChecksText = `
📊 <b>МОИ ПРОВЕРКИ ПОДПИСКИ</b>

У вас пока нет активных проверок подписки.

💡 <b>Чтобы создать проверку:</b>
1. Добавьте бота в ваш чат как администратора
2. Используйте соответствующие команды в чате
3. Настройте нужный тип проверки

📋 <b>Доступные типы проверок:</b>
• Публичные каналы/чаты
• Приватные каналы/чаты  
• По пригласительной ссылке
• Реферальная система PR GRAM
`;

    const keyboard = new InlineKeyboard()
      .text('📋 Создать проверку', 'subscription:create:public')
      .text('📚 Инструкции', 'menu:subscription')
      .text('🏠 Главное меню', 'menu:main');

    await ctx.editMessageText(myChecksText, { 
      reply_markup: keyboard,
      parse_mode: 'HTML' 
    });
    await ctx.answerCallbackQuery();

  } catch (error) {
    console.error('Show my checks error:', error);
    await ctx.answerCallbackQuery('❌ Ошибка при загрузке проверок');
  }
}

// Create subscription check handlers
subscriptionHandler.callbackQuery(/^subscription:create:(.+)$/, async (ctx) => {
  const checkType = ctx.match[1];
  
  switch (checkType) {
    case 'public':
      await showCreatePublicCheck(ctx);
      break;
    case 'private':
      await showCreatePrivateCheck(ctx);
      break;
    case 'invite':
      await showCreateInviteCheck(ctx);
      break;
    case 'referral':
      await showCreateReferralCheck(ctx);
      break;
    case 'autodelete':
      await showCreateAutoDeleteConfig(ctx);
      break;
    default:
      await ctx.answerCallbackQuery('❌ Неизвестный тип проверки');
  }
});

// Show create public check interface
async function showCreatePublicCheck(ctx: BotContext) {
  const createText = `
📋 <b>СОЗДАНИЕ ПРОВЕРКИ ПУБЛИЧНОГО КАНАЛА</b>

Для создания проверки подписки на публичный канал выполните следующие шаги:

🔧 <b>НАСТРОЙКА:</b>
1. Добавьте бота @prgram_bot в ваш чат как администратора
2. Убедитесь, что бот также админ в канале для проверки
3. В вашем чате введите команду:

<code>/setup @username_канала</code>

📝 <b>ПРИМЕРЫ КОМАНД:</b>
• <code>/setup @prgram_channel</code>
• <code>/setup @prgram_channel 24h</code>
• <code>/setup @prgram_channel 7d</code>

⏰ <b>Опциональный таймер:</b>
• 30s, 5m, 2h, 1d - формат времени
• Проверка автоматически отключится через указанное время

💡 После настройки новые участники чата должны будут подписаться на указанный канал для возможности писать сообщения.
`;

  const keyboard = new InlineKeyboard()
    .text('📚 Подробная инструкция', 'subscription:public')
    .text('⬅️ Назад', 'menu:subscription');

  await ctx.editMessageText(createText, { 
    reply_markup: keyboard,
    parse_mode: 'HTML' 
  });
  await ctx.answerCallbackQuery();
}

// Show create private check interface
async function showCreatePrivateCheck(ctx: BotContext) {
  const createText = `
📋 <b>СОЗДАНИЕ ПРОВЕРКИ ПРИВАТНОГО КАНАЛА</b>

Для создания проверки подписки на приватный канал:

🔧 <b>ПОДГОТОВКА:</b>
1. Добавьте бота в приватный канал как администратора
2. Получите ID канала:
   • Перешлите сообщение из канала в @userinfobot
   • Скопируйте Chat ID (например: -1001234567890)

3. Добавьте бота в ваш чат как администратора
4. Введите команду с ID канала:

<code>/setup -1001234567890</code>

📝 <b>ПРИМЕРЫ КОМАНД:</b>
• <code>/setup -1001234567890</code>
• <code>/setup -1001234567890 12h</code>
• <code>/setup -1001234567890 3d</code>

🔒 <b>ВАЖНО:</b>
• ID приватного канала всегда начинается с -100
• Бот должен быть админом в приватном канале
• Участники не увидят название канала, только требование подписки
`;

  const keyboard = new InlineKeyboard()
    .text('📚 Подробная инструкция', 'subscription:private')
    .text('⬅️ Назад', 'menu:subscription');

  await ctx.editMessageText(createText, { 
    reply_markup: keyboard,
    parse_mode: 'HTML' 
  });
  await ctx.answerCallbackQuery();
}

// Show create invite check interface
async function showCreateInviteCheck(ctx: BotContext) {
  const createText = `
📋 <b>СОЗДАНИЕ ПРОВЕРКИ ПО ПРИГЛАСИТЕЛЬНОЙ ССЫЛКЕ</b>

Проверка с подсчетом подписчиков через пригласительную ссылку:

🔧 <b>НАСТРОЙКА:</b>
1. Создайте пригласительную ссылку в вашем канале
2. Добавьте бота в канал как администратора  
3. Добавьте бота в чат как администратора
4. Введите команду:

<code>/setup_invite [ID_канала] [ссылка] [цель]</code>

📝 <b>ПРИМЕР:</b>
<code>/setup_invite -1001234567890 https://t.me/+AbCdEfGhIjKl 1000</code>

📊 <b>ПАРАМЕТРЫ:</b>
• ID канала - начинается с -100
• Пригласительная ссылка - полная ссылка
• Цель подписчиков - желаемое количество (опционально)
• Таймер - время работы проверки (опционально)

🎯 <b>ОСОБЕННОСТИ:</b>
• Автоматический подсчет новых подписчиков
• Отключение при достижении цели
• Статистика переходов и конверсии
`;

  const keyboard = new InlineKeyboard()
    .text('📚 Подробная инструкция', 'subscription:invite')
    .text('⬅️ Назад', 'menu:subscription');

  await ctx.editMessageText(createText, { 
    reply_markup: keyboard,
    parse_mode: 'HTML' 
  });
  await ctx.answerCallbackQuery();
}

// Show create referral check interface
async function showCreateReferralCheck(ctx: BotContext) {
  const createText = `
📋 <b>СОЗДАНИЕ РЕФЕРАЛЬНОЙ ПРОВЕРКИ</b>

Настройка обязательной регистрации через вашу реферальную ссылку:

🔧 <b>НАСТРОЙКА:</b>
1. Добавьте бота в ваш чат как администратора
2. Введите команду с вашим ID:

<code>/setup_bot ${ctx.user.telegramId}</code>

📝 <b>ДОПОЛНИТЕЛЬНЫЕ ОПЦИИ:</b>
• <code>/setup_bot ${ctx.user.telegramId} 24h</code> - с таймером
• <code>/unsetup_bot</code> - отключить проверку

🎯 <b>ВАШИ ДАННЫЕ:</b>
• ID: <code>${ctx.user.telegramId}</code>
• Реферальная ссылка: <code>https://t.me/prgram_bot?start=${ctx.user.referralCode}</code>

💰 <b>ДОХОДЫ:</b>
• 1000 GRAM за каждого реферала
• 5% от пополнений рефералов  
• 3% от заработка рефералов на заданиях

💡 После настройки участники смогут писать в чате только после регистрации в боте через вашу реферальную ссылку.
`;

  const keyboard = new InlineKeyboard()
    .text('📋 Копировать ID', `copy:${ctx.user.telegramId}`)
    .text('🔗 Копировать ссылку', `copy:https://t.me/prgram_bot?start=${ctx.user.referralCode}`).row()
    .text('📚 Подробная инструкция', 'subscription:referral')
    .text('⬅️ Назад', 'menu:subscription');

  await ctx.editMessageText(createText, { 
    reply_markup: keyboard,
    parse_mode: 'HTML' 
  });
  await ctx.answerCallbackQuery();
}

// Show create auto-delete config interface
async function showCreateAutoDeleteConfig(ctx: BotContext) {
  const createText = `
📋 <b>НАСТРОЙКА АВТОУДАЛЕНИЯ</b>

Настройка автоматического удаления сообщений бота:

🔧 <b>НАСТРОЙКА:</b>
1. Добавьте бота в ваш чат как администратора
2. Введите команду автоудаления:

<code>/autodelete [время]</code>

📝 <b>ПРИМЕРЫ КОМАНД:</b>
• <code>/autodelete 30s</code> - удаление через 30 секунд
• <code>/autodelete 2m</code> - удаление через 2 минуты
• <code>/autodelete 5m</code> - удаление через 5 минут  
• <code>/autodelete off</code> - отключить автоудаление

⏰ <b>ОГРАНИЧЕНИЯ:</b>
• Минимум: 15 секунд
• Максимум: 5 минут
• Форматы: s (секунды), m (минуты)

📊 <b>ПРОВЕРКА НАСТРОЕК:</b>
<code>/get_autodelete</code> - посмотреть текущие настройки

💡 Автоудаление поможет поддерживать чистоту чата, автоматически удаляя уведомления бота через заданное время.
`;

  const keyboard = new InlineKeyboard()
    .text('📚 Подробная инструкция', 'subscription:autodelete')
    .text('⬅️ Назад', 'menu:subscription');

  await ctx.editMessageText(createText, { 
    reply_markup: keyboard,
    parse_mode: 'HTML' 
  });
  await ctx.answerCallbackQuery();
}

// Handle copy actions
subscriptionHandler.callbackQuery(/^copy:(.+)$/, async (ctx) => {
  const textToCopy = ctx.match[1];
  
  // Since we can't actually copy to clipboard in Telegram bot,
  // we'll show the text in a way that's easy to copy
  await ctx.answerCallbackQuery(`📋 Скопируйте: ${textToCopy}`, { show_alert: true });
});

// Handle help and info callbacks
subscriptionHandler.callbackQuery('subscription:help', async (ctx) => {
  const helpText = `
🆘 <b>ПОМОЩЬ ПО ПРОВЕРКЕ ПОДПИСКИ</b>

🔧 <b>ОСНОВНЫЕ ШАГИ:</b>
1. Добавьте @prgram_bot в ваш чат как администратора
2. Добавьте бота в канал/чат для проверки как администратора
3. Используйте соответствующие команды в чате

📞 <b>ПОДДЕРЖКА:</b>
• Канал поддержки: @prgram_support
• Чат поддержки: @prgram_help  
• FAQ: /help

❓ <b>ЧАСТЫЕ ВОПРОСЫ:</b>
• Бот не проверяет подписку - убедитесь, что он админ в канале
• Команды не работают - проверьте права администратора бота в чате
• Проверка отключилась - возможно, истек таймер или достигнута цель

🔍 <b>ДИАГНОСТИКА:</b>
Используйте команду <code>/status</code> в чате для проверки активных настроек.
`;

  const keyboard = new InlineKeyboard()
    .text('📞 Связаться с поддержкой', 'support:contact')
    .text('⬅️ Назад', 'menu:subscription');

  await ctx.editMessageText(helpText, { 
    reply_markup: keyboard,
    parse_mode: 'HTML' 
  });
  await ctx.answerCallbackQuery();
});