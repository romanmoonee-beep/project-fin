import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@pr-gram/database';
import { TaskType, TaskStatus, ExecutionStatus, VerificationType } from '@pr-gram/shared';

interface TasksQuerystring {
  page?: number;
  limit?: number;
  search?: string;
  type?: TaskType;
  status?: TaskStatus;
  authorId?: string;
  minReward?: number;
  maxReward?: number;
  sortBy?: 'createdAt' | 'reward' | 'completedCount' | 'targetCount';
  sortOrder?: 'asc' | 'desc';
  createdAfter?: string;
  createdBefore?: string;
}

interface TaskParams {
  id: string;
}

interface UpdateTaskBody {
  title?: string;
  description?: string;
  reward?: number;
  targetCount?: number;
  status?: TaskStatus;
  autoApproveHours?: number;
}

interface ModerateExecutionBody {
  action: 'approve' | 'reject';
  comment?: string;
  rewardAmount?: number;
}

export default async function tasksRoutes(fastify: FastifyInstance) {

  // GET /tasks - Список заданий с фильтрами
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Tasks'],
      summary: 'Get tasks list with filters and pagination',
      security: [{ JWT: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          search: { type: 'string', description: 'Search by title or description' },
          type: { type: 'string', enum: Object.values(TaskType) },
          status: { type: 'string', enum: Object.values(TaskStatus) },
          authorId: { type: 'string' },
          minReward: { type: 'number', minimum: 0 },
          maxReward: { type: 'number', minimum: 0 },
          sortBy: { type: 'string', enum: ['createdAt', 'reward', 'completedCount', 'targetCount'], default: 'createdAt' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          createdAfter: { type: 'string', format: 'date' },
          createdBefore: { type: 'string', format: 'date' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: TasksQuerystring }>, reply: FastifyReply) => {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        type,
        status,
        authorId,
        minReward,
        maxReward,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        createdAfter,
        createdBefore
      } = request.query;

      const offset = (page - 1) * limit;

      // Строим условия фильтрации
      const where: any = {};

      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (type) where.type = type;
      if (status) where.status = status;
      if (authorId) where.authorId = BigInt(authorId);
      
      if (minReward !== undefined || maxReward !== undefined) {
        where.reward = {};
        if (minReward !== undefined) where.reward.gte = minReward;
        if (maxReward !== undefined) where.reward.lte = maxReward;
      }

      if (createdAfter || createdBefore) {
        where.createdAt = {};
        if (createdAfter) where.createdAt.gte = new Date(createdAfter);
        if (createdBefore) where.createdAt.lte = new Date(createdBefore);
      }

      // Параллельные запросы
      const [tasks, totalCount, quickStats] = await Promise.all([
        prisma.task.findMany({
          where,
          skip: offset,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            author: {
              select: {
                telegramId: true,
                username: true,
                level: true
              }
            },
            _count: {
              select: {
                executions: true
              }
            }
          }
        }),
        prisma.task.count({ where }),
        prisma.task.groupBy({
          by: ['status'],
          _count: { status: true },
          where: status ? { status } : undefined
        })
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      // Группируем статистику
      const statusStats = quickStats.reduce((acc, item) => {
        acc[item.status] = item._count.status;
        return acc;
      }, {} as Record<TaskStatus, number>);

      return {
        success: true,
        data: {
          tasks: tasks.map(task => ({
            ...task,
            authorId: Number(task.authorId),
            reward: Number(task.reward),
            author: task.author ? {
              ...task.author,
              telegramId: Number(task.author.telegramId)
            } : null,
            executionsCount: task._count.executions
          })),
          pagination: {
            page,
            limit,
            total: totalCount,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          },
          stats: {
            total: totalCount,
            byStatus: statusStats
          }
        }
      };

    } catch (error) {
      fastify.log.error('Get tasks error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch tasks'
      });
    }
  });

  // GET /tasks/pending - Задания ожидающие модерации
  fastify.get('/pending', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Tasks'],
      summary: 'Get tasks pending moderation',
      security: [{ JWT: [] }],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          sortBy: { type: 'string', enum: ['createdAt', 'reward'], default: 'createdAt' }
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Querystring: { limit?: number; sortBy?: 'createdAt' | 'reward' } 
  }>, reply: FastifyReply) => {
    try {
      const { limit = 20, sortBy = 'createdAt' } = request.query;

      const pendingExecutions = await prisma.taskExecution.findMany({
        where: { status: ExecutionStatus.PENDING },
        include: {
          task: {
            include: {
              author: {
                select: {
                  telegramId: true,
                  username: true,
                  level: true
                }
              }
            }
          },
          user: {
            select: {
              telegramId: true,
              username: true,
              level: true
            }
          }
        },
        orderBy: { createdAt: sortBy === 'createdAt' ? 'asc' : undefined },
        take: limit
      });

      return {
        success: true,
        data: {
          pendingExecutions: pendingExecutions.map(execution => ({
            ...execution,
            userId: Number(execution.userId),
            rewardAmount: Number(execution.rewardAmount),
            user: {
              ...execution.user,
              telegramId: Number(execution.user.telegramId)
            },
            task: {
              ...execution.task,
              authorId: Number(execution.task.authorId),
              reward: Number(execution.task.reward),
              author: execution.task.author ? {
                ...execution.task.author,
                telegramId: Number(execution.task.author.telegramId)
              } : null
            }
          })),
          total: pendingExecutions.length,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      fastify.log.error('Get pending tasks error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch pending tasks'
      });
    }
  });

  // GET /tasks/:id - Детали задания
  fastify.get<{ Params: TaskParams }>('/:id', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Tasks'],
      summary: 'Get task details by ID',
      security: [{ JWT: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest<{ Params: TaskParams }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;

      const task = await prisma.task.findUnique({
        where: { id },
        include: {
          author: {
            select: {
              telegramId: true,
              username: true,
              firstName: true,
              level: true,
              role: true
            }
          },
          executions: {
            include: {
              user: {
                select: {
                  telegramId: true,
                  username: true,
                  level: true
                }
              }
            },
            orderBy: { createdAt: 'desc' },
            take: 20
          },
          _count: {
            select: {
              executions: true
            }
          }
        }
      });

      if (!task) {
        return reply.status(404).send({
          success: false,
          error: 'Task not found'
        });
      }

      // Статистика по выполнениям
      const executionStats = await prisma.taskExecution.groupBy({
        by: ['status'],
        where: { taskId: id },
        _count: { status: true }
      });

      const statsMap = executionStats.reduce((acc, item) => {
        acc[item.status] = item._count.status;
        return acc;
      }, {} as Record<ExecutionStatus, number>);

      return {
        success: true,
        data: {
          task: {
            ...task,
            authorId: Number(task.authorId),
            reward: Number(task.reward),
            author: task.author ? {
              ...task.author,
              telegramId: Number(task.author.telegramId)
            } : null,
            executions: task.executions.map(exec => ({
              ...exec,
              userId: Number(exec.userId),
              rewardAmount: Number(exec.rewardAmount),
              user: {
                ...exec.user,
                telegramId: Number(exec.user.telegramId)
              }
            })),
            totalExecutions: task._count.executions
          },
          executionStats: {
            pending: statsMap[ExecutionStatus.PENDING] || 0,
            approved: statsMap[ExecutionStatus.APPROVED] || 0,
            rejected: statsMap[ExecutionStatus.REJECTED] || 0,
            expired: statsMap[ExecutionStatus.EXPIRED] || 0
          }
        }
      };

    } catch (error) {
      fastify.log.error('Get task details error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch task details'
      });
    }
  });

  // PUT /tasks/:id - Редактирование задания
  fastify.put<{ Params: TaskParams; Body: UpdateTaskBody }>('/:id', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Tasks'],
      summary: 'Update task information',
      security: [{ JWT: [] }],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 3, maxLength: 255 },
          description: { type: 'string', minLength: 10, maxLength: 1000 },
          reward: { type: 'number', minimum: 10, maximum: 10000 },
          targetCount: { type: 'number', minimum: 1, maximum: 10000 },
          status: { type: 'string', enum: Object.values(TaskStatus) },
          autoApproveHours: { type: 'number', minimum: 1, maximum: 168 }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: TaskParams; Body: UpdateTaskBody }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const updateData = request.body;
      const adminUser = (request as any).user;

      const task = await prisma.task.findUnique({
        where: { id }
      });

      if (!task) {
        return reply.status(404).send({
          success: false,
          error: 'Task not found'
        });
      }

      const updatedTask = await prisma.task.update({
        where: { id },
        data: updateData,
        include: {
          author: {
            select: {
              telegramId: true,
              username: true,
              level: true
            }
          }
        }
      });

      // Логируем изменения
      await prisma.userActivity.create({
        data: {
          userId: BigInt(adminUser.userId),
          type: 'admin_action',
          description: `Updated task ${task.title}`,
          metadata: {
            taskId: id,
            changes: updateData,
            previousData: {
              title: task.title,
              status: task.status,
              reward: Number(task.reward)
            }
          }
        }
      });

      // Публикуем событие обновления
      await fastify.eventBus.publish('task:updated', {
        taskId: id,
        changes: updateData
      });

      return {
        success: true,
        data: {
          task: {
            ...updatedTask,
            authorId: Number(updatedTask.authorId),
            reward: Number(updatedTask.reward),
            author: updatedTask.author ? {
              ...updatedTask.author,
              telegramId: Number(updatedTask.author.telegramId)
            } : null
          }
        },
        message: 'Task updated successfully'
      };

    } catch (error) {
      fastify.log.error('Update task error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to update task'
      });
    }
  });

  // POST /tasks/executions/:executionId/moderate - Модерация выполнения
  fastify.post<{ Params: { executionId: string }; Body: ModerateExecutionBody }>('/executions/:executionId/moderate', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Tasks'],
      summary: 'Moderate task execution',
      security: [{ JWT: [] }],
      params: {
        type: 'object',
        properties: { executionId: { type: 'string' } },
        required: ['executionId']
      },
      body: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['approve', 'reject'] },
          comment: { type: 'string', maxLength: 500 },
          rewardAmount: { type: 'number', minimum: 0 }
        },
        required: ['action']
      }
    }
  }, async (request: FastifyRequest<{ Params: { executionId: string }; Body: ModerateExecutionBody }>, reply: FastifyReply) => {
    try {
      const { executionId } = request.params;
      const { action, comment, rewardAmount } = request.body;
      const adminUser = (request as any).user;

      const execution = await prisma.taskExecution.findUnique({
        where: { id: executionId },
        include: {
          task: {
            include: {
              author: {
                select: {
                  telegramId: true,
                  username: true
                }
              }
            }
          },
          user: {
            select: {
              telegramId: true,
              username: true,
              balance: true
            }
          }
        }
      });

      if (!execution) {
        return reply.status(404).send({
          success: false,
          error: 'Task execution not found'
        });
      }

      if (execution.status !== ExecutionStatus.PENDING) {
        return reply.status(400).send({
          success: false,
          error: 'Task execution already moderated'
        });
      }

      // Выполняем модерацию в транзакции
      const result = await prisma.$transaction(async (tx) => {
        const finalReward = rewardAmount !== undefined ? rewardAmount : Number(execution.rewardAmount);
        
        if (action === 'approve') {
          // Одобряем выполнение
          const updatedExecution = await tx.taskExecution.update({
            where: { id: executionId },
            data: {
              status: ExecutionStatus.APPROVED,
              verifiedAt: new Date(),
              verifiedBy: BigInt(adminUser.userId),
              adminComment: comment,
              rewardAmount: finalReward
            }
          });

          // Начисляем награду пользователю
          await tx.user.update({
            where: { telegramId: execution.userId },
            data: {
              balance: { increment: finalReward },
              totalEarned: { increment: finalReward },
              tasksCompleted: { increment: 1 }
            }
          });

          // Создаем транзакцию
          await tx.transaction.create({
            data: {
              userId: execution.userId,
              type: 'earn',
              amount: finalReward,
              description: `Task completed: ${execution.task.title}`,
              metadata: {
                taskId: execution.taskId,
                executionId: executionId,
                moderatedBy: adminUser.userId
              }
            }
          });

          // Обновляем счетчик выполнений задания
          await tx.task.update({
            where: { id: execution.taskId },
            data: {
              completedCount: { increment: 1 }
            }
          });

          return { type: 'approved', execution: updatedExecution, reward: finalReward };

        } else {
          // Отклоняем выполнение
          const updatedExecution = await tx.taskExecution.update({
            where: { id: executionId },
            data: {
              status: ExecutionStatus.REJECTED,
              verifiedAt: new Date(),
              verifiedBy: BigInt(adminUser.userId),
              adminComment: comment || 'Task execution rejected'
            }
          });

          return { type: 'rejected', execution: updatedExecution };
        }
      });

      // Публикуем событие
      if (result.type === 'approved') {
        await fastify.eventBus.publish('execution:approved', {
          executionId,
          taskId: execution.taskId,
          userId: Number(execution.userId),
          reward: result.reward || 0
        });
      } else {
        await fastify.eventBus.publish('execution:rejected', {
          executionId,
          taskId: execution.taskId,
          userId: Number(execution.userId),
          reason: comment || 'Rejected by admin'
        });
      }

      // Логируем действие админа
      await prisma.userActivity.create({
        data: {
          userId: BigInt(adminUser.userId),
          type: 'admin_action',
          description: `${action === 'approve' ? 'Approved' : 'Rejected'} task execution`,
          metadata: {
            executionId,
            taskId: execution.taskId,
            userId: Number(execution.userId),
            action,
            comment,
            reward: result.type === 'approved' ? result.reward : undefined
          }
        }
      });

      return {
        success: true,
        data: {
          execution: {
            ...result.execution,
            userId: Number(result.execution.userId),
            rewardAmount: Number(result.execution.rewardAmount)
          },
          action,
          reward: result.type === 'approved' ? result.reward : undefined
        },
        message: `Task execution ${action}d successfully`
      };

    } catch (error) {
      fastify.log.error('Moderate execution error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to moderate task execution'
      });
    }
  });

  // GET /tasks/stats - Статистика заданий
  fastify.get('/stats', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      tags: ['Tasks'],
      summary: 'Get tasks statistics',
      security: [{ JWT: [] }]
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [
        totalTasks,
        tasksByStatus,
        tasksByType,
        executionStats,
        todayStats,
        monthStats,
        topAuthors
      ] = await Promise.all([
        prisma.task.count(),
        
        prisma.task.groupBy({
          by: ['status'],
          _count: { status: true }
        }),
        
        prisma.task.groupBy({
          by: ['type'],
          _count: { type: true },
          _avg: { reward: true }
        }),
        
        prisma.taskExecution.groupBy({
          by: ['status'],
          _count: { status: true }
        }),
        
        prisma.taskExecution.aggregate({
          where: { createdAt: { gte: today } },
          _count: { id: true },
          _sum: { rewardAmount: true }
        }),
        
        prisma.task.aggregate({
          where: { createdAt: { gte: thisMonth } },
          _count: { id: true },
          _sum: { reward: true }
        }),
        
        prisma.task.groupBy({
          by: ['authorId'],
          _count: { authorId: true },
          _sum: { reward: true },
          orderBy: { _count: { authorId: 'desc' } },
          take: 10
        })
      ]);

      return {
        success: true,
        data: {
          overview: {
            totalTasks,
            byStatus: tasksByStatus.reduce((acc, item) => {
              acc[item.status] = item._count.status;
              return acc;
            }, {} as Record<TaskStatus, number>),
            byType: tasksByType.map(item => ({
              type: item.type,
              count: item._count.type,
              averageReward: Number(item._avg.reward || 0)
            }))
          },
          executions: {
            byStatus: executionStats.reduce((acc, item) => {
              acc[item.status] = item._count.status;
              return acc;
            }, {} as Record<ExecutionStatus, number>)
          },
          performance: {
            today: {
              executions: todayStats._count.id,
              totalRewards: Number(todayStats._sum.rewardAmount || 0)
            },
            thisMonth: {
              tasksCreated: monthStats._count.id,
              totalBudget: Number(monthStats._sum.reward || 0)
            }
          },
          topAuthors: topAuthors.map(author => ({
            authorId: Number(author.authorId),
            tasksCount: author._count.authorId,
            totalBudget: Number(author._sum.reward || 0)
          }))
        }
      };

    } catch (error) {
      fastify.log.error('Get tasks stats error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch tasks statistics'
      });
    }
  });
}