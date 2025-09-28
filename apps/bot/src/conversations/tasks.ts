import { createConversation } from '@grammyjs/conversations';
import { InlineKeyboard } from 'grammy';
import { TaskType } from '@pr-gram/database';
import { taskService } from '../services/taskService';
import { TASK_TYPE_CONFIG } from '@pr-gram/shared';
import type { BotContext } from '../types/context';

// Create task conversation
export const createTaskConversation = createConversation('createTask', async (conversation, ctx: BotContext) => {
  let taskData = ctx.session.taskData || {};

  try {
    // Step 1: Select task type
    if (!taskData.type) {
      const typeKeyboard = new InlineKeyboard()
        .text('📺 Подписка на канал', 'type:subscribe').row()
        .text('👥 Вступление в группу', 'type:join_group').row()
        .text('👀 Просмотр поста', 'type:view_post').row()
        .text('🤖 Переход в бота', 'type:use_bot').row()
        .text('👍 Реакция на пост', 'type:react_post').row()
        .text('⭐ Премиум буст', 'type:premium_boost').row()
        .text('❌ Отмена', 'cancel');

      await ctx.reply('📢 Выберите тип задания:', { reply_markup: typeKeyboard });
      
      const response = await conversation.waitForCallbackQuery();
      
      if (response.data === 'cancel') {
        await response.answerCallbackQuery('❌ Создание задания отменено');
        return;
      }

      if (response.data?.startsWith('type:')) {
        taskData.type = response.data.replace('type:', '') as TaskType;
        await response.answerCallbackQuery();
      } else {
        await response.answerCallbackQuery('❌ Неверный выбор');
        return;
      }
    }

    // Step 2: Enter title
    if (!taskData.title) {
      await ctx.editMessageText('📝 Введите название задания (максимум 255 символов):');
      
      const titleResponse = await conversation.waitFor(':text');
      const title = titleResponse.message?.text?.trim();
      
      if (!title || title.length < 3 || title.length > 255) {
        await ctx.reply('❌ Название должно быть от 3 до 255 символов');
        return;
      }
      
      taskData.title = title;
    }

    // Step 3: Enter description
    if (!taskData.description) {
      await ctx.reply('📋 Введите описание задания (максимум 1000 символов):');
      
      const descResponse = await conversation.waitFor(':text');
      const description = descResponse.message?.text?.trim();
      
      if (!description || description.length < 10 || description.length > 1000) {
        await ctx.reply('❌ Описание должно быть от 10 до 1000 символов');
        return;
      }
      
      taskData.description = description;
    }

    // Step 4: Enter target URL
    if (!taskData.targetUrl && needsUrl(taskData.type)) {
      const urlPrompt = getUrlPrompt(taskData.type);
      await ctx.reply(urlPrompt);
      
      const urlResponse = await conversation.waitFor(':text');
      const url = urlResponse.message?.text?.trim();
      
      if (!url || !isValidUrl(url, taskData.type)) {
        await ctx.reply('❌ Неверная ссылка');
        return;
      }
      
      taskData.targetUrl = url;
    }

    // Step 5: Enter reward
    if (!taskData.reward) {
      const config = TASK_TYPE_CONFIG[taskData.type];
      await ctx.reply(
        `💰 Введите награду за выполнение (от ${config.minReward} до ${config.maxReward} GRAM):`
      );
      
      const rewardResponse = await conversation.waitFor(':text');
      const rewardText = rewardResponse.message?.text?.trim();
      const reward = parseInt(rewardText || '');
      
      if (isNaN(reward) || reward < config.minReward || reward > config.maxReward) {
        await ctx.reply(`❌ Награда должна быть от ${config.minReward} до ${config.maxReward} GRAM`);
        return;
      }
      
      taskData.reward = reward;
    }

    // Step 6: Enter target count
    if (!taskData.targetCount) {
      await ctx.reply('👥 Введите количество выполнений (от 1 до 10000):');
      
      const countResponse = await conversation.waitFor(':text');
      const countText = countResponse.message?.text?.trim();
      const count = parseInt(countText || '');
      
      if (isNaN(count) || count < 1 || count > 10000) {
        await ctx.reply('❌ Количество должно быть от 1 до 10000');
        return;
      }
      
      taskData.targetCount = count;
    }

    // Step 7: Select verification type
    if (!taskData.verificationType) {
      const verificationKeyboard = new InlineKeyboard()
        .text('🤖 Автоматическая', 'verification:auto').row()
        .text('👨‍💻 Ручная', 'verification:manual').row()
        .text('🔄 Смешанная', 'verification:hybrid').row();

      await ctx.reply('🔍 Выберите тип проверки:', { reply_markup: verificationKeyboard });
      
      const verResponse = await conversation.waitForCallbackQuery();
      
      if (verResponse.data?.startsWith('verification:')) {
        taskData.verificationType = verResponse.data.replace('verification:', '');
        await verResponse.answerCallbackQuery();
      } else {
        await verResponse.answerCallbackQuery('❌ Неверный выбор');
        return;
      }
    }

    // Step 8: Review and confirm
    const totalCost = calculateTaskCost(taskData.reward!, taskData.targetCount!, ctx.user.level);
    const commission = totalCost - (taskData.reward! * taskData.targetCount!);
    
    const reviewText = `
✅ <b>СОЗДАТЬ ЗАДАНИЕ</b>

${getTaskTypeIcon(taskData.type!)} <b>${taskData.title}</b>
💰 ${taskData.reward} GRAM за выполнение
👥 Цель: ${taskData.targetCount} выполнений
🔍 Проверка: ${getVerificationText(taskData.verificationType!)}
⏰ Активно до: без ограничений

📊 <b>Стоимость:</b>
├ Награды: ${taskData.reward! * taskData.targetCount!} GRAM
├ Комиссия (${getCommissionRate(ctx.user.level)}%): ${commission} GRAM
└ <b>Итого: ${totalCost} GRAM</b>

💰 <b>Ваш баланс:</b> ${ctx.user.balance} GRAM
💰 <b>Остаток после создания:</b> ${ctx.user.balance.toNumber() - totalCost} GRAM

Подтвердить создание?
`;

    const confirmKeyboard = new InlineKeyboard()
      .text('✅ Создать задание', 'confirm')
      .text('❌ Отмена', 'cancel');

    await ctx.reply(reviewText, { 
      reply_markup: confirmKeyboard,
      parse_mode: 'HTML'
    });

    const confirmResponse = await conversation.waitForCallbackQuery();
    
    if (confirmResponse.data === 'cancel') {
      await confirmResponse.answerCallbackQuery('❌ Создание задания отменено');
      return;
    }

    if (confirmResponse.data === 'confirm') {
      await confirmResponse.answerCallbackQuery('⏳ Создаем задание...');
      
      try {
        // Create the task
        const task = await taskService.createTask(ctx.user.telegramId, {
          type: taskData.type!,
          title: taskData.title!,
          description: taskData.description!,
          reward: taskData.reward!,
          targetCount: taskData.targetCount!,
          targetUrl: taskData.targetUrl,
          verificationType: taskData.verificationType,
          conditions: {},
        });

        const successText = `
✅ <b>ЗАДАНИЕ СОЗДАНО!</b>

${getTaskTypeIcon(task.type)} <b>${task.title}</b>
💰 ${task.reward} GRAM за выполнение
👥 Цель: ${task.targetCount} выполнений
⏰ Активно до: без ограничений

📊 <b>Параметры:</b>
├ ID задания: #${task.id.slice(-6)}
├ Статус: Активное
├ Потрачено: ${totalCost} GRAM
└ Остаток баланса: ${ctx.user.balance.toNumber() - totalCost} GRAM

🚀 Ваше задание уже показывается пользователям!
`;

        const successKeyboard = new InlineKeyboard()
          .text('📊 Статистика задания', `task_stats:${task.id}`)
          .text('📢 Создать еще задание', 'menu:promote')
          .text('🏠 В главное меню', 'menu:main');

        await ctx.editMessageText(successText, {
          reply_markup: successKeyboard,
          parse_mode: 'HTML'
        });

        // Clear session data
        ctx.session.taskData = {};

      } catch (error) {
        console.error('Create task error:', error);
        await ctx.editMessageText(
          `❌ Ошибка при создании задания: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
          { reply_markup: new InlineKeyboard().text('🏠 Главное меню', 'menu:main') }
        );
      }
    }

  } catch (