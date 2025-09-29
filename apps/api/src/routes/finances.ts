import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@pr-gram/database';
import { TransactionType } from '@pr-gram/shared';

interface FinancesQuerystring {
  page?: number;
  limit?: number;
  search?: string;
  userId?: string;
  type?: TransactionType;
  minAmount?: number;
  maxAmount?: number;
  sortBy?: 'createdAt' | 'amount';
  sortOrder?: 'asc' | 'desc';
  dateFrom?: string;
  dateTo?: string;
}

interface WithdrawalQuerystring {
  page?: number;
  limit?: number;
  status?: 'pending' | 'approved' | 'rejected' | 'completed';
  sortBy?: 'createdAt' | 'amount';
  sortOrder?: 'asc' | 'desc';
}

interface ProcessWithdrawalBody {
  action: 'approve' | 'reject';
  comment?: string;
  transactionId?: string;
}

export default async function financesRoutes(fastify: FastifyInstance) {

  // GET /finances/transactions - Список транзакций
  fastify.get('/transactions', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Finances'],
      summary: 'Get transactions list with filters',
      security: [{ JWT: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          search: { type: 'string', description: 'Search by description or transaction ID' },
          userId: { type: 'string' },
          type: { type: 'string', enum: Object.values(TransactionType) },
          minAmount: { type: 'number' },
          maxAmount: { type: 'number' },
          sortBy: { type: 'string', enum: ['createdAt', 'amount'], default: 'createdAt' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          dateFrom: { type: 'string', format: 'date' },
          dateTo: { type: 'string', format: 'date' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: FinancesQuerystring }>, reply: FastifyReply) => {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        userId,
        type,
        minAmount,
        maxAmount,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        dateFrom,
        dateTo
      } = request.query;

      const offset = (page - 1) * limit;

      // Строим условия фильтрации
      const where: any = {};

      if (search) {
        where.OR = [
          { description: { contains: search, mode: 'insensitive' } },
          { id: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (userId) where.userId = BigInt(userId);
      if (type) where.type = type;

      if (minAmount !== undefined || maxAmount !== undefined) {
        where.amount = {};
        if (minAmount !== undefined) where.amount.gte = minAmount;
        if (maxAmount !== undefined) where.amount.lte = maxAmount;
      }

      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = new Date(dateFrom);
        if (dateTo) where.createdAt.lte = new Date(dateTo + 'T23:59:59.999Z');
      }

      // Параллельные запросы
      const [transactions, totalCount, financialStats] = await Promise.all([
        prisma.transaction.findMany({
          where,
          skip: offset,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            user: {
              select: {
                telegramId: true,
                username: true,
                level: true
              }
            }
          }
        }),
        prisma.transaction.count({ where }),
        prisma.transaction.groupBy({
          by: ['type'],
          _count: { type: true },
          _sum: { amount: true },
          where
        })
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      // Группируем статистику по типам
      const typeStats = financialStats.reduce((acc, item) => {
        acc[item.type] = {
          count: item._count.type,
          sum: Number(item._sum.amount || 0)
        };
        return acc;
      }, {} as Record<TransactionType, { count: number; sum: number }>);

      return {
        success: true,
        data: {
          transactions: transactions.map(transaction => ({
            ...transaction,
            userId: Number(transaction.userId),
            amount: Number(transaction.amount),
            user: {
              ...transaction.user,
              telegramId: Number(transaction.user.telegramId)
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
            total: totalCount,
            byType: typeStats,
            totalAmount: Object.values(typeStats).reduce((sum, stat) => sum + stat.sum, 0)
          }
        }
      };

    } catch (error) {
      fastify.log.error('Get transactions error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch transactions'
      });
    }
  });

  // GET /finances/summary - Финансовая сводка
  fastify.get('/summary', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Finances'],
      summary: 'Get financial summary',
      security: [{ JWT: [] }],
      querystring: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['today', 'week', 'month', 'year'], default: 'month' }
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Querystring: { period?: 'today' | 'week' | 'month' | 'year' } 
  }>, reply: FastifyReply) => {
    try {
      const { period = 'month' } = request.query;

      // Вычисляем даты периода
      const now = new Date();
      let startDate: Date;

      switch (period) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
      }

      const [
        currentPeriodStats,
        previousPeriodStats,
        userBalances,
        topTransactions,
        systemRevenue
      ] = await Promise.all([
        // Статистика текущего периода
        prisma.transaction.groupBy({
          by: ['type'],
          where: { createdAt: { gte: startDate } },
          _count: { type: true },
          _sum: { amount: true }
        }),

        // Статистика предыдущего периода для сравнения
        prisma.transaction.groupBy({
          by: ['type'],
          where: {
            createdAt: {
              gte: new Date(startDate.getTime() - (now.getTime() - startDate.getTime())),
              lt: startDate
            }
          },
          _count: { type: true },
          _sum: { amount: true }
        }),

        // Балансы пользователей
        prisma.user.aggregate({
          _sum: { balance: true, frozenBalance: true, totalEarned: true, totalSpent: true },
          _count: { id: true }
        }),

        // Топ транзакции
        prisma.transaction.findMany({
          where: { createdAt: { gte: startDate } },
          orderBy: { amount: 'desc' },
          take: 10,
          include: {
            user: {
              select: {
                telegramId: true,
                username: true,
                level: true
              }
            }
          }
        }),

        // Доходы системы (комиссии)
        prisma.transaction.aggregate({
          where: {
            createdAt: { gte: startDate },
            OR: [
              { type: TransactionType.PENALTY },
              { description: { contains: 'commission' } },
              { description: { contains: 'fee' } }
            ]
          },
          _sum: { amount: true },
          _count: { id: true }
        })
      ]);

      // Группируем текущие данные
      const currentStats = currentPeriodStats.reduce((acc, item) => {
        acc[item.type] = {
          count: item._count.type,
          sum: Number(item._sum.amount || 0)
        };
        return acc;
      }, {} as Record<string, { count: number; sum: number }>);

      // Группируем предыдущие данные для сравнения
      const previousStats = previousPeriodStats.reduce((acc, item) => {
        acc[item.type] = {
          count: item._count.type,
          sum: Number(item._sum.amount || 0)
        };
        return acc;
      }, {} as Record<string, { count: number; sum: number }>);

      // Вычисляем изменения
      const calculateChange = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
      };

      const totalIncome = (currentStats[TransactionType.EARN]?.sum || 0) + 
                         (currentStats[TransactionType.BONUS]?.sum || 0) +
                         (currentStats[TransactionType.REFERRAL]?.sum || 0);

      const totalExpenses = Math.abs(currentStats[TransactionType.SPEND]?.sum || 0) + 
                           Math.abs(currentStats[TransactionType.PENALTY]?.sum || 0);

      const previousIncome = (previousStats[TransactionType.EARN]?.sum || 0) + 
                           (previousStats[TransactionType.BONUS]?.sum || 0) +
                           (previousStats[TransactionType.REFERRAL]?.sum || 0);

      const previousExpenses = Math.abs(previousStats[TransactionType.SPEND]?.sum || 0) + 
                             Math.abs(previousStats[TransactionType.PENALTY]?.sum || 0);

      return {
        success: true,
        data: {
          period,
          summary: {
            totalIncome,
            totalExpenses,
            netProfit: totalIncome - totalExpenses,
            systemRevenue: Math.abs(Number(systemRevenue._sum.amount || 0)),
            transactionCount: Object.values(currentStats).reduce((sum, stat) => sum + stat.count, 0),
            changes: {
              income: calculateChange(totalIncome, previousIncome),
              expenses: calculateChange(totalExpenses, previousExpenses),
              profit: calculateChange(totalIncome - totalExpenses, previousIncome - previousExpenses)
            }
          },
          breakdown: {
            byType: currentStats,
            comparison: previousStats
          },
          ecosystem: {
            totalUsers: userBalances._count.id,
            totalBalance: Number(userBalances._sum.balance || 0),
            frozenBalance: Number(userBalances._sum.frozenBalance || 0),
            totalEarned: Number(userBalances._sum.totalEarned || 0),
            totalSpent: Number(userBalances._sum.totalSpent || 0),
            averageBalance: userBalances._count.id > 0 
              ? Number(userBalances._sum.balance || 0) / userBalances._count.id 
              : 0
          },
          topTransactions: topTransactions.map(transaction => ({
            ...transaction,
            userId: Number(transaction.userId),
            amount: Number(transaction.amount),
            user: {
              ...transaction.user,
              telegramId: Number(transaction.user.telegramId)
            }
          }))
        }
      };

    } catch (error) {
      fastify.log.error('Get financial summary error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch financial summary'
      });
    }
  });

  // GET /finances/withdrawals - Заявки на вывод
  fastify.get('/withdrawals', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Finances'],
      summary: 'Get withdrawal requests',
      security: [{ JWT: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'completed'] },
          sortBy: { type: 'string', enum: ['createdAt', 'amount'], default: 'createdAt' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: WithdrawalQuerystring }>, reply: FastifyReply) => {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = request.query;

      const offset = (page - 1) * limit;

      // Для демо создаем мок данные заявок на вывод
      // В реальности это была бы отдельная таблица withdrawals
      const where: any = {
        type: TransactionType.SPEND,
        description: { contains: 'withdrawal' }
      };

      if (status) {
        // Эмулируем статусы через metadata
        where.metadata = {
          path: ['withdrawalStatus'],
          equals: status
        };
      }

      const [withdrawals, totalCount, withdrawalStats] = await Promise.all([
        prisma.transaction.findMany({
          where,
          skip: offset,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            user: {
              select: {
                telegramId: true,
                username: true,
                firstName: true,
                level: true
              }
            }
          }
        }),
        prisma.transaction.count({ where }),
        prisma.transaction.groupBy({
          by: ['createdAt'],
          where,
          _count: { id: true },
          _sum: { amount: true }
        })
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      return {
        success: true,
        data: {
          withdrawals: withdrawals.map(withdrawal => ({
            id: withdrawal.id,
            userId: Number(withdrawal.userId),
            amount: Math.abs(Number(withdrawal.amount)),
            method: (withdrawal.metadata as any)?.method || 'bank_card',
            details: (withdrawal.metadata as any)?.details || 'N/A',
            status: (withdrawal.metadata as any)?.withdrawalStatus || 'pending',
            requestedAt: withdrawal.createdAt,
            processedAt: (withdrawal.metadata as any)?.processedAt || null,
            comment: (withdrawal.metadata as any)?.comment || null,
            user: {
              ...withdrawal.user,
              telegramId: Number(withdrawal.user.telegramId)
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
            total: totalCount,
            totalAmount: withdrawalStats.reduce((sum, item) => sum + Math.abs(Number(item._sum.amount || 0)), 0),
            pendingCount: withdrawals.filter(w => !(w.metadata as any)?.withdrawalStatus || (w.metadata as any)?.withdrawalStatus === 'pending').length
          }
        }
      };

    } catch (error) {
      fastify.log.error('Get withdrawals error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch withdrawal requests'
      });
    }
  });

  // POST /finances/withdrawals/:id/process - Обработка заявки на вывод
  fastify.post<{ Params: { id: string }; Body: ProcessWithdrawalBody }>('/withdrawals/:id/process', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Finances'],
      summary: 'Process withdrawal request',
      security: [{ JWT: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['approve', 'reject'] },
          comment: { type: 'string', maxLength: 500 },
          transactionId: { type: 'string', description: 'External transaction ID for approved withdrawals' }
        },
        required: ['action']
      }
    }
  }, async (request: FastifyRequest<{ Params: { id: string }; Body: ProcessWithdrawalBody }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const { action, comment, transactionId } = request.body;
      const adminUser = (request as any).user;

      const withdrawal = await prisma.transaction.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              telegramId: true,
              username: true,
              balance: true
            }
          }
        }
      });

      if (!withdrawal) {
        return reply.status(404).send({
          success: false,
          error: 'Withdrawal request not found'
        });
      }

      const currentStatus = (withdrawal.metadata as any)?.withdrawalStatus || 'pending';
      if (currentStatus !== 'pending') {
        return reply.status(400).send({
          success: false,
          error: 'Withdrawal request already processed'
        });
      }

      // Обновляем статус заявки в транзакции
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      const updatedMetadata = {
        ...withdrawal.metadata as any,
        withdrawalStatus: newStatus,
        processedAt: new Date().toISOString(),
        processedBy: adminUser.userId,
        adminComment: comment,
        externalTransactionId: transactionId
      };

      const updatedWithdrawal = await prisma.transaction.update({
        where: { id },
        data: { metadata: updatedMetadata }
      });

      // Если заявка отклонена, возвращаем средства пользователю
      if (action === 'reject') {
        const refundAmount = Math.abs(Number(withdrawal.amount));
        
        await prisma.$transaction(async (tx) => {
          // Возвращаем баланс
          await tx.user.update({
            where: { telegramId: withdrawal.userId },
            data: { balance: { increment: refundAmount } }
          });

          // Создаем транзакцию возврата
          await tx.transaction.create({
            data: {
              userId: withdrawal.userId,
              type: TransactionType.REFUND,
              amount: refundAmount,
              description: `Withdrawal refund: ${comment || 'Request rejected'}`,
              metadata: {
                originalWithdrawalId: id,
                refundReason: comment,
                processedBy: adminUser.userId
              }
            }
          });
        });
      }

      // Логируем действие админа
      await prisma.userActivity.create({
        data: {
          userId: BigInt(adminUser.userId),
          type: 'admin_action',
          description: `${action === 'approve' ? 'Approved' : 'Rejected'} withdrawal request`,
          metadata: {
            withdrawalId: id,
            userId: Number(withdrawal.userId),
            amount: Math.abs(Number(withdrawal.amount)),
            action,
            comment,
            transactionId
          }
        }
      });

      // Публикуем событие
      await fastify.eventBus.publish('admin:action', {
        adminId: adminUser.userId,
        action: `withdrawal_${action}`,
        target: {
          withdrawalId: id,
          userId: Number(withdrawal.userId),
          amount: Math.abs(Number(withdrawal.amount))
        },
        timestamp: new Date()
      });

      return {
        success: true,
        data: {
          withdrawal: {
            id: updatedWithdrawal.id,
            status: newStatus,
            processedAt: new Date().toISOString(),
            comment
          }
        },
        message: `Withdrawal request ${action}d successfully`
      };

    } catch (error) {
      fastify.log.error('Process withdrawal error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to process withdrawal request'
      });
    }
  });

  // GET /finances/charts - Данные для финансовых графиков
  fastify.get('/charts', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Finances'],
      summary: 'Get financial chart data',
      security: [{ JWT: [] }],
      querystring: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['7d', '30d', '90d'], default: '30d' },
          type: { type: 'string', enum: ['overview', 'detailed'], default: 'overview' }
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Querystring: { period?: '7d' | '30d' | '90d'; type?: 'overview' | 'detailed' } 
  }>, reply: FastifyReply) => {
    try {
      const { period = '30d', type = 'overview' } = request.query;
      
      const daysBack = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      // Генерируем даты для оси X
      const dateRange = Array.from({ length: daysBack }, (_, i) => {
        const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
        return date.toISOString().split('T')[0];
      });

      const dailyStats = await prisma.$queryRaw`
        SELECT 
          DATE(created_at) as date,
          type,
          COUNT(*)::int as count,
          SUM(amount)::float as amount
        FROM transactions 
        WHERE created_at >= ${startDate}
        GROUP BY DATE(created_at), type
        ORDER BY date, type
      `;

      // Группируем данные по дням
      const chartData = dateRange.map(date => {
        const dayStats = (dailyStats as any[]).filter(stat => 
          stat.date.toISOString().split('T')[0] === date
        );

        const income = dayStats
          .filter(stat => [TransactionType.EARN, TransactionType.BONUS, TransactionType.REFERRAL].includes(stat.type))
          .reduce((sum, stat) => sum + (stat.amount || 0), 0);

        const expenses = dayStats
          .filter(stat => [TransactionType.SPEND, TransactionType.PENALTY].includes(stat.type))
          .reduce((sum, stat) => sum + Math.abs(stat.amount || 0), 0);

        const transactions = dayStats.reduce((sum, stat) => sum + stat.count, 0);

        return {
          date,
          income: Math.round(income * 100) / 100,
          expenses: Math.round(expenses * 100) / 100,
          profit: Math.round((income - expenses) * 100) / 100,
          transactions
        };
      });

      let detailedData = {};
      if (type === 'detailed') {
        // Дополнительная детализация по типам транзакций
        const typeBreakdown = await prisma.transaction.groupBy({
          by: ['type'],
          where: { createdAt: { gte: startDate } },
          _count: { type: true },
          _sum: { amount: true },
          _avg: { amount: true }
        });

        detailedData = {
          byType: typeBreakdown.map(item => ({
            type: item.type,
            count: item._count.type,
            totalAmount: Number(item._sum.amount || 0),
            averageAmount: Number(item._avg.amount || 0)
          }))
        };
      }

      return {
        success: true,
        data: {
          period,
          dateRange,
          chartData,
          summary: {
            totalIncome: chartData.reduce((sum, day) => sum + day.income, 0),
            totalExpenses: chartData.reduce((sum, day) => sum + day.expenses, 0),
            totalProfit: chartData.reduce((sum, day) => sum + day.profit, 0),
            totalTransactions: chartData.reduce((sum, day) => sum + day.transactions, 0),
            averageDailyIncome: chartData.reduce((sum, day) => sum + day.income, 0) / chartData.length,
            averageDailyExpenses: chartData.reduce((sum, day) => sum + day.expenses, 0) / chartData.length
          },
          ...detailedData
        }
      };

    } catch (error) {
      fastify.log.error('Get financial charts error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch financial chart data'
      });
    }
  });

  // GET /finances/export - Экспорт финансовых данных
  fastify.get('/export', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Finances'],
      summary: 'Export financial data',
      security: [{ JWT: [] }],
      querystring: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['csv', 'json'], default: 'csv' },
          dateFrom: { type: 'string', format: 'date' },
          dateTo: { type: 'string', format: 'date' },
          type: { type: 'string', enum: Object.values(TransactionType) }
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Querystring: { format?: 'csv' | 'json'; dateFrom?: string; dateTo?: string; type?: TransactionType } 
  }>, reply: FastifyReply) => {
    try {
      const { format = 'csv', dateFrom, dateTo, type } = request.query;
      const adminUser = (request as any).user;

      const where: any = {};
      if (dateFrom) where.createdAt = { gte: new Date(dateFrom) };
      if (dateTo) {
        where.createdAt = { ...where.createdAt, lte: new Date(dateTo + 'T23:59:59.999Z') };
      }
      if (type) where.type = type;

      const transactions = await prisma.transaction.findMany({
        where,
        include: {
          user: {
            select: {
              telegramId: true,
              username: true,
              level: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Логируем экспорт
      await prisma.userActivity.create({
        data: {
          userId: BigInt(adminUser.userId),
          type: 'admin_action',
          description: `Exported ${transactions.length} transactions in ${format} format`,
          metadata: {
            exportCount: transactions.length,
            format,
            filters: { dateFrom, dateTo, type }
          }
        }
      });

      if (format === 'json') {
        reply.header('Content-Type', 'application/json');
        reply.header('Content-Disposition', `attachment; filename="transactions-export-${new Date().toISOString().split('T')[0]}.json"`);
        
        return {
          success: true,
          data: {
            transactions: transactions.map(transaction => ({
              ...transaction,
              userId: Number(transaction.userId),
              amount: Number(transaction.amount),
              user: {
                ...transaction.user,
                telegramId: Number(transaction.user.telegramId)
              }
            })),
            exportedAt: new Date().toISOString(),
            totalCount: transactions.length,
            filters: { dateFrom, dateTo, type }
          }
        };
      } else {
        // CSV format
        const csvHeader = 'Transaction ID,User ID,Username,Type,Amount,Description,Created At\n';
        const csvRows = transactions.map(transaction => [
          transaction.id,
          Number(transaction.userId),
          transaction.user.username || '',
          transaction.type,
          Number(transaction.amount),
          `"${transaction.description.replace(/"/g, '""')}"`,
          transaction.createdAt.toISOString()
        ].join(','));

        const csv = csvHeader + csvRows.join('\n');

        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', `attachment; filename="transactions-export-${new Date().toISOString().split('T')[0]}.csv"`);
        
        return csv;
      }

    } catch (error) {
      fastify.log.error('Export financial data error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to export financial data'
      });
    }
  });
}