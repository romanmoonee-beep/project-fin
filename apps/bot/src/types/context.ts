import { Context, SessionFlavor } from 'grammy';
import { ConversationFlavor } from '@grammyjs/conversations';
import { I18nFlavor } from '@grammyjs/i18n';
import { ParseModeFlavor } from '@grammyjs/parse-mode';
import { MenuFlavor } from '@grammyjs/menu';
import { User } from '@pr-gram/database';

// Session data structure
export interface SessionData {
  step: string;
  data: Record<string, any>;
  taskData?: {
    type?: string;
    title?: string;
    description?: string;
    reward?: number;
    targetCount?: number;
    targetUrl?: string;
    conditions?: Record<string, any>;
    verificationType?: string;
    minUserLevel?: string;
    expiresAt?: Date;
  };
  checkData?: {
    amount?: number;
    maxActivations?: number;
    password?: string;
    comment?: string;
    imageUrl?: string;
    conditions?: Record<string, any>;
    design?: Record<string, any>;
  };
  subscriptionData?: {
    chatId?: number;
    targetChatId?: number;
    targetUsername?: string;
    inviteLink?: string;
    setupType?: string;
    autoDeleteTimer?: number;
    expiresAt?: Date;
  };
  uploadedFiles?: string[];
  tempData?: Record<string, any>;
}

// Extended context with all flavors
export interface BotContext extends 
  Context, 
  SessionFlavor<SessionData>,
  ConversationFlavor,
  I18nFlavor,
  ParseModeFlavor<Context>,
  MenuFlavor {
  
  // User data from database
  user: User;
  
  // Custom properties
  isAdmin: boolean;
  isSuperAdmin: boolean;
  
  // Helper methods
  replyWithMenu(text: string, menu?: any): Promise<any>;
  editMessageTextWithMenu(text: string, menu?: any): Promise<any>;
  answerCallbackQuery(text?: string): Promise<any>;
  
  // Error handling
  handleError(error: Error, context?: string): Promise<void>;
  
  // Quick responses
  replyWithSuccess(message: string): Promise<any>;
  replyWithError(message: string): Promise<any>;
  replyWithWarning(message: string): Promise<any>;
  replyWithInfo(message: string): Promise<any>;
}

// Conversation names
export enum ConversationName {
  CREATE_TASK = 'createTask',
  EXECUTE_TASK = 'executeTask',
  CREATE_CHECK = 'createCheck',
  ACTIVATE_CHECK = 'activateCheck',
  SETUP_SUBSCRIPTION = 'setupSubscription',
  MODERATE_TASK = 'moderateTask',
  APPEAL_REJECTION = 'appealRejection',
  TOP_UP_BALANCE = 'topUpBalance',
  SETTINGS = 'settings',
  REFERRAL_SETUP = 'referralSetup',
}

// Menu names
export enum MenuName {
  MAIN = 'main',
  EARN = 'earn',
  PROMOTE = 'promote',
  PROFILE = 'profile',
  SUBSCRIPTION = 'subscription',
  SETTINGS = 'settings',
  ADMIN = 'admin',
  TASK_LIST = 'taskList',
  TASK_DETAILS = 'taskDetails',
  CHECK_LIST = 'checkList',
  REFERRALS = 'referrals',
}

// Callback data patterns
export interface CallbackData {
  action: string;
  data?: Record<string, any>;
}

// Task execution states
export enum TaskExecutionStep {
  IDLE = 'idle',
  SELECTING_TASK = 'selecting_task',
  VIEWING_TASK = 'viewing_task',
  EXECUTING_TASK = 'executing_task',
  UPLOADING_PROOF = 'uploading_proof',
  WAITING_VERIFICATION = 'waiting_verification',
}

// Task creation states
export enum TaskCreationStep {
  IDLE = 'idle',
  SELECTING_TYPE = 'selecting_type',
  ENTERING_TITLE = 'entering_title',
  ENTERING_DESCRIPTION = 'entering_description',
  ENTERING_URL = 'entering_url',
  ENTERING_REWARD = 'entering_reward',
  ENTERING_COUNT = 'entering_count',
  SELECTING_VERIFICATION = 'selecting_verification',
  CONFIGURING_CONDITIONS = 'configuring_conditions',
  REVIEWING = 'reviewing',
  CONFIRMING = 'confirming',
}

// Check creation states
export enum CheckCreationStep {
  IDLE = 'idle',
  SELECTING_TYPE = 'selecting_type',
  ENTERING_AMOUNT = 'entering_amount',
  ENTERING_ACTIVATIONS = 'entering_activations',
  ENTERING_COMMENT = 'entering_comment',
  ENTERING_PASSWORD = 'entering_password',
  CONFIGURING_CONDITIONS = 'configuring_conditions',
  CONFIGURING_DESIGN = 'configuring_design',
  REVIEWING = 'reviewing',
  CONFIRMING = 'confirming',
}

// Subscription check states
export enum SubscriptionSetupStep {
  IDLE = 'idle',
  SELECTING_TYPE = 'selecting_type',
  ENTERING_CHAT_ID = 'entering_chat_id',
  ENTERING_TARGET = 'entering_target',
  ENTERING_INVITE_LINK = 'entering_invite_link',
  CONFIGURING_TIMER = 'configuring_timer',
  CONFIGURING_SETTINGS = 'configuring_settings',
  REVIEWING = 'reviewing',
  CONFIRMING = 'confirming',
}

// Error types
export interface BotError extends Error {
  code?: string;
  context?: string;
  userId?: number;
  chatId?: number;
  messageId?: number;
}

// File upload info
export interface UploadedFile {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url?: string;
  thumbnailUrl?: string;
}

// Rate limit info
export interface RateLimitInfo {
  remaining: number;
  resetTime: number;
  isLimited: boolean;
}

// Middleware context extensions
export interface MiddlewareContext {
  startTime: number;
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
}

// Admin context extensions
export interface AdminContext {
  canModerate: boolean;
  canManageUsers: boolean;
  canManageSettings: boolean;
  canViewAnalytics: boolean;
  canManageAdmins: boolean;
}