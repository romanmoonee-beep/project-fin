// apps/api/src/routes/logs.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@pr-gram/database';

interface LogsQuerystring {
  page?: number;
  limit?: number;
  type?: string;
  userId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export default async function logsRoutes(fastify: FastifyInstance) {
  
  // GET /logs - Системные логи
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Logs'],
      summary: 'Get system logs',
      security: [{ JWT: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          type: { type: 'string' },
          userId: { type: 'string' },
          search: { type: 'string' },
          dateFrom: { type: 'string', format: 'date' },
          dateTo: { type: 'string', format: 'date' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: LogsQuerystring }>, reply: FastifyReply) => {
    try {
      const {
        page = 1,
        limit = 50,
        type,
        userId,
        search,
        dateFrom,
        dateTo
      } = request.query;

      const offset = (page - 1) * limit;

      const where: any = {};
      if (type) where.type = type;
      if (userId) where.userId = BigInt(userId);
      if (search) {
        where.OR = [
          { description: { contains: search, mode: 'insensitive' } },
          { type: { contains: search, mode: 'insensitive' } }
        ];
      }
      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = new Date(dateFrom);
        if (dateTo) where.createdAt.lte = new Date(dateTo + 'T23:59:59.999Z');
      }

      const [logs, totalCount, typeStats] = await Promise.all([
        prisma.userActivity.findMany({
          where,
          skip: offset,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                telegramId: true,
                username: true,
                role: true
              }
            }
          }
        }),
        prisma.userActivity.count({ where }),
        prisma.userActivity.groupBy({
          by: ['type'],
          where,
          _count: { type: true }
        })
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      return {
        success: true,
        data: {
          logs: logs.map(log => ({
            ...log,
            userId: Number(log.userId),
            user: {
              ...log.user,
              telegramId: Number(log.user.telegramId)
            }
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
            byType: typeStats.reduce((acc, item) => {
              acc[item.type] = item._count.type;
              return acc;
            }, {} as Record<string, number>)
          }
        }
      };
    } catch (error) {
      fastify.log.error('Get logs error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch logs'
      });
    }
  });

  // GET /logs/security - Логи безопасности
  fastify.get('/security', {
    preHandler: [fastify.authenticate, fastify.requireSuperAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const securityLogs = await prisma.userActivity.findMany({
        where: {
          type: { in: ['admin_login', 'admin_logout', 'failed_login', 'security_event'] }
        },
        include: {
          user: {
            select: {
              telegramId: true,
              username: true,
              role: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 100
      });

      return {
        success: true,
        data: {
          securityLogs: securityLogs.map(log => ({
            ...log,
            userId: Number(log.userId),
            user: {
              ...log.user,
              telegramId: Number(log.user.telegramId)
            }
          }))
        }
      };
    } catch (error) {
      fastify.log.error('Get security logs error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch security logs'
      });
    }
  });

  // GET /logs/export - Экспорт логов
  fastify.get('/export', {
    preHandler: [fastify.authenticate, fastify.requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const adminUser = (request as any).user;
      
      const logs = await prisma.userActivity.findMany({
        include: {
          user: {
            select: {
              telegramId: true,
              username: true,
              role: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 1000
      });

      // Логируем экспорт
      await prisma.userActivity.create({
        data: {
          userId: BigInt(adminUser.userId),
          type: 'admin_action',
          description: `Exported ${logs.length} logs`,
          metadata: { exportCount: logs.length }
        }
      });

      const csv = 'Timestamp,User ID,Username,Type,Description\n' +
        logs.map(log => [
          log.createdAt.toISOString(),
          Number(log.userId),
          log.user.username || '',
          log.type,
          `"${log.description.replace(/"/g, '""')}"`
        ].join(',')).join('\n');

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename="logs-export.csv"');
      return csv;

    } catch (error) {
      fastify.log.error('Export logs error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to export logs'
      });
    }
  });
}
