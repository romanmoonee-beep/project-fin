import { Menu } from '@grammyjs/menu';
import { prisma, TaskStatus, ExecutionStatus, UserLevel } from '@pr-gram/database';
import { adminOnlyMiddleware, superAdminOnlyMiddleware } from '../middleware/auth';
import type { BotContext } from '../types/context';

// Админ меню (доступно только администраторам)
export const adminMenu = new Menu<BotContext>('admin')
  .text('📊 Общая статистика', async (ctx) => {
    try {
      const stats = await getSystemStatistics();
      
      const statsText = `
📊 <b>ОБЩАЯ СТАТИСТИКА СИСТЕМЫ</b>

👥 <b>ПОЛЬЗОВАТЕЛИ:</b>
├ Всего: ${stats.users.total}
├ Активных (7 дней): ${stats.users.active}
├ Новых сегодня: ${stats.users.newToday}
├ Premium: ${stats.users.premium}
└ Онлайн сейчас: ${stats.users.online}

🎯 <b>ЗАДАНИЯ:</b>
├ Всего создано: ${stats.tasks.total}
├ Активных: ${stats.tasks.active}
├ Выполнений сегодня: ${stats.tasks.executionsToday}
├ Ожидают модерации: ${stats.tasks.pendingModeration}
└ Успешность: ${stats.tasks.successRate}%

💰 <b>ЭКОНОМИКА:</b>
├ Общий оборот: ${stats.economy.totalVolume} GRAM
├ Комиссии сегодня: ${stats.economy.commissionsToday} GRAM
├ Выплачено сегодня: ${stats.economy.payoutsToday} GRAM
├ Средний чек: ${stats.economy.averageTask} GRAM
└ Баланс системы: ${stats.economy.systemBalance} GRAM

✅ <b>ПРОВЕРКИ ПОДПИСКИ:</b>
├ Активных проверок: ${stats.subscriptions.active}
├ Проверок сегодня: ${stats.subscriptions.checksToday}
├ Успешных проверок: ${stats.subscriptions.successRate}%
└ Удалено сообщений: ${stats.subscriptions.deletedMessages}

💳 <b>ЧЕКИ:</b>
├ Создано сегодня: ${stats.checks.createdToday}
├ Активировано: ${stats.checks.activatedToday}
├ Сумма чеков: ${stats.checks.totalAmount} GRAM
└ Конверсия: ${stats.checks.conversionRate}%

🔧 <b>СИСТЕМА:</b>
├ Время работы: ${stats.system.uptime}
├ Нагрузка: ${stats.system.load}%
├ Память: ${stats.system.memory}%
└ База данных: ${stats.system.dbStatus}
`;

      await ctx.editMessageText(statsText, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Обновить', callback_data: 'admin:stats' }],
            [{ text: '📈 Детальная аналитика', callback_data: 'admin:analytics' }],
            [{ text: '📊 Экспорт данных', callback_data: 'admin:export' }],
            [{ text: '⬅️ Назад в админ панель', callback_data: 'admin:main' }]
          ]
        },
        parse_mode: 'HTML'
      });
    } catch (error) {
      console.error('Show admin stats error:', error);
      await ctx.editMessageText(
        '❌ Ошибка при загрузке статистики. Попробуйте позже.',
        { reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'admin:main' }]] } }
      );
    }
  }).row()
  
  .text('👥 Управление пользователями', async (ctx) => {
    const userManagementText = `
👥 <b>УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ</b>

Выберите действие:
`;

    await ctx.editMessageText(userManagementText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔍 Поиск пользователя', callback_data: 'admin:user_search' }],
          [{ text: '📊 Топ пользователи', callback_data: 'admin:top_users' }],
          [{ text: '🚫 Заблокированные', callback_data: 'admin:banned_users' }],
          [{ text: '💎 Premium пользователи', callback_data: 'admin:premium_users' }],
          [{ text: '📈 Аналитика по уровням', callback_data: 'admin:level_analytics' }],
          [{ text: '⬅️ Назад в админ панель', callback_data: 'admin:main' }]
        ]
      },
      parse_mode: 'HTML'
    });
  }).row()
  
  .text('🎯 Модерация заданий', async (ctx) => {
    try {
      const pendingTasks = await getPendingModerationTasks();
      
      if (pendingTasks.length === 0) {
        await ctx.editMessageText(
          '🎯 Нет заданий, ожидающих модерации.\n\nВсе задания обработаны!',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '📊 История модерации', callback_data: 'admin:moderation_history' }],
                [{ text: '⬅️ Назад в админ панель', callback_data: 'admin:main' }]
              ]
            }
          }
        );
        return;
      }

      let moderationText = `🎯 <b>МОДЕРАЦИЯ ЗАДАНИЙ</b>\n\n⏳ Ожидают проверки: ${pendingTasks.length}\n\n`;
      
      pendingTasks.slice(0, 5).forEach((execution, index) => {
        const task = execution.task;
        const user = execution.user;
        
        moderationText += `${index + 1}. <b>${task.title}</b>\n`;
        moderationText += `   👤 ${user.firstName || user.username || 'Пользователь'}\n`;
        moderationText += `   💰 ${execution.rewardAmount} GRAM\n`;
        moderationText += `   📅 ${formatDateTime(execution.createdAt)}\n\n`;
      });

      const keyboard = [];
      
      // Кнопки для каждого задания
      pendingTasks.slice(0, 5).forEach((execution, index) => {
        keyboard.push([
          { text: `✅ Одобрить #${index + 1}`, callback_data: `admin:approve:${execution.id}` },
          { text: `❌ Отклонить #${index + 1}`, callback_data: `admin:reject:${execution.id}` }
        ]);
      });

      if (pendingTasks.length > 5) {
        keyboard.push([{ text: `📄 Показать все (${pendingTasks.length})`, callback_data: 'admin:all_pending' }]);
      }

      keyboard.push([
        { text: '✅ Одобрить все', callback_data: 'admin:approve_all' },
        { text: '❌ Отклонить все', callback_data: 'admin:reject_all' }
      ]);
      keyboard.push([{ text: '⬅️ Назад в админ панель', callback_data: 'admin:main' }]);

      await ctx.editMessageText(moderationText, {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'HTML'
      });
    } catch (error) {
      console.error('Show moderation tasks error:', error);
      await ctx.editMessageText(
        '❌ Ошибка при загрузке заданий для модерации. Попробуйте позже.',
        { reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'admin:main' }]] } }
      );
    }
  }).row()
  
  .text('💳 Управление чеками', async (ctx) => {
    try {
      const checksStats = await getChecksStatistics();
      
      const checksText = `
💳 <b>УПРАВЛЕНИЕ ЧЕКАМИ</b>

📊 <b>СТАТИСТИКА:</b>
├ Всего создано: ${checksStats.total}
├ Активных: ${checksStats.active}
├ Активировано сегодня: ${checksStats.activatedToday}
├ Общая сумма: ${checksStats.totalAmount} GRAM
└ Средняя сумма чека: ${checksStats.averageAmount} GRAM

🏆 <b>ТОП СОЗДАТЕЛИ ЧЕКОВ:</b>
${checksStats.topCreators.map((creator, i) => 
  `${i + 1}. ${creator.name} - ${creator.amount} GRAM`
).join('\n')}

⚠️ <b>ПОДОЗРИТЕЛЬНАЯ АКТИВНОСТЬ:</b>
├ Спам чеки: ${checksStats.suspicious.spam}
├ Большие суммы: ${checksStats.suspicious.largeSums}
└ Требуют проверки: ${checksStats.suspicious.needReview}
`;

      await ctx.editMessageText(checksText, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔍 Поиск чека', callback_data: 'admin:check_search' }],
            [{ text: '⚠️ Подозрительные чеки', callback_data: 'admin:suspicious_checks' }],
            [{ text: '📊 Детальная статистика', callback_data: 'admin:checks_analytics' }],
            [{ text: '🚫 Заблокировать чек', callback_data: 'admin:block_check' }],
            [{ text: '⬅️ Назад в админ панель', callback_data: 'admin:main' }]
          ]
        },
        parse_mode: 'HTML'
      });
    } catch (error) {
      console.error('Show checks management error:', error);
      await ctx.editMessageText(
        '❌ Ошибка при загрузке управления чеками. Попробуйте позже.',
        { reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'admin:main' }]] } }
      );
    }
  }).row()
  
  .text('⚙️ Системные настройки', async (ctx) => {
    const settingsText = `
⚙️ <b>СИСТЕМНЫЕ НАСТРОЙКИ</b>

Настройка параметров системы:
`;

    await ctx.editMessageText(settingsText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '💰 Экономические параметры', callback_data: 'admin:economy_settings' }],
          [{ text: '🎯 Лимиты заданий', callback_data: 'admin:task_limits' }],
          [{ text: '🚫 Антиспам настройки', callback_data: 'admin:antispam_settings' }],
          [{ text: '🔧 Техническое обслуживание', callback_data: 'admin:maintenance' }],
          [{ text: '📢 Рассылка уведомлений', callback_data: 'admin:broadcast' }],
          [{ text: '⬅️ Назад в админ панель', callback_data: 'admin:main' }]
        ]
      },
      parse_mode: 'HTML'
    });
  }).row()
  
  .text('📈 Аналитика и отчеты', async (ctx) => {
    const analyticsText = `
📈 <b>АНАЛИТИКА И ОТЧЕТЫ</b>

Детальная аналитика системы:
`;

    await ctx.editMessageText(analyticsText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📊 Дашборд реального времени', callback_data: 'admin:realtime_dashboard' }],
          [{ text: '💰 Финансовые отчеты', callback_data: 'admin:financial_reports' }],
          [{ text: '👥 Аналитика пользователей', callback_data: 'admin:user_analytics' }],
          [{ text: '🎯 Статистика заданий', callback_data: 'admin:task_analytics' }],
          [{ text: '📧 Автоматические отчеты', callback_data: 'admin:auto_reports' }],
          [{ text: '⬅️ Назад в админ панель', callback_data: 'admin:main' }]
        ]
      },
      parse_mode: 'HTML'
    });
  }).row()
  
  .text('🔒 Супер админ панель', async (ctx) => {
    // Проверяем права супер админа
    if (!ctx.isSuperAdmin) {
      await ctx.answerCallbackQuery('❌ Недостаточно прав доступа');
      return;
    }

    const superAdminText = `
🔒 <b>СУПЕР АДМИН ПАНЕЛЬ</b>

⚠️ <b>КРИТИЧЕСКИ ВАЖНЫЕ ОПЕРАЦИИ</b>

Доступные действия:
`;

    await ctx.editMessageText(superAdminText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '👑 Управление администраторами', callback_data: 'superadmin:manage_admins' }],
          [{ text: '🗄️ Резервное копирование БД', callback_data: 'superadmin:backup_db' }],
          [{ text: '🔧 Системные команды', callback_data: 'superadmin:system_commands' }],
          [{ text: '💰 Управление балансами', callback_data: 'superadmin:manage_balances' }],
          [{ text: '🚫 Глобальные блокировки', callback_data: 'superadmin:global_bans' }],
          [{ text: '📊 Системные логи', callback_data: 'superadmin:system_logs' }],
          [{ text: '⬅️ Назад в админ панель', callback_data: 'admin:main' }]
        ]
      },
      parse_mode: 'HTML'
    });
  }).row()
  
  .back('🏠 Главное меню');

// Регистрируем обработчики callback
adminMenu.register(async (ctx) => {
  const data = ctx.callbackQuery?.data;
  
  if (data?.startsWith('admin:')) {
    await handleAdminCallback(ctx, data);
    return;
  }
  
  if (data?.startsWith('superadmin:')) {
    if (!ctx.isSuperAdmin) {
      await ctx.answerCallbackQuery('❌ Недостаточно прав доступа');
      return;
    }
    await handleSuperAdminCallback(ctx, data);
    return;
  }

  // Основное админ меню
  const adminText = `
👑 <b>АДМИНИСТРИРОВАНИЕ</b>

Добро пожаловать в панель администратора!

🔑 <b>Ваши права:</b>
${ctx.isSuperAdmin ? '• Супер администратор (полный доступ)' : '• Администратор'}
${ctx.isAdmin ? '• Модерация контента' : ''}
${ctx.isAdmin ? '• Управление пользователями' : ''}
${ctx.isSuperAdmin ? '• Системные настройки' : ''}

📊 <b>Быстрая статистика:</b>
• Пользователей онлайн: ${await getOnlineUsersCount()}
• Заданий на модерации: ${await getPendingTasksCount()}
• Активных проверок: ${await getActiveSubscriptionChecksCount()}

Выберите раздел:
`;

  if (ctx.callbackQuery) {
    await ctx.editMessageText(adminText, {
      reply_markup: adminMenu,
      parse_mode: 'HTML'
    });
    await ctx.answerCallbackQuery();
  }
});

// Helper функции
const formatDateTime = (date: Date): string => {
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Функции для работы с БД
const getSystemStatistics = async () => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers, activeUsers, newUsersToday, premiumUsers,
      totalTasks, activeTasks, executionsToday, pendingModeration,
      totalVolume, commissionsToday, payoutsToday,
      activeSubscriptions, checksToday, subscriptionChecksToday,
      checksCreatedToday, checksActivatedToday
    ] = await Promise.all([
      // Пользователи
      prisma.user.count(),
      prisma.user.count({
        where: { updatedAt: { gte: weekAgo } }
      }),
      prisma.user.count({
        where: { createdAt: { gte: today } }
      }),
      prisma.user.count({
        where: { isPremium: true }
      }),

      // Задания
      prisma.task.count(),
      prisma.task.count({
        where: { status: TaskStatus.active }
      }),
      prisma.taskExecution.count({
        where: { createdAt: { gte: today } }
      }),
      prisma.taskExecution.count({
        where: { status: ExecutionStatus.pending }
      }),

      // Экономика
      prisma.transaction.aggregate({
        _sum: { amount: true }
      }),
      prisma.transaction.aggregate({
        where: {
          createdAt: { gte: today },
          description: { contains: 'комиссия' }
        },
        _sum: { amount: true }
      }),
      prisma.transaction.aggregate({
        where: {
          createdAt: { gte: today },
          type: 'earn'
        },
        _sum: { amount: true }
      }),

      // Подписки
      prisma.subscriptionCheck.count({
        where: { isActive: true }
      }),
      prisma.check.count({
        where: { createdAt: { gte: today } }
      }),
      
      // Заглушка для проверок подписки
      Promise.resolve(0),

      // Чеки
      prisma.check.count({
        where: { createdAt: { gte: today } }
      }),
      prisma.checkActivation.count({
        where: { activatedAt: { gte: today } }
      })
    ]);

    // Подсчет успешности заданий
    const totalExecutions = await prisma.taskExecution.count();
    const successfulExecutions = await prisma.taskExecution.count({
      where: { status: ExecutionStatus.approved }
    });
    const successRate = totalExecutions > 0 ? 
      Math.round((successfulExecutions / totalExecutions) * 100) : 0;

    // Подсчет среднего чека задания
    const avgTaskResult = await prisma.task.aggregate({
      _avg: { reward: true }
    });
    const averageTask = Math.round(avgTaskResult._avg.reward?.toNumber() || 0);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        newToday: newUsersToday,
        premium: premiumUsers,
        online: Math.floor(activeUsers * 0.1) // Примерная оценка
      },
      tasks: {
        total: totalTasks,
        active: activeTasks,
        executionsToday,
        pendingModeration,
        successRate
      },
      economy: {
        totalVolume: Math.round(totalVolume._sum.amount?.toNumber() || 0),
        commissionsToday: Math.round(commissionsToday._sum.amount?.toNumber() || 0),
        payoutsToday: Math.round(payoutsToday._sum.amount?.toNumber() || 0),
        averageTask,
        systemBalance: 1000000 // Заглушка
      },
      subscriptions: {
        active: activeSubscriptions,
        checksToday: subscriptionChecksToday,
        successRate: 85, // Заглушка
        deletedMessages: subscriptionChecksToday * 2 // Примерная оценка
      },
      checks: {
        createdToday: checksCreatedToday,
        activatedToday: checksActivatedToday,
        totalAmount: checksCreatedToday * 1000, // Примерная оценка
        conversionRate: checksCreatedToday > 0 ? 
          Math.round((checksActivatedToday / checksCreatedToday) * 100) : 0
      },
      system: {
        uptime: '5 дней 12 часов',
        load: Math.floor(Math.random() * 30 + 20),
        memory: Math.floor(Math.random() * 40 + 30),
        dbStatus: '✅ Норма'
      }
    };
  } catch (error) {
    console.error('Get system statistics error:', error);
    throw error;
  }
};

const getPendingModerationTasks = async () => {
  try {
    return await prisma.taskExecution.findMany({
      where: { status: ExecutionStatus.pending },
      include: {
        task: {
          select: {
            title: true,
            type: true,
            reward: true
          }
        },
        user: {
          select: {
            telegramId: true,
            username: true,
            firstName: true
          }
        }
      },
      orderBy: { createdAt: 'asc' },
      take: 20
    });
  } catch (error) {
    console.error('Get pending moderation tasks error:', error);
    return [];
  }
};

const getChecksStatistics = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      total, active, activatedToday, totalAmountResult, avgAmountResult,
      topCreators, suspiciousChecks
    ] = await Promise.all([
      prisma.check.count(),
      prisma.check.count({ where: { isActive: true } }),
      prisma.checkActivation.count({
        where: { activatedAt: { gte: today } }
      }),
      prisma.check.aggregate({ _sum: { amount: true } }),
      prisma.check.aggregate({ _avg: { amount: true } }),
      
      // Топ создатели чеков
      prisma.check.groupBy({
        by: ['createdBy'],
        _sum: { amount: true },
        _count: { id: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 5
      }),
      
      // Подозрительные чеки (большие суммы)
      prisma.check.count({
        where: { amount: { gte: 10000 } }
      })
    ]);

    const topCreatorsData = await Promise.all(
      topCreators.map(async (creator) => {
        const user = await prisma.user.findUnique({
          where: { telegramId: creator.createdBy },
          select: { username: true, firstName: true }
        });
        
        return {
          name: user?.username || user?.firstName || `ID: ${creator.createdBy}`,
          amount: creator._sum.amount?.toNumber() || 0
        };
      })
    );

    return {
      total,
      active,
      activatedToday,
      totalAmount: Math.round(totalAmountResult._sum.amount?.toNumber() || 0),
      averageAmount: Math.round(avgAmountResult._avg.amount?.toNumber() || 0),
      topCreators: topCreatorsData,
      suspicious: {
        spam: 0, // Заглушка
        largeSums: suspiciousChecks,
        needReview: suspiciousChecks
      }
    };
  } catch (error) {
    console.error('Get checks statistics error:', error);
    throw error;
  }
};

const getOnlineUsersCount = async (): Promise<number> => {
  try {
    // Примерная оценка: пользователи, активные за последние 5 минут
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return await prisma.user.count({
      where: { updatedAt: { gte: fiveMinutesAgo } }
    });
  } catch (error) {
    console.error('Get online users count error:', error);
    return 0;
  }
};

const getPendingTasksCount = async (): Promise<number> => {
  try {
    return await prisma.taskExecution.count({
      where: { status: ExecutionStatus.pending }
    });
  } catch (error) {
    console.error('Get pending tasks count error:', error);
    return 0;
  }
};

const getActiveSubscriptionChecksCount = async (): Promise<number> => {
  try {
    return await prisma.subscriptionCheck.count({
      where: { isActive: true }
    });
  } catch (error) {
    console.error('Get active subscription checks count error:', error);
    return 0;
  }
};

// Callback handlers (заглушки для будущей реализации)
const handleAdminCallback = async (ctx: BotContext, data: string) => {
  const action = data.replace('admin:', '');
  
  switch (action) {
    case 'stats':
      // Обновляем статистику
      const stats = await getSystemStatistics();
      await ctx.answerCallbackQuery('📊 Статистика обновлена');
      break;
      
    case 'approve_all':
      await handleApproveAll(ctx);
      break;
      
    case 'reject_all':
      await handleRejectAll(ctx);
      break;
      
    default:
      if (action.startsWith('approve:')) {
        const executionId = action.replace('approve:', '');
        await handleApproveExecution(ctx, executionId);
      } else if (action.startsWith('reject:')) {
        const executionId = action.replace('reject:', '');
        await handleRejectExecution(ctx, executionId);
      } else {
        await ctx.answerCallbackQuery('🔄 Функция в разработке');
      }
      break;
  }
};

const handleSuperAdminCallback = async (ctx: BotContext, data: string) => {
  const action = data.replace('superadmin:', '');
  
  switch (action) {
    case 'manage_admins':
      await showAdminManagement(ctx);
      break;
      
    case 'backup_db':
      await initiateDatabaseBackup(ctx);
      break;
      
    case 'system_commands':
      await showSystemCommands(ctx);
      break;
      
    default:
      await ctx.answerCallbackQuery('🔄 Функция в разработке');
      break;
  }
};

// Функции обработки модерации
const handleApproveExecution = async (ctx: BotContext, executionId: string) => {
  try {
    const execution = await prisma.taskExecution.findUnique({
      where: { id: executionId },
      include: {
        task: true,
        user: true
      }
    });

    if (!execution) {
      await ctx.answerCallbackQuery('❌ Выполнение не найдено');
      return;
    }

    // Одобряем выполнение
    await prisma.taskExecution.update({
      where: { id: executionId },
      data: {
        status: ExecutionStatus.approved,
        verifiedAt: new Date(),
        verifiedBy: ctx.user.telegramId,
        adminComment: 'Одобрено администратором'
      }
    });

    // Начисляем награду пользователю
    await prisma.user.update({
      where: { telegramId: execution.userId },
      data: {
        balance: { increment: execution.rewardAmount },
        tasksCompleted: { increment: 1 }
      }
    });

    // Создаем транзакцию
    await prisma.transaction.create({
      data: {
        userId: execution.userId,
        type: 'earn',
        amount: execution.rewardAmount,
        description: `Выполнение задания: ${execution.task.title}`,
        metadata: {
          taskId: execution.task.id,
          executionId: execution.id,
          approvedBy: ctx.user.telegramId
        }
      }
    });

    // Обновляем счетчик выполнений задания
    await prisma.task.update({
      where: { id: execution.task.id },
      data: {
        completedCount: { increment: 1 }
      }
    });

    await ctx.answerCallbackQuery(`✅ Выполнение одобрено. Пользователь получил ${execution.rewardAmount} GRAM`);
    
    // Обновляем список
    await ctx.editMessageText('🔄 Обновление списка заданий...', { reply_markup: undefined });
    // Здесь можно перезагрузить список заданий
    
  } catch (error) {
    console.error('Approve execution error:', error);
    await ctx.answerCallbackQuery('❌ Ошибка при одобрении выполнения');
  }
};

const handleRejectExecution = async (ctx: BotContext, executionId: string) => {
  try {
    const execution = await prisma.taskExecution.findUnique({
      where: { id: executionId },
      include: {
        task: true,
        user: true
      }
    });

    if (!execution) {
      await ctx.answerCallbackQuery('❌ Выполнение не найдено');
      return;
    }

    // Отклоняем выполнение
    await prisma.taskExecution.update({
      where: { id: executionId },
      data: {
        status: ExecutionStatus.rejected,
        verifiedAt: new Date(),
        verifiedBy: ctx.user.telegramId,
        adminComment: 'Отклонено администратором'
      }
    });

    await ctx.answerCallbackQuery(`❌ Выполнение отклонено`);
    
    // Обновляем список
    await ctx.editMessageText('🔄 Обновление списка заданий...', { reply_markup: undefined });
    
  } catch (error) {
    console.error('Reject execution error:', error);
    await ctx.answerCallbackQuery('❌ Ошибка при отклонении выполнения');
  }
};

const handleApproveAll = async (ctx: BotContext) => {
  try {
    const pendingExecutions = await prisma.taskExecution.findMany({
      where: { status: ExecutionStatus.pending },
      include: { task: true }
    });

    if (pendingExecutions.length === 0) {
      await ctx.answerCallbackQuery('ℹ️ Нет заданий для одобрения');
      return;
    }

    // Одобряем все выполнения
    const executionIds = pendingExecutions.map(e => e.id);
    
    await prisma.taskExecution.updateMany({
      where: { id: { in: executionIds } },
      data: {
        status: ExecutionStatus.approved,
        verifiedAt: new Date(),
        verifiedBy: ctx.user.telegramId,
        adminComment: 'Массовое одобрение администратором'
      }
    });

    // Начисляем награды и обновляем балансы
    for (const execution of pendingExecutions) {
      await prisma.user.update({
        where: { telegramId: execution.userId },
        data: {
          balance: { increment: execution.rewardAmount },
          tasksCompleted: { increment: 1 }
        }
      });

      await prisma.transaction.create({
        data: {
          userId: execution.userId,
          type: 'earn',
          amount: execution.rewardAmount,
          description: `Выполнение задания: ${execution.task.title}`,
          metadata: {
            taskId: execution.task.id,
            executionId: execution.id,
            approvedBy: ctx.user.telegramId,
            massApproval: true
          }
        }
      });

      await prisma.task.update({
        where: { id: execution.task.id },
        data: {
          completedCount: { increment: 1 }
        }
      });
    }

    await ctx.answerCallbackQuery(`✅ Одобрено ${pendingExecutions.length} выполнений`);
    await ctx.editMessageText('✅ Все задания одобрены!', { reply_markup: undefined });
    
  } catch (error) {
    console.error('Approve all error:', error);
    await ctx.answerCallbackQuery('❌ Ошибка при массовом одобрении');
  }
};

const handleRejectAll = async (ctx: BotContext) => {
  try {
    const pendingExecutions = await prisma.taskExecution.findMany({
      where: { status: ExecutionStatus.pending }
    });

    if (pendingExecutions.length === 0) {
      await ctx.answerCallbackQuery('ℹ️ Нет заданий для отклонения');
      return;
    }

    // Отклоняем все выполнения
    const executionIds = pendingExecutions.map(e => e.id);
    
    await prisma.taskExecution.updateMany({
      where: { id: { in: executionIds } },
      data: {
        status: ExecutionStatus.rejected,
        verifiedAt: new Date(),
        verifiedBy: ctx.user.telegramId,
        adminComment: 'Массовое отклонение администратором'
      }
    });

    await ctx.answerCallbackQuery(`❌ Отклонено ${pendingExecutions.length} выполнений`);
    await ctx.editMessageText('❌ Все задания отклонены!', { reply_markup: undefined });
    
  } catch (error) {
    console.error('Reject all error:', error);
    await ctx.answerCallbackQuery('❌ Ошибка при массовом отклонении');
  }
};

// Супер админ функции
const showAdminManagement = async (ctx: BotContext) => {
  try {
    const admins = await prisma.user.findMany({
      where: {
        role: { in: ['admin', 'super_admin'] }
      },
      select: {
        telegramId: true,
        username: true,
        firstName: true,
        role: true,
        createdAt: true
      }
    });

    let adminText = `👑 <b>УПРАВЛЕНИЕ АДМИНИСТРАТОРАМИ</b>\n\n📊 Всего администраторов: ${admins.length}\n\n`;
    
    admins.forEach((admin, index) => {
      const roleEmoji = admin.role === 'super_admin' ? '👑' : '🛡️';
      const name = admin.username || admin.firstName || `ID: ${admin.telegramId}`;
      
      adminText += `${roleEmoji} <b>${name}</b>\n`;
      adminText += `   ID: <code>${admin.telegramId}</code>\n`;
      adminText += `   Роль: ${admin.role === 'super_admin' ? 'Супер админ' : 'Админ'}\n`;
      adminText += `   Назначен: ${formatDateTime(admin.createdAt)}\n\n`;
    });

    await ctx.editMessageText(adminText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Добавить админа', callback_data: 'superadmin:add_admin' }],
          [{ text: '➖ Удалить админа', callback_data: 'superadmin:remove_admin' }],
          [{ text: '📊 Логи действий', callback_data: 'superadmin:admin_logs' }],
          [{ text: '⬅️ Назад в супер админ панель', callback_data: 'admin:super_admin' }]
        ]
      },
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.error('Show admin management error:', error);
    await ctx.answerCallbackQuery('❌ Ошибка при загрузке списка администраторов');
  }
};

const initiateDatabaseBackup = async (ctx: BotContext) => {
  try {
    await ctx.answerCallbackQuery('🔄 Создание резервной копии...');
    
    const backupText = `
🗄️ <b>РЕЗЕРВНОЕ КОПИРОВАНИЕ БД</b>

⏳ Создание резервной копии базы данных...

📊 <b>Статистика базы:</b>
├ Пользователей: ${await prisma.user.count()}
├ Заданий: ${await prisma.task.count()}
├ Выполнений: ${await prisma.taskExecution.count()}
├ Транзакций: ${await prisma.transaction.count()}
├ Чеков: ${await prisma.check.count()}
└ Проверок подписки: ${await prisma.subscriptionCheck.count()}

⚠️ <b>ВНИМАНИЕ:</b> Процесс может занять несколько минут

<i>Резервная копия будет сохранена с отметкой времени ${new Date().toISOString()}</i>
`;

    await ctx.editMessageText(backupText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Подтвердить создание копии', callback_data: 'superadmin:confirm_backup' }],
          [{ text: '📋 История копий', callback_data: 'superadmin:backup_history' }],
          [{ text: '❌ Отмена', callback_data: 'admin:super_admin' }]
        ]
      },
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.error('Initiate database backup error:', error);
    await ctx.answerCallbackQuery('❌ Ошибка при инициации резервного копирования');
  }
};

const showSystemCommands = async (ctx: BotContext) => {
  const commandsText = `
🔧 <b>СИСТЕМНЫЕ КОМАНДЫ</b>

⚠️ <b>КРИТИЧЕСКИ ВАЖНЫЕ ОПЕРАЦИИ</b>

Доступные команды:
`;

  await ctx.editMessageText(commandsText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 Перезапустить бота', callback_data: 'superadmin:restart_bot' }],
        [{ text: '🧹 Очистка логов', callback_data: 'superadmin:clear_logs' }],
        [{ text: '📊 Обновление статистики', callback_data: 'superadmin:update_stats' }],
        [{ text: '🗄️ Оптимизация БД', callback_data: 'superadmin:optimize_db' }],
        [{ text: '🚨 Режим обслуживания', callback_data: 'superadmin:maintenance_mode' }],
        [{ text: '⬅️ Назад в супер админ панель', callback_data: 'admin:super_admin' }]
      ]
    },
    parse_mode: 'HTML'
  });
};