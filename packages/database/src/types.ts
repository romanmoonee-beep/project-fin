import { Prisma } from '@prisma/client';

// Re-export Prisma types
export * from '@prisma/client';

// User types with relations
export type UserWithReferrals = Prisma.UserGetPayload<{
  include: {
    referrals: true;
    referrer: true;
  };
}>;

export type UserWithTasks = Prisma.UserGetPayload<{
  include: {
    createdTasks: true;
    taskExecutions: {
      include: {
        task: true;
      };
    };
  };
}>;

export type UserWithChecks = Prisma.UserGetPayload<{
  include: {
    createdChecks: true;
    checkActivations: {
      include: {
        check: true;
      };
    };
  };
}>;

export type UserFull = Prisma.UserGetPayload<{
  include: {
    referrals: true;
    referrer: true;
    createdTasks: true;
    taskExecutions: {
      include: {
        task: true;
      };
    };
    createdChecks: true;
    checkActivations: {
      include: {
        check: true;
      };
    };
    subscriptionChecks: true;
    transactions: true;
    notifications: true;
    activities: true;
  };
}>;

// Task types with relations
export type TaskWithAuthor = Prisma.TaskGetPayload<{
  include: {
    author: true;
  };
}>;

export type TaskWithExecutions = Prisma.TaskGetPayload<{
  include: {
    executions: {
      include: {
        user: true;
      };
    };
  };
}>;

export type TaskFull = Prisma.TaskGetPayload<{
  include: {
    author: true;
    executions: {
      include: {
        user: true;
      };
    };
  };
}>;

// Task Execution types with relations
export type ExecutionWithTask = Prisma.TaskExecutionGetPayload<{
  include: {
    task: {
      include: {
        author: true;
      };
    };
    user: true;
  };
}>;

// Check types with relations
export type CheckWithCreator = Prisma.CheckGetPayload<{
  include: {
    creator: true;
  };
}>;

export type CheckWithActivations = Prisma.CheckGetPayload<{
  include: {
    activations: {
      include: {
        user: true;
      };
    };
  };
}>;

export type CheckFull = Prisma.CheckGetPayload<{
  include: {
    creator: true;
    activations: {
      include: {
        user: true;
      };
    };
  };
}>;

// Check Activation with relations
export type ActivationFull = Prisma.CheckActivationGetPayload<{
  include: {
    check: {
      include: {
        creator: true;
      };
    };
    user: true;
  };
}>;

// Subscription Check with relations
export type SubscriptionCheckWithCreator = Prisma.SubscriptionCheckGetPayload<{
  include: {
    creator: true;
  };
}>;

// Transaction with user
export type TransactionWithUser = Prisma.TransactionGetPayload<{
  include: {
    user: true;
  };
}>;

// Notification with user
export type NotificationWithUser = Prisma.NotificationGetPayload<{
  include: {
    user: true;
  };
}>;

// User Activity with user
export type ActivityWithUser = Prisma.UserActivityGetPayload<{
  include: {
    user: true;
  };
}>;

// Create input types
export type UserCreateInput = Prisma.UserCreateInput;
export type UserUpdateInput = Prisma.UserUpdateInput;
export type UserWhereInput = Prisma.UserWhereInput;
export type UserOrderByInput = Prisma.UserOrderByWithRelationInput;

export type TaskCreateInput = Prisma.TaskCreateInput;
export type TaskUpdateInput = Prisma.TaskUpdateInput;
export type TaskWhereInput = Prisma.TaskWhereInput;
export type TaskOrderByInput = Prisma.TaskOrderByWithRelationInput;

export type ExecutionCreateInput = Prisma.TaskExecutionCreateInput;
export type ExecutionUpdateInput = Prisma.TaskExecutionUpdateInput;
export type ExecutionWhereInput = Prisma.TaskExecutionWhereInput;
export type ExecutionOrderByInput = Prisma.TaskExecutionOrderByWithRelationInput;

export type CheckCreateInput = Prisma.CheckCreateInput;
export type CheckUpdateInput = Prisma.CheckUpdateInput;
export type CheckWhereInput = Prisma.CheckWhereInput;
export type CheckOrderByInput = Prisma.CheckOrderByWithRelationInput;

export type ActivationCreateInput = Prisma.CheckActivationCreateInput;
export type ActivationWhereInput = Prisma.CheckActivationWhereInput;
export type ActivationOrderByInput = Prisma.CheckActivationOrderByWithRelationInput;

export type SubscriptionCheckCreateInput = Prisma.SubscriptionCheckCreateInput;
export type SubscriptionCheckUpdateInput = Prisma.SubscriptionCheckUpdateInput;
export type SubscriptionCheckWhereInput = Prisma.SubscriptionCheckWhereInput;
export type SubscriptionCheckOrderByInput = Prisma.SubscriptionCheckOrderByWithRelationInput;

export type TransactionCreateInput = Prisma.TransactionCreateInput;
export type TransactionWhereInput = Prisma.TransactionWhereInput;
export type TransactionOrderByInput = Prisma.TransactionOrderByWithRelationInput;

export type NotificationCreateInput = Prisma.NotificationCreateInput;
export type NotificationUpdateInput = Prisma.NotificationUpdateInput;
export type NotificationWhereInput = Prisma.NotificationWhereInput;
export type NotificationOrderByInput = Prisma.NotificationOrderByWithRelationInput;

export type ActivityCreateInput = Prisma.UserActivityCreateInput;
export type ActivityWhereInput = Prisma.UserActivityWhereInput;
export type ActivityOrderByInput = Prisma.UserActivityOrderByWithRelationInput;

// Database utility types
export type PaginationOptions = {
  page?: number;
  limit?: number;
  skip?: number;
  take?: number;
};

export type FilterOptions<T> = {
  where?: T;
  orderBy?: any;
  include?: any;
  select?: any;
} & PaginationOptions;

export type DatabaseError = {
  code: string;
  message: string;
  meta?: any;
};

// Statistics types
export type UserStatistics = {
  totalUsers: number;
  activeUsers: number;
  premiumUsers: number;
  newUsersToday: number;
  totalBalance: number;
  averageBalance: number;
  levelDistribution: Record<string, number>;
};

export type TaskStatistics = {
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  totalExecutions: number;
  successRate: number;
  averageReward: number;
  typeDistribution: Record<string, number>;
};

export type CheckStatistics = {
  totalChecks: number;
  activeChecks: number;
  totalActivations: number;
  totalAmount: number;
  averageAmount: number;
  successRate: number;
};

export type SubscriptionStatistics = {
  totalChecks: number;
  activeChecks: number;
  totalMessages: number;
  deletedMessages: number;
  successRate: number;
  typeDistribution: Record<string, number>;
};

export type SystemStatistics = {
  users: UserStatistics;
  tasks: TaskStatistics;
  checks: CheckStatistics;
  subscriptions: SubscriptionStatistics;
  revenue: {
    totalRevenue: number;
    totalCommissions: number;
    averageTransactionSize: number;
  };
};