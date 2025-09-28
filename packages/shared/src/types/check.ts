import { UserLevel } from '../enums';

// Check interface
export interface Check {
  id: string;
  uuid: string;
  createdBy: number;
  amount: number;
  maxActivations: number;
  currentActivations: number;
  password?: string;
  comment?: string;
  imageUrl?: string;
  conditions: CheckConditions;
  design: CheckDesign;
  isActive: boolean;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  // Relations
  creator?: CheckCreator;
  activations?: CheckActivation[];
}

// Check Conditions
export interface CheckConditions {
  subscriptionRequired?: string; // channel/chat username or ID
  subscriptionChatId?: number;
  minLevel?: UserLevel;
  maxUsagePerUser?: number;
  allowedUsers?: number[]; // specific user IDs
  blockedUsers?: number[]; // blocked user IDs
  geographicalRestrictions?: string[]; // country codes
  timeRestrictions?: TimeRestrictions;
}

// Time Restrictions
export interface TimeRestrictions {
  availableFrom?: Date;
  availableUntil?: Date;
  daysOfWeek?: number[]; // 0-6 (Sunday-Saturday)
  hoursOfDay?: number[]; // 0-23
  timezone?: string;
}

// Check Design
export interface CheckDesign {
  emoji: string;
  color: string;
  backgroundColor?: string;
  borderColor?: string;
  animation?: CheckAnimation;
  template?: CheckTemplate;
}

// Check Animation
export interface CheckAnimation {
  type: 'none' | 'pulse' | 'bounce' | 'glow' | 'confetti';
  duration?: number; // milliseconds
  iterations?: number;
}

// Check Template
export interface CheckTemplate {
  name: string;
  style: 'minimal' | 'elegant' | 'festive' | 'business' | 'gaming';
  customCSS?: string;
}

// Check Creator info
export interface CheckCreator {
  telegramId: number;
  username?: string;
  level: UserLevel;
  totalChecksCreated: number;
  totalAmountGiven: number;
}

// Check Activation
export interface CheckActivation {
  id: string;
  checkId: string;
  userId: number;
  amount: number;
  ipAddress?: string;
  userAgent?: string;
  location?: ActivationLocation;
  metadata?: any;
  activatedAt: Date;
  // Relations
  check?: Check;
  user?: CheckActivator;
}

// Activation Location
export interface ActivationLocation {
  country?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
}

// Check Activator info
export interface CheckActivator {
  telegramId: number;
  username?: string;
  level: UserLevel;
  totalActivations: number;
  totalAmountReceived: number;
}

// Create Check Data
export interface CreateCheckData {
  amount: number;
  maxActivations: number;
  password?: string;
  comment?: string;
  imageUrl?: string;
  conditions?: CheckConditions;
  design?: Partial<CheckDesign>;
  expiresAt?: Date;
}

// Update Check Data  
export interface UpdateCheckData {
  maxActivations?: number;
  password?: string;
  comment?: string;
  imageUrl?: string;
  conditions?: Partial<CheckConditions>;
  design?: Partial<CheckDesign>;
  isActive?: boolean;
  expiresAt?: Date;
}

// Check Filter
export interface CheckFilter {
  createdBy?: number;
  isActive?: boolean;
  hasPassword?: boolean;
  minAmount?: number;
  maxAmount?: number;
  createdAfter?: Date;
  createdBefore?: Date;
  expiresAfter?: Date;
  expiresBefore?: Date;
  search?: string; // Search in comment
}

// Check Sort Options
export interface CheckSort {
  field: 'createdAt' | 'amount' | 'maxActivations' | 'currentActivations' | 'expiresAt';
  direction: 'asc' | 'desc';
}

// Check Activation Request
export interface CheckActivationRequest {
  checkId: string;
  password?: string;
  ipAddress?: string;
  userAgent?: string;
  location?: Partial<ActivationLocation>;
}

// Check Activation Result
export interface CheckActivationResult {
  success: boolean;
  amount?: number;
  message: string;
  reason?: 'invalid_check' | 'wrong_password' | 'max_activations' | 'conditions_not_met' | 'expired' | 'already_used' | 'insufficient_balance';
  check?: Check;
  activation?: CheckActivation;
}

// Check Statistics
export interface CheckStatistics {
  totalChecks: number;
  activeChecks: number;
  totalAmount: number;
  totalActivations: number;
  averageAmount: number;
  averageActivations: number;
  popularDesigns: DesignStats[];
  dailyStats: DailyCheckStats[];
  topCreators: CreatorStats[];
}

// Design Statistics
export interface DesignStats {
  emoji: string;
  color: string;
  count: number;
  totalAmount: number;
}

// Daily Check Statistics
export interface DailyCheckStats {
  date: string;
  checksCreated: number;
  activations: number;
  totalAmount: number;
  uniqueUsers: number;
}

// Creator Statistics
export interface CreatorStats {
  telegramId: number;
  username?: string;
  checksCreated: number;
  totalAmount: number;
  totalActivations: number;
  averageActivationsPerCheck: number;
}

// Check Validation
export interface CheckValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Bulk Check Creation
export interface BulkCheckCreation {
  checks: CreateCheckData[];
  totalAmount: number;
  estimatedCost: number;
}

// Check Template Data
export interface CheckTemplateData {
  name: string;
  description: string;
  design: CheckDesign;
  suggestedAmounts: number[];
  category: 'business' | 'personal' | 'event' | 'gaming' | 'education';
}

// Check Analytics
export interface CheckAnalytics {
  checkId: string;
  views: number;
  clicks: number;
  activations: number;
  conversionRate: number;
  averageActivationTime: number; // seconds from view to activation
  topCountries: CountryActivationStats[];
  hourlyDistribution: HourlyStats[];
}

// Country Activation Statistics
export interface CountryActivationStats {
  country: string;
  activations: number;
  totalAmount: number;
  percentage: number;
}

// Hourly Statistics
export interface HourlyStats {
  hour: number; // 0-23
  activations: number;
  amount: number;
}