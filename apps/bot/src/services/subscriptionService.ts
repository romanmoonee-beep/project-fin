import { prisma, CheckType } from '@pr-gram/database';
import { telegramService } from './telegramService';
import { notificationService } from './notificationService';
import { balanceService } from './balanceService';
import type { BotContext } from '../types/context';

export class SubscriptionService {
  // Setup subscription check
  async setupSubscriptionCheck(
    chatId: number,
    setupData: {
      type: CheckType;
      target: string;
      inviteLink?: string;
      timer?: number; // seconds
      subscriberGoal?: number;
      createdBy: number;
    }
  ) {
    // Validate setup data
    await this.validateSetupData(setupData);

    // Check if chat already has maximum number of checks
    const existingChecks = await prisma.subscriptionCheck.count({
      where: {
        chatId,
        isActive: true
      }
    });

    if (existingChecks >= 5) { // Maximum 5 checks per chat
      throw new Error('Превышен лимит проверок подписки для этого чата (максимум 5)');
    }

    let targetChatId: number | undefined;
    let targetUsername: string | undefined;
    let targetTitle: string | undefined;

    // Process target based on type
    switch (setupData.type) {
      case CheckType.public_channel:
        targetUsername = this.cleanUsername(setupData.target);
        targetTitle = await this.getChatTitle(targetUsername);
        break;
        
      case CheckType.private_channel:
        targetChatId = parseInt(setupData.target);
        if (isNaN(targetChatId)) {
          throw new Error('Неверный ID приватного канала');
        }
        targetTitle = await this.getChatTitle(targetChatId);
        break;
        
      case CheckType.invite_link:
        targetChatId = parseInt(setupData.target);
        if (isNaN(targetChatId) || !setupData.inviteLink) {
          throw new Error('Требуется ID канала и пригласительная ссылка');
        }
        targetTitle = await this.getChatTitle(targetChatId);
        break;
        
      case CheckType.referral_bot:
        // For referral bot setup, target is the referrer's user ID
        const referrerId = parseInt(setupData.target);
        if (isNaN(referrerId)) {
          throw new Error('Неверный ID реферера');
        }
        
        const referrer = await prisma.user.findUnique({
          where: { telegramId: referrerId }
        });
        
        if (!referrer) {
          throw new Error('Реферер не найден');
        }
        
        targetUsername = `PR GRAM Bot (Реферер: ${referrer.username || referrer.firstName})`;
        break;
    }

    // Calculate expiration time
    let expiresAt: Date | undefined;
    if (setupData.timer && setupData.timer > 0) {
      expiresAt = new Date(Date.now() + (setupData.timer * 1000));
    }

    // Create subscription check
    const subscriptionCheck = await prisma.subscriptionCheck.create({
      data: {
        chatId,
        targetChatId,
        targetUsername,
        targetTitle,
        inviteLink: setupData.inviteLink,
        setupType: setupData.type,
        expiresAt,
        subscriberGoal: setupData.subscriberGoal,
        createdBy: setupData.createdBy,
        settings: {
          autoDelete: false,
          autoDeleteTimer: 30, // Default 30 seconds
          showStatistics: true,
          notifyAdmins: true,
          requireReferral: setupData.type === CheckType.referral_bot,
          referralUserId: setupData.type === CheckType.referral_bot ? parseInt(setupData.target) : undefined,
        },
        statistics: {
          totalChecks: 0,
          passedChecks: 0,
          failedChecks: 0,
          uniqueUsers: 0,
          totalMessages: 0,
          deletedMessages: 0,
          averageCheckTime: 0,
          dailyStats: [],
        }
      }
    });

    // Log activity
    await this.logSubscriptionActivity(
      setupData.createdBy,
      'setup_created',
      `Настроена проверка подписки для чата ${chatId}`,
      {
        checkId: subscriptionCheck.id,
        chatId,
        setupType: setupData.type,
        target: setupData.target
      }
    );

    return subscriptionCheck;
  }

  // Remove subscription check
  async removeSubscriptionCheck(chatId: number, target?: string, userId?: number) {
    let whereClause: any = {
      chatId,
      isActive: true
    };

    if (target) {
      // Remove specific check
      if (target.startsWith('@') || isNaN(parseInt(target))) {
        // Username
        whereClause.targetUsername = this.cleanUsername(target);
      } else {
        // Chat ID
        whereClause.targetChatId = parseInt(target);
      }
    }

    const checks = await prisma.subscriptionCheck.findMany({
      where: whereClause
    });

    if (checks.length === 0) {
      throw new Error('Проверки подписки не найдены');
    }

    // Deactivate checks
    const updated = await prisma.subscriptionCheck.updateMany({
      where: whereClause,
      data: {
        isActive: false,
        metadata: {
          path: ['deactivatedAt'],
          set: new Date().toISOString()
        }
      }
    });

    // Log activity
    if (userId) {
      await this.logSubscriptionActivity(
        userId,
        'setup_removed',
        `Удалена проверка подписки для чата ${chatId}`,
        {
          chatId,
          target,
          removedCount: updated.count
        }
      );
    }

    return updated.count;
  }

  // Check user subscriptions
  async checkUserSubscriptions(userId: number, chatId: number) {
    // Get active subscription checks for this chat
    const checks = await prisma.subscriptionCheck.findMany({
      where: {
        chatId,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      }
    });

    if (checks.length === 0) {
      return {
        passed: true,
        failed: [],
        message: null,
        requiresAction: false
      };
    }

    const results = [];
    const startTime = Date.now();

    // Check each subscription requirement
    for (const check of checks) {
      const result = await this.verifySubscription(userId, check);
      results.push({
        check,
        subscribed: result.subscribed,
        reason: result.reason
      });

      // Update check statistics
      await this.updateCheckStatistics(check.id, result.subscribed);
    }

    const failed = results.filter(r => !r.subscribed);
    const passed = failed.length === 0;

    // Update overall statistics
    const checkTime = Date.now() - startTime;
    await this.updateOverallStatistics(chatId, passed, checkTime);

    if (!passed) {
      return {
        passed: false,
        failed: failed.map(f => f.check),
        message: this.generateSubscriptionMessage(failed),
        requiresAction: true
      };
    }

    // Handle referral bonus if applicable
    await this.handleReferralBonus(userId, checks);

    return {
      passed: true,
      failed: [],
      message: null,
      requiresAction: false
    };
  }

  // Verify single subscription
  async verifySubscription(userId: number, check: any) {
    try {
      switch (check.setupType) {
        case CheckType.public_channel:
          return await this.verifyPublicChannelSubscription(userId, check);
          
        case CheckType.private_channel:
          return await this.verifyPrivateChannelSubscription(userId, check);
          
        case CheckType.invite_link:
          return await this.verifyInviteLinkSubscription(userId, check);
          
        case CheckType.referral_bot:
          return await this.verifyReferralBotSubscription(userId, check);
          
        default:
          return { subscribed: false, reason: 'Неизвестный тип проверки' };
      }
    } catch (error) {
      console.error('Subscription verification error:', error);
      return { subscribed: false, reason: 'Ошибка проверки подписки' };
    }
  }

  // Verify public channel subscription
  async verifyPublicChannelSubscription(userId: number, check: any) {
    if (!check.targetUsername) {
      return { subscribed: false, reason: 'Не указан канал для проверки' };
    }

    try {
      const isMember = await telegramService.checkChatMember(check.targetUsername, userId);
      return {
        subscribed: isMember,
        reason: isMember ? 'Подписка подтверждена' : 'Подписка не найдена'
      };
    } catch (error) {
      console.error('Public channel verification error:', error);
      return { subscribed: false, reason: 'Ошибка проверки канала' };
    }
  }

  // Verify private channel subscription
  async verifyPrivateChannelSubscription(userId: number, check: any) {
    if (!check.targetChatId) {
      return { subscribed: false, reason: 'Не указан ID канала' };
    }

    try {
      const isMember = await telegramService.checkChatMember(check.targetChatId, userId);
      return {
        subscribed: isMember,
        reason: isMember ? 'Участие подтверждено' : 'Участие не найдено'
      };
    } catch (error) {
      console.error('Private channel verification error:', error);
      return { subscribed: false, reason: 'Ошибка проверки канала' };
    }
  }

  // Verify invite link subscription
  async verifyInviteLinkSubscription(userId: number, check: any) {
    if (!check.targetChatId) {
      return { subscribed: false, reason: 'Не указан ID канала' };
    }

    try {
      const isMember = await telegramService.checkChatMember(check.targetChatId, userId);
      
      // If user is subscribed, update subscriber count
      if (isMember && check.subscriberGoal) {
        await this.updateSubscriberCount(check.id);
        
        // Check if goal is reached
        if (check.currentSubscribers + 1 >= check.subscriberGoal) {
          await this.deactivateCheck(check.id, 'Достигнута цель по количеству подписчиков');
        }
      }
      
      return {
        subscribed: isMember,
        reason: isMember ? 'Участие подтверждено' : 'Перейдите по ссылке и вступите в канал'
      };
    } catch (error) {
      console.error('Invite link verification error:', error);
      return { subscribed: false, reason: 'Ошибка проверки канала' };
    }
  }

  // Verify referral bot subscription
  async verifyReferralBotSubscription(userId: number, check: any) {
    const settings = check.settings as any;
    const referralUserId = settings?.referralUserId;

    if (!referralUserId) {
      return { subscribed: false, reason: 'Не указан ID реферера' };
    }

    try {
      // Check if user was referred by the specified user
      const user = await prisma.user.findUnique({
        where: { telegramId: userId },
        include: { referrer: true }
      });

      if (!user) {
        return { subscribed: false, reason: 'Пользователь не найден' };
      }

      const isReferred = user.referrerId === referralUserId;
      
      return {
        subscribed: isReferred,
        reason: isReferred 
          ? 'Реферальная связь подтверждена' 
          : 'Необходимо зарегистрироваться по реферальной ссылке'
      };
    } catch (error) {
      console.error('Referral verification error:', error);
      return { subscribed: false, reason: 'Ошибка проверки реферальной связи' };
    }
  }

  // Generate subscription message
  generateSubscriptionMessage(failed: any[]) {
    const channels = failed.map(f => {
      const check = f.check;
      let name = check.targetTitle || check.targetUsername || 'Канал';
      let url = '';

      switch (check.setupType) {
        case CheckType.public_channel:
          url = `https://t.me/${check.targetUsername?.replace('@', '')}`;
          break;
        case CheckType.private_channel:
        case CheckType.invite_link:
          url = check.inviteLink || '';
          break;
        case CheckType.referral_bot:
          url = `https://t.me/prgram_bot?start=${check.settings?.referralUserId}`;
          name = 'PR GRAM Bot (реферальная ссылка)';
          break;
      }

      return { name, url };
    });

    let message = '🔒 Для участия в чате необходимо подписаться на каналы:\n\n';
    
    channels.forEach((channel, index) => {
      message += `${index + 1}. ${channel.name}\n`;
    });

    message += '\n💡 После подписки нажмите "Проверить"';

    return message;
  }

  // Handle referral bonus
  async handleReferralBonus(userId: number, checks: any[]) {
    const referralChecks = checks.filter(c => c.setupType === CheckType.referral_bot);
    
    for (const check of referralChecks) {
      const referralUserId = check.settings?.referralUserId;
      if (!referralUserId) continue;

      try {
        // Check if user is new (registered recently)
        const user = await prisma.user.findUnique({
          where: { telegramId: userId }
        });

        if (!user || user.referrerId !== referralUserId) continue;

        // Check if bonus was already given
        const existingBonus = await prisma.transaction.findFirst({
          where: {
            userId: referralUserId,
            type: 'referral',
            metadata: {
              path: ['referralUserId'],
              equals: userId
            }
          }
        });

        if (existingBonus) continue;

        // Give referral bonus
        await balanceService.handleReferralBonus(referralUserId, userId);
        
      } catch (error) {
        console.error('Referral bonus error:', error);
      }
    }
  }

  // Update check statistics
  async updateCheckStatistics(checkId: string, passed: boolean) {
    await prisma.subscriptionCheck.update({
      where: { id: checkId },
      data: {
        statistics: {
          path: ['totalChecks'],
          increment: 1
        }
      }
    });

    const field = passed ? 'passedChecks' : 'failedChecks';
    await prisma.subscriptionCheck.update({
      where: { id: checkId },
      data: {
        statistics: {
          path: [field],
          increment: 1
        }
      }
    });
  }

  // Update overall statistics
  async updateOverallStatistics(chatId: number, passed: boolean, checkTimeMs: number) {
    // This would update daily statistics
    // Implementation depends on how you want to structure the statistics
  }

  // Update subscriber count
  async updateSubscriberCount(checkId: string) {
    await prisma.subscriptionCheck.update({
      where: { id: checkId },
      data: {
        currentSubscribers: { increment: 1 }
      }
    });
  }

  // Deactivate check
  async deactivateCheck(checkId: string, reason: string) {
    await prisma.subscriptionCheck.update({
      where: { id: checkId },
      data: {
        isActive: false,
        metadata: {
          path: ['deactivatedAt'],
          set: new Date().toISOString(),
          reason
        }
      }
    });
  }

  // Get subscription checks status
  async getSubscriptionStatus(chatId: number) {
    const checks = await prisma.subscriptionCheck.findMany({
      where: {
        chatId,
        isActive: true
      },
      include: {
        creator: {
          select: {
            username: true,
            firstName: true
          }
        }
      }
    });

    return checks.map(check => ({
      id: check.id,
      type: check.setupType,
      target: check.targetUsername || check.targetChatId?.toString() || 'Unknown',
      title: check.targetTitle,
      inviteLink: check.inviteLink,
      subscriberGoal: check.subscriberGoal,
      currentSubscribers: check.currentSubscribers,
      expiresAt: check.expiresAt,
      createdBy: check.creator,
      createdAt: check.createdAt,
      statistics: check.statistics
    }));
  }

  // Helper methods
  private cleanUsername(username: string): string {
    return username.startsWith('@') ? username.slice(1) : username;
  }

  private async getChatTitle(chatIdentifier: string | number): Promise<string> {
    try {
      const chat = await telegramService.getChat(chatIdentifier);
      return chat.title || chat.first_name || 'Unknown';
    } catch (error) {
      console.error('Get chat title error:', error);
      return 'Unknown';
    }
  }

  private validateSetupData(setupData: any) {
    if (!setupData.target) {
      throw new Error('Не указана цель для проверки подписки');
    }

    if (setupData.type === CheckType.invite_link && !setupData.inviteLink) {
      throw new Error('Для проверки по пригласительной ссылке требуется указать ссылку');
    }

    if (setupData.timer && (setupData.timer < 60 || setupData.timer > 604800)) {
      throw new Error('Таймер должен быть от 1 минуты до 7 дней');
    }

    if (setupData.subscriberGoal && (setupData.subscriberGoal < 1 || setupData.subscriberGoal > 100000)) {
      throw new Error('Цель подписчиков должна быть от 1 до 100,000');
    }
  }

  private async logSubscriptionActivity(
    userId: number,
    type: string,
    description: string,
    metadata: any
  ) {
    try {
      await prisma.userActivity.create({
        data: {
          userId,
          type,
          description,
          metadata
        }
      });
    } catch (error) {
      console.error('Log subscription activity error:', error);
    }
  }
}

export const subscriptionService = new SubscriptionService();