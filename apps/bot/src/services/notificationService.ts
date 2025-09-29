// apps/bot/src/services/notificationService.ts
import { prisma, NotificationType } from '@pr-gram/database';
import { telegramService } from './telegramService';
import { config } from '../config';

export class NotificationService {
  private batchQueue: any[] = [];
  private processingTimer?: NodeJS.Timeout;

  // Initialize service
  async initialize() {
    console.log('📢 Initializing notification service...');
    this.startBatchProcessor();
  }

  // Shutdown service
  async shutdown() {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
    }
    await this.processPendingNotifications();
  }

  // Create notification
  async createNotification(
    userId: number,
    type: NotificationType,
    title: string,
    message: string,
    data?: any
  ) {
    try {
      const notification = await prisma.notification.create({
        data: {
          userId,
          type,
          title,
          message,
          data: data || {}
        }
      });

      // Add to batch queue for sending
      this.batchQueue.push(notification);

      return notification;
    } catch (error) {
      console.error('Create notification error:', error);
      throw new Error('Не удалось создать уведомление');
    }
  }

  // Send notification immediately
  async sendNotification(userId: number, title: string, message: string, data?: any) {
    try {
      await telegramService.sendMessage(
        userId,
        `🔔 <b>${title}</b>\n\n${message}`,
        { parse_mode: 'HTML' }
      );

      return true;
    } catch (error) {
      console.error('Send notification error:', error);
      return false;
    }
  }

  // Mark notification as read
  async markAsRead(notificationId: string, userId: number) {
    try {
      return await prisma.notification.update({
        where: {
          id: notificationId,
          userId // Ensure user can only mark their own notifications
        },
        data: {
          isRead: true,
          readAt: new Date()
        }
      });
    } catch (error) {
      console.error('Mark as read error:', error);
      throw new Error('Не удалось отметить уведомление как прочитанное');
    }
  }

  // Get user notifications
  async getUserNotifications(
    userId: number,
    page = 1,
    limit = 20,
    unreadOnly = false
  ) {
    const skip = (page - 1) * limit;

    const where = {
      userId,
      ...(unreadOnly && { isRead: false })
    };

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { userId, isRead: false }
      })
    ]);

    return {
      notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      },
      unreadCount
    };
  }

  // Mark all notifications as read
  async markAllAsRead(userId: number) {
    try {
      const result = await prisma.notification.updateMany({
        where: {
          userId,
          isRead: false
        },
        data: {
          isRead: true,
          readAt: new Date()
        }
      });

      return result.count;
    } catch (error) {
      console.error('Mark all as read error:', error);
      throw new Error('Не удалось отметить все уведомления как прочитанные');
    }
  }

  // Delete notification
  async deleteNotification(notificationId: string, userId: number) {
    try {
      return await prisma.notification.delete({
        where: {
          id: notificationId,
          userId
        }
      });
    } catch (error) {
      console.error('Delete notification error:', error);
      throw new Error('Не удалось удалить уведомление');
    }
  }

  // Send bulk notifications
  async sendBulkNotifications(
    userIds: number[],
    title: string,
    message: string,
    type: NotificationType = NotificationType.system_message,
    data?: any
  ) {
    const results = [];

    // Create notifications in database
    const notifications = await Promise.allSettled(
      userIds.map(userId =>
        this.createNotification(userId, type, title, message, data)
      )
    );

    // Send via Telegram
    for (let i = 0; i < userIds.length; i++) {
      const userId = userIds[i];
      
      try {
        const sent = await this.sendNotification(userId, title, message, data);
        results.push({ userId, success: sent });
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        results.push({ 
          userId, 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return {
      total: userIds.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  // Notify admins
  async notifyAdmins(title: string, message: string, data?: any) {
    const adminIds = config.BOT_ADMIN_IDS;
    
    if (adminIds.length === 0) {
      console.warn('No admin IDs configured for notifications');
      return;
    }

    return await this.sendBulkNotifications(
      adminIds,
      `🔴 ADMIN: ${title}`,
      message,
      NotificationType.system_message,
      data
    );
  }

  // Start batch processor
  private startBatchProcessor() {
    this.processingTimer = setInterval(async () => {
      await this.processPendingNotifications();
    }, config.NOTIFICATION_DELAY_MS || 5000); // Process every 5 seconds
  }

  // Process pending notifications
  private async processPendingNotifications() {
    if (this.batchQueue.length === 0) return;

    const batch = this.batchQueue.splice(0, config.NOTIFICATION_BATCH_SIZE || 10);
    
    for (const notification of batch) {
      try {
        await this.sendNotification(
          notification.userId,
          notification.title,
          notification.message,
          notification.data
        );
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error('Failed to send notification:', error);
      }
    }
  }

  // Send task completion notification
  async notifyTaskCompleted(
    userId: number,
    taskTitle: string,
    reward: number,
    newBalance: number
  ) {
    return await this.createNotification(
      userId,
      NotificationType.task_completed,
      'Задание выполнено!',
      `Задание "${taskTitle}" выполнено! Получено: ${reward} GRAM\nТекущий баланс: ${newBalance} GRAM`,
      { taskTitle, reward, newBalance }
    );
  }

  // Send task approval notification
  async notifyTaskApproved(
    userId: number,
    taskTitle: string,
    reward: number
  ) {
    return await this.createNotification(
      userId,
      NotificationType.task_approved,
      'Задание одобрено!',
      `Ваше выполнение задания "${taskTitle}" одобрено! Получено: ${reward} GRAM`,
      { taskTitle, reward }
    );
  }

  // Send task rejection notification
  async notifyTaskRejected(
    userId: number,
    taskTitle: string,
    reason: string
  ) {
    return await this.createNotification(
      userId,
      NotificationType.task_rejected,
      'Задание отклонено',
      `Ваше выполнение задания "${taskTitle}" отклонено.\nПричина: ${reason}`,
      { taskTitle, reason }
    );
  }

  // Send referral bonus notification
  async notifyReferralBonus(
    userId: number,
    bonus: number,
    referralUsername?: string
  ) {
    return await this.createNotification(
      userId,
      NotificationType.referral_bonus,
      'Реферальный бонус!',
      `Получен бонус ${bonus} GRAM за приглашение${referralUsername ? ` пользователя @${referralUsername}` : ''}`,
      { bonus, referralUsername }
    );
  }

  // Send level up notification
  async notifyLevelUp(
    userId: number,
    newLevel: string,
    benefits: string[]
  ) {
    return await this.createNotification(
      userId,
      NotificationType.level_up,
      'Повышение уровня!',
      `Поздравляем! Ваш уровень повышен до ${newLevel.toUpperCase()}!\n\nНовые возможности:\n${benefits.join('\n')}`,
      { newLevel, benefits }
    );
  }

  // Send balance low warning
  async notifyBalanceLow(userId: number, currentBalance: number) {
    return await this.createNotification(
      userId,
      NotificationType.balance_low,
      'Низкий баланс',
      `Внимание! Ваш баланс составляет ${currentBalance} GRAM. Рекомендуем пополнить баланс для создания новых заданий.`,
      { currentBalance }
    );
  }

  // Get notification statistics
  async getNotificationStatistics(userId?: number) {
    const baseWhere = userId ? { userId } : {};

    const [total, unread, byType] = await Promise.all([
      prisma.notification.count({ where: baseWhere }),
      prisma.notification.count({ where: { ...baseWhere, isRead: false } }),
      prisma.notification.groupBy({
        by: ['type'],
        where: baseWhere,
        _count: { type: true }
      })
    ]);

    return {
      total,
      unread,
      read: total - unread,
      byType: byType.reduce((acc, item) => {
        acc[item.type] = item._count.type;
        return acc;
      }, {} as Record<string, number>)
    };
  }
}

export const notificationService = new NotificationService();