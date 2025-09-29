// apps/bot/src/services/checkService.ts
import { prisma } from '@pr-gram/database';
import { balanceService } from './balanceService';
import { notificationService } from './notificationService';
import { telegramService } from './telegramService';

export class CheckService {
  // Create a new check
  async createCheck(
    createdBy: number,
    amount: number,
    maxActivations: number,
    password?: string,
    comment?: string,
    conditions?: any,
    expiresAt?: Date
  ) {
    // Validate creator has sufficient balance
    const totalCost = amount * maxActivations;
    const canAfford = await balanceService.canAfford(createdBy, totalCost);
    
    if (!canAfford) {
      throw new Error('Недостаточно средств для создания чека');
    }

    return await prisma.$transaction(async (tx) => {
      // Freeze the required amount
      await balanceService.freezeBalance(
        createdBy,
        totalCost,
        `Создание чека на ${amount} GRAM x${maxActivations}`
      );

      // Create the check
      const check = await tx.check.create({
        data: {
          createdBy,
          amount,
          maxActivations,
          password,
          comment,
          conditions: conditions || {},
          design: {
            emoji: '💰',
            color: '#FFD700',
            backgroundColor: '#FFF8DC',
            borderColor: '#DAA520'
          },
          expiresAt
        }
      });

      return check;
    });
  }

  // Activate a check
  async activateCheck(
    checkId: string,
    userId: number,
    password?: string,
    metadata?: any
  ) {
    return await prisma.$transaction(async (tx) => {
      const check = await tx.check.findUnique({
        where: { id: checkId },
        include: { 
          creator: true,
          activations: {
            where: { userId }
          }
        }
      });

      if (!check) {
        throw new Error('Чек не найден');
      }

      if (!check.isActive) {
        throw new Error('Чек неактивен');
      }

      if (check.expiresAt && check.expiresAt < new Date()) {
        throw new Error('Срок действия чека истек');
      }

      if (check.currentActivations >= check.maxActivations) {
        throw new Error('Превышено максимальное количество активаций');
      }

      // Check if user already activated this check
      if (check.activations && check.activations.length > 0) {
        throw new Error('Вы уже активировали этот чек');
      }

      // Check password if required
      if (check.password && check.password !== password) {
        throw new Error('Неверный пароль');
      }

      // Check conditions
      const conditionsResult = await this.checkConditions(check.conditions, userId);
      if (!conditionsResult.passed) {
        throw new Error(conditionsResult.reason || 'Условия получения не выполнены');
      }

      // Create activation record
      const activation = await tx.checkActivation.create({
        data: {
          checkId: check.id,
          userId,
          amount: check.amount,
          metadata: metadata || {}
        }
      });

      // Update check activation count
      await tx.check.update({
        where: { id: checkId },
        data: {
          currentActivations: { increment: 1 }
        }
      });

      // Transfer funds from frozen balance to user
      await this.transferCheckFunds(check.createdBy, userId, check.amount, checkId);

      // Deactivate check if fully used
      if (check.currentActivations + 1 >= check.maxActivations) {
        await tx.check.update({
          where: { id: checkId },
          data: { isActive: false }
        });

        // Unfreeze remaining balance if any
        const remainingAmount = (check.maxActivations - check.currentActivations - 1) * check.amount;
        if (remainingAmount > 0) {
          await balanceService.unfreezeBalance(
            check.createdBy,
            remainingAmount,
            'Возврат неиспользованных средств чека'
          );
        }
      }

      return { check, activation };
    });
  }

  // Check conditions for check activation
  async checkConditions(conditions: any, userId: number) {
    if (!conditions || Object.keys(conditions).length === 0) {
      return { passed: true };
    }

    // Check subscription requirement
    if (conditions.subscriptionRequired) {
      const isSubscribed = await telegramService.verifyChannelSubscription(
        conditions.subscriptionRequired,
        userId
      );
      
      if (!isSubscribed) {
        return { 
          passed: false, 
          reason: `Необходимо подписаться на канал ${conditions.subscriptionRequired}` 
        };
      }
    }

    // Check minimum level requirement
    if (conditions.minLevel) {
      const user = await prisma.user.findUnique({
        where: { telegramId: userId }
      });

      if (!user) {
        return { passed: false, reason: 'Пользователь не найден' };
      }

      const levelOrder = ['bronze', 'silver', 'gold', 'premium'];
      const userLevelIndex = levelOrder.indexOf(user.level);
      const minLevelIndex = levelOrder.indexOf(conditions.minLevel);

      if (userLevelIndex < minLevelIndex) {
        return { 
          passed: false, 
          reason: `Требуется минимальный уровень: ${conditions.minLevel}` 
        };
      }
    }

    return { passed: true };
  }

  // Transfer check funds
  async transferCheckFunds(fromUserId: number, toUserId: number, amount: number, checkId: string) {
    // Unfreeze amount from creator
    await balanceService.unfreezeBalance(
      fromUserId,
      amount,
      `Активация чека #${checkId.slice(-6)}`
    );

    // Credit to recipient
    await balanceService.updateBalance(
      toUserId,
      amount,
      'earn',
      `Активация чека #${checkId.slice(-6)}`,
      { checkId, transferFrom: fromUserId }
    );

    // Handle referral bonus if recipient has referrer
    const recipient = await prisma.user.findUnique({
      where: { telegramId: toUserId }
    });

    if (recipient?.referrerId) {
      await balanceService.handleReferralEarningBonus(
        recipient.referrerId,
        toUserId,
        amount
      );
    }
  }
}

export const checkService = new CheckService();
