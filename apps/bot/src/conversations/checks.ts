import { createConversation } from '@grammyjs/conversations';
import { InlineKeyboard } from 'grammy';
import { checkService } from '../services/checkService';
import { BOT_CONSTANTS } from '../config';
import type { BotContext } from '../types/context';

// Create check conversation
export const createCheckConversation = createConversation('createCheck', async (conversation, ctx: BotContext) => {
  let checkData = ctx.session.checkData || {};

  try {
    // Step 1: Enter amount
    if (!checkData.amount) {
      await ctx.reply('💰 Введите сумму чека (от 10 до 100,000 GRAM):');
      
      const amountResponse = await conversation.waitFor(':text');
      const amountText = amountResponse.message?.text?.trim();
      const amount = parseInt(amountText || '');
      
      if (isNaN(amount) || amount < BOT_CONSTANTS.CHECK_LIMITS.MIN_AMOUNT || amount > BOT_CONSTANTS.CHECK_LIMITS.MAX_AMOUNT) {
        await ctx.reply(`❌ Сумма должна быть от ${BOT_CONSTANTS.CHECK_LIMITS.MIN_AMOUNT} до ${BOT_CONSTANTS.CHECK_LIMITS.MAX_AMOUNT} GRAM`);
        return;
      }
      
      if (ctx.user.balance.toNumber() < amount) {
        await ctx.reply('❌ Недостаточно средств на балансе');
        return;
      }
      
      checkData.amount = amount;
    }

    // Step 2: Enter activations count
    if (!checkData.maxActivations) {
      const maxActivations = checkData.type === 'personal' ? 1 : undefined;
      
      if (maxActivations) {
        checkData.maxActivations = maxActivations;
      } else {
        await ctx.reply('👥 Введите количество активаций (от 1 до 10,000):');
        
        const activationsResponse = await conversation.waitFor(':text');
        const activationsText = activationsResponse.message?.text?.trim();
        const activations = parseInt(activationsText || '');
        
        if (isNaN(activations) || activations < BOT_CONSTANTS.CHECK_LIMITS.MIN_ACTIVATIONS || activations > BOT_CONSTANTS.CHECK_LIMITS.MAX_ACTIVATIONS) {
          await ctx.reply(`❌ Количество активаций должно быть от ${BOT_CONSTANTS.CHECK_LIMITS.MIN_ACTIVATIONS} до ${BOT_CONSTANTS.CHECK_LIMITS.MAX_ACTIVATIONS}`);
          return;
        }
        
        const totalCost = checkData.amount * activations;
        if (ctx.user.balance.toNumber() < totalCost) {
          await ctx.reply(`❌ Недостаточно средств. Нужно: ${totalCost} GRAM, у вас: ${ctx.user.balance} GRAM`);
          return;
        }
        
        checkData.maxActivations = activations;
      }
    }

    // Step 3: Enter comment (optional)
    if (checkData.comment === undefined) {
      const skipKeyboard = new InlineKeyboard().text('⏭️ Пропустить', 'skip_comment');
      
      await ctx.reply('💬 Введите комментарий к чеку (необязательно):', {
        reply_markup: skipKeyboard
      });
      
      const commentResponse = await conversation.waitForCallbackQuery(['skip_comment'], async (ctx) => {
        return await conversation.waitFor(':text');
      });
      
      if (commentResponse.data === 'skip_comment') {
        await commentResponse.answerCallbackQuery();
        checkData.comment = '';
      } else {
        const comment = commentResponse.message?.text?.trim();
        if (comment && comment.length > BOT_CONSTANTS.CHECK_LIMITS.MAX_COMMENT_LENGTH) {
          await ctx.reply(`❌ Комментарий слишком длинный (максимум ${BOT_CONSTANTS.CHECK_LIMITS.MAX_COMMENT_LENGTH} символов)`);
          return;
        }
        checkData.comment = comment || '';
      }
    }

    // Step 4: Set password (for protected checks)
    if (checkData.type === 'protected' && !checkData.password) {
      await ctx.reply('🔒 Введите пароль для чека (максимум 50 символов):');
      
      const passwordResponse = await conversation.waitFor(':text');
      const password = passwordResponse.message?.text?.trim();
      
      if (!password || password.length > BOT_CONSTANTS.CHECK_LIMITS.MAX_PASSWORD_LENGTH) {
        await ctx.reply(`❌ Пароль должен содержать от 1 до ${BOT_CONSTANTS.CHECK_LIMITS.MAX_PASSWORD_LENGTH} символов`);
        return;
      }
      
      checkData.password = password;
    }

    // Step 5: Choose design (for gift checks)
    if (checkData.type === 'gift' && !checkData.design) {
      const designKeyboard = new InlineKeyboard()
        .text('🎁 Подарок', 'design:🎁:red').text('💝 Сюрприз', 'design:💝:pink').row()
        .text('🎉 Праздник', 'design:🎉:gold').text('🎊 Веселье', 'design:🎊:blue').row()
        .text('⭐ Звезда', 'design:⭐:yellow').text('💎 Алмаз', 'design:💎:purple').row()
        .text('💰 Деньги', 'design:💰:green').text('🏆 Победа', 'design:🏆:orange').row();

      await ctx.reply('🎨 Выберите дизайн чека:', { reply_markup: designKeyboard });
      
      const designResponse = await conversation.waitForCallbackQuery();
      
      if (designResponse.data?.startsWith('design:')) {
        const [, emoji, color] = designResponse.data.split(':');
        checkData.design = { emoji, color };
        await designResponse.answerCallbackQuery();
      } else {
        await designResponse.answerCallbackQuery('❌ Неверный выбор дизайна');
        return;
      }
    }

    // Step 6: Set expiration (optional)
    if (checkData.expiresAt === undefined) {
      const expirationKeyboard = new InlineKeyboard()
        .text('1 час', 'expire:1h').text('6 часов', 'expire:6h').text('1 день', 'expire:1d').row()
        .text('3 дня', 'expire:3d').text('7 дней', 'expire:7d').text('30 дней', 'expire:30d').row()
        .text('⏭️ Без ограничения', 'expire:never');

      await ctx.reply('⏰ Выберите срок действия чека:', { reply_markup: expirationKeyboard });
      
      const expirationResponse = await conversation.waitForCallbackQuery();
      
      if (expirationResponse.data?.startsWith('expire:')) {
        const duration = expirationResponse.data.replace('expire:', '');
        
        if (duration === 'never') {
          checkData.expiresAt = null;
        } else {
          const expiresAt = calculateExpirationDate(duration);
          checkData.expiresAt = expiresAt;
        }
        
        await expirationResponse.answerCallbackQuery();
      } else {
        await expirationResponse.answerCallbackQuery('❌ Неверный выбор');
        return;
      }
    }

    // Step 7: Review and confirm
    const totalCost = checkData.amount * checkData.maxActivations;
    const design = checkData.design || { emoji: '💰', color: 'default' };
    
    const reviewText = `
${design.emoji} <b>СОЗДАТЬ ЧЕК</b>

💰 <b>Сумма:</b> ${checkData.amount} GRAM
👥 <b>Активаций:</b> ${checkData.maxActivations}
💬 <b>Комментарий:</b> ${checkData.comment || 'Без комментария'}
${checkData.password ? '🔒 <b>Пароль:</b> Установлен' : '🔓 <b>Пароль:</b> Не установлен'}
🎨 <b>Дизайн:</b> ${design.emoji} ${design.color}
⏰ <b>Действует:</b> ${checkData.expiresAt ? formatDate(checkData.expiresAt) : 'Без ограничения'}

💳 <b>К списанию:</b> ${totalCost} GRAM
💰 <b>Остаток баланса:</b> ${ctx.user.balance.toNumber() - totalCost} GRAM

Подтвердить создание чека?
`;

    const confirmKeyboard = new InlineKeyboard()
      .text('✅ Создать чек', 'confirm')
      .text('❌ Отмена', 'cancel');

    await ctx.reply(reviewText, { 
      reply_markup: confirmKeyboard,
      parse_mode: 'HTML'
    });

    const confirmResponse = await conversation.waitForCallbackQuery();
    
    if (confirmResponse.data === 'cancel') {
      await confirmResponse.answerCallbackQuery('❌ Создание чека отменено');
      return;
    }

    if (confirmResponse.data === 'confirm') {
      await confirmResponse.answerCallbackQuery('⏳ Создаем чек...');
      
      try {
        // Create the check
        const check = await checkService.createCheck(ctx.user.telegramId, {
          amount: checkData.amount,
          maxActivations: checkData.maxActivations,
          comment: checkData.comment,
          password: checkData.password,
          design: checkData.design,
          expiresAt: checkData.expiresAt,
          conditions: {}
        });

        const checkUrl = `https://t.me/prgram_bot?start=check_${check.id}`;
        
        const successText = `
${design.emoji} <b>ЧЕК СОЗДАН!</b>

${checkData.comment || 'Чек без комментария'}

💰 <b>Сумма:</b> ${checkData.amount} GRAM
👥 <b>Активаций:</b> ${checkData.maxActivations}
⏰ <b>Создан:</b> ${formatDateTime(check.createdAt)}
${checkData.expiresAt ? `⏰ <b>Истекает:</b> ${formatDate(checkData.expiresAt)}` : ''}

🔗 <b>Ссылка для активации:</b>
<code>${checkUrl}</code>

📤 <b>Готовое сообщение для отправки:</b>

<code>${design.emoji} ${checkData.comment || 'Чек на получение GRAM'}

💰 Сумма: ${checkData.amount} GRAM
👥 Доступно активаций: ${checkData.maxActivations}

🎁 Получить: ${checkUrl}</code>
`;

        const successKeyboard = new InlineKeyboard()
          .url('📤 Поделиться', `https://t.me/share/url?url=${encodeURIComponent(checkUrl)}`)
          .text('📊 Мои чеки', 'checks:my_checks').row()
          .text('➕ Создать еще чек', 'menu:checks')
          .text('🏠 В главное меню', 'menu:main');

        await ctx.editMessageText(successText, {
          reply_markup: successKeyboard,
          parse_mode: 'HTML'
        });

        // Clear session data
        ctx.session.checkData = {};

      } catch (error) {
        console.error('Create check error:', error);
        await ctx.editMessageText(
          `❌ Ошибка при создании чека: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
          { reply_markup: new InlineKeyboard().text('🏠 Главное меню', 'menu:main') }
        );
      }
    }

  } catch (error) {
    console.error('Check conversation error:', error);
    await ctx.reply('❌ Произошла ошибка. Попробуйте еще раз.');
  }
});

// Activate check conversation
export const activateCheckConversation = createConversation('activateCheck', async (conversation, ctx: BotContext) => {
  const { checkId } = ctx.session.checkData || {};
  
  if (!checkId) {
    await ctx.reply('❌ Ошибка: ID чека не найден');
    return;
  }

  try {
    const check = await checkService.getCheckDetails(checkId);
    
    if (!check.password) {
      await ctx.reply('❌ Ошибка: чек не защищен паролем');
      return;
    }

    await ctx.reply('🔒 Введите пароль от чека:');
    
    const passwordResponse = await conversation.waitFor(':text');
    const password = passwordResponse.message?.text?.trim();
    
    if (!password) {
      await ctx.reply('❌ Пароль не может быть пустым');
      return;
    }

    if (password !== check.password) {
      await ctx.reply('❌ Неверный пароль');
      return;
    }

    // Activate check
    const result = await checkService.activateCheck(checkId, ctx.user.telegramId, { password });
    
    if (result.success) {
      const design = check.design || { emoji: '💰', color: 'default' };
      
      const successText = `
🎉 <b>ЧЕК АКТИВИРОВАН!</b>

${design.emoji} ${check.comment || 'Чек без комментария'}

💰 +${result.amount} GRAM зачислено на ваш баланс

📊 <b>Ваш баланс:</b> ${ctx.user.balance.toNumber() + result.amount} GRAM

🎁 Спасибо за использование чека!
`;

      const keyboard = new InlineKeyboard()
        .text('💰 Заработать еще', 'menu:earn')
        .text('🏠 Главное меню', 'menu:main');

      await ctx.reply(successText, { 
        reply_markup: keyboard,
        parse_mode: 'HTML' 
      });
    } else {
      await ctx.reply(`❌ ${result.message}`);
    }

    // Clear session data
    ctx.session.checkData = {};

  } catch (error) {
    console.error('Activate check conversation error:', error);
    await ctx.reply(`❌ Ошибка активации: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
  }
});

// Utility functions
function calculateExpirationDate(duration: string): Date {
  const now = new Date();
  
  switch (duration) {
    case '1h':
      return new Date(now.getTime() + 60 * 60 * 1000);
    case '6h':
      return new Date(now.getTime() + 6 * 60 * 60 * 1000);
    case '1d':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case '3d':
      return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
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