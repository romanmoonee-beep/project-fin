import { Menu } from '@grammyjs/menu';
import { prisma } from '@pr-gram/database';
import { subscriptionService } from '../services/subscriptionService';
import type { BotContext } from '../types/context';

// Меню проверки подписки
export const subscriptionMenu = new Menu<BotContext>('subscription')
  .text('🏛️ Публичные каналы/чаты', async (ctx) => {
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

⚠️ Лимит: 5 одновременных проверок
`;

    await ctx.editMessageText(publicText, {
      reply_markup: { 
        inline_keyboard: [
          [{ text: '⬅️ Назад к проверке подписки', callback_data: 'menu:subscription' }]
        ]
      },
      parse_mode: 'HTML'
    });
  }).row()
  
  .text('🔒 Приватные каналы/чаты', async (ctx) => {
    const privateText = `
🔒 <b>ПРИВАТНЫЕ КАНАЛЫ/ЧАТЫ</b>

Настройка проверки подписки на закрытые каналы.

📝 <b>КОМАНДЫ ДЛЯ ВАШЕГО ЧАТА:</b>

┌── ОСНОВНЫЕ ──┐
<code>/setup -1001234567890</code> - по ID канала
<code>/unsetup -1001234567890</code> - убрать проверку
<code>/status</code> - показать активные проверки

┌── С ТАЙМЕРОМ ──┐
<code>/setup -1001234567890 1d</code> - на 1 день
<code>/setup -1001234567890 12h</code> - на 12 часов

🔍 <b>КАК УЗНАТЬ ID КАНАЛА:</b>
1. Добавьте бота в ваш приватный канал как админа
2. Перешлите любое сообщение из канала боту @userinfobot
3. Скопируйте Chat ID (например: -1001234567890)

📝 <b>ПРИМЕР НАСТРОЙКИ:</b>
1. Добавьте бота в ваш чат как админа
2. Добавьте бота в приватный канал как админа
3. Напишите: <code>/setup -1001234567890</code>

⚠️ <b>ВАЖНО:</b> Бот должен быть админом в обоих чатах!
`;

    await ctx.editMessageText(privateText, {
      reply_markup: { 
        inline_keyboard: [
          [{ text: '⬅️ Назад к проверке подписки', callback_data: 'menu:subscription' }]
        ]
      },
      parse_mode: 'HTML'
    });
  }).row()
  
  .text('🔗 Пригласительная ссылка', async (ctx) => {
    const inviteText = `
🔗 <b>ПРИГЛАСИТЕЛЬНАЯ ССЫЛКА</b>

Настройка проверки подписки через пригласительную ссылку с целью по подписчикам.

📝 <b>КОМАНДЫ ДЛЯ ВАШЕГО ЧАТА:</b>

┌── НАСТРОЙКА ──┐
<code>/setup_invite CHAT_ID INVITE_LINK GOAL</code>

<b>Пример:</b>
<code>/setup_invite -1001234567890 https://t.me/+AbCdEfGhIjKlMn 100</code>

┌── УПРАВЛЕНИЕ ──┐
<code>/unsetup_invite</code> - отключить проверку
<code>/status</code> - показать прогресс

🎯 <b>ОСОБЕННОСТИ:</b>
• Автоматический подсчет новых подписчиков
• Достижение цели = автоотключение проверки
• Статистика в реальном времени
• Защита от накруток

📊 <b>СТАТИСТИКА:</b>
• Количество переходов по ссылке
• Количество подписок
• Процент конверсии
• График активности

⚠️ <b>ТРЕБОВАНИЯ:</b>
• Бот должен быть админом в обоих чатах
• Пригласительная ссылка должна быть активна
• Цель: от 10 до 100,000 подписчиков
`;

    await ctx.editMessageText(inviteText, {
      reply_markup: { 
        inline_keyboard: [
          [{ text: '⬅️ Назад к проверке подписки', callback_data: 'menu:subscription' }]
        ]
      },
      parse_mode: 'HTML'
    });
  }).row()
  
  .text('🎯 Реферальная система PR GRAM', async (ctx) => {
    const referralText = `
🎯 <b>РЕФЕРАЛЬНАЯ СИСТЕМА PR GRAM</b>

Добавьте обязательную регистрацию через вашу реферальную ссылку PR GRAM!

💰 <b>ВЫ БУДЕТЕ ПОЛУЧАТЬ:</b>
• 1000 GRAM – за каждого привлеченного реферала
• +10% – от суммы пополнений ваших рефералов
• +5% – от выполнения заданий вашими рефералами

📝 <b>НАСТРОЙКА:</b>
▸ Шаг 1: Добавьте бота в ваш чат с правами админа
▸ Шаг 2: Используйте команду <code>/setup_bot</code> с вашим ID

┌── КОМАНДЫ ──┐
<code>/setup_bot ${ctx.user.telegramId}</code> - включить реферальную проверку
<code>/setup_bot ${ctx.user.telegramId} 1d</code> - с таймером на 1 день
<code>/unsetup_bot</code> - отключить реферальную проверку

📊 <b>ВАШ РЕФЕРАЛЬНЫЙ ПРОФИЛЬ:</b>
├ ID: <code>${ctx.user.telegramId}</code>
├ Ссылка: <code>https://t.me/prgram_bot?start=${ctx.user.telegramId}</code>
├ Всего рефералов: ${await getReferralCount(ctx.user.telegramId)}
└ Заработано: ${await getReferralEarnings(ctx.user.telegramId)} GRAM

💡 <b>КАК ЭТО РАБОТАЕТ:</b>
1. Участники должны регистрироваться по вашей ссылке
2. Только зарегистрированные пользователи могут писать
3. Вы получаете доход с каждого реферала

🎁 <b>ДОПОЛНИТЕЛЬНЫЕ БОНУСЫ:</b>
• x2 доход за Premium рефералов
• Еженедельные бонусы за активных рефералов
• Особые награды за топ-рефереров
`;

    const keyboard = [
      [{ text: '📋 Копировать ID', callback_data: `copy_id:${ctx.user.telegramId}` }],
      [{ text: '🔗 Копировать ссылку', callback_data: `copy_ref:${ctx.user.telegramId}` }],
      [{ text: '📊 Мои рефералы', callback_data: 'menu:referrals' }],
      [{ text: '⬅️ Назад к проверке подписки', callback_data: 'menu:subscription' }]
    ];

    await ctx.editMessageText(referralText, {
      reply_markup: { inline_keyboard: keyboard },
      parse_mode: 'HTML'
    });
  }).row()
  
  .text('⌛ Автоудаление сообщений', async (ctx) => {
    const autoDeleteText = `
⌛ <b>АВТОУДАЛЕНИЕ СООБЩЕНИЙ</b>

Настройка автоматического удаления сообщений бота о проверке подписки.

📝 <b>КОМАНДЫ ДЛЯ ВАШЕГО ЧАТА:</b>

┌── НАСТРОЙКА ──┐
<code>/autodelete 30s</code> - удаление через 30 секунд
<code>/autodelete 2m</code> - удаление через 2 минуты
<code>/autodelete 5m</code> - удаление через 5 минут
<code>/autodelete off</code> - отключить автоудаление

┌── ИНФОРМАЦИЯ ──┐
<code>/get_autodelete</code> - текущие настройки

🕒 <b>Доступные интервалы:</b>
• Минимум: 15 секунд
• Максимум: 5 минут
• Форматы: 30s, 2m, 300s

💡 <b>РЕКОМЕНДАЦИИ:</b>
• 30-60 секунд - для активных чатов
• 2-3 минуты - для обычных групп
• 5 минут - для медленных групп

⚙️ <b>ОСОБЕННОСТИ:</b>
• Удаляются только сообщения о проверке
• Успешные проверки удаляются через 5 секунд
• Системные сообщения остаются
• Работает независимо для каждого чата

📊 <b>СТАТИСТИКА АВТОУДАЛЕНИЯ:</b>
• Количество удаленных сообщений
• Среднее время до удаления
• Эффективность очистки чата
• График активности
`;

    await ctx.editMessageText(autoDeleteText, {
      reply_markup: { 
        inline_keyboard: [
          [{ text: '⬅️ Назад к проверке подписки', callback_data: 'menu:subscription' }]
        ]
      },
      parse_mode: 'HTML'
    });
  }).row()
  
  .text('📊 Мои проверки', async (ctx) => {
    try {
      const userChecks = await subscriptionService.getUserSubscriptionChecks(ctx.user.telegramId);
      
      if (userChecks.length === 0) {
        await ctx.editMessageText(
          '📊 У вас пока нет настроенных проверок подписки.\n\nДобавьте бота в ваш чат и настройте проверку!',
          {
            reply_markup: { 
              inline_keyboard: [
                [{ text: '📝 Инструкция', callback_data: 'subscription:help' }],
                [{ text: '⬅️ Назад', callback_data: 'menu:subscription' }]
              ]
            }
          }
        );
        return;
      }

      let checksText = `📊 <b>МОИ ПРОВЕРКИ ПОДПИСКИ</b>\n\n📈 Всего проверок: ${userChecks.length}\n\n`;
      
      userChecks.forEach((check, index) => {
        const typeEmoji = getCheckTypeEmoji(check.setupType);
        const statusEmoji = check.isActive ? '🟢' : '🔴';
        const target = check.targetTitle || check.targetUsername || `Chat ${check.targetChatId}`;
        
        checksText += `${statusEmoji} ${typeEmoji} <b>${check.chatTitle || `Чат ${check.chatId}`}</b>\n`;
        checksText += `   🎯 Цель: ${target}\n`;
        checksText += `   📊 Проверок: ${check.statistics.totalChecks} (${check.statistics.passedChecks} прошли)\n`;
        checksText += `   📅 Создано: ${formatDate(check.createdAt)}\n\n`;
      });

      const keyboard = [];
      
      // Buttons for each check
      userChecks.forEach((check, index) => {
        keyboard.push([
          { text: `📊 ${check.chatTitle || `Чат ${check.chatId}`}`, callback_data: `sub_stats:${check.id}` }
        ]);
      });

      keyboard.push([{ text: '⬅️ Назад к проверке подписки', callback_data: 'menu:subscription' }]);

      await ctx.editMessageText(checksText, {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'HTML'
      });
    } catch (error) {
      console.error('Show subscription checks error:', error);
      await ctx.editMessageText(
        '❌ Ошибка при загрузке ваших проверок. Попробуйте позже.',
        { reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'menu:subscription' }]] } }
      );
    }
  }).row()
  
  .back('🏠 Главное меню');

// Регистрируем обработчики callback
subscriptionMenu.register(async (ctx) => {
  const data = ctx.callbackQuery?.data;
  
  if (data?.startsWith('copy_id:')) {
    const userId = data.replace('copy_id:', '');
    await ctx.answerCallbackQuery(`ID скопирован: ${userId}`);
    return;
  }
  
  if (data?.startsWith('copy_ref:')) {
    const userId = data.replace('copy_ref:', '');
    await ctx.answerCallbackQuery(`Ссылка скопирована: https://t.me/prgram_bot?start=${userId}`);
    return;
  }

  if (data?.startsWith('sub_stats:')) {
    const checkId = data.replace('sub_stats:', '');
    await showSubscriptionCheckStats(ctx, checkId);
    return;
  }

  if (data === 'subscription:help') {
    await showSubscriptionHelp(ctx);
    return;
  }

  // Основное меню проверки подписки
  const subscriptionText = `
✅ <b>ПРОВЕРКА ПОДПИСКИ</b>

Настройте обязательную подписку на каналы/чаты для участников вашего сообщества.

📋 <b>ИНСТРУКЦИЯ:</b>
▸ Шаг 1: Добавьте бота в ваш чат с правами администратора
▸ Шаг 2: Добавьте бота в админы канала/чата, на который хотите установить проверку
▸ Шаг 3: Используйте команду /setup

Выберите тип проверки:
`;

  if (ctx.callbackQuery) {
    await ctx.editMessageText(subscriptionText, {
      reply_markup: subscriptionMenu,
      parse_mode: 'HTML'
    });
    await ctx.answerCallbackQuery();
  }
});

// Helper функции
const getCheckTypeEmoji = (type: string): string => {
  const emojis = {
    public_channel: '🏛️',
    private_channel: '🔒',
    invite_link: '🔗',
    referral_bot: '🎯'
  };
  return emojis[type as keyof typeof emojis] || '✅';
};

const formatDate = (date: Date): string => {
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Функции для работы с БД
const getReferralCount = async (userId: number): Promise<number> => {
  try {
    return await prisma.user.count({
      where: { referrerId: userId }
    });
  } catch (error) {
    console.error('Get referral count error:', error);
    return 0;
  }
};

const getReferralEarnings = async (userId: number): Promise<number> => {
  try {
    const result = await prisma.transaction.aggregate({
      where: {
        userId: userId,
        type: 'referral'
      },
      _sum: {
        amount: true
      }
    });
    
    return result._sum.amount?.toNumber() || 0;
  } catch (error) {
    console.error('Get referral earnings error:', error);
    return 0;
  }
};

const showSubscriptionCheckStats = async (ctx: BotContext, checkId: string) => {
  try {
    const check = await prisma.subscriptionCheck.findUnique({
      where: { id: checkId },
      include: {
        creator: {
          select: {
            username: true,
            firstName: true
          }
        }
      }
    });

    if (!check) {
      await ctx.answerCallbackQuery('❌ Проверка не найдена');
      return;
    }

    const stats = check.statistics as any;
    const successRate = stats.totalChecks > 0 ? Math.round((stats.passedChecks / stats.totalChecks) * 100) : 0;

    const statsText = `
📊 <b>СТАТИСТИКА ПРОВЕРКИ</b>

🏷️ <b>Чат:</b> ${check.chatTitle || `ID: ${check.chatId}`}
🎯 <b>Цель:</b> ${check.targetTitle || check.targetUsername || 'Не указана'}
📅 <b>Создано:</b> ${formatDate(check.createdAt)}
${check.expiresAt ? `⏰ <b>Истекает:</b> ${formatDate(check.expiresAt)}` : ''}

📈 <b>СТАТИСТИКА:</b>
├ Всего проверок: ${stats.totalChecks || 0}
├ Прошли проверку: ${stats.passedChecks || 0}
├ Не прошли: ${stats.failedChecks || 0}
├ Процент успеха: ${successRate}%
├ Уникальных пользователей: ${stats.uniqueUsers || 0}
├ Удалено сообщений: ${stats.deletedMessages || 0}
└ Среднее время проверки: ${Math.round((stats.averageCheckTime || 0) / 1000)}с

${check.subscriberGoal ? `🎯 <b>Прогресс цели:</b> ${check.currentSubscribers}/${check.subscriberGoal} (${Math.round((check.currentSubscribers / check.subscriberGoal) * 100)}%)` : ''}
`;

    await ctx.editMessageText(statsText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Обновить', callback_data: `sub_stats:${checkId}` }],
          [{ text: check.isActive ? '⏸️ Приостановить' : '▶️ Возобновить', callback_data: `sub_toggle:${checkId}` }],
          [{ text: '🗑️ Удалить', callback_data: `sub_delete:${checkId}` }],
          [{ text: '⬅️ Назад к проверкам', callback_data: 'subscription:my_checks' }]
        ]
      },
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.error('Show subscription check stats error:', error);
    await ctx.answerCallbackQuery('❌ Ошибка при загрузке статистики');
  }
};

const showSubscriptionHelp = async (ctx: BotContext) => {
  const helpText = `
📖 <b>ПОДРОБНАЯ ИНСТРУКЦИЯ</b>

<b>🏛️ ПУБЛИЧНЫЕ КАНАЛЫ:</b>
1. Добавьте @prgram_bot в ваш чат как админа
2. Используйте: <code>/setup @your_channel</code>
3. Готово! Новые участники должны подписаться

<b>🔒 ПРИВАТНЫЕ КАНАЛЫ:</b>
1. Добавьте @prgram_bot в ваш чат как админа
2. Добавьте @prgram_bot в приватный канал как админа
3. Узнайте ID канала через @userinfobot
4. Используйте: <code>/setup -1001234567890</code>

<b>🎯 РЕФЕРАЛЬНАЯ СИСТЕМА:</b>
1. Добавьте @prgram_bot в ваш чат как админа
2. Используйте: <code>/setup_bot ${ctx.user.telegramId}</code>
3. Участники регистрируются по вашей ссылке

<b>⚠️ ТРЕБОВАНИЯ:</b>
• Бот должен быть админом в вашем чате
• Бот должен быть админом в целевом канале
• Права бота: удаление сообщений, блокировка пользователей

<b>🔧 ДОПОЛНИТЕЛЬНЫЕ НАСТРОЙКИ:</b>
• <code>/autodelete 30s</code> - автоудаление через 30 сек
• <code>/status</code> - показать все проверки
• <code>/unsetup</code> - отключить все проверки

<b>💡 СОВЕТЫ:</b>
• Используйте таймеры для временных акций
• Комбинируйте разные типы проверок
• Следите за статистикой в реальном времени
`;

  await ctx.editMessageText(helpText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '⬅️ Назад к проверке подписки', callback_data: 'menu:subscription' }]
      ]
    },
    parse_mode: 'HTML'
  });
};