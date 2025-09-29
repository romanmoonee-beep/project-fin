import { Bot } from 'grammy';
import { prisma, UserLevel } from '@pr-gram/database';
import { config } from '../config';

export interface BroadcastFilters {
  levels?: UserLevel[];
  isPremium?: boolean;
  registeredAfter?: Date;
  registeredBefore?: Date;
  minBalance?: number;
  maxBalance?: number;
  activeOnly?: boolean;
  specificUsers?: number[];
}

export interface BroadcastMessage {
  text: string;
  parseMode?: 'HTML' | 'Markdown';
  disableWebPagePreview?: boolean;
  replyMarkup?: any;
}

export interface BroadcastResult {
  id: string;
  totalUsers: number;
  sentCount: number;
  failedCount: number;
  blockedCount: number;
  errors: string[];
  startedAt: Date;
  completedAt?: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export class BroadcastService {
  private bot: Bot;

  constructor() {
    this.bot = new Bot(config.BOT_TOKEN);
  }

  // Получение пользователей по фильтрам
  async getUsersForBroadcast(filters: BroadcastFilters): Promise<number[]> {
    const where: any = {};

    if (filters.levels && filters.levels.length > 0) {
      where.level = { in: filters.levels };
    }

    if (filters.isPremium !== undefined) {
      where.isPremium = filters.isPremium;
    }

    if (filters.registeredAfter) {
      where.createdAt = { gte: filters.registeredAfter };
    }

    if (filters.registeredBefore) {
      if (where.createdAt) {
        where.createdAt.lte = filters.registeredBefore;
      } else {
        where.createdAt = { lte: filters.registeredBefore };
      }
    }

    if (filters.minBalance !== undefined) {
      where.balance = { gte: filters.minBalance };
    }

    if (filters.maxBalance !== undefined) {
      if (where.balance) {
        where.balance.lte = filters.maxBalance;
      } else {
        where.balance = { lte: filters.maxBalance };
      }
    }

    if (filters.activeOnly) {
      // Пользователи активные за последние 30 дней
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      where.activities = {
        some: {
          createdAt: { gte: thirtyDaysAgo }
        }
      };
    }

    // Исключаем заблокированных пользователей
    where.metadata = {
      path: ['banned'],
      not: true
    };

    if (filters.specificUsers && filters.specificUsers.length > 0) {
      where.telegramId = { in: filters.specificUsers };
    }

    const users = await prisma.user.findMany({
      where,
      select: { telegramId: true }
    });

    return users.map(u => u.telegramId);
  }

  // Отправка рассылки
  async sendBroadcast(
    message: BroadcastMessage,
    filters: BroadcastFilters,
    adminId: number,
    scheduledAt?: Date
  ): Promise<BroadcastResult> {
    const userIds = await this.getUsersForBroadcast(filters);
    
    if (userIds.length === 0) {
      throw new Error('Не найдено пользователей для рассылки');
    }

    // Создаем запись о рассылке
    const broadcast = await prisma.userActivity.create({
      data: {
        userId: adminId,
        type: 'broadcast_created',
        description: `Создана рассылка для ${userIds.length} пользователей`,
        metadata: {
          message,
          filters,
          userIds,
          scheduledAt: scheduledAt?.toISOString(),
          status: scheduledAt ? 'scheduled' : 'pending',
          totalUsers: userIds.length
        }
      }
    });

    if (scheduledAt && scheduledAt > new Date()) {
      // Запланированная рассылка - добавляем в очередь
      return {
        id: broadcast.id,
        totalUsers: userIds.length,
        sentCount: 0,
        failedCount: 0,
        blockedCount: 0,
        errors: [],
        startedAt: new Date(),
        status: 'pending'
      };
    }

    // Немедленная отправка
    return await this.executeBroadcast(broadcast.id, message, userIds);
  }

  // Выполнение рассылки
  private async executeBroadcast(
    broadcastId: string,
    message: BroadcastMessage,
    userIds: number[]
  ): Promise<BroadcastResult> {
    const result: BroadcastResult = {
      id: broadcastId,
      totalUsers: userIds.length,
      sentCount: 0,
      failedCount: 0,
      blockedCount: 0,
      errors: [],
      startedAt: new Date(),
      status: 'in_progress'
    };

    // Обновляем статус
    await prisma.userActivity.update({
      where: { id: broadcastId },
      data: {
        metadata: {
          path: ['status'],
          set: 'in_progress'
        }
      }
    });

    // Отправляем сообщения порциями
    const batchSize = 30; // Telegram rate limit
    const batches = this.chunkArray(userIds, batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      for (const userId of batch) {
        try {
          await this.bot.api.sendMessage(userId, message.text, {
            parse_mode: message.parseMode,
            disable_web_page_preview: message.disableWebPagePreview,
            reply_markup: message.replyMarkup
          });
          
          result.sentCount++;
          
        } catch (error: any) {
          result.failedCount++;
          
          if (error.error_code === 403) {
            // Пользователь заблокировал бота
            result.blockedCount++;
            
            // Помечаем пользователя как заблокировавшего бота
            await prisma.user.update({
              where: { telegramId: userId },
              data: {
                metadata: {
                  path: ['botBlocked'],
                  set: true
                }
              }
            }).catch(() => {}); // Игнорируем ошибки обновления
            
          } else {
            result.errors.push(`User ${userId}: ${error.description}`);
          }
        }
        
        // Небольшая задержка между сообщениями
        await this.delay(100);
      }
      
      // Задержка между батчами
      if (i < batches.length - 1) {
        await this.delay(1000);
      }
    }

    result.completedAt = new Date();
    result.status = 'completed';

    // Обновляем результат в БД
    await prisma.userActivity.update({
      where: { id: broadcastId },
      data: {
        metadata: {
          path: ['result'],
          set: {
            sentCount: result.sentCount,
            failedCount: result.failedCount,
            blockedCount: result.blockedCount,
            errors: result.errors.slice(0, 10), // Храним только первые 10 ошибок
            completedAt: result.completedAt.toISOString(),
            status: 'completed'
          }
        }
      }
    });

    return result;
  }

  // Получение статистики рассылки
  async getBroadcastStats(broadcastId: string) {
    const broadcast = await prisma.userActivity.findUnique({
      where: { id: broadcastId }
    });

    if (!broadcast || broadcast.type !== 'broadcast_created') {
      throw new Error('Рассылка не найдена');
    }

    return {
      id: broadcast.id,
      createdAt: broadcast.createdAt,
      message: broadcast.metadata.message,
      filters: broadcast.metadata.filters,
      result: broadcast.metadata.result || {
        sentCount: 0,
        failedCount: 0,
        blockedCount: 0,
        status: broadcast.metadata.status
      }
    };
  }

  // Получение истории рассылок
  async getBroadcastHistory(page = 1, limit = 20) {
    const [broadcasts, total] = await Promise.all([
      prisma.userActivity.findMany({
        where: { type: 'broadcast_created' },
        include: {
          user: {
            select: {
              username: true,
              firstName: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.userActivity.count({
        where: { type: 'broadcast_created' }
      })
    ]);

    return {
      broadcasts: broadcasts.map(b => ({
        id: b.id,
        createdBy: b.user,
        message: b.metadata.message?.text?.substring(0, 100) + '...',
        totalUsers: b.metadata.totalUsers || 0,
        sentCount: b.metadata.result?.sentCount || 0,
        status: b.metadata.result?.status || b.metadata.status,
        createdAt: b.createdAt
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  // Тестовая отправка
  async sendTestMessage(message: BroadcastMessage, testUserIds: number[]) {
    const results = [];

    for (const userId of testUserIds) {
      try {
        await this.bot.api.sendMessage(userId, `🧪 ТЕСТ РАССЫЛКИ\n\n${message.text}`, {
          parse_mode: message.parseMode,
          disable_web_page_preview: message.disableWebPagePreview,
          reply_markup: message.replyMarkup
        });
        
        results.push({ userId, success: true });
      } catch (error: any) {
        results.push({ 
          userId, 
          success: false, 
          error: error.description 
        });
      }
    }

    return results;
  }

  // Получение шаблонов сообщений
  async getMessageTemplates() {
    return [
      {
        id: 'welcome',
        name: 'Приветствие',
        text: '🎉 Добро пожаловать в PR GRAM!\n\nЗарабатывайте GRAM за простые действия и продвигайте свои проекты!'
      },
      {
        id: 'new_features',
        name: 'Новые функции',
        text: '🆕 Обновление!\n\nВ боте появились новые возможности:\n• Новые типы заданий\n• Улучшенная система чеков\n• Расширенная аналитика'
      },
      {
        id: 'maintenance',
        name: 'Техническое обслуживание',
        text: '🔧 Техническое обслуживание\n\nВ {время} планируется кратковременное техническое обслуживание.\n\nВремя недоступности: ~{длительность}'
      }
    ];
  }

  // Утилиты
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const broadcastService = new BroadcastService();