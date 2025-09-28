import { TransactionType, NotificationType, LanguageCode } from '../enums';

// Pagination
export interface Pagination {
  page: number;
  limit: number;
  offset: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Paginated Response
export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

// API Response
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errors?: string[];
  pagination?: Pagination;
  timestamp: Date;
}

// API Error
export interface ApiError {
  code: string;
  message: string;
  details?: any;
  statusCode: number;
  timestamp: Date;
}

// Transaction
export interface Transaction {
  id: string;
  userId: number;
  type: TransactionType;
  amount: number;
  description: string;
  metadata?: TransactionMetadata;
  createdAt: Date;
}

// Transaction Metadata
export interface TransactionMetadata {
  taskId?: string;
  executionId?: string;
  checkId?: string;
  referralId?: number;
  adminId?: number;
  reason?: string;
  originalAmount?: number;
  exchangeRate?: number;
  paymentMethod?: string;
  paymentId?: string;
}

// Notification
export interface Notification {
  id: string;
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  data?: NotificationData;
  isRead: boolean;
  createdAt: Date;
  readAt?: Date;
}

// Notification Data
export interface NotificationData {
  taskId?: string;
  executionId?: string;
  checkId?: string;
  amount?: number;
  referralId?: number;
  level?: string;
  url?: string;
  actionRequired?: boolean;
  expiresAt?: Date;
}

// File Upload
export interface FileUpload {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
  uploadedBy: number;
  metadata?: FileMetadata;
  createdAt: Date;
}

// File Metadata
export interface FileMetadata {
  width?: number;
  height?: number;
  duration?: number; // for videos/audio
  title?: string;
  description?: string;
  tags?: string[];
}

// System Settings
export interface SystemSettings {
  maintenance: MaintenanceSettings;
  limits: SystemLimits;
  features: FeatureFlags;
  rates: ExchangeRates;
  messages: SystemMessages;
}

// Maintenance Settings
export interface MaintenanceSettings {
  enabled: boolean;
  message: string;
  startTime?: Date;
  endTime?: Date;
  affectedServices: string[];
}

// System Limits
export interface SystemLimits {
  maxTasksPerUser: number;
  maxTasksPerDay: number;
  maxFileSize: number; // bytes
  maxExecutionsPerTask: number;
  maxChecksPerUser: number;
  maxReferralsPerUser: number;
  rateLimits: RateLimits;
}

// Rate Limits
export interface RateLimits {
  api: RateLimit;
  bot: RateLimit;
  uploads: RateLimit;
}

// Rate Limit
export interface RateLimit {
  requests: number;
  windowMs: number; // milliseconds
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

// Feature Flags
export interface FeatureFlags {
  enableTaskBoosts: boolean;
  enablePremiumFeatures: boolean;
  enableGeolocation: boolean;
  enableAnalytics: boolean;
  enableReferrals: boolean;
  enableChecks: boolean;
  enableSubscriptionChecks: boolean;
  maintenanceMode: boolean;
}

// Exchange Rates
export interface ExchangeRates {
  gramToStars: number;
  starsToGram: number;
  bonusRates: BonusRates;
  lastUpdated: Date;
}

// Bonus Rates
export interface BonusRates {
  [key: string]: number; // package amount -> bonus percentage
}

// System Messages
export interface SystemMessages {
  welcome: LocalizedMessage;
  maintenance: LocalizedMessage;
  rateLimit: LocalizedMessage;
  error: LocalizedMessage;
}

// Localized Message
export interface LocalizedMessage {
  [key in LanguageCode]: string;
}

// Analytics Event
export interface AnalyticsEvent {
  id: string;
  userId?: number;
  event: string;
  properties: any;
  timestamp: Date;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
}

// Geolocation
export interface Geolocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  country?: string;
  city?: string;
  timezone?: string;
}

// Time Period
export interface TimePeriod {
  start: Date;
  end: Date;
  label?: string;
}

// Statistics Base
export interface StatisticsBase {
  period: TimePeriod;
  data: any;
  metadata?: any;
  generatedAt: Date;
}

// Search Parameters
export interface SearchParams {
  query?: string;
  filters?: any;
  sort?: SortParams;
  pagination?: PaginationParams;
}

// Sort Parameters
export interface SortParams {
  field: string;
  direction: 'asc' | 'desc';
}

// Pagination Parameters
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

// Cache Options
export interface CacheOptions {
  ttl?: number; // seconds
  key?: string;
  namespace?: string;
  tags?: string[];
}

// Job Data
export interface JobData {
  id: string;
  type: string;
  payload: any;
  options?: JobOptions;
  createdAt: Date;
}

// Job Options
export interface JobOptions {
  delay?: number; // milliseconds
  attempts?: number;
  backoff?: BackoffOptions;
  removeOnComplete?: number;
  removeOnFail?: number;
}

// Backoff Options
export interface BackoffOptions {
  type: 'fixed' | 'exponential';
  delay: number;
}

// Health Check
export interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  uptime: number;
  services: ServiceHealth[];
}

// Service Health
export interface ServiceHealth {
  name: string;
  status: 'up' | 'down' | 'degraded';
  responseTime?: number;
  error?: string;
  lastCheck: Date;
}