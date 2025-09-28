// User Level Enum
export enum UserLevel {
  BRONZE = 'bronze',
  SILVER = 'silver', 
  GOLD = 'gold',
  PREMIUM = 'premium'
}

// User Role Enum
export enum UserRole {
  USER = 'user',
  MODERATOR = 'moderator',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin'
}

// Task Type Enum
export enum TaskType {
  SUBSCRIBE = 'subscribe',
  JOIN_GROUP = 'join_group',
  VIEW_POST = 'view_post',
  REACT_POST = 'react_post',
  USE_BOT = 'use_bot',
  PREMIUM_BOOST = 'premium_boost'
}

// Task Status Enum
export enum TaskStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired'
}

// Task Execution Status Enum
export enum ExecutionStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired'
}

// Verification Type Enum
export enum VerificationType {
  AUTO = 'auto',
  MANUAL = 'manual',
  HYBRID = 'hybrid'
}

// Subscription Check Type Enum
export enum CheckType {
  PUBLIC_CHANNEL = 'public_channel',
  PRIVATE_CHANNEL = 'private_channel',
  INVITE_LINK = 'invite_link',
  REFERRAL_BOT = 'referral_bot'
}

// Task Boost Type Enum
export enum TaskBoostType {
  TOP_PLACEMENT = 'top_placement',
  HIGHLIGHT = 'highlight',
  PREMIUM_ONLY = 'premium_only',
  FAST_TRACK = 'fast_track'
}

// Transaction Type Enum
export enum TransactionType {
  EARN = 'earn',
  SPEND = 'spend',
  REFERRAL = 'referral',
  BONUS = 'bonus',
  REFUND = 'refund',
  PENALTY = 'penalty'
}

// Notification Type Enum
export enum NotificationType {
  TASK_COMPLETED = 'task_completed',
  TASK_APPROVED = 'task_approved',
  TASK_REJECTED = 'task_rejected',
  REFERRAL_BONUS = 'referral_bonus',
  LEVEL_UP = 'level_up',
  BALANCE_LOW = 'balance_low',
  SYSTEM_MESSAGE = 'system_message'
}

// Language Code Enum
export enum LanguageCode {
  RU = 'ru',
  EN = 'en',
  ES = 'es',
  DE = 'de',
  FR = 'fr'
}