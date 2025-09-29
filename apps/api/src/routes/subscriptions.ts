// apps/api/src/routes/subscriptions.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@pr-gram/database';
import { CheckType } from '@pr-gram/shared';

export default async function subscriptionsRoutes(fastify: FastifyInstance) {
  
  // GET /subscriptions - Список проверок подписки
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Subscriptions'],
      summary: 'Get subscription checks list',
      security: [{ JWT: [] }]
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const subscriptions = await prisma.subscriptionCheck.findMany({
        include: {
          creator: {
            select: {
              telegramId: true,
              username: true,
              level: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return {
        success: true,
        data: {
          subscriptions: subscriptions.map(sub => ({
            ...sub,
            chatId: Number(sub.chatId),
            targetChatId: sub.targetChatId ? Number(sub.targetChatId) : null,
            createdBy: Number(sub.createdBy),
            creator: {
              ...sub.creator,
              telegramId: Number(sub.creator.telegramId)
            }
          }))
        }
      };
    } catch (error) {
      fastify.log.error('Get subscriptions error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch subscription checks'
      });
    }
  });

  // GET /subscriptions/stats - Статистика проверок подписки
  fastify.get('/stats', {
    preHandler: [fastify.authenticate, fastify.requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const [totalChecks, activeChecks, typeStats] = await Promise.all([
        prisma.subscriptionCheck.count(),
        prisma.subscriptionCheck.count({ where: { isActive: true } }),
        prisma.subscriptionCheck.groupBy({
          by: ['setupType'],
          _count: { setupType: true }
        })
      ]);

      return {
        success: true,
        data: {
          overview: {
            total: totalChecks,
            active: activeChecks,
            inactive: totalChecks - activeChecks
          },
          byType: typeStats.reduce((acc, item) => {
            acc[item.setupType] = item._count.setupType;
            return acc;
          }, {} as Record<CheckType, number>)
        }
      };
    } catch (error) {
      fastify.log.error('Get subscription stats error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch subscription statistics'
      });
    }
  });
}
