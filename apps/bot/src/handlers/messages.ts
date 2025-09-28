import { Composer, InlineKeyboard } from 'grammy';
import { subscriptionService } from '../services/subscriptionService';
import type { BotContext } from '../types/context';

export const messageHandler = new Composer<BotContext>();

// Handle all messages in groups/channels for subscription checking
messageHandler.on('message', async (ctx, next) => {
  // Skip private chats
  if (ctx.chat.type === 'private') {
    return next();
  }

  // Skip bot messages
  if (ctx.from?.is_bot) {
    return next();
  }

  // Skip if no user found
  if (!ctx.from) {
    return next();
  }

  try {
    // Check subscription requirements
    const checkResult = await subscriptionService.checkUserSubscriptions(
      ctx.from.id,
      ctx.chat.id
    );

    if (!checkResult.passed && checkResult.requiresAction) {
      // Delete user message
      try {
        await ctx.deleteMessage();
      } catch (error) {
        console.error('Failed to delete message:', error);
      }

      // Send subscription requirement message
      const keyboard = generateSubscriptionKeyboard(checkResult.failed);
      
      const sentMessage = await ctx.reply(
        checkResult.message || 'Необходимо подписаться на каналы',
        {
          reply_markup: keyboard,
          parse_mode: 'HTML'
        }
      );

      // Auto-delete the bot message after configured time
      const autoDeleteTimer = await getAutoDeleteTimer(ctx.chat.id);
      if (autoDeleteTimer > 0) {
        setTimeout(async () => {
          try {
            await ctx.api.deleteMessage(ctx.chat.id, sentMessage.message_id);
          } catch (error) {
            console.error('Failed to auto-delete message:', error);
          }
        }, autoDeleteTimer * 1000);
      }

      return; // Don't call next()
    }

    // User passed all checks, continue
    return next();

  } catch (error) {
    console.error('Subscription check error:', error);
    return next();
  }
});

// Handle subscription check button clicks
messageHandler.callbackQuery(/^sub_check:(.+)$/, async (ctx) => {
  const action = ctx.match[1];
  
  if (action === 'recheck') {
    await handleSubscriptionRecheck(ctx);
  } else if (action.startsWith('channel:')) {
    const channelId = action.replace('channel:', '');
    await handleChannelRedirect(ctx, channelId);
  }
});

// Handle subscription recheck
async function handleSubscriptionRecheck(ctx: BotContext) {
  try {
    await ctx.answerCallbackQuery('⏳ Проверяем подписки...');

    const checkResult = await subscriptionService.checkUserSubscriptions(
      ctx.from!.id,
      ctx.chat!.id
    );

    if (checkResult.passed) {
      // User passed all checks
      await ctx.editMessageText(
        '✅ <b>Отлично!</b>\n\nВсе требования выполнены. Теперь вы можете писать в чате.',
        { parse_mode: 'HTML' }
      );

      // Auto-delete success message after 5 seconds
      setTimeout(async () => {
        try {
          await ctx.deleteMessage();
        } catch (error) {
          console.error('Failed to delete success message:', error);
        }
      }, 5000);

    } else {
      // User still hasn't met requirements
      const keyboard = generateSubscriptionKeyboard(checkResult.failed);
      
      await ctx.editMessageText(
        checkResult.message || 'Необходимо подписаться на все каналы',
        {
          reply_markup: keyboard,
          parse_mode: 'HTML'
        }
      );
    }

  } catch (error) {
    console.error('Subscription recheck error:', error);
    await ctx.answerCallbackQuery('❌ Ошибка при проверке подписок');
  }
}

// Handle channel redirect
async function handleChannelRedirect(ctx: BotContext, channelData: string) {
  try {
    // Decode channel data (could be username or invite link)
    const [type, identifier] = channelData.split('|');
    
    let url = '';
    if (type === 'username') {
      url = `https://t.me/${identifier}`;
    } else if (type === 'invite') {
      url = identifier; // Already a full URL
    } else if (type === 'referral') {
      url = `https://t.me/prgram_bot?start=${identifier}`;
    }

    if (url) {
      await ctx.answerCallbackQuery(`Переходим к каналу...`);
      // The inline button will handle the actual redirect
    } else {
      await ctx.answerCallbackQuery('❌ Неверная ссылка на канал');
    }

  } catch (error) {
    console.error('Channel redirect error:', error);
    await ctx.answerCallbackQuery('❌ Ошибка при переходе к каналу');
  }
}

// Generate subscription keyboard
function generateSubscriptionKeyboard(failedChecks: any[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  failedChecks.forEach((check, index) => {
    let buttonText = '';
    let url = '';
    let callbackData = '';

    switch (check.setupType) {
      case 'public_channel':
        buttonText = `📺 ${check.targetTitle || check.targetUsername || 'Канал'}`;
        url = `https://t.me/${check.targetUsername?.replace('@', '')}`;
        break;

      case 'private_channel':
      case 'invite_link':
        buttonText = `🔒 ${check.targetTitle || 'Приватный канал'}`;
        url = check.inviteLink || '';
        break;

      case 'referral_bot':
        buttonText = `🎯 PR GRAM Bot (реферальная ссылка)`;
        url = `https://t.me/prgram_bot?start=${check.settings?.referralUserId}`;
        break;

      default:
        buttonText = `📺 Канал ${index + 1}`;
    }

    if (url) {
      keyboard.url(buttonText, url);
    } else {
      keyboard.text(buttonText, `sub_check:channel:${check.setupType}|${check.targetUsername || check.targetChatId}`);
    }

    keyboard.row();
  });

  // Add recheck button
  keyboard.text('✅ Проверить', 'sub_check:recheck');

  return keyboard;
}

// Get auto-delete timer for chat
async function getAutoDeleteTimer(chatId: number): Promise<number> {
  try {
    // This would normally fetch from database
    // For now, return default of 30 seconds
    return 30;
  } catch (error) {
    console.error('Get auto-delete timer error:', error);
    return 30; // Default fallback
  }
}

// Handle file uploads (for task proof)
messageHandler.on(':photo', async (ctx, next) => {
  if (ctx.chat.type !== 'private') {
    return next();
  }

  // Check if user is in a conversation that expects file upload
  const session = ctx.session;
  if (session.step && session.step.includes('upload')) {
    await handleFileUpload(ctx, 'photo');
    return;
  }

  return next();
});

messageHandler.on(':document', async (ctx, next) => {
  if (ctx.chat.type !== 'private') {
    return next();
  }

  const session = ctx.session;
  if (session.step && session.step.includes('upload')) {
    await handleFileUpload(ctx, 'document');
    return;
  }

  return next();
});

// Handle file upload for task proof
async function handleFileUpload(ctx: BotContext, type: 'photo' | 'document') {
  try {
    let fileId = '';
    let fileName = '';
    let fileSize = 0;

    if (type === 'photo') {
      const photo = ctx.message?.photo;
      if (!photo || photo.length === 0) return;
      
      // Get the largest photo
      const largestPhoto = photo.reduce((prev, current) => 
        (prev.file_size || 0) > (current.file_size || 0) ? prev : current
      );
      
      fileId = largestPhoto.file_id;
      fileName = `photo_${Date.now()}.jpg`;
      fileSize = largestPhoto.file_size || 0;

    } else if (type === 'document') {
      const document = ctx.message?.document;
      if (!document) return;

      fileId = document.file_id;
      fileName = document.file_name || `document_${Date.now()}`;
      fileSize = document.file_size || 0;

      // Check file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (document.mime_type && !allowedTypes.includes(document.mime_type)) {
        await ctx.reply('❌ Поддерживаются только изображения и PDF файлы.');
        return;
      }
    }

    // Check file size (max 20MB)
    if (fileSize > 20 * 1024 * 1024) {
      await ctx.reply('❌ Файл слишком большой. Максимальный размер: 20 МБ.');
      return;
    }

    // Store file info in session
    if (!ctx.session.uploadedFiles) {
      ctx.session.uploadedFiles = [];
    }

    const fileInfo = {
      fileId,
      fileName,
      fileSize,
      uploadedAt: new Date().toISOString()
    };

    ctx.session.uploadedFiles.push(JSON.stringify(fileInfo));

    const keyboard = new InlineKeyboard()
      .text('📤 Добавить еще файл', 'upload:add_more')
      .text('✅ Завершить загрузку', 'upload:finish')
      .text('❌ Отмена', 'upload:cancel');

    await ctx.reply(
      `✅ Файл загружен: <b>${fileName}</b>\n\n` +
      `📁 Загружено файлов: ${ctx.session.uploadedFiles.length}\n\n` +
      `Вы можете добавить еще файлы или завершить загрузку.`,
      {
        reply_markup: keyboard,
        parse_mode: 'HTML'
      }
    );

  } catch (error) {
    console.error('File upload error:', error);
    await ctx.reply('❌ Ошибка при загрузке файла. Попробуйте еще раз.');
  }
}

// Handle upload action buttons
messageHandler.callbackQuery(/^upload:(.+)$/, async (ctx) => {
  const action = ctx.match[1];

  switch (action) {
    case 'add_more':
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        '📤 Отправьте еще один файл (изображение или PDF)',
        { reply_markup: new InlineKeyboard().text('❌ Отмена', 'upload:cancel') }
      );
      break;

    case 'finish':
      await handleUploadFinish(ctx);
      break;

    case 'cancel':
      await handleUploadCancel(ctx);
      break;
  }
});

// Handle upload finish
async function handleUploadFinish(ctx: BotContext) {
  try {
    const uploadedFiles = ctx.session.uploadedFiles || [];
    
    if (uploadedFiles.length === 0) {
      await ctx.answerCallbackQuery('❌ Нет загруженных файлов');
      return;
    }

    await ctx.answerCallbackQuery('✅ Файлы сохранены');

    // Get task ID from session
    const taskId = ctx.session.data?.taskId;
    if (!taskId) {
      await ctx.editMessageText('❌ Ошибка: ID задания не найден');
      return;
    }

    // Submit task execution with proof
    try {
      const fileUrls = uploadedFiles.map(fileStr => {
        const fileInfo = JSON.parse(fileStr);
        return `https://api.telegram.org/file/bot${ctx.api.token}/${fileInfo.fileId}`;
      });

      await taskService.executeTask(
        ctx.user.telegramId,
        taskId,
        {
          screenshotUrls: fileUrls,
          description: 'Доказательство выполнения задания',
          metadata: {
            uploadedFiles: uploadedFiles.map(f => JSON.parse(f)),
            uploadedAt: new Date().toISOString()
          }
        }
      );

      const successText = `
📤 <b>СКРИНШОТ ОТПРАВЛЕН</b>

✅ Задание #${taskId.slice(-6)} отправлено автору на проверку

⏰ <b>Статус проверки:</b>
├ Отправлено: ${new Date().toLocaleString('ru-RU')}
├ Файлов: ${uploadedFiles.length}
└ Автопроверка: через 24 часа

💡 Если автор не проверит задание в течение 24 часов, оно будет автоматически засчитано и оплачено.

🔔 Вы получите уведомление о результате проверки.
`;

      const keyboard = new InlineKeyboard()
        .text('💰 Другие задания', 'menu:earn')
        .text('🏠 В главное меню', 'menu:main');

      await ctx.editMessageText(successText, {
        reply_markup: keyboard,
        parse_mode: 'HTML'
      });

      // Clear session data
      ctx.session.uploadedFiles = [];
      ctx.session.step = 'idle';
      delete ctx.session.data?.taskId;

    } catch (error) {
      console.error('Submit task execution error:', error);
      await ctx.editMessageText(
        `❌ Ошибка при отправке задания: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
        { reply_markup: new InlineKeyboard().text('🔄 Попробовать снова', 'upload:finish') }
      );
    }

  } catch (error) {
    console.error('Upload finish error:', error);
    await ctx.answerCallbackQuery('❌ Ошибка при завершении загрузки');
  }
}

// Handle upload cancel
async function handleUploadCancel(ctx: BotContext) {
  await ctx.answerCallbackQuery('❌ Загрузка отменена');
  
  // Clear session data
  ctx.session.uploadedFiles = [];
  ctx.session.step = 'idle';
  delete ctx.session.data?.taskId;

  const keyboard = new InlineKeyboard()
    .text('💰 Заработать', 'menu:earn')
    .text('🏠 Главное меню', 'menu:main');

  await ctx.editMessageText(
    '❌ Загрузка файлов отменена',
    { reply_markup: keyboard }
  );
}

// Handle text messages in private chat (for conversations)
messageHandler.on(':text', async (ctx, next) => {
  if (ctx.chat.type !== 'private') {
    return next();
  }

  // Check if user is in a conversation that expects text input
  const session = ctx.session;
  if (session.step && session.step !== 'idle') {
    // Let conversations handle the text input
    return next();
  }

  // Handle standalone text messages
  const text = ctx.message.text.toLowerCase();
  
  if (text.includes('помощь') || text.includes('help')) {
    await ctx.reply(
      '🆘 Используйте команду /help для получения справки по боту',
      { reply_markup: new InlineKeyboard().text('📋 Помощь', 'help') }
    );
  } else if (text.includes('меню') || text.includes('menu')) {
    await ctx.reply(
      '📋 Используйте команду /menu для открытия главного меню',
      { reply_markup: new InlineKeyboard().text('🏠 Главное меню', 'menu:main') }
    );
  } else {
    // Unknown text message
    await ctx.reply(
      '🤔 Не понимаю команду. Используйте /help для справки или /menu для главного меню.',
      { 
        reply_markup: new InlineKeyboard()
          .text('🏠 Главное меню', 'menu:main')
          .text('🆘 Помощь', 'help')
      }
    );
  }
});

// Handle callback queries that don't match other patterns
messageHandler.on('callback_query', async (ctx, next) => {
  const data = ctx.callbackQuery.data;
  
  if (data === 'noop' || data === 'ignore') {
    await ctx.answerCallbackQuery();
    return;
  }

  if (data === 'help') {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('showHelp');
    return;
  }

  // Let other handlers process the callback query
  return next();
});