import { NextFunction } from 'grammy';
import { prisma } from '@pr-gram/database';
import { config, isAdmin, isSuperAdmin } from '../config';
import { referralService } from '../services/referralService';
import type { BotContext } from '../types/context';

export const userMiddleware = async (ctx: BotContext, next: NextFunction) => {
  if (!ctx.from) {
    return next();
  }

  try {
    const telegramId = ctx.from.id;
    const username = ctx.from.username;
    const firstName = ctx.from.first_name;
    const lastName = ctx.from.last_name;
    const languageCode = ctx.from.language_code || 'ru';

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { telegramId }
    });

    if (!user) {
      // Check for referral in start parameter
      let referrerId: number | undefined;
      
      if (ctx.message?.text?.startsWith('/start')) {
        const startParam = ctx.message.text.split(' ')[1];
        if (startParam && startParam.startsWith('ref_')) {
          const referralCode = startParam.replace('ref_', '');
          try {
            const referrer = await prisma.user.findFirst({
              where: { referralCode }
            });
            if (referrer && referrer.telegramId !== telegramId) {
              referrerId = referrer.telegramId;
            }
          } catch (error) {
            console.error('Referral processing error:', error);
          }
        }
      }

      // Generate unique referral code
      const referralCode = referralService.generateReferralCode();

      // Create new user
      user = await prisma.user.create({
        data: {
          telegramId,
          username,
          firstName,
          lastName,
          languageCode: languageCode as any,
          referrerId,
          referralCode,
          balance: 0,
          frozenBalance: 0,
          level: 'bronze',
          role: 'user',
          totalEarned: 0,
          totalSpent: 0,
          tasksCompleted: 0,
          tasksCreated: 0,
          isPremium: false,
          settings: {
            notifications: {
              taskCompleted: true,
              taskApproved: true,
              taskRejected: true,
              referralBonus: true,
              levelUp: true,
              systemMessages: true,
              dailySummary: false,
              weeklyReport: false
            },
            privacy: {
              showUsername: true,
              showLevel: true,
              showStats: false,
              allowDirectMessages: true
            },
            language: languageCode,
            theme: 'light'
          },
          metadata: {
            firstTaskCompletedAt: null,
            lastActiveAt: new Date(),
            deviceInfo: {
              platform: 'telegram',
              language: languageCode
            },
            registrationSource: 'telegram_bot',
            totalLoginDays: 1,
            consecutiveLoginDays: 1,
            averageTasksPerDay: 0,
            preferredTaskTypes: []
          }
        }
      });

      // Process referral bonus if applicable
      if (referrerId) {
        try {
          await referralService.processReferralRegistration(referralCode, telegramId);
        } catch (error) {
          console.error('Referral bonus processing error:', error);
        }
      }

      // Log new user registration
      await prisma.userActivity.create({
        data: {
          userId: telegramId,
          type: 'user_registered',
          description: 'Пользователь зарегистрировался в боте',
          metadata: {
            referrerId,
            source: 'telegram_bot',
            timestamp: new Date().toISOString()
          }
        }
      });

    } else {
      // Update existing user info if changed
      const updateData: any = {};
      let hasChanges = false;

      if (user.username !== username) {
        updateData.username = username;
        hasChanges = true;
      }
      if (user.firstName !== firstName) {
        updateData.firstName = firstName;
        hasChanges = true;
      }
      if (user.lastName !== lastName) {
        updateData.lastName = lastName;
        hasChanges = true;
      }
      if (user.languageCode !== languageCode) {
        updateData.languageCode = languageCode;
        hasChanges = true;
      }

      // Update last active time
      updateData.metadata = {
        ...user.metadata,
        lastActiveAt: new Date()
      };
      hasChanges = true;

      if (hasChanges) {
        user = await prisma.user.update({
          where: { telegramId },
          data: updateData
        });
      }
    }

    // Check user permissions
    const isAdminUser = isAdmin(telegramId);
    const isSuperAdminUser = isSuperAdmin(telegramId);

    // Attach user to context
    ctx.user = user;
    ctx.isAdmin = isAdminUser;
    ctx.isSuperAdmin = isSuperAdminUser;

    // Set locale for i18n if available
    if (ctx.i18n && user.languageCode) {
      ctx.i18n.locale = user.languageCode;
    }

    return next();

  } catch (error) {
    console.error('User middleware error:', error);
    
    // Create minimal user context to prevent errors
    ctx.user = {
      id: '',
      telegramId: ctx.from.id,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name,
      languageCode: 'ru',
      balance: 0,
      frozenBalance: 0,
      level: 'bronze',
      role: 'user',
      referrerId: null,
      referralCode: '',
      totalEarned: 0,
      totalSpent: 0,
      tasksCompleted: 0,
      tasksCreated: 0,
      isPremium: false,
      premiumUntil: null,
      settings: {
        notifications: {
          taskCompleted: true,
          taskApproved: true,
          taskRejected: true,
          referralBonus: true,
          levelUp: true,
          systemMessages: true,
          dailySummary: false,
          weeklyReport: false
        },
        privacy: {
          showUsername: true,
          showLevel: true,
          showStats: false,
          allowDirectMessages: true
        },
        language: 'ru',
        theme: 'light'
      },
      metadata: {
        firstTaskCompletedAt: null,
        lastActiveAt: new Date(),
        deviceInfo: {
          platform: 'telegram',
          language: 'ru'
        },
        registrationSource: 'telegram_bot',
        totalLoginDays: 0,
        consecutiveLoginDays: 0,
        averageTasksPerDay: 0,
        preferredTaskTypes: []
      },
      createdAt: new Date(),
      updatedAt: new Date()
    } as any;

    ctx.isAdmin = isAdmin(ctx.from.id);
    ctx.isSuperAdmin = isSuperAdmin(ctx.from.id);

    return next();
  }
};