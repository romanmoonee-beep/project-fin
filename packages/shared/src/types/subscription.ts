import { CheckType } from '../enums';

// Subscription Check interface
export interface SubscriptionCheck {
  id: string;
  uuid: string;
  chatId: number;
  chatTitle?: string;
  targetChatId?: number;
  targetUsername?: string;
  targetTitle?: string;
  inviteLink?: string;
  setupType: CheckType;
  isActive: boolean;
  autoDeleteTimer?: number; // seconds
  expiresAt?: Date;
  subscriberGoal?: number;
  currentSubscribers: number;
  createdBy: number;
  settings: SubscriptionSettings;
  statistics: SubscriptionStatistics;
  createdAt: Date;
  updatedAt: Date;
}

// Subscription Settings
export interface SubscriptionSettings {
  autoDelete: boolean;
  autoDeleteTimer: number; // seconds
  customMessage?: string;
  buttonText?: string;
  showStatistics: boolean;
  notifyAdmins: boolean;
  requireReferral: boolean;
  referralUserId?: number;
  allowedUserLevels?: string[];
  blockedUsers?: number[];
  whitelist?: number[];
}

// Subscription Statistics
export interface SubscriptionStatistics {
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  uniqueUsers: number;
  totalMessages: number;
  deletedMessages: number;
  averageCheckTime: number; // milliseconds
  dailyStats: DailySubscriptionStats[];
}

// Daily Subscription Statistics
export interface DailySubscriptionStats {
  date: string;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  newSubscribers: number;
  unsubscribers: number;
}

// Subscription Check Result
export interface SubscriptionCheckResult {
  userId: number;
  chatId: number;
  checkId: string;
  passed: boolean;
  subscribed: boolean;
  subscriptionDetails: SubscriptionDetails[];
  message?: string;
  actionTaken: 'none' | 'deleted_message' | 'restricted_user' | 'banned_user';
  timestamp: Date;
}

// Subscription Details
export interface SubscriptionDetails {
  checkId: string;
  targetChatId?: number;
  targetUsername?: string;
  targetTitle?: string;
  setupType: CheckType;
  subscribed: boolean;
  reason?: string;
  checkedAt: Date;
}

// Create Subscription Check Data
export interface CreateSubscriptionCheckData {
  chatId: number;
  targetChatId?: number;
  targetUsername?: string;
  inviteLink?: string;
  setupType: CheckType;
  autoDeleteTimer?: number;
  expiresAt?: Date;
  subscriberGoal?: number;
  settings?: Partial<SubscriptionSettings>;
}

// Update Subscription Check Data
export interface UpdateSubscriptionCheckData {
  targetChatId?: number;
  targetUsername?: string;
  inviteLink?: string;
  isActive?: boolean;
  autoDeleteTimer?: number;
  expiresAt?: Date;
  subscriberGoal?: number;
  settings?: Partial<SubscriptionSettings>;
}

// Subscription Check Filter
export interface SubscriptionCheckFilter {
  chatId?: number;
  setupType?: CheckType;
  isActive?: boolean;
  createdBy?: number;
  createdAfter?: Date;
  createdBefore?: Date;
  expiresAfter?: Date;
  expiresBefore?: Date;
}

// Chat Member Info
export interface ChatMemberInfo {
  userId: number;
  chatId: number;
  status: 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';
  username?: string;
  firstName?: string;
  lastName?: string;
  joinedAt?: Date;
  canSendMessages?: boolean;
  canSendMediaMessages?: boolean;
  canSendPolls?: boolean;
  canSendOtherMessages?: boolean;
  canAddWebPagePreviews?: boolean;
  canChangeInfo?: boolean;
  canInviteUsers?: boolean;
  canPinMessages?: boolean;
}

// Subscription Command Data
export interface SubscriptionCommand {
  command: string;
  chatId: number;
  userId: number;
  args: string[];
  messageId: number;
  timestamp: Date;
}

// Setup Command Handlers
export interface SetupCommandData {
  type: 'public' | 'private' | 'invite' | 'referral';
  target: string;
  timer?: string;
  goal?: number;
  userId: number;
  chatId: number;
}

// Unsetup Command Data
export interface UnsetupCommandData {
  target?: string;
  all?: boolean;
  userId: number;
  chatId: number;
}

// Status Command Response
export interface StatusCommandResponse {
  chatId: number;
  activeChecks: SubscriptionCheck[];
  totalChecks: number;
  totalSubscribers: number;
  statistics: SubscriptionStatistics;
}

// Auto Delete Configuration
export interface AutoDeleteConfig {
  enabled: boolean;
  timer: number; // seconds
  exceptions: number[]; // message IDs to keep
}

// Referral Subscription Data
export interface ReferralSubscriptionData {
  referralUserId: number;
  chatId: number;
  timer?: number;
  goal?: number;
  isActive: boolean;
}

// Subscription Verification
export interface SubscriptionVerification {
  userId: number;
  chatId: number;
  targetChatId?: number;
  targetUsername?: string;
  inviteLink?: string;
  isSubscribed: boolean;
  verificationMethod: 'api' | 'manual' | 'cached';
  verifiedAt: Date;
  error?: string;
}

// Batch Subscription Check
export interface BatchSubscriptionCheck {
  chatId: number;
  userIds: number[];
  checkResults: SubscriptionCheckResult[];
  totalUsers: number;
  passedUsers: number;
  failedUsers: number;
  processingTime: number; // milliseconds
}