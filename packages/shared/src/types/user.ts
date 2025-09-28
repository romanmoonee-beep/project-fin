import { UserLevel, UserRole, LanguageCode } from '../enums';

// Base User interface
export interface User {
  id: string;
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode: LanguageCode;
  balance: number;
  frozenBalance: number;
  level: UserLevel;
  role: UserRole;
  referrerId?: number;
  referralCode: string;
  totalEarned: number;
  totalSpent: number;
  tasksCompleted: number;
  tasksCreated: number;
  isPremium: boolean;
  premiumUntil?: Date;
  settings: UserSettings;
  metadata: UserMetadata;
  createdAt: Date;
  updatedAt: Date;
}

// User Settings
export interface UserSettings {
  notifications: NotificationSettings;
  privacy: PrivacySettings;
  language: LanguageCode;
  theme: 'light' | 'dark' | 'auto';
}

// Notification Settings
export interface NotificationSettings {
  taskCompleted: boolean;
  taskApproved: boolean;
  taskRejected: boolean;
  referralBonus: boolean;
  levelUp: boolean;
  systemMessages: boolean;
  dailySummary: boolean;
  weeklyReport: boolean;
}

// Privacy Settings
export interface PrivacySettings {
  showUsername: boolean;
  showLevel: boolean;
  showStats: boolean;
  allowDirectMessages: boolean;
}

// User Metadata
export interface UserMetadata {
  firstTaskCompletedAt?: Date;
  lastActiveAt?: Date;
  deviceInfo?: DeviceInfo;
  registrationSource?: string;
  totalLoginDays: number;
  consecutiveLoginDays: number;
  averageTasksPerDay: number;
  preferredTaskTypes: string[];
}

// Device Info
export interface DeviceInfo {
  platform: string;
  language: string;
  timezone?: string;
}

// User Statistics
export interface UserStats {
  totalEarned: number;
  totalSpent: number;
  tasksCompleted: number;
  tasksCreated: number;
  referralsCount: number;
  premiumReferralsCount: number;
  averageTaskReward: number;
  completionRate: number;
  currentStreak: number;
  longestStreak: number;
  levelProgress: LevelProgress;
}

// Level Progress
export interface LevelProgress {
  currentLevel: UserLevel;
  nextLevel?: UserLevel;
  currentPoints: number;
  pointsToNext?: number;
  progressPercentage: number;
}

// User Level Configuration
export interface UserLevelConfig {
  level: UserLevel;
  minBalance: number;
  maxDailyTasks: number;
  taskCreationLimit: number;
  commissionRate: number; // Percentage
  earningMultiplier: number;
  referralBonus: number;
  features: string[];
  restrictions: string[];
}

// Referral Information
export interface ReferralInfo {
  id: string;
  telegramId: number;
  username?: string;
  level: UserLevel;
  totalEarned: number;
  registeredAt: Date;
  isActive: boolean;
  lastActiveAt?: Date;
}

// User Activity
export interface UserActivity {
  id: string;
  userId: string;
  type: string;
  description: string;
  metadata?: any;
  createdAt: Date;
}

// User Session
export interface UserSession {
  telegramId: number;
  sessionId: string;
  step: string;
  data: any;
  expiresAt: Date;
  createdAt: Date;
}

// User Creation Data
export interface CreateUserData {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: LanguageCode;
  referrerId?: number;
}

// User Update Data
export interface UpdateUserData {
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: LanguageCode;
  settings?: Partial<UserSettings>;
}

// User Balance Operation
export interface BalanceOperation {
  userId: string;
  amount: number;
  type: 'add' | 'subtract' | 'freeze' | 'unfreeze';
  reason: string;
  metadata?: any;
}

// User Filter for queries
export interface UserFilter {
  level?: UserLevel;
  role?: UserRole;
  isPremium?: boolean;
  hasBalance?: boolean;
  registeredAfter?: Date;
  registeredBefore?: Date;
  lastActiveAfter?: Date;
  lastActiveBefore?: Date;
  search?: string; // Search by username, firstName, lastName
}

// User Sort Options
export interface UserSort {
  field: 'createdAt' | 'lastActiveAt' | 'balance' | 'totalEarned' | 'tasksCompleted';
  direction: 'asc' | 'desc';
}