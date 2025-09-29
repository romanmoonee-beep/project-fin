import { prisma, TaskType, UserLevel } from '@pr-gram/database';

export class AnalyticsService {
  // Get platform statistics
  async getPlatformStatistics() {
    const [
      totalUsers,
      activeUsers,
      premiumUsers,
      totalTasks,
      activeTasks,
      completedTasks,
      totalChecks,
      activeChecks,
      totalTransactions,
      platformBalance
    ] = await Promise.all([
      // Users
      prisma.user.count(),
      prisma.user.count({
        where: {
          updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }
      }),
      prisma.user.count({ where: { isPremium: true } }),
      
      // Tasks
      prisma.task.count(),
      prisma.task.count({ where: { status: 'active' } }),
      prisma.task.count({ where: { status: 'completed' } }),
      
      // Checks
      prisma.check.count(),
      prisma.check.count({ where: { isActive: true } }),
      
      // Transactions
      prisma.transaction.count(),
      prisma.transaction.aggregate({
        _sum: { amount: true }
      })
    ]);

    // User level distribution
    const userLevelDistribution = await prisma.user.groupBy({
      by: ['level'],
      _count: { level: true }
    });

    // Task type distribution
    const taskTypeDistribution = await prisma.task.groupBy({
      by: ['type'],
      _count: { type: true },
      _sum: { reward: true }
    });

    // Calculate growth metrics
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const newUsersThisWeek = await prisma.user.count({
      where: { createdAt: { gte: lastWeek } }
    });

    const newTasksThisWeek = await prisma.task.count({
      where: { createdAt: { gte: lastWeek } }
    });

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        premium: premiumUsers,
        newThisWeek: newUsersThisWeek,
        levelDistribution: userLevelDistribution.reduce((acc, item) => {
          acc[item.level] = item._count.level;
          return acc;
        }, {} as Record<string, number>)
      },
      tasks: {
        total: totalTasks,
        active: activeTasks,
        completed: completedTasks,
        newThisWeek: newTasksThisWeek,
        typeDistribution: taskTypeDistribution.reduce((acc, item) => {
          acc[item.type] = {
            count: item._count.type,
            totalReward: item._sum.reward?.toNumber() || 0
          };
          return acc;
        }, {} as Record<string, any>)
      },
      checks: {
        total: totalChecks,
        active: activeChecks,
        inactive: totalChecks - activeChecks
      },
      finance: {
        totalTransactions,
        platformBalance: platformBalance._sum.amount?.toNumber() || 0,
        dailyVolume: await this.getDailyTransactionVolume()
      }
    };
  }

  // Get user analytics
  async getUserAnalytics(userId: number, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      user,
      tasksCompleted,
      tasksCreated,
      totalEarned,
      totalSpent,
      referralStats,
      checkStats,
      dailyActivity
    ] = await Promise.all([
      // User info
      prisma.user.findUnique({
        where: { telegramId: userId }
      }),
      
      // Tasks completed
      prisma.taskExecution.count({
        where: {
          userId,
          status: 'approved',
          createdAt: { gte: startDate }
        }
      }),
      
      // Tasks created
      prisma.task.count({
        where: {
          authorId: userId,
          createdAt: { gte: startDate }
        }
      }),
      
      // Total earned
      prisma.transaction.aggregate({
        where: {
          userId,
          type: { in: ['earn', 'referral', 'bonus'] },
          createdAt: { gte: startDate }
        },
        _sum: { amount: true }
      }),
      
      // Total spent
      prisma.transaction.aggregate({
        where: {
          userId,
          type: 'spend',
          createdAt: { gte: startDate }
        },
        _sum: { amount: true }
      }),
      
      // Referral stats
      this.getReferralAnalytics(userId, days),
      
      // Check stats
      this.getCheckAnalytics(userId, days),
      
      // Daily activity
      this.getDailyActivity(userId, days)
    ]);

    if (!user) {
      throw new Error('Пользователь не найден');
    }

    return {
      user: {
        telegramId: user.telegramId,
        username: user.username,
        level: user.level,
        isPremium: user.isPremium,
        registeredAt: user.createdAt,
        currentBalance: user.balance.toNumber()
      },
      period: {
        days,
        startDate,
        endDate: new Date()
      },
      tasks: {
        completed: tasksCompleted,
        created: tasksCreated,
        completionRate: tasksCreated > 0 ? (tasksCompleted / tasksCreated) * 100 : 0
      },
      finance: {
        earned: totalEarned._sum.amount?.toNumber() || 0,
        spent: Math.abs(totalSpent._sum.amount?.toNumber() || 0),
        netProfit: (totalEarned._sum.amount?.toNumber() || 0) + (totalSpent._sum.amount?.toNumber() || 0),
        dailyAverage: ((totalEarned._sum.amount?.toNumber() || 0) + (totalSpent._sum.amount?.toNumber() || 0)) / days
      },
      referrals: referralStats,
      checks: checkStats,
      activity: dailyActivity
    };
  }

  // Get task analytics
  async getTaskAnalytics(taskId?: string, authorId?: number, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    let baseWhere = {
      createdAt: { gte: startDate }
    };

    if (taskId) {
      baseWhere = { ...baseWhere, id: taskId } as any;
    } else if (authorId) {
      baseWhere = { ...baseWhere, authorId } as any;
    }

    const [
      totalTasks,
      completedTasks,
      activeTasks,
      totalExecutions,
      approvedExecutions,
      rejectedExecutions,
      totalReward
    ] = await Promise.all([
      prisma.task.count({ where: baseWhere }),
      prisma.task.count({ where: { ...baseWhere, status: 'completed' } }),
      prisma.task.count({ where: { ...baseWhere, status: 'active' } }),
      
      prisma.taskExecution.count({
        where: {
          task: baseWhere,
          createdAt: { gte: startDate }
        }
      }),
      
      prisma.taskExecution.count({
        where: {
          task: baseWhere,
          status: 'approved',
          createdAt: { gte: startDate }
        }
      }),
      
      prisma.taskExecution.count({
        where: {
          task: baseWhere,
          status: 'rejected',
          createdAt: { gte: startDate }
        }
      }),
      
      prisma.taskExecution.aggregate({
        where: {
          task: baseWhere,
          status: 'approved',
          createdAt: { gte: startDate }
        },
        _sum: { rewardAmount: true }
      })
    ]);

    // Task type performance
    const typePerformance = await prisma.task.groupBy({
      by: ['type'],
      where: baseWhere,
      _count: { type: true },
      _avg: { completedCount: true, reward: true }
    });

    // Daily completion stats
    const dailyStats = await this.getDailyTaskStats(baseWhere, days);

    return {
      summary: {
        totalTasks,
        completedTasks,
        activeTasks,
        completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0
      },
      executions: {
        total: totalExecutions,
        approved: approvedExecutions,
        rejected: rejectedExecutions,
        pending: totalExecutions - approvedExecutions - rejectedExecutions,
        approvalRate: totalExecutions > 0 ? (approvedExecutions / totalExecutions) * 100 : 0
      },
      finance: {
        totalRewardsPaid: totalReward._sum.rewardAmount?.toNumber() || 0,
        averageReward: approvedExecutions > 0 ? (totalReward._sum.rewardAmount?.toNumber() || 0) / approvedExecutions : 0
      },
      performance: {
        typePerformance: typePerformance.map(item => ({
          type: item.type,
          count: item._count.type,
          avgCompletions: item._avg.completedCount || 0,
          avgReward: item._avg.reward?.toNumber() || 0
        })),
        dailyStats
      }
    };
  }

  // Get referral analytics
  private async getReferralAnalytics(userId: number, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      totalReferrals,
      newReferrals,
      referralEarnings,
      activeReferrals
    ] = await Promise.all([
      prisma.user.count({ where: { referrerId: userId } }),
      prisma.user.count({
        where: {
          referrerId: userId,
          createdAt: { gte: startDate }
        }
      }),
      prisma.transaction.aggregate({
        where: {
          userId,
          type: 'referral',
          createdAt: { gte: startDate }
        },
        _sum: { amount: true }
      }),
      prisma.user.count({
        where: {
          referrerId: userId,
          updatedAt: { gte: startDate }
        }
      })
    ]);

    return {
      total: totalReferrals,
      new: newReferrals,
      active: activeReferrals,
      earnings: referralEarnings._sum.amount?.toNumber() || 0
    };
  }

  // Get check analytics
  private async getCheckAnalytics(userId: number, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      checksCreated,
      checksActivated,
      totalAmount,
      activations
    ] = await Promise.all([
      prisma.check.count({
        where: {
          createdBy: userId,
          createdAt: { gte: startDate }
        }
      }),
      
      prisma.checkActivation.count({
        where: {
          userId,
          activatedAt: { gte: startDate }
        }
      }),
      
      prisma.checkActivation.aggregate({
        where: {
          check: { createdBy: userId },
          activatedAt: { gte: startDate }
        },
        _sum: { amount: true }
      }),
      
      prisma.checkActivation.aggregate({
        where: {
          userId,
          activatedAt: { gte: startDate }
        },
        _sum: { amount: true }
      })
    ]);

    return {
      created: checksCreated,
      activated: checksActivated,
      totalAmountGiven: totalAmount._sum.amount?.toNumber() || 0,
      totalAmountReceived: activations._sum.amount?.toNumber() || 0
    };
  }

  // Get daily activity
  private async getDailyActivity(userId: number, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get all user activities for the period
    const activities = await prisma.userActivity.findMany({
      where: {
        userId,
        createdAt: { gte: startDate }
      },
      select: {
        type: true,
        createdAt: true
      }
    });

    // Group by day
    const dailyStats = {};
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split('T')[0];
      dailyStats[dateKey] = {
        total: 0,
        taskExecutions: 0,
        taskCreations: 0,
        checkActivations: 0,
        other: 0
      };
    }

    activities.forEach(activity => {
      const dateKey = activity.createdAt.toISOString().split('T')[0];
      if (dailyStats[dateKey]) {
        dailyStats[dateKey].total++;
        
        switch (activity.type) {
          case 'task_executed':
            dailyStats[dateKey].taskExecutions++;
            break;
          case 'task_created':
            dailyStats[dateKey].taskCreations++;
            break;
          case 'check_activated':
            dailyStats[dateKey].checkActivations++;
            break;
          default:
            dailyStats[dateKey].other++;
        }
      }
    });

    return Object.entries(dailyStats).map(([date, stats]) => ({
      date,
      ...stats
    })).reverse();
  }

  // Get daily transaction volume
  private async getDailyTransactionVolume() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const volume = await prisma.transaction.aggregate({
      where: {
        createdAt: { gte: today }
      },
      _sum: { amount: true },
      _count: { id: true }
    });

    return {
      amount: Math.abs(volume._sum.amount?.toNumber() || 0),
      count: volume._count.id
    };
  }

  // Get daily task stats
  private async getDailyTaskStats(baseWhere: any, days: number) {
    // This would ideally be implemented with proper SQL grouping
    // For now, we'll return basic stats
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const dailyData = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      const dayStats = await Promise.all([
        prisma.task.count({
          where: {
            ...baseWhere,
            createdAt: { gte: dayStart, lte: dayEnd }
          }
        }),
        prisma.taskExecution.count({
          where: {
            task: baseWhere,
            createdAt: { gte: dayStart, lte: dayEnd }
          }
        })
      ]);

      dailyData.push({
        date: date.toISOString().split('T')[0],
        tasksCreated: dayStats[0],
        executions: dayStats[1]
      });
    }

    return dailyData.reverse();
  }

  // Get top performers
  async getTopPerformers(type: 'earners' | 'creators' | 'referrers', limit = 10, period = 'month') {
    let dateFilter = {};
    
    if (period === 'week') {
      dateFilter = { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
    } else if (period === 'month') {
      dateFilter = { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    }

    switch (type) {
      case 'earners':
        return await this.getTopEarners(limit, dateFilter);
      case 'creators':
        return await this.getTopCreators(limit, dateFilter);
      case 'referrers':
        return await this.getTopReferrers(limit, dateFilter);
      default:
        throw new Error('Invalid performer type');
    }
  }

  // Get top earners
  private async getTopEarners(limit: number, dateFilter: any) {
    const topEarners = await prisma.transaction.groupBy({
      by: ['userId'],
      where: {
        type: { in: ['earn', 'referral', 'bonus'] },
        ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter })
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: limit
    });

    // Get user details
    const userIds = topEarners.map(e => e.userId);
    const users = await prisma.user.findMany({
      where: { telegramId: { in: userIds } },
      select: {
        telegramId: true,
        username: true,
        firstName: true,
        level: true
      }
    });

    return topEarners.map(earner => {
      const user = users.find(u => u.telegramId === earner.userId);
      return {
        user,
        totalEarned: earner._sum.amount?.toNumber() || 0
      };
    });
  }

  // Get top creators
  private async getTopCreators(limit: number, dateFilter: any) {
    const topCreators = await prisma.task.groupBy({
      by: ['authorId'],
      where: {
        ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter })
      },
      _count: { id: true },
      _sum: { reward: true },
      orderBy: { _count: { id: 'desc' } },
      take: limit
    });

    // Get user details
    const userIds = topCreators.map(c => c.authorId);
    const users = await prisma.user.findMany({
      where: { telegramId: { in: userIds } },
      select: {
        telegramId: true,
        username: true,
        firstName: true,
        level: true
      }
    });

    return topCreators.map(creator => {
      const user = users.find(u => u.telegramId === creator.authorId);
      return {
        user,
        tasksCreated: creator._count.id,
        totalReward: creator._sum.reward?.toNumber() || 0
      };
    });
  }

  // Get top referrers
  private async getTopReferrers(limit: number, dateFilter: any) {
    const topReferrers = await prisma.user.findMany({
      where: {
        referrals: {
          some: {
            ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter })
          }
        }
      },
      select: {
        telegramId: true,
        username: true,
        firstName: true,
        level: true,
        _count: {
          select: {
            referrals: {
              where: {
                ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter })
              }
            }
          }
        }
      },
      orderBy: {
        referrals: { _count: 'desc' }
      },
      take: limit
    });

    return topReferrers.map(referrer => ({
      user: {
        telegramId: referrer.telegramId,
        username: referrer.username,
        firstName: referrer.firstName,
        level: referrer.level
      },
      referralCount: referrer._count.referrals
    }));
  }

  // Export analytics data
  async exportAnalyticsData(userId: number, format: 'json' | 'csv' = 'json') {
    const analytics = await this.getUserAnalytics(userId, 90); // 3 months

    if (format === 'json') {
      return JSON.stringify(analytics, null, 2);
    }

    // Convert to CSV format for basic data
    const csvData = [
      ['Date', 'Tasks Completed', 'Tasks Created', 'Earned', 'Spent'],
      ...analytics.activity.map(day => [
        day.date,
        day.taskExecutions,
        day.taskCreations,
        0, // Would need to calculate daily earnings
        0  // Would need to calculate daily spending
      ])
    ];

    return csvData.map(row => row.join(',')).join('\n');
  }

  // Real-time statistics
  async getRealTimeStats() {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const [
      activeUsers,
      newTasks,
      completedExecutions,
      newUsers,
      transactionVolume
    ] = await Promise.all([
      prisma.user.count({
        where: { updatedAt: { gte: hourAgo } }
      }),
      
      prisma.task.count({
        where: { createdAt: { gte: hourAgo } }
      }),
      
      prisma.taskExecution.count({
        where: {
          status: 'approved',
          verifiedAt: { gte: hourAgo }
        }
      }),
      
      prisma.user.count({
        where: { createdAt: { gte: hourAgo } }
      }),
      
      prisma.transaction.aggregate({
        where: { createdAt: { gte: hourAgo } },
        _sum: { amount: true }
      })
    ]);

    return {
      timestamp: now,
      lastHour: {
        activeUsers,
        newTasks,
        completedExecutions,
        newUsers,
        transactionVolume: Math.abs(transactionVolume._sum.amount?.toNumber() || 0)
      }
    };
  }
}

export const analyticsService = new AnalyticsService();