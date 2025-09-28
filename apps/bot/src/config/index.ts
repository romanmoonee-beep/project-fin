import { loadBotConfig, type BotConfig } from '@pr-gram/config';

// Load configuration
export const config: BotConfig = loadBotConfig();

// Bot constants
export const BOT_CONSTANTS = {
  // Session keys
  SESSION_KEYS: {
    USER_STEP: 'step',
    TASK_DATA: 'taskData',
    CHECK_DATA: 'checkData',
    SUBSCRIPTION_DATA: 'subscriptionData',
    UPLOADED_FILES: 'uploadedFiles',
    TEMP_DATA: 'tempData',
  },
  
  // Cache TTL (seconds)
  CACHE_TTL: {
    USER_DATA: 300, // 5 minutes
    TASK_LIST: 60, // 1 minute
    SUBSCRIPTION_CHECKS: 300, // 5 minutes
    RATE_LIMIT: 3600, // 1 hour
  },
  
  // Rate limits
  RATE_LIMITS: {
    COMMANDS_PER_MINUTE: config.BOT_RATE_LIMIT_COMMANDS,
    MESSAGES_PER_MINUTE: config.BOT_RATE_LIMIT_MESSAGES,
    TASKS_PER_MINUTE: config.BOT_RATE_LIMIT_TASKS,
    FILE_UPLOADS_PER_HOUR: 20,
  },
  
  // File limits
  FILE_LIMITS: {
    MAX_SIZE: config.BOT_MAX_FILE_SIZE,
    ALLOWED_TYPES: config.BOT_ALLOWED_FILE_TYPES,
    MAX_FILES_PER_TASK: 5,
  },
  
  // Task limits
  TASK_LIMITS: {
    MIN_REWARD: 10,
    MAX_REWARD: 10000,
    MIN_TARGET_COUNT: 1,
    MAX_TARGET_COUNT: 10000,
    MAX_TITLE_LENGTH: 255,
    MAX_DESCRIPTION_LENGTH: 1000,
    AUTO_APPROVE_HOURS: config.TASK_AUTO_APPROVE_HOURS,
  },
  
  // Check limits
  CHECK_LIMITS: {
    MIN_AMOUNT: 10,
    MAX_AMOUNT: 100000,
    MIN_ACTIVATIONS: 1,
    MAX_ACTIVATIONS: 10000,
    MAX_COMMENT_LENGTH: 500,
    MAX_PASSWORD_LENGTH: 50,
  },
  
  // Subscription limits
  SUBSCRIPTION_LIMITS: {
    MAX_CHECKS_PER_CHAT: config.SUBSCRIPTION_MAX_CHECKS_PER_CHAT,
    AUTO_DELETE_MIN_TIMER: 15, // seconds
    AUTO_DELETE_MAX_TIMER: 300, // 5 minutes
    MAX_SUBSCRIBER_GOAL: 100000,
  },
  
  // Timeouts
  TIMEOUTS: {
    TASK_VERIFICATION: config.TASK_VERIFICATION_TIMEOUT * 1000, // milliseconds
    SUBSCRIPTION_CHECK: config.SUBSCRIPTION_CHECK_TIMEOUT * 1000,
    USER_INPUT: 60000, // 1 minute
    CONVERSATION: 300000, // 5 minutes
  },
  
  // Retry settings
  RETRY: {
    MAX_ATTEMPTS: config.TASK_MAX_RETRIES,
    DELAY_MS: 1000,
    EXPONENTIAL_BACKOFF: true,
  },
  
  // Admin IDs
  ADMIN_IDS: config.BOT_ADMIN_IDS,
  SUPER_ADMIN_ID: config.BOT_SUPER_ADMIN_ID,
  
  // Chat IDs
  SUPPORT_CHAT_ID: config.SUPPORT_CHAT_ID,
  LOGS_CHAT_ID: config.LOGS_CHAT_ID,
  ANNOUNCEMENTS_CHAT_ID: config.ANNOUNCEMENTS_CHAT_ID,
} as const;

// Validation rules
export const VALIDATION_RULES = {
  TELEGRAM_ID: /^\d+$/,
  TELEGRAM_USERNAME: /^@?[a-zA-Z0-9_]{5,32}$/,
  TELEGRAM_URL: /^https:\/\/t\.me\/[a-zA-Z0-9_]+$/,
  TELEGRAM_INVITE_LINK: /^https:\/\/t\.me\/\+[a-zA-Z0-9_-]+$/,
  DURATION: /^(\d+)([smhd])$/,
  PASSWORD: /^[a-zA-Z0-9!@#$%^&*()_+-=]{1,50}$/,
} as const;

// Error messages
export const BOT_ERRORS = {
  INVALID_INPUT: 'Неверный ввод данных',
  INSUFFICIENT_BALANCE: 'Недостаточно средств на балансе',
  TASK_NOT_FOUND: 'Задание не найдено',
  TASK_EXPIRED: 'Срок выполнения задания истек',
  TASK_ALREADY_COMPLETED: 'Задание уже выполнено',
  CHECK_NOT_FOUND: 'Чек не найден',
  CHECK_EXPIRED: 'Срок действия чека истек',
  USER_NOT_FOUND: 'Пользователь не найден',
  RATE_LIMITED: 'Превышен лимит запросов',
  FILE_TOO_LARGE: 'Файл слишком большой',
  INVALID_FILE_TYPE: 'Неподдерживаемый тип файла',
  SUBSCRIPTION_NOT_FOUND: 'Проверка подписки не найдена',
  NOT_SUBSCRIBED: 'Необходимо подписаться на канал',
  CONVERSATION_TIMEOUT: 'Время ожидания истекло',
  UNAUTHORIZED: 'Недостаточно прав',
  MAINTENANCE_MODE: 'Техническое обслуживание',
} as const;

// Success messages
export const BOT_SUCCESS = {
  TASK_CREATED: 'Задание успешно создано',
  TASK_COMPLETED: 'Задание выполнено!',
  CHECK_CREATED: 'Чек успешно создан',
  CHECK_ACTIVATED: 'Чек активирован!',
  SUBSCRIPTION_SETUP: 'Проверка подписки настроена',
  BALANCE_UPDATED: 'Баланс обновлен',
  SETTINGS_SAVED: 'Настройки сохранены',
  FILE_UPLOADED: 'Файл загружен',
  APPEAL_SUBMITTED: 'Апелляция подана',
} as const;

// Callback data prefixes
export const CALLBACK_PREFIXES = {
  MENU: 'menu',
  TASK: 'task',
  CHECK: 'check',
  SUBSCRIPTION: 'sub',
  ADMIN: 'admin',
  APPEAL: 'appeal',
  PROFILE: 'profile',
  SETTINGS: 'settings',
  REFERRAL: 'ref',
  PAGINATION: 'page',
} as const;

// Environment checks
export const isProduction = () => config.NODE_ENV === 'production';
export const isDevelopment = () => config.NODE_ENV === 'development';
export const isTest = () => config.NODE_ENV === 'test';

// Helper functions
export const isAdmin = (userId: number): boolean => {
  return BOT_CONSTANTS.ADMIN_IDS.includes(userId) || 
         userId === BOT_CONSTANTS.SUPER_ADMIN_ID;
};

export const isSuperAdmin = (userId: number): boolean => {
  return userId === BOT_CONSTANTS.SUPER_ADMIN_ID;
};

export const getMaxTasksPerDay = (userLevel: string): number => {
  const levelConfig = {
    bronze: 5,
    silver: 15,
    gold: 30,
    premium: -1, // unlimited
  };
  return levelConfig[userLevel as keyof typeof levelConfig] || 5;
};

export const getCommissionRate = (userLevel: string): number => {
  const levelConfig = {
    bronze: 7,
    silver: 6,
    gold: 5,
    premium: 3,
  };
  return levelConfig[userLevel as keyof typeof levelConfig] || 7;
};

export const getEarningMultiplier = (userLevel: string): number => {
  const levelConfig = {
    bronze: 1.0,
    silver: 1.2,
    gold: 1.35,
    premium: 1.5,
  };
  return levelConfig[userLevel as keyof typeof levelConfig] || 1.0;
};