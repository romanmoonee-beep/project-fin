// apps/api/src/routes/analytics.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@pr-gram/database';

export default async function analyticsRoutes(fastify: FastifyInstance) {
  
  // GET /analytics/overview - Общая аналитика
  fastify.get('/overview', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Analytics'],
      summary: 'Get analytics overview',
      security: [{ JWT: [] }]
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const now = new Date();
      const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

      const [userGrowth, taskPerformance, revenueStats] = await Promise.all([
        prisma.$queryRaw`
          SELECT DATE(created_at) as date, COUNT(*)::int as count
          FROM users 
          WHERE created_at >= ${monthAgo}
          GROUP BY DATE(created_at)
          ORDER BY date
        `,
        
        prisma.$queryRaw`
          SELECT DATE(created_at) as date, COUNT(*)::int as executions
          FROM task_executions 
          WHERE created_at >= ${monthAgo} AND status = 'approved'
          GROUP BY DATE(created_at)
          ORDER BY date
        `,

        prisma.transaction.groupBy({
          by: ['type'],
          where: { createdAt: { gte: monthAgo } },
          _sum: { amount: true },
          _count: { type: true }
        })
      ]);

      return {
        success: true,
        data: {
          userGrowth: (userGrowth as any[]).map(day => ({
            date: day.date.toISOString().split('T')[0],
            users: day.count
          })),
          taskPerformance: (taskPerformance as any[]).map(day => ({
            date: day.date.toISOString().split('T')[0],
            executions: day.executions
          })),
          revenue: revenueStats.map(stat => ({
            type: stat.type,
            amount: Number(stat._sum.amount || 0),
            count: stat._count.type
          }))
        }
      };
    } catch (error) {
      fastify.log.error('Get analytics overview error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch analytics overview'
      });
    }
  });

  // GET /analytics/retention - Анализ удержания
  fastify.get('/retention', {
    preHandler: [fastify.authenticate, fastify.requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Анализ возвращающихся пользователей
      const retentionData = await prisma.$queryRaw`
        WITH user_activity AS (
          SELECT 
            user_id,
            DATE(created_at) as activity_date,
            ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) as visit_number
          FROM user_activities 
          WHERE created_at >= NOW() - INTERVAL '30 days'
        )
        SELECT 
          visit_number,
          COUNT(DISTINCT user_id)::int as user_count
        FROM user_activity 
        WHERE visit_number <= 7
        GROUP BY visit_number
        ORDER BY visit_number
      `;

      return {
        success: true,
        data: { retention: retentionData }
      };
    } catch (error) {
      fastify.log.error('Get retention analytics error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch retention analytics'
      });
    }
  });
}





