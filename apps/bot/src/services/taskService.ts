import { prisma, TaskStatus, ExecutionStatus, TaskType } from '@pr-gram/database';
import { applyMultiplier, calculateTaskCost } from '@pr-gram/shared';
import { telegramService } from './telegramService';
import { notificationService } from './notificationService';
import { balanceService } from './balanceService';
import type { BotContext } from '../types/context';

export class TaskService {
  // Get available tasks for user
  async getAvailableTasks(
    userId: number,
    userLevel: string,
    type?: TaskType,
    page = 1,
    limit = 20
  ) {
    const skip = (page - 1) * limit;
    
    const where = {
      status: TaskStatus.active,
      minUserLevel: this.getLevelFilter(userLevel),
      expiresAt: {
        OR: [
          { equals: null },
          { gt: new Date() }
        ]
      },
      // Exclude tasks from the same user
      NOT: {
        authorId: userId
      },
      // Exclude already completed tasks
      executions: {
        none: {
          userId,
          status: {
            in: [ExecutionStatus.approved, ExecutionStatus.pending]
          }
        }
      },
      ...(type && { type })
    };

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          author: {
            select: {
              username: true,
              level: true
            }
          },
          executions: {
            where: { userId },
            select: { status: true }
          }
        },
        orderBy: [
          { isBoosted: 'desc' },
          { priority: 'desc' },
          { createdAt: 'desc' }
        ],
        skip,
        take: limit,
      }),
      prisma.task.count({ where })
    ]);

    return {
      tasks: tasks.map(task => ({
        ...task,
        canExecute: true,
        rewardWithMultiplier: applyMultiplier(task.reward.toNumber(), userLevel)
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1
    };
  }

  // Get task details
  async getTaskDetails(taskId: string, userId?: number) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        author: {
          select: {
            telegramId: true,
            username: true,
            level: true
          }
        },
        executions: userId ? {
          where: { userId },
          select: {
            id: true,
            status: true,
            createdAt: true,
            verifiedAt: true,
            adminComment: true
          }
        } : undefined
      }
    });

    if (!task) {
      throw new Error('Задание не найдено');
    }

    if (task.status !== TaskStatus.active) {
      throw new Error('Задание неактивно');
    }

    if (task.expiresAt && task.expiresAt < new Date()) {
      throw new Error('Срок выполнения задания истек');
    }

    return task;
  }

  // Create new task
  async createTask(
    authorId: number,
    taskData: {
      type: TaskType;
      title: string;
      description: string;
      reward: number;
      targetCount: number;
      targetUrl?: string;
      targetChatId?: number;
      conditions?: Record<string, any>;
      verificationType?: string;
      minUserLevel?: string;
      autoApproveHours?: number;
      expiresAt?: Date;
      boostConfig?: Record<string, any>;
    }
  ) {
    const author = await prisma.user.findUnique({
      where: { telegramId: authorId }
    });

    if (!author) {
      throw new Error('Пользователь не найден');
    }

    // Calculate total cost
    const commissionRate = this.getCommissionRate(author.level);
    const totalCost = calculateTaskCost(taskData.reward, taskData.targetCount, commissionRate);

    if (author.balance.toNumber() < totalCost) {
      throw new Error('Недостаточно средств на балансе');
    }

    // Check daily task limit
    await this.checkDailyTaskLimit(authorId, author.level);

    // Create task
    const task = await prisma.task.create({
      data: {
        ...taskData,
        authorId,
        verificationType: taskData.verificationType || 'auto',
        minUserLevel: taskData.minUserLevel || 'bronze',
        autoApproveHours: taskData.autoApproveHours || 24,
        conditions: taskData.conditions || {},
        boostConfig: taskData.boostConfig || {},
        geographicalRestrictions: {},
      }
    });

    // Deduct cost from balance
    await balanceService.updateBalance(
      authorId,
      -totalCost,
      'spend',
      `Создание задания: ${task.title}`,
      { taskId: task.id, commission: totalCost - (taskData.reward * taskData.targetCount) }
    );

    // Update user stats
    await prisma.user.update({
      where: { telegramId: authorId },
      data: {
        tasksCreated: { increment: 1 }
      }
    });

    return task;
  }

  // Execute task
  async executeTask(
    userId: number,
    taskId: string,
    proofData?: {
      screenshotUrls?: string[];
      description?: string;
      metadata?: Record<string, any>;
    }
  ) {
    const task = await this.getTaskDetails(taskId, userId);
    
    if (task.executions && task.executions.length > 0) {
      throw new Error('Задание уже выполнено');
    }

    // Check if task is full
    if (task.completedCount >= task.targetCount) {
      throw new Error('Задание уже полностью выполнено');
    }

    // Check user level requirement
    const user = await prisma.user.findUnique({
      where: { telegramId: userId }
    });

    if (!user || !this.canUserExecuteTask(user.level, task.minUserLevel)) {
      throw new Error('Недостаточный уровень для выполнения задания');
    }

    // Create execution record
    const execution = await prisma.taskExecution.create({
      data: {
        taskId,
        userId,
        status: task.verificationType === 'auto' ? ExecutionStatus.pending : ExecutionStatus.pending,
        screenshotUrls: proofData?.screenshotUrls || [],
        proofData: proofData || {},
        rewardAmount: task.reward
      }
    });

    // Auto-verify for simple tasks
    if (task.verificationType === 'auto' && this.canAutoVerify(task.type)) {
      return await this.autoVerifyTask(execution.id, task);
    }

    // Schedule auto-approval
    await this.scheduleAutoApproval(execution.id, task.autoApproveHours);

    return execution;
  }

  // Auto-verify task execution
  async autoVerifyTask(executionId: string, task: any) {
    try {
      // Perform automatic verification based on task type
      const verificationResult = await this.performVerification(task, executionId);
      
      if (verificationResult.success) {
        return await this.approveExecution(executionId, 'System auto-verification');
      } else {
        return await this.rejectExecution(executionId, verificationResult.reason);
      }
    } catch (error) {
      console.error('Auto verification error:', error);
      // Keep as pending for manual review
      return await prisma.taskExecution.findUnique({
        where: { id: executionId }
      });
    }
  }

  // Perform verification based on task type
  async performVerification(task: any, executionId: string) {
    const execution = await prisma.taskExecution.findUnique({
      where: { id: executionId },
      include: { user: true }
    });

    if (!execution) {
      return { success: false, reason: 'Выполнение не найдено' };
    }

    switch (task.type) {
      case TaskType.subscribe:
        return await this.verifySubscription(execution.user.telegramId, task);
      
      case TaskType.join_group:
        return await this.verifyGroupMembership(execution.user.telegramId, task);
      
      case TaskType.view_post:
        return await this.verifyPostView(execution.user.telegramId, task);
      
      case TaskType.react_post:
        return await this.verifyReaction(execution.user.telegramId, task);
      
      default:
        return { success: false, reason: 'Тип задания не поддерживает автопроверку' };
    }
  }

  // Verify subscription
  async verifySubscription(userId: number, task: any) {
    try {
      const targetUsername = task.conditions?.channelUsername || 
                           task.targetUrl?.split('/').pop()?.replace('@', '');
      
      if (!targetUsername) {
        return { success: false, reason: 'Неверная ссылка на канал' };
      }

      const isMember = await telegramService.checkChatMember(targetUsername, userId);
      
      return {
        success: isMember,
        reason: isMember ? 'Подписка подтверждена' : 'Подписка не найдена'
      };
    } catch (error) {
      console.error('Subscription verification error:', error);
      return { success: false, reason: 'Ошибка проверки подписки' };
    }
  }

  // Verify group membership
  async verifyGroupMembership(userId: number, task: any) {
    try {
      const targetGroup = task.conditions?.groupId || 
                         task.conditions?.groupUsername ||
                         task.targetChatId;
      
      if (!targetGroup) {
        return { success: false, reason: 'Неверная ссылка на группу' };
      }

      const isMember = await telegramService.checkChatMember(targetGroup, userId);
      
      return {
        success: isMember,
        reason: isMember ? 'Участие в группе подтверждено' : 'Участие в группе не найдено'
      };
    } catch (error) {
      console.error('Group membership verification error:', error);
      return { success: false, reason: 'Ошибка проверки участия в группе' };
    }
  }

  // Verify post view (simplified - in real app would need more sophisticated tracking)
  async verifyPostView(userId: number, task: any) {
    // For demo purposes, always return success after delay
    // In real implementation, would track post views through analytics
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return { success: true, reason: 'Просмотр поста подтвержден' };
  }

  // Verify reaction
  async verifyReaction(userId: number, task: any) {
    try {
      // This would require special bot permissions and message tracking
      // For demo purposes, simplified verification
      return { success: true, reason: 'Реакция подтверждена' };
    } catch (error) {
      console.error('Reaction verification error:', error);
      return { success: false, reason: 'Ошибка проверки реакции' };
    }
  }

  // Approve task execution
  async approveExecution(executionId: string, comment?: string, verifiedBy?: number) {
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

    // Calculate reward with user's multiplier
    const finalReward = applyMultiplier(
      execution.rewardAmount.toNumber(),
      execution.user.level
    );

    // Update execution status
    const updatedExecution = await prisma.taskExecution.update({
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
    await prisma.task.update({
      where: { id: execution.task.id },
      data: {
        completedCount: { increment: 1 }
      }
    });

    // Update user stats
    await prisma.user.update({
      where: { telegramId: execution.userId },
      data: {
        tasksCompleted: { increment: 1 }
      }
    });

    // Check if task is completed
    const updatedTask = await prisma.task.findUnique({
      where: { id: execution.task.id }
    });

    if (updatedTask && updatedTask.completedCount >= updatedTask.targetCount) {
      await prisma.task.update({
        where: { id: execution.task.id },
        data: { status: TaskStatus.completed }
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
    await notificationService.createNotification(
      execution.userId,
      'task_approved',
      'Задание одобрено!',
      `Ваше выполнение задания "${execution.task.title}" одобрено. Получено: ${finalReward} GRAM`,
      { taskId: execution.task.id, executionId, amount: finalReward }
    );

    return updatedExecution;
  }

  // Reject task execution
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
    await notificationService.createNotification(
      execution.userId,
      'task_rejected',
      'Задание отклонено',
      `Ваше выполнение задания "${execution.task.title}" отклонено. Причина: ${reason}`,
      { 
        taskId: execution.task.id, 
        executionId, 
        reason,
        canAppeal: true // User can create appeal
      }
    );

    return updatedExecution;
  }

  // Create appeal for rejected task
  async createAppeal(
    executionId: string,
    userId: number,
    appealText: string,
    additionalProof?: string[]
  ) {
    const execution = await prisma.taskExecution.findUnique({
      where: { id: executionId },
      include: { task: true, user: true }
    });

    if (!execution) {
      throw new Error('Выполнение задания не найдено');
    }

    if (execution.userId !== userId) {
      throw new Error('Нет прав на создание апелляции');
    }

    if (execution.status !== ExecutionStatus.rejected) {
      throw new Error('Апелляция возможна только для отклоненных заданий');
    }

    // Check if appeal already exists
    const existingAppeal = await prisma.userActivity.findFirst({
      where: {
        userId,
        type: 'appeal_created',
        metadata: {
          path: ['executionId'],
          equals: executionId
        }
      }
    });

    if (existingAppeal) {
      throw new Error('Апелляция уже подана для этого задания');
    }

    // Create appeal record
    const appeal = await prisma.userActivity.create({
      data: {
        userId,
        type: 'appeal_created',
        description: `Апелляция на отклонение задания: ${execution.task.title}`,
        metadata: {
          executionId,
          taskId: execution.task.id,
          appealText,
          additionalProof: additionalProof || [],
          originalRejectionReason: execution.adminComment,
          createdAt: new Date().toISOString()
        }
      }
    });

    // Notify admins about new appeal
    await notificationService.notifyAdmins(
      'Новая апелляция',
      `Пользователь ${execution.user.username || execution.user.firstName} подал апелляцию на отклонение задания "${execution.task.title}"`,
      {
        type: 'appeal',
        executionId,
        taskId: execution.task.id,
        userId,
        appealId: appeal.id
      }
    );

    return appeal;
  }

  // Schedule auto-approval
  async scheduleAutoApproval(executionId: string, hours: number) {
    // This would integrate with a job queue (Bull, Agenda, etc.)
    // For now, we'll use a simple setTimeout (not recommended for production)
    
    setTimeout(async () => {
      try {
        const execution = await prisma.taskExecution.findUnique({
          where: { id: executionId },
          include: { task: true }
        });

        if (execution && execution.status === ExecutionStatus.pending) {
          await this.approveExecution(
            executionId,
            'Автоматическое одобрение по истечении времени',
            undefined
          );
        }
      } catch (error) {
        console.error('Auto-approval error:', error);
      }
    }, hours * 60 * 60 * 1000); // Convert hours to milliseconds
  }

  // Helper methods
  private getLevelFilter(userLevel: string) {
    const levelOrder = ['bronze', 'silver', 'gold', 'premium'];
    const userLevelIndex = levelOrder.indexOf(userLevel);
    
    return {
      in: levelOrder.slice(0, userLevelIndex + 1)
    };
  }

  private getCommissionRate(userLevel: string): number {
    const rates = {
      bronze: 7,
      silver: 6,
      gold: 5,
      premium: 3
    };
    return rates[userLevel as keyof typeof rates] || 7;
  }

  private canUserExecuteTask(userLevel: string, taskMinLevel: string): boolean {
    const levels = ['bronze', 'silver', 'gold', 'premium'];
    const userIndex = levels.indexOf(userLevel);
    const minIndex = levels.indexOf(taskMinLevel);
    return userIndex >= minIndex;
  }

  private canAutoVerify(taskType: TaskType): boolean {
    return [
      TaskType.subscribe,
      TaskType.join_group,
      TaskType.view_post,
      TaskType.react_post
    ].includes(taskType);
  }

  private async checkDailyTaskLimit(userId: number, userLevel: string) {
    const limits = {
      bronze: 5,
      silver: 15,
      gold: 30,
      premium: -1 // unlimited
    };

    const dailyLimit = limits[userLevel as keyof typeof limits] || 5;
    
    if (dailyLimit === -1) return; // Unlimited for premium

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tasksCreatedToday = await prisma.task.count({
      where: {
        authorId: userId,
        createdAt: {
          gte: today
        }
      }
    });

    if (tasksCreatedToday >= dailyLimit) {
      throw new Error(`Превышен дневной лимит создания заданий (${dailyLimit})`);
    }
  }

  // Get user's tasks
  async getUserTasks(userId: number, status?: TaskStatus, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    
    const where = {
      authorId: userId,
      ...(status && { status })
    };

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          executions: {
            select: {
              id: true,
              status: true,
              user: {
                select: {
                  username: true,
                  firstName: true
                }
              },
              createdAt: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.task.count({ where })
    ]);

    return {
      tasks,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1
    };
  }

  // Get task executions for moderation
  async getTaskExecutions(
    taskId: string,
    status?: ExecutionStatus,
    page = 1,
    limit = 20
  ) {
    const skip = (page - 1) * limit;
    
    const where = {
      taskId,
      ...(status && { status })
    };

    const [executions, total] = await Promise.all([
      prisma.taskExecution.findMany({
        where,
        include: {
          user: {
            select: {
              telegramId: true,
              username: true,
              firstName: true,
              level: true
            }
          },
          task: {
            select: {
              title: true,
              type: true,
              reward: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.taskExecution.count({ where })
    ]);

    return {
      executions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1
    };
  }

  // Get pending executions for author moderation
  async getPendingExecutions(authorId: number, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    
    const where = {
      status: ExecutionStatus.pending,
      task: {
        authorId,
        verificationType: 'manual'
      }
    };

    const [executions, total] = await Promise.all([
      prisma.taskExecution.findMany({
        where,
        include: {
          user: {
            select: {
              telegramId: true,
              username: true,
              firstName: true,
              level: true
            }
          },
          task: {
            select: {
              id: true,
              title: true,
              type: true,
              reward: true,
              conditions: true
            }
          }
        },
        orderBy: { createdAt: 'asc' }, // Oldest first
        skip,
        take: limit
      }),
      prisma.taskExecution.count({ where })
    ]);

    return {
      executions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1
    };
  }

  // Update task status
  async updateTaskStatus(taskId: string, status: TaskStatus, authorId?: number) {
    const task = await prisma.task.findUnique({
      where: { id: taskId }
    });

    if (!task) {
      throw new Error('Задание не найдено');
    }

    if (authorId && task.authorId !== authorId) {
      throw new Error('Нет прав на изменение задания');
    }

    return await prisma.task.update({
      where: { id: taskId },
      data: { status }
    });
  }

  // Cancel task
  async cancelTask(taskId: string, authorId: number, reason?: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        executions: {
          where: {
            status: ExecutionStatus.pending
          }
        }
      }
    });

    if (!task) {
      throw new Error('Задание не найдено');
    }

    if (task.authorId !== authorId) {
      throw new Error('Нет прав на отмену задания');
    }

    if (task.status === TaskStatus.completed) {
      throw new Error('Нельзя отменить завершенное задание');
    }

    // Reject all pending executions
    if (task.executions.length > 0) {
      await prisma.taskExecution.updateMany({
        where: {
          taskId,
          status: ExecutionStatus.pending
        },
        data: {
          status: ExecutionStatus.rejected,
          adminComment: reason || 'Задание отменено автором',
          verifiedAt: new Date()
        }
      });

      // Notify users about rejection
      for (const execution of task.executions) {
        await notificationService.createNotification(
          execution.userId,
          'task_rejected',
          'Задание отменено',
          `Задание "${task.title}" было отменено автором`,
          { taskId, reason: reason || 'Задание отменено автором' }
        );
      }
    }

    // Calculate refund amount (90% of remaining budget)
    const spentAmount = task.completedCount * task.reward.toNumber();
    const remainingBudget = (task.targetCount * task.reward.toNumber()) - spentAmount;
    const refundAmount = Math.floor(remainingBudget * 0.9);

    // Update task status
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.cancelled,
        metadata: {
          path: ['cancellation'],
          set: {
            reason,
            cancelledAt: new Date().toISOString(),
            refundAmount
          }
        }
      }
    });

    // Refund remaining balance
    if (refundAmount > 0) {
      await balanceService.updateBalance(
        authorId,
        refundAmount,
        'refund',
        `Возврат за отмену задания: ${task.title}`,
        { taskId, originalAmount: remainingBudget, fee: remainingBudget - refundAmount }
      );
    }

    return updatedTask;
  }

  // Get task statistics
  async getTaskStatistics(taskId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        executions: {
          select: {
            status: true,
            createdAt: true,
            verifiedAt: true
          }
        }
      }
    });

    if (!task) {
      throw new Error('Задание не найдено');
    }

    const totalExecutions = task.executions.length;
    const approvedExecutions = task.executions.filter(e => e.status === ExecutionStatus.approved).length;
    const rejectedExecutions = task.executions.filter(e => e.status === ExecutionStatus.rejected).length;
    const pendingExecutions = task.executions.filter(e => e.status === ExecutionStatus.pending).length;

    const approvalRate = totalExecutions > 0 ? (approvedExecutions / totalExecutions) * 100 : 0;
    const completionRate = (task.completedCount / task.targetCount) * 100;

    // Calculate average completion time
    const completedExecutions = task.executions.filter(e => e.status === ExecutionStatus.approved && e.verifiedAt);
    const avgCompletionTime = completedExecutions.length > 0 
      ? completedExecutions.reduce((sum, e) => {
          const timeDiff = e.verifiedAt!.getTime() - e.createdAt.getTime();
          return sum + timeDiff;
        }, 0) / completedExecutions.length
      : 0;

    return {
      totalExecutions,
      approvedExecutions,
      rejectedExecutions,
      pendingExecutions,
      approvalRate: Math.round(approvalRate * 100) / 100,
      completionRate: Math.round(completionRate * 100) / 100,
      averageCompletionTimeMs: Math.round(avgCompletionTime),
      spentAmount: task.completedCount * task.reward.toNumber(),
      remainingBudget: (task.targetCount - task.completedCount) * task.reward.toNumber(),
      estimatedCompletion: this.estimateCompletionDate(task)
    };
  }

  private estimateCompletionDate(task: any): Date | null {
    if (task.completedCount >= task.targetCount) {
      return null; // Already completed
    }

    // Simple estimation based on current completion rate
    const daysSinceCreation = (Date.now() - task.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const completionRate = task.completedCount / Math.max(daysSinceCreation, 1);
    const remainingTasks = task.targetCount - task.completedCount;
    const estimatedDaysToComplete = remainingTasks / Math.max(completionRate, 0.1);

    const estimatedDate = new Date();
    estimatedDate.setDate(estimatedDate.getDate() + Math.ceil(estimatedDaysToComplete));

    return estimatedDate;
  }
}

export const taskService = new TaskService();