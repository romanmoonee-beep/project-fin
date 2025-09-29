// apps/bot/src/services/verificationService.ts
import { prisma, TaskType, ExecutionStatus } from '@pr-gram/database';
import { telegramService } from './telegramService';
import { balanceService } from './balanceService';
import { notificationService } from './notificationService';
import { applyMultiplier } from '@pr-gram/shared';

export class VerificationService {
  // Auto verify task execution
  async autoVerifyExecution(executionId: string) {
    const execution = await prisma.taskExecution.findUnique({
      where: { id: executionId },
      include: {
        task: {
          include: { author: true }
        },
        user: true
      }
    });

    if (!execution) {
      throw new Error('Выполнение задания не найдено');
    }

    if (execution.status !== ExecutionStatus.pending) {
      throw new Error('Задание уже обработано');
    }

    let verificationResult;

    switch (execution.task.type) {
      case TaskType.subscribe:
        verificationResult = await this.verifySubscription(execution);
        break;
      case TaskType.join_group:
        verificationResult = await this.verifyGroupMembership(execution);
        break;
      case TaskType.view_post:
        verificationResult = await this.verifyPostView(execution);
        break;
      case TaskType.react_post:
        verificationResult = await this.verifyReaction(execution);
        break;
      case TaskType.use_bot:
      case TaskType.premium_boost:
        // These require manual verification
        return { success: false, reason: 'Требует ручной проверки' };
      default:
        return { success: false, reason: 'Неподдерживаемый тип задания' };
    }

    if (verificationResult.success) {
      await this.approveExecution(executionId, 'Автоматическая проверка');
    } else {
      await this.rejectExecution(executionId, verificationResult.reason || 'Проверка не пройдена');
    }

    return verificationResult;
  }

  // Verify subscription to channel
  async verifySubscription(execution: any) {
    try {
      const { task, user } = execution;
      
      // Extract channel username from task data
      let channelUsername = '';
      
      if (task.targetUrl) {
        channelUsername = telegramService.extractUsernameFromUrl(task.targetUrl);
      } else if (task.conditions?.channelUsername) {
        channelUsername = task.conditions.channelUsername;
      }

      if (!channelUsername) {
        return { success: false, reason: 'Не удалось определить канал для проверки' };
      }

      // Check if user is subscribed
      const isSubscribed = await telegramService.verifyChannelSubscription(
        channelUsername,
        user.telegramId
      );

      return {
        success: isSubscribed,
        reason: isSubscribed ? 'Подписка подтверждена' : 'Подписка не найдена'
      };
    } catch (error) {
      console.error('Verify subscription error:', error);
      return { success: false, reason: 'Ошибка проверки подписки' };
    }
  }

  // Verify group membership
  async verifyGroupMembership(execution: any) {
    try {
      const { task, user } = execution;
      
      let groupId = '';
      
      if (task.targetChatId) {
        groupId = task.targetChatId.toString();
      } else if (task.targetUrl) {
        const username = telegramService.extractUsernameFromUrl(task.targetUrl);
        groupId = username ? `@${username}` : '';
      } else if (task.conditions?.groupId) {
        groupId = task.conditions.groupId;
      }

      if (!groupId) {
        return { success: false, reason: 'Не удалось определить группу для проверки' };
      }

      // Check if user is a member
      const isMember = await telegramService.verifyGroupMembership(
        groupId,
        user.telegramId
      );

      return {
        success: isMember,
        reason: isMember ? 'Участие в группе подтверждено' : 'Участие в группе не найдено'
      };
    } catch (error) {
      console.error('Verify group membership error:', error);
      return { success: false, reason: 'Ошибка проверки участия в группе' };
    }
  }

  // Verify post view
  async verifyPostView(execution: any) {
    try {
      const { task, user } = execution;
      
      // Extract post/channel info
      let postUrl = task.targetUrl;
      let channelUsername = '';
      let messageId = 0;
      
      if (postUrl) {
        const urlMatch = postUrl.match(/t\.me\/([^\/]+)\/(\d+)/);
        if (urlMatch) {
          channelUsername = urlMatch[1];
          messageId = parseInt(urlMatch[2]);
        }
      }

      if (!channelUsername || !messageId) {
        return { success: false, reason: 'Неверная ссылка на пост' };
      }

      // Check if user is subscribed to channel (required to view posts)
      const isSubscribed = await telegramService.verifyChannelSubscription(
        channelUsername,
        user.telegramId
      );

      if (!isSubscribed) {
        return { success: false, reason: 'Необходимо подписаться на канал для просмотра поста' };
      }

      // Check execution time (minimum 30 seconds)
      const minViewTime = 30;
      const executionTime = (Date.now() - execution.createdAt.getTime()) / 1000;
      
      if (executionTime < minViewTime) {
        return { success: false, reason: `Минимальное время просмотра: ${minViewTime} секунд` };
      }

      return { success: true, reason: 'Просмотр поста подтвержден' };
    } catch (error) {
      console.error('Verify post view error:', error);
      return { success: false, reason: 'Ошибка проверки просмотра поста' };
    }
  }

  // Verify reaction to post
  async verifyReaction(execution: any) {
    try {
      const { task, user } = execution;
      
      // Extract post info
      let postUrl = task.targetUrl;
      let channelUsername = '';
      let messageId = 0;
      
      if (postUrl) {
        const urlMatch = postUrl.match(/t\.me\/([^\/]+)\/(\d+)/);
        if (urlMatch) {
          channelUsername = urlMatch[1];
          messageId = parseInt(urlMatch[2]);
        }
      }

      if (!channelUsername || !messageId) {
        return { success: false, reason: 'Неверная ссылка на пост' };
      }

      // Check if user is subscribed to channel
      const isSubscribed = await telegramService.verifyChannelSubscription(
        channelUsername,
        user.telegramId
      );

      if (!isSubscribed) {
        return { success: false, reason: 'Необходимо подписаться на канал' };
      }

      // For reactions we require screenshot proof since we can't reliably track reactions via API
      if (!execution.screenshotUrls || execution.screenshotUrls.length === 0) {
        return { success: false, reason: 'Требуется скриншот реакции на пост' };
      }

      return { success: true, reason: 'Реакция подтверждена скриншотом' };
    } catch (error) {
      console.error('Verify reaction error:', error);
      return { success: false, reason: 'Ошибка проверки реакции' };
    }
  }

  // Approve execution
  async approveExecution(executionId: string, comment?: string, verifiedBy?: number) {
    return await prisma.$transaction(async (tx) => {
      const execution = await tx.taskExecution.findUnique({
        where: { id: executionId },
        include: {
          task: {
            include: { author: true }
          },
          user: true
        }
      });

      if (!execution) {
        throw new Error('Выполнение задания не найдено');
      }

      if (execution.status !== ExecutionStatus.pending) {
        throw new Error('Задание уже обработано');
      }

      // Calculate final reward with user's multiplier
      const baseReward = execution.rewardAmount.toNumber();
      const finalReward = applyMultiplier(baseReward, execution.user.level);

      // Update execution status
      const updatedExecution = await tx.taskExecution.update({
        where: { id: executionId },
        data: {
          status: ExecutionStatus.approved,
          verifiedAt: new Date(),
          verifiedBy,
          adminComment: comment,
          rewardAmount: finalReward
        }
      });

      // Credit reward to user
      await balanceService.updateBalance(
        execution.userId,
        finalReward,
        'earn',
        `Выполнение задания: ${execution.task.title}`,
        { taskId: execution.task.id, executionId }
      );

      // Update task completion count
      await tx.task.update({
        where: { id: execution.task.id },
        data: {
          completedCount: { increment: 1 }
        }
      });

      // Update user stats
      await tx.user.update({
        where: { telegramId: execution.userId },
        data: {
          tasksCompleted: { increment: 1 }
        }
      });

      // Check if task is completed
      const updatedTask = await tx.task.findUnique({
        where: { id: execution.task.id }
      });

      if (updatedTask && updatedTask.completedCount >= updatedTask.targetCount) {
        await tx.task.update({
          where: { id: execution.task.id },
          data: { status: 'completed' }
        });

        // Notify task author
        await notificationService.createNotification(
          execution.task.authorId,
          'task_completed',
          'Задание завершено!',
          `Ваше задание "${execution.task.title}" полностью выполнено`,
          { taskId: execution.task.id }
        );
      }

      // Notify user about approval
      await notificationService.notifyTaskApproved(
        execution.userId,
        execution.task.title,
        finalReward
      );

      // Handle referral bonus if user has referrer
      if (execution.user.referrerId) {
        await balanceService.handleReferralEarningBonus(
          execution.user.referrerId,
          execution.userId,
          finalReward
        );
      }

      return updatedExecution;
    });
  }

  // Reject execution
  async rejectExecution(executionId: string, reason: string, verifiedBy?: number) {
    const execution = await prisma.taskExecution.findUnique({
      where: { id: executionId },
      include: {
        task: true,
        user: true
      }
    });

    if (!execution) {
      throw new Error('Выполнение задания не найдено');
    }

    if (execution.status !== ExecutionStatus.pending) {
      throw new Error('Задание уже обработано');
    }

    // Update execution status
    const updatedExecution = await prisma.taskExecution.update({
      where: { id: executionId },
      data: {
        status: ExecutionStatus.rejected,
        verifiedAt: new Date(),
        verifiedBy,
        adminComment: reason
      }
    });

    // Notify user about rejection
    await notificationService.notifyTaskRejected(
      execution.userId,
      execution.task.title,
      reason
    );

    return updatedExecution;
  }
}

export const verificationService = new VerificationService();