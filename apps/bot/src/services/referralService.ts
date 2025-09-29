// apps/bot/src/services/referralService.ts
import { prisma, UserLevel } from '@pr-gram/database';
import { USER_LEVEL_CONFIG } from '@pr-gram/shared';
import { balanceService } from './balanceService';
import { notificationService } from './notificationService';

export class ReferralService {
  // Generate unique referral code
  generateReferralCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Create referral link
  createReferralLink(userId: number, referralCode?: string): string {
    const code = referralCode || this.generateReferralCode();
    return `https://t.me/${process.env.BOT_USERNAME}?start=ref_${code}`;
  }

  // Process referral registration
  async processReferralRegistration(referralCode: string, newUserId: number) {
    return await prisma.$transaction(async (tx) => {
      // Find referrer by code
      const referrer = await tx.user.findFirst({
        where: { referralCode }
      });

      if (!referrer) {
        throw new Error('Реферальный код не найден');
      }

      if (referrer.telegramId === newUserId) {
        throw new Error('Нельзя использовать собственную реферальную ссылку');
      }

      // Check if user already has a referrer
      const existingUser = await tx.user.findUnique({
        where: { telegramId: newUserId }
      });

      if (existingUser?.referrerId) {
        throw new Error('У пользователя уже есть реферер');
      }

      // Update new user with referrer
      await tx.user.update({
        where: { telegramId: newUserId },
        data: { referrerId: referrer.telegramId }
      });

      // Give referral bonus to referrer
      const levelConfig = USER_LEVEL_CONFIG[referrer.level];
      const bonusAmount = levelConfig.referralBonus;

      await balanceService.updateBalance(
        referrer.telegramId,
        bonusAmount,
        'referral',
        'Бонус за приглашение нового пользователя',
        { 
          referralId: newUserId,
          bonusType: 'registration' 
        }
      );

      // Notify referrer
      await notificationService.notifyReferralBonus(
        referrer.telegramId,
        bonusAmount
      );

      return {
        referrer,
        bonusAmount,
        newUserId
      };
    });
  }

  // Handle referral earning bonus
  async handleReferralEarning(referrerId: number, referralId: number, earningAmount: number) {
    const referrer = await prisma.user.findUnique({
      where: { telegramId: referrerId }
    });

    if (!referrer) return null;

    // Calculate bonus percentage based on referrer level
    let bonusPercentage = 0.05; // Default 5%
    
    switch (referrer.level) {
      case UserLevel.bronze:
        bonusPercentage = 0.05; // 5%
        break;
      case UserLevel.silver:
        bonusPercentage = 0.07; // 7%
        break;
      case UserLevel.gold:
        bonusPercentage = 0.10; // 10%
        break;
      case UserLevel.premium:
        bonusPercentage = 0.15; // 15%
        break;
    }

    const bonusAmount = Math.floor(earningAmount * bonusPercentage);

    if (bonusAmount < 1) return null; // Minimum 1 GRAM

    // Give bonus to referrer
    await balanceService.updateBalance(
      referrerId,
      bonusAmount,
      'referral',
      `Бонус с заработка реферала (${Math.round(bonusPercentage * 100)}%)`,
      { 
        referralId,
        earningAmount,
        bonusPercentage: Math.round(bonusPercentage * 100)
      }
    );

    return bonusAmount;
  }
}

export const referralService = new ReferralService();


