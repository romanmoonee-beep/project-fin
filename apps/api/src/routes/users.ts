import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@pr-gram/database';
import { UserLevel, UserRole, TransactionType } from '@pr-gram/shared';

interface UsersQuerystring {
  page?: number;
  limit?: number;
  search?: string;
  level?: UserLevel;
  role?: UserRole;
  isPremium?: boolean;
  sortBy?: 'createdAt' | 'balance' | 'totalEarned' | 'tasksCompleted';
  sortOrder?: 'asc' | 'desc';
  registeredAfter?: string;
  registeredBefore?: string;
}

interface UserParams {
  id: string;
}

interface UpdateUserBody {
  firstName?: string;
  lastName?: string;
  username?: string;
  level?: UserLevel;
  role?: UserRole;
  isPremium?: boolean;
  balanceOperation?: {
    type: 'add' | 'subtract' | 'set';
    amount: number;
    reason: string;
  };
}

interface MassActionBody {
  userIds: string[];
  action: 'ban' | 'unban' | 'changeLevel' | 'balanceOperation' | 'sendNotification';
  payload?: any;
}

export default async function usersRoutes(fastify: FastifyInstance) {

  // GET /users - Список пользователей с фильтрами и пагинацией
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Users'],
      summary: 'Get users list with filters and pagination',
      security: [{ JWT: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          search: { type: 'string', description: 'Search by username, firstName, lastName' },
          level: { type: 'string', enum: Object.values(UserLevel) },
          role: { type: 'string', enum: Object.values(UserRole) },
          isPremium: { type: 'boolean' },
          sortBy: { type: 'string', enum: ['createdAt', 'balance', 'totalEarned', 'tasksCompleted'], default: 'createdAt' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          registeredAfter: { type: 'string', format: 'date' },
          registeredBefore: { type: 'string', format: 'date' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: UsersQuerystring }>, reply: FastifyReply) => {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        level,
        role,
        isPremium,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        registeredAfter,
        registeredBefore
      } = request.query;

      const offset = (page - 1) * limit;

      // Строим условия фильтрации
      const where: any = {};

      if (search) {
        where.OR = [
          { username: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (level) where.level = level;
      if (role) where.role = role;
      if (typeof isPremium === 'boolean') where.isPremium = isPremium;
      
      if (registeredAfter || registeredBefore) {
        where.createdAt = {};
        if (registeredAfter) where.createdAt.gte = new Date(registeredAfter);
        if (registeredBefore) where.createdAt.lte = new Date(registeredBefore);
      }

      // Параллельные запросы
      const [users, totalCount] = await Promise.all([
        prisma.user.findMany({
          where,
          skip: offset,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          select: {
            id: true,
            telegramId: true,
            username: true,
            firstName: true,
            lastName: true,
            level: true,
            role: true,
            balance: true,
            frozenBalance: true,
            totalEarned: true,
            totalSpent: true,
            tasksCompleted: true,
            tasksCreated: true,
            isPremium: true,
            premiumUntil: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                referrals: true
              }
            }
          }
        }),
        prisma.user.count({ where })
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      return {
        success: true,
        data: {
          users: users.map(user => ({
            ...user,
            telegramId: Number(user.telegramId),
            balance: Number(user.balance),
            frozenBalance: Number(user.frozenBalance),
            totalEarned: Number(user.totalEarned),
            totalSpent: Number(user.totalSpent),
            referralsCount: user._count.referrals
          })),
          pagination: {
            page,
            limit,
            total: totalCount,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        }
      };

    } catch (error) {
      fastify.log.error('Get users error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch users'
      });
    }
  });

  // GET /users/:id - Детальная информация о пользователе
  fastify.get<{ Params: UserParams }>('/:id', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Users'],
      summary: 'Get user details by ID',
      security: [{ JWT: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest<{ Params: UserParams }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;

      // Находим пользователя
      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          referrer: {
            select: {
              telegramId: true,
              username: true,
              level: true
            }
          },
          _count: {
            select: {
              referrals: true,
              createdTasks: true,
              taskExecutions: true,
              createdChecks: true,
              checkActivations: true,
              transactions: true,
              notifications: true
            }
          }
        }
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: 'User not found'
        });
      }

      // Получаем дополнительную статистику
      const [
        recentTransactions,
        recentTasks,
        referralStats,
        activityStats
      ] = await Promise.all([
        // Последние 10 транзакций
        prisma.transaction.findMany({
          where: { userId: user.telegramId },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            type: true,
            amount: true,
            description: true,
            createdAt: true
          }
        }),

        // Последние 5 заданий
        prisma.taskExecution.findMany({
          where: { userId: user.telegramId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            task: {
              select: {
                id: true,
                title: true,
                type: true,
                reward: true
              }
            }
          }
        }),

        // Статистика рефералов
        prisma.user.findMany({
          where: { referrerId: user.telegramId },
          select: {
            telegramId: true,
            username: true,
            level: true,
            isPremium: true,
            totalEarned: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        }),

        // Активность за последние 30 дней
        prisma.userActivity.groupBy({
          by: ['type'],
          where: {
            userId: user.telegramId,
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            }
          },
          _count: { type: true }
        })
      ]);

      return {
        success: true,
        data: {
          user: {
            ...user,
            telegramId: Number(user.telegramId),
            balance: Number(user.balance),
            frozenBalance: Number(user.frozenBalance),
            totalEarned: Number(user.totalEarned),
            totalSpent: Number(user.totalSpent),
            referrer: user.referrer ? {
              ...user.referrer,
              telegramId: Number(user.referrer.telegramId)
            } : null
          },
          statistics: {
            counts: user._count,
            activity: activityStats.reduce((acc, item) => {
              acc[item.type] = item._count.type;
              return acc;
            }, {} as Record<string, number>)
          },
          recentTransactions: recentTransactions.map(t => ({
            ...t,
            amount: Number(t.amount)
          })),
          recentTasks: recentTasks.map(t => ({
            ...t,
            rewardAmount: Number(t.rewardAmount),
            task: t.task ? {
              ...t.task,
              reward: Number(t.task.reward)
            } : null
          })),
          referrals: referralStats.map(r => ({
            ...r,
            telegramId: Number(r.telegramId),
            totalEarned: Number(r.totalEarned)
          }))
        }
      };

    } catch (error) {
      fastify.log.error('Get user details error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch user details'
      });
    }
  });

  // PUT /users/:id - Редактирование пользователя
  fastify.put<{ Params: UserParams; Body: UpdateUserBody }>('/:id', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Users'],
      summary: 'Update user information',
      security: [{ JWT: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          firstName: { type: 'string', maxLength: 255 },
          lastName: { type: 'string', maxLength: 255 },
          username: { type: 'string', maxLength: 255 },
          level: { type: 'string', enum: Object.values(UserLevel) },
          role: { type: 'string', enum: Object.values(UserRole) },
          isPremium: { type: 'boolean' },
          balanceOperation: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['add', 'subtract', 'set'] },
              amount: { type: 'number', minimum: 0 },
              reason: { type: 'string', minLength: 1, maxLength: 500 }
            },
            required: ['type', 'amount', 'reason']
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: UserParams; Body: UpdateUserBody }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const { balanceOperation, ...updateData } = request.body;
      const adminUser = (request as any).user;

      // Находим пользователя
      const user = await prisma.user.findUnique({
        where: { id }
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: 'User not found'
        });
      }

      // Проверяем права на изменение роли
      if (updateData.role && adminUser.role !== UserRole.SUPER_ADMIN) {
        return reply.status(403).send({
          success: false,
          error: 'Only super admin can change user roles'
        });
      }

      // Начинаем транзакцию
      const result = await prisma.$transaction(async (tx) => {
        // Обновляем основные данные
        const updatedUser = await tx.user.update({
          where: { id },
          data: updateData
        });

        // Обрабатываем операцию с балансом
        if (balanceOperation) {
          const currentBalance = Number(user.balance);
          let newBalance: number;

          switch (balanceOperation.type) {
            case 'add':
              newBalance = currentBalance + balanceOperation.amount;
              break;
            case 'subtract':
              newBalance = Math.max(0, currentBalance - balanceOperation.amount);
              break;
            case 'set':
              newBalance = balanceOperation.amount;
              break;
          }

          // Обновляем баланс
          await tx.user.update({
            where: { id },
            data: { balance: newBalance }
          });

          // Создаем транзакцию
          await tx.transaction.create({
            data: {
              userId: user.telegramId,
              type: balanceOperation.type === 'subtract' ? TransactionType.PENALTY : TransactionType.BONUS,
              amount: balanceOperation.type === 'subtract' ? -balanceOperation.amount : balanceOperation.amount,
              description: `Admin ${balanceOperation.type}: ${balanceOperation.reason}`,
              metadata: {
                adminId: adminUser.userId,
                previousBalance: currentBalance,
                newBalance,
                operationType: balanceOperation.type
              }
            }
          });

          // Логируем активность
          await tx.userActivity.create({
            data: {
              userId: user.telegramId,
              type: 'admin_balance_change',
              description: `Balance ${balanceOperation.type} by admin`,
              metadata: {
                adminId: adminUser.userId,
                amount: balanceOperation.amount,
                reason: balanceOperation.reason,
                previousBalance: currentBalance,
                newBalance
              }
            }
          });

          updatedUser.balance = newBalance;
        }

        return updatedUser;
      });

      // Публикуем событие обновления пользователя
      await fastify.eventBus.publish('user:updated', {
        userId: Number(user.telegramId),
        changes: {
          ...updateData,
          ...(balanceOperation && { balanceChanged: true })
        }
      });

      // Если изменился уровень, публикуем отдельное событие
      if (updateData.level && updateData.level !== user.level) {
        await fastify.eventBus.publish('user:level_changed', {
          userId: Number(user.telegramId),
          oldLevel: user.level,
          newLevel: updateData.level
        });
      }

      // Логируем действие админа
      await prisma.userActivity.create({
        data: {
          userId: BigInt(adminUser.userId),
          type: 'admin_action',
          description: `Updated user ${user.username || user.telegramId}`,
          metadata: {
            targetUserId: Number(user.telegramId),
            changes: updateData
          }
        }
      });

      return {
        success: true,
        data: {
          user: {
            ...result,
            telegramId: Number(result.telegramId),
            balance: Number(result.balance),
            frozenBalance: Number(result.frozenBalance),
            totalEarned: Number(result.totalEarned),
            totalSpent: Number(result.totalSpent)
          }
        },
        message: 'User updated successfully'
      };

    } catch (error) {
      fastify.log.error('Update user error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to update user'
      });
    }
  });

  // POST /users/mass-action - Массовые операции с пользователями
  fastify.post<{ Body: MassActionBody }>('/mass-action', {
    preHandler: [fastify.authenticate, fastify.requireSuperAdmin],
    schema: {
      tags: ['Users'],
      summary: 'Perform mass actions on users',
      security: [{ JWT: [] }],
      body: {
        type: 'object',
        properties: {
          userIds: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 100
          },
          action: {
            type: 'string',
            enum: ['ban', 'unban', 'changeLevel', 'balanceOperation', 'sendNotification']
          },
          payload: { type: 'object' }
        },
        required: ['userIds', 'action']
      }
    }
  }, async (request: FastifyRequest<{ Body: MassActionBody }>, reply: FastifyReply) => {
    try {
      const { userIds, action, payload } = request.body;
      const adminUser = (request as any).user;

      // Валидация payload в зависимости от действия
      if (action === 'changeLevel' && (!payload?.level || !Object.values(UserLevel).includes(payload.level))) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid level specified for changeLevel action'
        });
      }

      if (action === 'balanceOperation' && (!payload?.type || !payload?.amount || !payload?.reason)) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid payload for balanceOperation action'
        });
      }

      let results: any[] = [];

      // Выполняем массовую операцию в транзакции
      await prisma.$transaction(async (tx) => {
        for (const userId of userIds) {
          try {
            const user = await tx.user.findUnique({
              where: { id: userId }
            });

            if (!user) {
              results.push({ userId, success: false, error: 'User not found' });
              continue;
            }

            switch (action) {
              case 'ban':
                await tx.user.update({
                  where: { id: userId },
                  data: { role: UserRole.USER, metadata: { ...user.metadata, banned: true, bannedAt: new Date(), bannedBy: adminUser.userId } }
                });
                break;

              case 'unban':
                await tx.user.update({
                  where: { id: userId },
                  data: { metadata: { ...user.metadata, banned: false, unbannedAt: new Date(), unbannedBy: adminUser.userId } }
                });
                break;

              case 'changeLevel':
                await tx.user.update({
                  where: { id: userId },
                  data: { level: payload.level }
                });
                break;

              case 'balanceOperation':
                const currentBalance = Number(user.balance);
                let newBalance: number;

                switch (payload.type) {
                  case 'add':
                    newBalance = currentBalance + payload.amount;
                    break;
                  case 'subtract':
                    newBalance = Math.max(0, currentBalance - payload.amount);
                    break;
                  case 'set':
                    newBalance = payload.amount;
                    break;
                }

                await tx.user.update({
                  where: { id: userId },
                  data: { balance: newBalance }
                });

                await tx.transaction.create({
                  data: {
                    userId: user.telegramId,
                    type: payload.type === 'subtract' ? TransactionType.PENALTY : TransactionType.BONUS,
                    amount: payload.type === 'subtract' ? -payload.amount : payload.amount,
                    description: `Mass admin ${payload.type}: ${payload.reason}`,
                    metadata: {
                      adminId: adminUser.userId,
                      massAction: true,
                      previousBalance: currentBalance,
                      newBalance
                    }
                  }
                });
                break;
            }

            results.push({ userId, success: true });

          } catch (error) {
            results.push({ 
              userId, 
              success: false, 
              error: error instanceof Error ? error.message : 'Unknown error' 
            });
          }
        }
      });

      // Публикуем событие массовой операции
      await fastify.eventBus.publish('admin:bulk_operation', {
        adminId: adminUser.userId,
        operation: action,
        affectedIds: userIds,
        results
      });

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      return {
        success: true,
        data: {
          processed: results.length,
          successful: successCount,
          failed: failureCount,
          results
        },
        message: `Mass action completed: ${successCount} successful, ${failureCount} failed`
      };

    } catch (error) {
      fastify.log.error('Mass action error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to perform mass action'
      });
    }
  });

  // GET /users/export - Экспорт пользователей
  fastify.get('/export', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Users'],
      summary: 'Export users data',
      security: [{ JWT: [] }],
      querystring: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['csv', 'json'], default: 'csv' },
          filters: { type: 'string', description: 'JSON string with filters' }
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Querystring: { format?: 'csv' | 'json'; filters?: string } 
  }>, reply: FastifyReply) => {
    try {
      const { format = 'csv', filters } = request.query;
      const adminUser = (request as any).user;

      // Парсим фильтры
      let where = {};
      if (filters) {
        try {
          where = JSON.parse(filters);
        } catch (error) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid filters JSON'
          });
        }
      }

      // Получаем пользователей
      const users = await prisma.user.findMany({
        where,
        select: {
          telegramId: true,
          username: true,
          firstName: true,
          lastName: true,
          level: true,
          role: true,
          balance: true,
          totalEarned: true,
          totalSpent: true,
          tasksCompleted: true,
          tasksCreated: true,
          isPremium: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' }
      });

      // Логируем экспорт
      await prisma.userActivity.create({
        data: {
          userId: BigInt(adminUser.userId),
          type: 'admin_action',
          description: `Exported ${users.length} users in ${format} format`,
          metadata: {
            exportCount: users.length,
            format,
            filters: where
          }
        }
      });

      if (format === 'json') {
        reply.header('Content-Type', 'application/json');
        reply.header('Content-Disposition', `attachment; filename="users-export-${new Date().toISOString().split('T')[0]}.json"`);
        
        return {
          success: true,
          data: {
            users: users.map(user => ({
              ...user,
              telegramId: Number(user.telegramId),
              balance: Number(user.balance),
              totalEarned: Number(user.totalEarned),
              totalSpent: Number(user.totalSpent)
            })),
            exportedAt: new Date().toISOString(),
            totalCount: users.length
          }
        };
      } else {
        // CSV format
        const csvHeader = 'Telegram ID,Username,First Name,Last Name,Level,Role,Balance,Total Earned,Total Spent,Tasks Completed,Tasks Created,Is Premium,Registered At\n';
        const csvRows = users.map(user => [
          user.telegramId,
          user.username || '',
          user.firstName || '',
          user.lastName || '',
          user.level,
          user.role,
          Number(user.balance),
          Number(user.totalEarned),
          Number(user.totalSpent),
          user.tasksCompleted,
          user.tasksCreated,
          user.isPremium,
          user.createdAt.toISOString()
        ].join(','));

        const csv = csvHeader + csvRows.join('\n');

        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', `attachment; filename="users-export-${new Date().toISOString().split('T')[0]}.csv"`);
        
        return csv;
      }

    } catch (error) {
      fastify.log.error('Export users error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to export users'
      });
    }
  });
}