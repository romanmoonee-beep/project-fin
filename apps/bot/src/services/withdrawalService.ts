import { prisma } from '@pr-gram/database';
import { notificationService } from './notificationService';

export interface WithdrawalRequest {
  id: string;
  userId: number;
  amount: number;
  method: 'card' | 'crypto' | 'bank' | 'other';
  details: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  createdAt: Date;
  processedAt?: Date;
  processedBy?: number;
  adminComment?: string;
}

export class WithdrawalService {
  // Создание заявки на вывод
  async createWithdrawalRequest(
    userId: number,
    amount: number,
    method: string,
    details: string
  ): Promise<WithdrawalRequest> {
    const user = await prisma.user.findUnique({
      where: { telegramId: userId }
    });

    if (!user) {
      throw new Error('Пользователь не найден');
    }

    if (user.balance.toNumber() < amount) {
      throw new Error('Недостаточно средств на балансе');
    }

    if (amount < 100) {
      throw new Error('Минимальная сумма для вывода: 100 GRAM');
    }

    // Проверяем, нет ли активных заявок
    const existingRequest = await prisma.userActivity.findFirst({
      where: {
        userId,
        type: 'withdrawal_request',
        metadata: {
          path: ['status'],
          equals: 'pending'
        }
      }
    });

    if (existingRequest) {
      throw new Error('У вас уже есть активная заявка на вывод');
    }

    // Замораживаем средства
    await prisma.user.update({
      where: { telegramId: userId },
      data: {
        balance: { decrement: amount },
        frozenBalance: { increment: amount }
      }
    });

    // Создаем заявку
    const request = await prisma.userActivity.create({
      data: {
        userId,
        type: 'withdrawal_request',
        description: `Заявка на вывод ${amount} GRAM`,
        metadata: {
          amount,
          method,
          details,
          status: 'pending',
          createdAt: new Date().toISOString()
        }
      }
    });

    // Уведомляем администраторов
    await notificationService.notifyAdmins(
      '💸 Новая заявка на вывод',
      `Пользователь @${user.username || user.firstName} запросил вывод ${amount} GRAM\nМетод: ${method}\nДетали: ${details}`,
      { type: 'withdrawal', requestId: request.id, userId, amount }
    );

    // Уведомляем пользователя
    await notificationService.sendToUser(
      userId,
      `✅ Заявка на вывод создана\n\n💰 Сумма: ${amount} GRAM\n💳 Метод: ${method}\n📋 Детали: ${details}\n\n⏰ Заявка будет обработана в течение 24 часов.`
    );

    return {
      id: request.id,
      userId,
      amount,
      method: method as any,
      details,
      status: 'pending',
      createdAt: request.createdAt
    };
  }

  // Получение заявок для админа
  async getWithdrawalRequests(filters: {
    status?: string;
    userId?: number;
    page?: number;
    limit?: number;
  }) {
    const { status = 'pending', userId, page = 1, limit = 20 } = filters;

    const where: any = {
      type: 'withdrawal_request'
    };

    if (status !== 'all') {
      where.metadata = {
        path: ['status'],
        equals: status
      };
    }

    if (userId) {
      where.userId = userId;
    }

    const [requests, total] = await Promise.all([
      prisma.userActivity.findMany({
        where,
        include: {
          user: {
            select: {
              telegramId: true,
              username: true,
              firstName: true,
              level: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.userActivity.count({ where })
    ]);

    return {
      requests: requests.map(req => ({
        id: req.id,
        userId: req.userId,
        user: req.user,
        amount: req.metadata.amount,
        method: req.metadata.method,
        details: req.metadata.details,
        status: req.metadata.status,
        createdAt: req.createdAt,
        processedAt: req.metadata.processedAt ? new Date(req.metadata.processedAt) : undefined,
        processedBy: req.metadata.processedBy,
        adminComment: req.metadata.adminComment
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  // Одобрение заявки
  async approveWithdrawal(requestId: string, adminId: number, comment?: string) {
    const request = await prisma.userActivity.findUnique({
      where: { id: requestId },
      include: { user: true }
    });

    if (!request || request.type !== 'withdrawal_request') {
      throw new Error('Заявка не найдена');
    }

    if (request.metadata.status !== 'pending') {
      throw new Error('Заявка уже обработана');
    }

    const amount = request.metadata.amount;

    // Обновляем статус заявки
    await prisma.userActivity.update({
      where: { id: requestId },
      data: {
        metadata: {
          ...request.metadata,
          status: 'approved',
          processedAt: new Date().toISOString(),
          processedBy: adminId,
          adminComment: comment
        }
      }
    });

    // Списываем замороженные средства
    await prisma.user.update({
      where: { telegramId: request.userId },
      data: {
        frozenBalance: { decrement: amount }
      }
    });

    // Создаем транзакцию
    await prisma.transaction.create({
      data: {
        userId: request.userId,
        type: 'refund', // или создать новый тип 'withdrawal'
        amount: -amount,
        description: `Вывод средств одобрен`,
        metadata: {
          requestId,
          adminId,
          method: request.metadata.method,
          comment
        }
      }
    });

    // Уведомляем пользователя
    await notificationService.sendToUser(
      request.userId,
      `✅ Заявка на вывод одобрена!\n\n💰 Сумма: ${amount} GRAM\n💳 Метод: ${request.metadata.method}\n\n💡 Средства будут переведены в течение 1-3 рабочих дней.${comment ? `\n\n💬 Комментарий админа: ${comment}` : ''}`
    );

    return { success: true };
  }

  // Отклонение заявки
  async rejectWithdrawal(requestId: string, adminId: number, reason: string) {
    const request = await prisma.userActivity.findUnique({
      where: { id: requestId },
      include: { user: true }
    });

    if (!request || request.type !== 'withdrawal_request') {
      throw new Error('Заявка не найдена');
    }

    if (request.metadata.status !== 'pending') {
      throw new Error('Заявка уже обработана');
    }

    const amount = request.metadata.amount;

    // Обновляем статус заявки
    await prisma.userActivity.update({
      where: { id: requestId },
      data: {
        metadata: {
          ...request.metadata,
          status: 'rejected',
          processedAt: new Date().toISOString(),
          processedBy: adminId,
          adminComment: reason
        }
      }
    });

    // Возвращаем средства на основной баланс
    await prisma.user.update({
      where: { telegramId: request.userId },
      data: {
        balance: { increment: amount },
        frozenBalance: { decrement: amount }
      }
    });

    // Создаем транзакцию
    await prisma.transaction.create({
      data: {
        userId: request.userId,
        type: 'refund',
        amount: amount,
        description: `Возврат средств: заявка на вывод отклонена`,
        metadata: {
          requestId,
          adminId,
          reason
        }
      }
    });

    // Уведомляем пользователя
    await notificationService.sendToUser(
      request.userId,
      `❌ Заявка на вывод отклонена\n\n💰 Сумма: ${amount} GRAM\n📝 Причина: ${reason}\n\n💡 Средства возвращены на ваш баланс. Вы можете создать новую заявку.`
    );

    return { success: true };
  }

  // Статистика выводов
  async getWithdrawalStats(period: 'day' | 'week' | 'month' = 'month') {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    const requests = await prisma.userActivity.findMany({
      where: {
        type: 'withdrawal_request',
        createdAt: { gte: startDate }
      }
    });

    const stats = {
      total: requests.length,
      pending: requests.filter(r => r.metadata.status === 'pending').length,
      approved: requests.filter(r => r.metadata.status === 'approved').length,
      rejected: requests.filter(r => r.metadata.status === 'rejected').length,
      totalAmount: requests.reduce((sum, r) => sum + (r.metadata.amount || 0), 0),
      approvedAmount: requests
        .filter(r => r.metadata.status === 'approved')
        .reduce((sum, r) => sum + (r.metadata.amount || 0), 0)
    };

    return stats;
  }

  // Получение заявок пользователя
  async getUserWithdrawals(userId: number) {
    const requests = await prisma.userActivity.findMany({
      where: {
        userId,
        type: 'withdrawal_request'
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    return requests.map(req => ({
      id: req.id,
      amount: req.metadata.amount,
      method: req.metadata.method,
      details: req.metadata.details,
      status: req.metadata.status,
      createdAt: req.createdAt,
      adminComment: req.metadata.adminComment
    }));
  }
}

export const withdrawalService = new WithdrawalService();