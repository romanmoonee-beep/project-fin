import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@pr-gram/database';
import { UserLevel, TaskStatus, ExecutionStatus, TransactionType } from '@pr-gram/shared';

export default async function dashboardRoutes(fastify: FastifyInstance) {
  
  // GET /dashboard/stats - Общая статистика для главной страницы
  fastify.get('/stats', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Dashboard'],
      summary: 'Get dashboard statistics',
      security: [{ JWT: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                users: { type: 'object' },
                tasks: { type: 'object' },
                finances: { type: 'object' },
                checks: { type: 'object' },
                subscriptions: { type: 'object' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

      // Параллельные запросы для производительности
      const [
        // Пользователи
        totalUsers,
        newUsersToday,
        newUsersYesterday,
        activeUsersToday,
        usersByLevel,
        totalBalance,
        
        // Задания
        totalTasks,
        activeTasks,
        completedTasksToday,
        pendingExecutions,
        tasksThisMonth,
        
        // Финансы
        totalEarnings,
        totalSpendings,
        transactionsToday,
        systemCommissions,
        
        // Чеки
        totalChecks,
        activeChecks,
        checkActivationsToday,
        
        // Проверки подписки
        totalSubscriptionChecks,
        activeSubscriptionChecks,
        subscriptionChecksToday
      ] = await Promise.all([
        // Статистика пользователей
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: today } } }),
        prisma.user.count({ where: { createdAt: { gte: yesterday, lt: today } } }),
        prisma.userActivity.count({ 
          where: { 
            createdAt: { gte: today },
            type: { in: ['bot_interaction', 'task_execution', 'check_activation'] }
          },
          distinct: ['userId']
        }),
        prisma.user.groupBy({
          by: ['level'],
          _count: { level: true }
        }),
        prisma.user.aggregate({
          _sum: { balance: true }
        }),
        
        // Статистика заданий
        prisma.task.count(),
        prisma.task.count({ where: { status: TaskStatus.ACTIVE } }),
        prisma.taskExecution.count({ 
          where: { 
            createdAt: { gte: today },
            status: ExecutionStatus.APPROVED
          }
        }),
        prisma.taskExecution.count({ where: { status: ExecutionStatus.PENDING } }),
        prisma.task.count({ where: { createdAt: { gte: lastMonth } } }),
        
        // Статистика финансов
        prisma.transaction.aggregate({
          where: { type: TransactionType.EARN },
          _sum: { amount: true }
        }),
        prisma.transaction.aggregate({
          where: { type: TransactionType.SPEND },
          _sum: { amount: true }
        }),
        prisma.transaction.count({ where: { createdAt: { gte: today } } }),
        prisma.transaction.aggregate({
          where: { 
            type: { in: [TransactionType.PENALTY] },
            description: { contains: 'commission' }
          },
          _sum: { amount: true }
        }),
        
        // Статистика чеков
        prisma.check.count(),
        prisma.check.count({ where: { isActive: true } }),
        prisma.checkActivation.count({ where: { activatedAt: { gte: today } } }),
        
        // Статистика проверок подписки
        prisma.subscriptionCheck.count(),
        prisma.subscriptionCheck.count({ where: { isActive: true } }),
        prisma.subscriptionCheck.count({ where: { createdAt: { gte: today } } })
      ]);

      // Подсчет изменений
      const newUsersTodayCount = newUsersToday || 0;
      const newUsersYesterdayCount = newUsersYesterday || 0;
      const userGrowthPercent = newUsersYesterdayCount > 0 
        ? ((newUsersTodayCount - newUsersYesterdayCount) / newUsersYesterdayCount * 100)
        : newUsersTodayCount > 0 ? 100 : 0;

      // Форматируем данные по уровням
      const levelDistribution = usersByLevel.reduce((acc, item) => {
        acc[item.level] = item._count.level;
        return acc;
      }, {} as Record<UserLevel, number>);

      // Публикуем событие обновления статистики
      await fastify.eventBus.publish('system:stats_updated', {
        timestamp: now,
        stats: {
          totalUsers,
          newUsersToday: newUsersTodayCount,
          activeTasks,
          systemRevenue: Number(systemCommissions._sum.amount || 0)
        }
      });

      return {
        success: true,
        data: {
          users: {
            total: totalUsers,
            newToday: newUsersTodayCount,
            newYesterday: newUsersYesterdayCount,
            activeToday: activeUsersToday,
            growthPercent: Math.round(userGrowthPercent * 100) / 100,
            byLevel: {
              bronze: levelDistribution[UserLevel.BRONZE] || 0,
              silver: levelDistribution[UserLevel.SILVER] || 0,
              gold: levelDistribution[UserLevel.GOLD] || 0,
              premium: levelDistribution[UserLevel.PREMIUM] || 0
            },
            totalBalance: Number(totalBalance._sum.balance || 0)
          },
          tasks: {
            total: totalTasks,
            active: activeTasks,
            completedToday: completedTasksToday,
            pendingModeration: pendingExecutions,
            createdThisMonth: tasksThisMonth,
            completionRate: totalTasks > 0 ? Math.round((completedTasksToday / totalTasks) * 100) : 0
          },
          finances: {
            totalEarnings: Number(totalEarnings._sum.amount || 0),
            totalSpendings: Number(totalSpendings._sum.amount || 0),
            systemCommissions: Number(systemCommissions._sum.amount || 0),
            transactionsToday: transactionsToday,
            dailyTurnover: Number(totalEarnings._sum.amount || 0) + Number(totalSpendings._sum.amount || 0),
            profitMargin: totalEarnings._sum.amount 
              ? Math.round((Number(systemCommissions._sum.amount || 0) / Number(totalEarnings._sum.amount)) * 100)
              : 0
          },
          checks: {
            total: totalChecks,
            active: activeChecks,
            activationsToday: checkActivationsToday,
            utilizationRate: totalChecks > 0 ? Math.round((checkActivationsToday / totalChecks) * 100) : 0
          },
          subscriptions: {
            total: totalSubscriptionChecks,
            active: activeSubscriptionChecks,
            setupToday: subscriptionChecksToday
          },
          lastUpdated: now.toISOString()
        }
      };

    } catch (error) {
      fastify.log.error('Dashboard stats error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch dashboard statistics'
      });
    }
  });

  // GET /dashboard/activity - Лента активности для dashboard
  fastify.get('/activity', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Dashboard'],
      summary: 'Get recent activity feed',
      security: [{ JWT: [] }],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
          types: { type: 'string', description: 'Comma-separated activity types' }
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Querystring: { limit?: number; types?: string } 
  }>, reply: FastifyReply) => {
    try {
      const { limit = 10, types } = request.query;
      
      // Фильтры по типам активности
      const activityTypes = types 
        ? types.split(',').map(t => t.trim())
        : ['task_completed', 'task_created', 'check_activated', 'user_registered', 'admin_action'];

      // Получаем последние активности
      const activities = await prisma.userActivity.findMany({
        where: {
          type: { in: activityTypes }
        },
        include: {
          user: {
            select: {
              telegramId: true,
              username: true,
              level: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit
      });

      // Параллельно получаем связанные данные
      const enrichedActivities = await Promise.all(
        activities.map(async (activity) => {
          let enrichedData: any = {
            ...activity,
            user: {
              telegramId: Number(activity.user.telegramId),
              username: activity.user.username,
              level: activity.user.level
            }
          };

          // Обогащаем данными в зависимости от типа
          if (activity.type === 'task_completed' && activity.metadata?.taskId) {
            const task = await prisma.task.findUnique({
              where: { id: activity.metadata.taskId },
              select: { title: true, reward: true, type: true }
            });
            enrichedData.task = task;
          }

          if (activity.type === 'check_activated' && activity.metadata?.checkId) {
            const check = await prisma.check.findUnique({
              where: { id: activity.metadata.checkId },
              select: { amount: true, comment: true }
            });
            enrichedData.check = check;
          }

          return enrichedData;
        })
      );

      return {
        success: true,
        data: {
          activities: enrichedActivities,
          total: enrichedActivities.length,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      fastify.log.error('Dashboard activity error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch activity feed'
      });
    }
  });

  // GET /dashboard/charts - Данные для графиков
  fastify.get('/charts', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Dashboard'],
      summary: 'Get chart data for dashboard',
      security: [{ JWT: [] }],
      querystring: {
        type: 'object',
        properties: {
          period: { 
            type: 'string', 
            enum: ['7d', '30d', '90d'], 
            default: '7d',
            description: 'Time period for charts'
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Querystring: { period?: '7d' | '30d' | '90d' } 
  }>, reply: FastifyReply) => {
    try {
      const { period = '7d' } = request.query;
      
      // Вычисляем период
      const now = new Date();
      const daysBack = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

      // Генерируем массив дат для оси X
      const dateRange = Array.from({ length: daysBack }, (_, i) => {
        const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
        return date.toISOString().split('T')[0]; // YYYY-MM-DD format
      });

      // Получаем данные по дням
      const [userStats, taskStats, financeStats] = await Promise.all([
        // Регистрации пользователей по дням
        prisma.$queryRaw`
          SELECT DATE(created_at) as date, COUNT(*)::int as count
          FROM users 
          WHERE created_at >= ${startDate}
          GROUP BY DATE(created_at)
          ORDER BY date
        `,
        
        // Выполнения заданий по дням
        prisma.$queryRaw`
          SELECT DATE(created_at) as date, COUNT(*)::int as count
          FROM task_executions 
          WHERE created_at >= ${startDate} AND status = 'approved'
          GROUP BY DATE(created_at)
          ORDER BY date
        `,
        
        // Транзакции по дням
        prisma.$queryRaw`
          SELECT DATE(created_at) as date, 
                 SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END)::float as income,
                 SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END)::float as expense
          FROM transactions 
          WHERE created_at >= ${startDate}
          GROUP BY DATE(created_at)
          ORDER BY date
        `
      ]);

      // Преобразуем данные в формат для графиков
      const userChart = dateRange.map(date => {
        const stat = (userStats as any[]).find(s => s.date.toISOString().split('T')[0] === date);
        return {
          date,
          users: stat?.count || 0
        };
      });

      const taskChart = dateRange.map(date => {
        const stat = (taskStats as any[]).find(s => s.date.toISOString().split('T')[0] === date);
        return {
          date,
          tasks: stat?.count || 0
        };
      });

      const financeChart = dateRange.map(date => {
        const stat = (financeStats as any[]).find(s => s.date.toISOString().split('T')[0] === date);
        return {
          date,
          income: stat?.income || 0,
          expense: stat?.expense || 0,
          profit: (stat?.income || 0) - (stat?.expense || 0)
        };
      });

      return {
        success: true,
        data: {
          period,
          dateRange,
          users: userChart,
          tasks: taskChart,
          finances: financeChart,
          summary: {
            totalNewUsers: userChart.reduce((sum, day) => sum + day.users, 0),
            totalCompletedTasks: taskChart.reduce((sum, day) => sum + day.tasks, 0),
            totalIncome: financeChart.reduce((sum, day) => sum + day.income, 0),
            totalExpense: financeChart.reduce((sum, day) => sum + day.expense, 0),
            totalProfit: financeChart.reduce((sum, day) => sum + day.profit, 0)
          }
        }
      };

    } catch (error) {
      fastify.log.error('Dashboard charts error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch chart data'
      });
    }
  });

  // GET /dashboard/top-performers - Топ пользователи
  fastify.get('/top-performers', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Dashboard'],
      summary: 'Get top performing users',
      security: [{ JWT: [] }],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
          type: { 
            type: 'string', 
            enum: ['earnings', 'tasks', 'referrals'], 
            default: 'earnings' 
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Querystring: { limit?: number; type?: 'earnings' | 'tasks' | 'referrals' } 
  }>, reply: FastifyReply) => {
    try {
      const { limit = 10, type = 'earnings' } = request.query;

      let topUsers;

      switch (type) {
        case 'earnings':
          topUsers = await prisma.user.findMany({
            select: {
              telegramId: true,
              username: true,
              level: true,
              totalEarned: true,
              createdAt: true
            },
            orderBy: { totalEarned: 'desc' },
            take: limit,
            where: { totalEarned: { gt: 0 } }
          });
          break;

        case 'tasks':
          topUsers = await prisma.user.findMany({
            select: {
              telegramId: true,
              username: true,
              level: true,
              tasksCompleted: true,
              createdAt: true
            },
            orderBy: { tasksCompleted: 'desc' },
            take: limit,
            where: { tasksCompleted: { gt: 0 } }
          });
          break;

        case 'referrals':
          topUsers = await prisma.user.findMany({
            select: {
              telegramId: true,
              username: true,
              level: true,
              createdAt: true,
              _count: {
                select: { referrals: true }
              }
            },
            orderBy: {
              referrals: { _count: 'desc' }
            },
            take: limit
          });
          break;
      }

      // Форматируем данные
      const formattedUsers = topUsers.map((user, index) => ({
        rank: index + 1,
        telegramId: Number(user.telegramId),
        username: user.username || `User ${Number(user.telegramId)}`,
        level: user.level,
        value: type === 'earnings' ? Number(user.totalEarned) :
               type === 'tasks' ? user.tasksCompleted :
               (user as any)._count?.referrals || 0,
        registeredAt: user.createdAt
      }));

      return {
        success: true,
        data: {
          type,
          performers: formattedUsers,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      fastify.log.error('Top performers error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch top performers'
      });
    }
  });
}