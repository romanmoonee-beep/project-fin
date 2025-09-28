import { UserLevel, TaskType, TaskBoostType, LanguageCode } from '../enums';

// User Level Configuration
export const USER_LEVEL_CONFIG = {
  [UserLevel.BRONZE]: {
    level: UserLevel.BRONZE,
    minBalance: 0,
    maxDailyTasks: 5,
    taskCreationLimit: 5,
    commissionRate: 7, // 7%
    earningMultiplier: 1.0,
    referralBonus: 1000,
    features: ['basic_tasks', 'referrals', 'basic_support'],
    restrictions: ['low_priority', 'basic_verification']
  },
  [UserLevel.SILVER]: {
    level: UserLevel.SILVER,
    minBalance: 10000,
    maxDailyTasks: 15,
    taskCreationLimit: 15,
    commissionRate: 6, // 6%
    earningMultiplier: 1.2,
    referralBonus: 1500,
    features: ['basic_tasks', 'referrals', 'priority_support', 'task_boost'],
    restrictions: ['medium_priority']
  },
  [UserLevel.GOLD]: {
    level: UserLevel.GOLD,
    minBalance: 50000,
    maxDailyTasks: 30,
    taskCreationLimit: 30,
    commissionRate: 5, // 5%
    earningMultiplier: 1.35,
    referralBonus: 2000,
    features: ['all_tasks', 'referrals', 'priority_support', 'task_boost', 'exclusive_tasks', 'analytics'],
    restrictions: ['high_priority']
  },
  [UserLevel.PREMIUM]: {
    level: UserLevel.PREMIUM,
    minBalance: 100000,
    maxDailyTasks: -1, // unlimited
    taskCreationLimit: -1, // unlimited
    commissionRate: 3, // 3%
    earningMultiplier: 1.5,
    referralBonus: 3000,
    features: ['all_tasks', 'referrals', 'vip_support', 'task_boost', 'exclusive_tasks', 'analytics', 'personal_manager', 'api_access'],
    restrictions: ['max_priority', 'instant_verification']
  }
} as const;

// Task Type Configuration
export const TASK_TYPE_CONFIG = {
  [TaskType.SUBSCRIBE]: {
    type: TaskType.SUBSCRIBE,
    name: 'Подписка на канал',
    icon: '📺',
    minReward: 50,
    maxReward: 500,
    verificationTime: 30, // seconds
    autoVerify: true
  },
  [TaskType.JOIN_GROUP]: {
    type: TaskType.JOIN_GROUP,
    name: 'Вступление в группу',
    icon: '👥',
    minReward: 75,
    maxReward: 750,
    verificationTime: 30,
    autoVerify: true
  },
  [TaskType.VIEW_POST]: {
    type: TaskType.VIEW_POST,
    name: 'Просмотр поста',
    icon: '👀',
    minReward: 25,
    maxReward: 200,
    verificationTime: 10,
    autoVerify: true
  },
  [TaskType.REACT_POST]: {
    type: TaskType.REACT_POST,
    name: 'Реакция на пост',
    icon: '👍',
    minReward: 30,
    maxReward: 150,
    verificationTime: 15,
    autoVerify: true
  },
  [TaskType.USE_BOT]: {
    type: TaskType.USE_BOT,
    name: 'Переход в бота',
    icon: '🤖',
    minReward: 100,
    maxReward: 1500,
    verificationTime: 120,
    autoVerify: false
  },
  [TaskType.PREMIUM_BOOST]: {
    type: TaskType.PREMIUM_BOOST,
    name: 'Премиум буст',
    icon: '⭐',
    minReward: 500,
    maxReward: 2000,
    verificationTime: 60,
    autoVerify: false
  }
} as const;

// Task Boost Configuration
export const TASK_BOOST_CONFIG = {
  [TaskBoostType.TOP_PLACEMENT]: {
    type: TaskBoostType.TOP_PLACEMENT,
    name: '🚀 Топ показ',
    description: 'Задание показывается в самом верху списка',
    price: 500,
    duration: 24, // hours
    multiplier: 3,
    maxPerUser: 5,
    icon: '🚀'
  },
  [TaskBoostType.HIGHLIGHT]: {
    type: TaskBoostType.HIGHLIGHT,
    name: '⭐ Подсветка',
    description: 'Золотая рамка и звездочка у задания',
    price: 300,
    duration: 24,
    multiplier: 1.5,
    maxPerUser: 10,
    icon: '⭐'
  },
  [TaskBoostType.PREMIUM_ONLY]: {
    type: TaskBoostType.PREMIUM_ONLY,
    name: '💎 Premium',
    description: 'Доступно только Premium пользователям',
    price: 200,
    duration: 48,
    multiplier: 1.2,
    maxPerUser: 3,
    icon: '💎'
  },
  [TaskBoostType.FAST_TRACK]: {
    type: TaskBoostType.FAST_TRACK,
    name: '⚡ Быстрая модерация',
    description: 'Приоритетная проверка заданий',
    price: 150,
    duration: 12,
    multiplier: 1,
    maxPerUser: 20,
    icon: '⚡'
  }
} as const;

// Language Configuration
export const LANGUAGE_CONFIG = {
  [LanguageCode.RU]: {
    code: LanguageCode.RU,
    name: 'Русский',
    nativeName: 'Русский',
    flag: '🇷🇺',
    isDefault: true
  },
  [LanguageCode.EN]: {
    code: LanguageCode.EN,
    name: 'English',
    nativeName: 'English',
    flag: '🇺🇸',
    isDefault: false
  },
  [LanguageCode.ES]: {
    code: LanguageCode.ES,
    name: 'Español',
    nativeName: 'Español',
    flag: '🇪🇸',
    isDefault: false
  },
  [LanguageCode.DE]: {
    code: LanguageCode.DE,
    name: 'Deutsch',
    nativeName: 'Deutsch',
    flag: '🇩🇪',
    isDefault: false
  },
  [LanguageCode.FR]: {
    code: LanguageCode.FR,
    name: 'Français',
    nativeName: 'Français',
    flag: '🇫🇷',
    isDefault: false
  }
} as const;

// Bot Configuration Constants
export const BOT_CONFIG = {
  // Rate Limits
  RATE_LIMITS: {
    TASKS_PER_MINUTE: 10,
    COMMANDS_PER_MINUTE: 30,
    MESSAGES_PER_MINUTE: 60,
    UPLOADS_PER_HOUR: 20
  },
  
  // File Limits
  FILE_LIMITS: {
    MAX_SIZE: 20 * 1024 * 1024, // 20MB
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'],
    MAX_FILES_PER_TASK: 5
  },
  
  // Task Limits
  TASK_LIMITS: {
    MIN_REWARD: 10,
    MAX_REWARD: 10000,
    MIN_TARGET_COUNT: 1,
    MAX_TARGET_COUNT: 10000,
    MAX_TITLE_LENGTH: 255,
    MAX_DESCRIPTION_LENGTH: 1000,
    AUTO_APPROVE_HOURS: 24
  },
  
  // Check Limits
  CHECK_LIMITS: {
    MIN_AMOUNT: 10,
    MAX_AMOUNT: 100000,
    MIN_ACTIVATIONS: 1,
    MAX_ACTIVATIONS: 10000,
    MAX_COMMENT_LENGTH: 500,
    MAX_PASSWORD_LENGTH: 50
  },
  
  // Subscription Check Limits
  SUBSCRIPTION_LIMITS: {
    MAX_CHECKS_PER_CHAT: 5,
    AUTO_DELETE_MIN_TIMER: 15, // seconds
    AUTO_DELETE_MAX_TIMER: 300, // 5 minutes
    MAX_SUBSCRIBER_GOAL: 100000
  }
} as const;

// API Configuration Constants
export const API_CONFIG = {
  // Pagination
  PAGINATION: {
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
    DEFAULT_PAGE: 1
  },
  
  // Cache TTL (seconds)
  CACHE_TTL: {
    USER_DATA: 300, // 5 minutes
    TASK_LIST: 60, // 1 minute
    STATISTICS: 600, // 10 minutes
    SYSTEM_SETTINGS: 3600 // 1 hour
  },
  
  // Rate Limits
  RATE_LIMITS: {
    ANONYMOUS: {
      requests: 100,
      windowMs: 15 * 60 * 1000 // 15 minutes
    },
    AUTHENTICATED: {
      requests: 1000,
      windowMs: 15 * 60 * 1000 // 15 minutes
    },
    ADMIN: {
      requests: 10000,
      windowMs: 15 * 60 * 1000 // 15 minutes
    }
  }
} as const;

// Exchange Rates
export const EXCHANGE_RATES = {
  BASE_RATE: 10, // 1 Star = 10 GRAM
  BONUS_PACKAGES: {
    100: 0, // 100 Stars = 1000 GRAM (no bonus)
    450: 10, // 450 Stars = 5000 GRAM (10% bonus)
    850: 15, // 850 Stars = 10000 GRAM (15% bonus)
    2000: 20 // 2000 Stars = 25000 GRAM (20% bonus) + 1000 GRAM extra
  }
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  // Common
  INVALID_INPUT: 'Неверный ввод данных',
  UNAUTHORIZED: 'Необходима авторизация',
  FORBIDDEN: 'Недостаточно прав доступа',
  NOT_FOUND: 'Ресурс не найден',
  RATE_LIMITED: 'Превышен лимит запросов',
  
  // User
  USER_NOT_FOUND: 'Пользователь не найден',
  INSUFFICIENT_BALANCE: 'Недостаточно средств на балансе',
  LEVEL_REQUIREMENT_NOT_MET: 'Недостаточный уровень пользователя',
  
  // Task
  TASK_NOT_FOUND: 'Задание не найдено',
  TASK_ALREADY_COMPLETED: 'Задание уже выполнено',
  TASK_EXPIRED: 'Срок выполнения задания истек',
  TASK_LIMIT_EXCEEDED: 'Превышен лимит заданий',
  
  // Check
  CHECK_NOT_FOUND: 'Чек не найден',
  CHECK_EXPIRED: 'Срок действия чека истек',
  CHECK_ALREADY_USED: 'Чек уже использован',
  WRONG_PASSWORD: 'Неверный пароль',
  
  // Subscription
  SUBSCRIPTION_CHECK_NOT_FOUND: 'Проверка подписки не найдена',
  NOT_SUBSCRIBED: 'Необходимо подписаться на канал',
  SUBSCRIPTION_LIMIT_EXCEEDED: 'Превышен лимит проверок подписки'
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
  TASK_CREATED: 'Задание успешно создано',
  TASK_COMPLETED: 'Задание выполнено!',
  CHECK_CREATED: 'Чек успешно создан',
  CHECK_ACTIVATED: 'Чек активирован!',
  SUBSCRIPTION_SETUP: 'Проверка подписки настроена',
  BALANCE_UPDATED: 'Баланс обновлен',
  SETTINGS_SAVED: 'Настройки сохранены'
} as const;

// Emoji Constants
export const EMOJIS = {
  // Levels
  BRONZE: '🥉',
  SILVER: '🥈',
  GOLD: '🥇',
  PREMIUM: '💎',
  
  // Actions
  EARN: '💰',
  PROMOTE: '📢',
  PROFILE: '👤',
  SETTINGS: '⚙️',
  SUBSCRIPTION_CHECK: '✅',
  
  // Status
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  INFO: 'ℹ️',
  FIRE: '🔥',
  STAR: '⭐',
  BOOST: '🚀',
  
  // Currency
  GRAM: '💰',
  STARS: '🌟',
  
  // Tasks
  CHANNEL: '📺',
  GROUP: '👥',
  VIEW: '👀',
  REACTION: '👍',
  BOT: '🤖',
  
  // Common
  BACK: '⬅️',
  NEXT: '➡️',
  HOME: '🏠',
  MENU: '📋',
  CLOCK: '🕐',
  CALENDAR: '📅',
  CHART: '📊'
} as const;

// Regex Patterns
export const REGEX_PATTERNS = {
  TELEGRAM_USERNAME: /^@?[a-zA-Z0-9_]{5,32}$/,
  TELEGRAM_CHAT_ID: /^-?\d+$/,
  TELEGRAM_URL: /^https:\/\/t\.me\/[a-zA-Z0-9_]+$/,
  TELEGRAM_INVITE_LINK: /^https:\/\/t\.me\/\+[a-zA-Z0-9_-]+$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/
} as const;