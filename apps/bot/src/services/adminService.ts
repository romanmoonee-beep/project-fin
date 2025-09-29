import { prisma, UserLevel, UserRole } from '@pr-gram/database';
import { notificationService } from './notificationService';

export class AdminService {
  // Управление пользователями
  async updateUserBalance(
    userId: number, 
    amount: number, 
    reason: string, 
    adminId: number
  ) {
    const user = await prisma.user.findUnique({
      where: { telegramId: userId }
    });

    if (!user) {
      throw new Error('Пользователь не найден');
    }

    const newBalance = user.balance.toNumber() + amount;
    if (newBalance < 0) {
      throw new Error('Недостаточно средств для списания');
    }

    // Обновляем баланс
    await prisma.user.update({
      where: { telegramId: userId },
      data: { balance: newBalance }
    });

    // Создаем транзакцию
    await prisma.transaction.create({
      data: {
        userId,
        type: amount > 0 ? 'bonus' : 'penalty',
        amount: Math.abs(amount),
        description: reason,
        metadata: { adminId, action: 'admin_balance_change' }
      }
    });

    // Уведомляем пользователя
    const message = amount > 0 
      ? `💰 На ваш баланс зачислено ${amount} GRAM\nПричина: ${reason}`
      : `💸 С вашего баланса списано ${Math.abs(amount)} GRAM\nПричина: ${reason}`;
    
    await notificationService.sendToUser(userId, message);

    return { newBalance, transaction: 'success' };
  }

  // Блокировка пользователя
  async banUser(userId: number, reason: string, adminId: number, duration?: number) {
    const user = await prisma.user.findUnique({
      where: { telegramId: userId }
    });

    if (!user) {
      throw new Error('Пользователь не найден');
    }

    const bannedUntil = duration 
      ? new Date(Date.now() + duration * 60 * 60 * 1000)
      : undefined;

    await prisma.user.update({
      where: { telegramId: userId },
      data: {
        metadata: {
          ...user.metadata as any,
          banned: true,
          bannedBy: adminId,
          banReason: reason,
          bannedAt: new Date(),
          bannedUntil
        }
      }
    });

    // Логируем действие
    await prisma.userActivity.create({
      data: {
        userId,
        type: 'user_banned',
        description: `Пользователь заблокирован: ${reason}`,
        metadata: { adminId, reason, duration }
      }
    });

    // Уведомляем пользователя
    const message = `🚫 Ваш аккаунт заблокирован\nПричина: ${reason}${bannedUntil ? `\nДо: ${bannedUntil.toLocaleString('ru-RU')}` : ''}`;
    await notificationService.sendToUser(userId, message);

    return { success: true };
  }

  // Разблокировка пользователя
  async unbanUser(userId: number, adminId: number) {
    const user = await prisma.user.findUnique({
      where: { telegramId: userId }
    });

    if (!user) {
      throw new Error('Пользователь не найден');
    }

    await prisma.user.update({
      where: { telegramId: userId },
      data: {
        metadata: {
          ...user.metadata as any,
          banned: false,
          unbannedBy: adminId,
          unbannedAt: new Date()
        }
      }
    });

    await prisma.userActivity.create({
      data: {
        userId,
        type: 'user_unbanned',
        description: 'Пользователь разблокирован',
        metadata: { adminId }
      }
    });

    await notificationService.sendToUser(userId, '✅ Ваш аккаунт разблокирован');

    return { success: true };
  }

  // Изменение уровня пользователя
  async changeUserLevel(userId: number, newLevel: UserLevel, adminId: number) {
    const user = await prisma.user.findUnique({
      where: { telegramId: userId }
    });

    if (!user) {
      throw new Error('Пользователь не найден');
    }

    const oldLevel = user.level;

    await prisma.user.update({
      where: { telegramId: userId },
      data: { level: newLevel }
    });

    await prisma.userActivity.create({
      data: {
        userId,
        type: 'level_changed',
        description: `Уровень изменен с ${oldLevel} на ${newLevel}`,
        metadata: { adminId, oldLevel, newLevel }
      }
    });

    const levelEmojis = {
      bronze: '🥉',
      silver: '🥈', 
      gold: '🥇',
      premium: '💎'
    };

    const message = `⭐ Ваш уровень изменен!\n${levelEmojis[oldLevel]} ${oldLevel} → ${levelEmojis[newLevel]} ${newLevel}`;
    await notificationService.sendToUser(userId, message);

    return { success: true, oldLevel, newLevel };
  }

  // Получение списка пользователей с фильтрами
  async getUsers(filters: {
    search?: string;
    level?: UserLevel;
    banned?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { search, level, banned, page = 1, limit = 20 } = filters;
    
    const where: any = {};

    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { telegramId: isNaN(Number(search)) ? undefined : Number(search) }
      ].filter(Boolean);
    }

    if (level) {
      where.level = level;
    }

    if (banned !== undefined) {
      where.metadata = banned 
        ? { path: ['banned'], equals: true }
        : { path: ['banned'], not: true };
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          telegramId: true,
          username: true,
          firstName: true,
          level: true,
          balance: true,
          tasksCompleted: true,
          tasksCreated: true,
          createdAt: true,
          metadata: true
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.user.count({ where })
    ]);

    return {
      users,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1
    };
  }

  // Получение статистики для админки
  async getDashboardStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      newUsersToday,
      activeTasks,
      pendingExecutions,
      totalBalance,
      todayRevenue
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: { createdAt: { gte: today } }
      }),
      prisma.task.count({
        where: { status: 'active' }
      }),
      prisma.taskExecution.count({
        where: { status: 'pending' }
      }),
      prisma.user.aggregate({
        _sum: { balance: true }
      }),
      prisma.transaction.aggregate({
        where: {
          createdAt: { gte: today },
          type: { in: ['spend'] }
        },
        _sum: { amount: true }
      })
    ]);

    const usersByLevel = await prisma.user.groupBy({
      by: ['level'],
      _count: { level: true }
    });

    return {
      totalUsers,
      newUsersToday,
      activeTasks,
      pendingExecutions,
      totalBalance: totalBalance._sum.balance?.toNumber() || 0,
      todayRevenue: todayRevenue._sum.amount?.toNumber() || 0,
      usersByLevel: usersByLevel.reduce((acc, item) => {
        acc[item.level] = item._count.level;
        return acc;
      }, {} as Record<string, number>)
    };
  }

  // Получение пользователей требующих внимания
  async getUsersRequiringAttention() {
    const suspicious = await prisma.user.findMany({
      where: {
        OR: [
          // Много неудачных заданий
          { metadata: { path: ['suspiciousActivity'], equals: true } },
          // Необычные паттерны
          { tasksCompleted: { gt: 100 }, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
        ]
      },
      select: {
        telegramId: true,
        username: true,
        firstName: true,
        tasksCompleted: true,
        createdAt: true,
        metadata: true
      },
      take: 10
    });

    return suspicious;
  }

  // Системные действия
  async getSystemInfo() {
    const dbSize = await prisma.$queryRaw`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size
    ` as any[];

    const activeConnections = await prisma.$queryRaw`
      SELECT count(*) as count FROM pg_stat_activity WHERE state = 'active'
    ` as any[];

    return {
      database: {
        size: dbSize[0]?.size || 'Unknown',
        connections: activeConnections[0]?.count || 0
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version
    };
  }
}

export const adminService = new AdminService();