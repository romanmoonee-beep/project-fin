import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@pr-gram/database';
import { TransactionType } from '@pr-gram/shared';

interface ChecksQuerystring {
  page?: number;
  limit?: number;
  search?: string;
  createdBy?: string;
  isActive?: boolean;
  hasPassword?: boolean;
  minAmount?: number;
  maxAmount?: number;
  sortBy?: 'createdAt' | 'amount' | 'currentActivations';
  sortOrder?: 'asc' | 'desc';
  createdAfter?: string;
  createdBefore?: string;
}

interface CheckParams {
  id: string;
}

interface CreateCheckBody {
  amount: number;
  maxActivations: number;
  password?: string;
  comment?: string;
  imageUrl?: string;
  conditions?: any;
  design?: any;
  expiresAt?: string;
  createdBy?: number;
}

interface UpdateCheckBody {
  maxActivations?: number;
  password?: string;
  comment?: string;
  imageUrl?: string;
  isActive?: boolean;
  expiresAt?: string;
}

export default async function checksRoutes(fastify: FastifyInstance) {

  // GET /checks - Список чеков с фильтрами
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Checks'],
      summary: 'Get checks list with filters and pagination',
      security: [{ JWT: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          search: { type: 'string', description: 'Search by comment or ID' },
          createdBy: { type: 'string' },
          isActive: { type: 'boolean' },
          hasPassword: { type: 'boolean' },
          minAmount: { type: 'number', minimum: 0 },
          maxAmount: { type: 'number', minimum: 0 },
          sortBy: { type: 'string', enum: ['createdAt', 'amount', 'currentActivations'], default: 'createdAt' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          createdAfter: { type: 'string', format: 'date' },
          createdBefore: { type: 'string', format: 'date' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: ChecksQuerystring }>, reply: FastifyReply) => {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        createdBy,
        isActive,
        hasPassword,
        minAmount,
        maxAmount,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        createdAfter,
        createdBefore
      } = request.query;

      const offset = (page - 1) * limit;

      // Строим условия фильтрации
      const where: any = {};

      if (search) {
        where.OR = [
          { comment: { contains: search, mode: 'insensitive' } },
          { uuid: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (createdBy) where.createdBy = BigInt(createdBy);
      if (typeof isActive === 'boolean') where.isActive = isActive;
      if (typeof hasPassword === 'boolean') {
        where.password = hasPassword ? { not: null } : null;
      }

      if (minAmount !== undefined || maxAmount !== undefined) {
        where.amount = {};
        if (minAmount !== undefined) where.amount.gte = minAmount;
        if (maxAmount !== undefined) where.amount.lte = maxAmount;
      }

      if (createdAfter || createdBefore) {
        where.createdAt = {};
        if (createdAfter) where.createdAt.gte = new Date(createdAfter);
        if (createdBefore) where.createdAt.lte = new Date(createdBefore);
      }

      // Параллельные запросы
      const [checks, totalCount, quickStats] = await Promise.all([
        prisma.check.findMany({
          where,
          skip: offset,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            creator: {
              select: {
                telegramId: true,
                username: true,
                level: true
              }
            },
            _count: {
              select: {
                activations: true
              }
            }
          }
        }),
        prisma.check.count({ where }),
        prisma.check.aggregate({
          _count: { id: true },
          _sum: { amount: true, currentActivations: true },
          where: isActive !== undefined ? { isActive } : undefined
        })
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      return {
        success: true,
        data: {
          checks: checks.map(check => ({
            ...check,
            createdBy: Number(check.createdBy),
            amount: Number(check.amount),
            creator: check.creator ? {
              ...check.creator,
              telegramId: Number(check.creator.telegramId)
            } : null,
            activationsCount: check._count.activations,
            hasPassword: !!check.password
          })),
          pagination: {
            page,
            limit,
            total: totalCount,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          },
          stats: {
            total: quickStats._count.id,
            totalAmount: Number(quickStats._sum.amount || 0),
            totalActivations: quickStats._sum.currentActivations || 0
          }
        }
      };

    } catch (error) {
      fastify.log.error('Get checks error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch checks'
      });
    }
  });

  // GET /checks/:id - Детали чека
  fastify.get<{ Params: CheckParams }>('/:id', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Checks'],
      summary: 'Get check details by ID',
      security: [{ JWT: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest<{ Params: CheckParams }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;

      const check = await prisma.check.findUnique({
        where: { id },
        include: {
          creator: {
            select: {
              telegramId: true,
              username: true,
              firstName: true,
              level: true,
              role: true
            }
          },
          activations: {
            include: {
              user: {
                select: {
                  telegramId: true,
                  username: true,
                  level: true
                }
              }
            },
            orderBy: { activatedAt: 'desc' },
            take: 20
          },
          _count: {
            select: {
              activations: true
            }
          }
        }
      });

      if (!check) {
        return reply.status(404).send({
          success: false,
          error: 'Check not found'
        });
      }

      // Статистика активаций по дням
      const activationsByDay = await prisma.$queryRaw`
        SELECT DATE(activated_at) as date, COUNT(*)::int as count, SUM(amount)::float as amount
        FROM check_activations 
        WHERE check_id = ${id}
        GROUP BY DATE(activated_at)
        ORDER BY date DESC
        LIMIT 7
      `;

      return {
        success: true,
        data: {
          check: {
            ...check,
            createdBy: Number(check.createdBy),
            amount: Number(check.amount),
            creator: check.creator ? {
              ...check.creator,
              telegramId: Number(check.creator.telegramId)
            } : null,
            activations: check.activations.map(activation => ({
              ...activation,
              amount: Number(activation.amount),
              user: {
                ...activation.user,
                telegramId: Number(activation.user.telegramId)
              }
            })),
            totalActivations: check._count.activations,
            hasPassword: !!check.password
          },
          analytics: {
            activationsByDay: (activationsByDay as any[]).map(day => ({
              date: day.date.toISOString().split('T')[0],
              count: day.count,
              amount: day.amount
            })),
            utilizationRate: check.maxActivations > 0 
              ? Math.round((check.currentActivations / check.maxActivations) * 100)
              : 0,
            averageActivationAmount: check.currentActivations > 0
              ? Number(check.amount)
              : 0
          }
        }
      };

    } catch (error) {
      fastify.log.error('Get check details error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch check details'
      });
    }
  });

  // POST /checks - Создание чека (админом)
  fastify.post<{ Body: CreateCheckBody }>('/', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Checks'],
      summary: 'Create a new check (admin)',
      security: [{ JWT: [] }],
      body: {
        type: 'object',
        properties: {
          amount: { type: 'number', minimum: 10, maximum: 100000 },
          maxActivations: { type: 'number', minimum: 1, maximum: 10000 },
          password: { type: 'string', minLength: 1, maxLength: 50 },
          comment: { type: 'string', maxLength: 500 },
          imageUrl: { type: 'string', format: 'uri' },
          conditions: { type: 'object' },
          design: { type: 'object' },
          expiresAt: { type: 'string', format: 'date-time' },
          createdBy: { type: 'number', description: 'User ID to create check on behalf of' }
        },
        required: ['amount', 'maxActivations']
      }
    }
  }, async (request: FastifyRequest<{ Body: CreateCheckBody }>, reply: FastifyReply) => {
    try {
      const { createdBy: targetUserId, ...checkData } = request.body;
      const adminUser = (request as any).user;

      // Определяем от чьего имени создается чек
      const creatorId = targetUserId || adminUser.userId;

      // Проверяем что пользователь существует
      const creator = await prisma.user.findUnique({
        where: { telegramId: BigInt(creatorId) }
      });

      if (!creator) {
        return reply.status(404).send({
          success: false,
          error: 'Creator user not found'
        });
      }

      // Проверяем баланс если создаем от имени пользователя
      if (targetUserId && Number(creator.balance) < checkData.amount * checkData.maxActivations) {
        return reply.status(400).send({
          success: false,
          error: 'Insufficient balance for check creation'
        });
      }

      // Создаем чек в транзакции
      const result = await prisma.$transaction(async (tx) => {
        // Создаем чек
        const check = await tx.check.create({
          data: {
            createdBy: BigInt(creatorId),
            amount: checkData.amount,
            maxActivations: checkData.maxActivations,
            password: checkData.password,
            comment: checkData.comment,
            imageUrl: checkData.imageUrl,
            conditions: checkData.conditions || {},
            design: checkData.design || {},
            expiresAt: checkData.expiresAt ? new Date(checkData.expiresAt) : null
          },
          include: {
            creator: {
              select: {
                telegramId: true,
                username: true,
                level: true
              }
            }
          }
        });

        // Если создаем от имени пользователя, списываем средства
        if (targetUserId) {
          const totalCost = checkData.amount * checkData.maxActivations;
          
          await tx.user.update({
            where: { telegramId: BigInt(creatorId) },
            data: {
              balance: { decrement: totalCost },
              totalSpent: { increment: totalCost }
            }
          });

          // Создаем транзакцию списания
          await tx.transaction.create({
            data: {
              userId: BigInt(creatorId),
              type: TransactionType.SPEND,
              amount: -totalCost,
              description: `Check created: ${checkData.comment || 'No comment'}`,
              metadata: {
                checkId: check.id,
                checkAmount: checkData.amount,
                maxActivations: checkData.maxActivations,
                createdByAdmin: adminUser.userId
              }
            }
          });
        }

        return check;
      });

      // Публикуем событие создания чека
      await fastify.eventBus.publish('check:created', {
        checkId: result.id,
        createdBy: creatorId,
        amount: checkData.amount,
        maxActivations: checkData.maxActivations
      });

      // Логируем действие админа
      await prisma.userActivity.create({
        data: {
          userId: BigInt(adminUser.userId),
          type: 'admin_action',
          description: `Created check ${targetUserId ? `on behalf of user ${creatorId}` : 'as admin'}`,
          metadata: {
            checkId: result.id,
            amount: checkData.amount,
            maxActivations: checkData.maxActivations,
            createdFor: targetUserId || null
          }
        }
      });

      return {
        success: true,
        data: {
          check: {
            ...result,
            createdBy: Number(result.createdBy),
            amount: Number(result.amount),
            creator: result.creator ? {
              ...result.creator,
              telegramId: Number(result.creator.telegramId)
            } : null
          }
        },
        message: 'Check created successfully'
      };

    } catch (error) {
      fastify.log.error('Create check error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to create check'
      });
    }
  });

  // PUT /checks/:id - Редактирование чека
  fastify.put<{ Params: CheckParams; Body: UpdateCheckBody }>('/:id', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Checks'],
      summary: 'Update check information',
      security: [{ JWT: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          maxActivations: { type: 'number', minimum: 1, maximum: 10000 },
          password: { type: 'string', minLength: 1, maxLength: 50 },
          comment: { type: 'string', maxLength: 500 },
          imageUrl: { type: 'string', format: 'uri' },
          isActive: { type: 'boolean' },
          expiresAt: { type: 'string', format: 'date-time' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: CheckParams; Body: UpdateCheckBody }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const updateData = request.body;
      const adminUser = (request as any).user;

      const check = await prisma.check.findUnique({
        where: { id }
      });

      if (!check) {
        return reply.status(404).send({
          success: false,
          error: 'Check not found'
        });
      }

      // Не даем уменьшить maxActivations ниже текущих активаций
      if (updateData.maxActivations && updateData.maxActivations < check.currentActivations) {
        return reply.status(400).send({
          success: false,
          error: 'Cannot set max activations below current activations count'
        });
      }

      const updatedCheck = await prisma.check.update({
        where: { id },
        data: {
          ...updateData,
          expiresAt: updateData.expiresAt ? new Date(updateData.expiresAt) : undefined
        },
        include: {
          creator: {
            select: {
              telegramId: true,
              username: true,
              level: true
            }
          }
        }
      });

      // Логируем изменения
      await prisma.userActivity.create({
        data: {
          userId: BigInt(adminUser.userId),
          type: 'admin_action',
          description: `Updated check ${check.uuid}`,
          metadata: {
            checkId: id,
            changes: updateData,
            previousData: {
              maxActivations: check.maxActivations,
              isActive: check.isActive,
              hasPassword: !!check.password
            }
          }
        }
      });

      return {
        success: true,
        data: {
          check: {
            ...updatedCheck,
            createdBy: Number(updatedCheck.createdBy),
            amount: Number(updatedCheck.amount),
            creator: updatedCheck.creator ? {
              ...updatedCheck.creator,
              telegramId: Number(updatedCheck.creator.telegramId)
            } : null
          }
        },
        message: 'Check updated successfully'
      };

    } catch (error) {
      fastify.log.error('Update check error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to update check'
      });
    }
  });

  // DELETE /checks/:id - Удаление чека
  fastify.delete<{ Params: CheckParams }>('/:id', {
    preHandler: [fastify.authenticate, fastify.requireSuperAdmin],
    schema: {
      tags: ['Checks'],
      summary: 'Delete check (super admin only)',
      security: [{ JWT: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest<{ Params: CheckParams }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const adminUser = (request as any).user;

      const check = await prisma.check.findUnique({
        where: { id },
        include: { _count: { select: { activations: true } } }
      });

      if (!check) {
        return reply.status(404).send({
          success: false,
          error: 'Check not found'
        });
      }

      if (check._count.activations > 0) {
        return reply.status(400).send({
          success: false,
          error: 'Cannot delete check with activations'
        });
      }

      await prisma.check.delete({
        where: { id }
      });

      // Логируем удаление
      await prisma.userActivity.create({
        data: {
          userId: BigInt(adminUser.userId),
          type: 'admin_action',
          description: `Deleted check ${check.uuid}`,
          metadata: {
            checkId: id,
            checkData: {
              amount: Number(check.amount),
              maxActivations: check.maxActivations,
              createdBy: Number(check.createdBy)
            }
          }
        }
      });

      return {
        success: true,
        message: 'Check deleted successfully'
      };

    } catch (error) {
      fastify.log.error('Delete check error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to delete check'
      });
    }
  });

  // GET /checks/analytics - Аналитика чеков
  fastify.get('/analytics', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Checks'],
      summary: 'Get checks analytics',
      security: [{ JWT: [] }],
      querystring: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['7d', '30d', '90d'], default: '30d' }
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Querystring: { period?: '7d' | '30d' | '90d' } 
  }>, reply: FastifyReply) => {
    try {
      const { period = '30d' } = request.query;
      
      const daysBack = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      const [
        totalStats,
        creationStats,
        activationStats,
        topCreators,
        suspiciousActivity
      ] = await Promise.all([
        // Общая статистика
        prisma.check.aggregate({
          _count: { id: true },
          _sum: { amount: true, currentActivations: true },
          _avg: { amount: true }
        }),

        // Статистика создания по дням
        prisma.$queryRaw`
          SELECT DATE(created_at) as date, COUNT(*)::int as count, SUM(amount)::float as amount
          FROM checks 
          WHERE created_at >= ${startDate}
          GROUP BY DATE(created_at)
          ORDER BY date
        `,

        // Статистика активаций по дням
        prisma.$queryRaw`
          SELECT DATE(activated_at) as date, COUNT(*)::int as count, SUM(amount)::float as amount
          FROM check_activations 
          WHERE activated_at >= ${startDate}
          GROUP BY DATE(activated_at)
          ORDER BY date
        `,

        // Топ создатели чеков
        prisma.check.groupBy({
          by: ['createdBy'],
          _count: { createdBy: true },
          _sum: { amount: true, currentActivations: true },
          orderBy: { _count: { createdBy: 'desc' } },
          take: 10
        }),

        // Подозрительная активность
        prisma.$queryRaw`
          SELECT 
            ca.ip_address,
            COUNT(*)::int as activation_count,
            COUNT(DISTINCT ca.check_id)::int as unique_checks,
            SUM(ca.amount)::float as total_amount
          FROM check_activations ca
          WHERE ca.activated_at >= ${startDate}
            AND ca.ip_address IS NOT NULL
          GROUP BY ca.ip_address
          HAVING COUNT(*) > 10
          ORDER BY COUNT(*) DESC
          LIMIT 10
        `
      ]);

      // Получаем информацию о топ создателях
      const creatorIds = topCreators.map(c => c.createdBy);
      const creators = await prisma.user.findMany({
        where: { telegramId: { in: creatorIds } },
        select: {
          telegramId: true,
          username: true,
          level: true
        }
      });

      const creatorsMap = creators.reduce((acc, creator) => {
        acc[Number(creator.telegramId)] = creator;
        return acc;
      }, {} as Record<number, any>);

      return {
        success: true,
        data: {
          overview: {
            totalChecks: totalStats._count.id,
            totalAmount: Number(totalStats._sum.amount || 0),
            totalActivations: totalStats._sum.currentActivations || 0,
            averageAmount: Number(totalStats._avg.amount || 0)
          },
          timeline: {
            period,
            creation: (creationStats as any[]).map(day => ({
              date: day.date.toISOString().split('T')[0],
              count: day.count,
              amount: day.amount
            })),
            activation: (activationStats as any[]).map(day => ({
              date: day.date.toISOString().split('T')[0],
              count: day.count,
              amount: day.amount
            }))
          },
          topCreators: topCreators.map(creator => ({
            userId: Number(creator.createdBy),
            username: creatorsMap[Number(creator.createdBy)]?.username || 'Unknown',
            level: creatorsMap[Number(creator.createdBy)]?.level || 'bronze',
            checksCount: creator._count.createdBy,
            totalAmount: Number(creator._sum.amount || 0),
            totalActivations: creator._sum.currentActivations || 0
          })),
          security: {
            suspiciousIPs: (suspiciousActivity as any[]).map(ip => ({
              ipAddress: ip.ip_address,
              activationCount: ip.activation_count,
              uniqueChecks: ip.unique_checks,
              totalAmount: ip.total_amount
            }))
          }
        }
      };

    } catch (error) {
      fastify.log.error('Get checks analytics error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch checks analytics'
      });
    }
  });
}