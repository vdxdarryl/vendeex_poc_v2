/**
 * Avatar Types for VendeeX 2.0
 * AI Buying Avatar configuration and preferences
 * Aligned with VendeeX Avatar Technical Design Specification
 */

import type { MemberClassification } from './auth.types';

// ============================================================================
// ENUMS - Core Avatar Classification and Status Types
// ============================================================================

/**
 * Avatar Status - Current operational state of an avatar
 */
export enum AvatarStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  ARCHIVED = 'ARCHIVED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
}

/**
 * Authority Level - Defines what actions the avatar agent can take
 */
export enum AuthorityLevel {
  OBSERVATION = 'OBSERVATION',       // Agent can only watch and report
  NEGOTIATION = 'NEGOTIATION',       // Agent can negotiate but needs approval
  TRANSACTION = 'TRANSACTION',       // Agent can transact within limits
  FULL_AUTHORITY = 'FULL_AUTHORITY', // Agent has full autonomy
}

/**
 * Learning Stage - Current phase of avatar's learning lifecycle
 */
export enum LearningStage {
  ONBOARDING = 'ONBOARDING',
  EARLY_LEARNING = 'EARLY_LEARNING',
  MATURE_OPERATION = 'MATURE_OPERATION',
  ADAPTATION = 'ADAPTATION',
}

// ============================================================================
// PREFERENCE PROFILE - Five-Dimension Weight System
// ============================================================================

/**
 * Preference dimension weights that must sum to 1.0
 * These weights determine how the avatar prioritizes different factors
 */
export interface PreferenceWeights {
  /** Price sensitivity, budget consciousness */
  economic: number;
  /** Sustainability preferences, packaging concerns */
  environmental: number;
  /** Ethical sourcing, local business support */
  social: number;
  /** Delivery speed, scheduling flexibility */
  temporal: number;
  /** Product quality standards, brand preferences */
  quality: number;
}

/**
 * Full preference profile with weights and detailed settings
 */
export interface PreferenceProfile {
  weights: PreferenceWeights;
  economicDetails: EconomicPreferences;
  environmentalDetails: EnvironmentalPreferences;
  socialDetails: SocialPreferences;
  temporalDetails: TemporalPreferences;
  qualityDetails: QualityPreferences;
}

/**
 * Economic dimension preferences
 */
export interface EconomicPreferences {
  budgetRange: BudgetRange;
  priceAlertThreshold: number;
  preferDeals: boolean;
  maxPriceFlexibilityPercent: number;
  bulkBuyingEnabled: boolean;
}

/**
 * Environmental dimension preferences
 */
export interface EnvironmentalPreferences {
  preferEcoFriendly: boolean;
  minimalPackaging: boolean;
  carbonFootprintAware: boolean;
  preferRecyclableMaterials: boolean;
  sustainabilityCertifications: string[];
}

/**
 * Social dimension preferences
 */
export interface SocialPreferences {
  preferLocalBusiness: boolean;
  preferEthicalSourcing: boolean;
  preferFairTrade: boolean;
  supportSmallBusiness: boolean;
  avoidControversialBrands: boolean;
  preferredCertifications: string[];
}

/**
 * Temporal dimension preferences
 */
export interface TemporalPreferences {
  maxDeliveryDays: number;
  preferExpressShipping: boolean;
  flexibleScheduling: boolean;
  preferredDeliveryWindow: DeliveryWindow | null;
  urgencyLevel: UrgencyLevel;
}

/**
 * Quality dimension preferences
 */
export interface QualityPreferences {
  minimumRating: number;
  preferPremiumBrands: boolean;
  acceptRefurbished: boolean;
  warrantyRequired: boolean;
  preferredBrands: string[];
  excludedBrands: string[];
}

// ============================================================================
// AUTHORITY CONFIGURATION
// ============================================================================

/**
 * Authority configuration defining agent permissions and limits
 */
export interface AuthorityConfiguration {
  level: AuthorityLevel;
  transactionLimits: TransactionLimits;
  approvalRequired: ApprovalRequirements;
  allowedCategories: ProductCategory[];
  blockedVendors: string[];
  autoApproveBelow: number;
}

/**
 * Transaction limits for the avatar
 */
export interface TransactionLimits {
  singleTransactionMax: number;
  dailyLimit: number;
  weeklyLimit: number;
  monthlyLimit: number;
  currency: string;
}

/**
 * Approval requirements based on transaction characteristics
 */
export interface ApprovalRequirements {
  newVendorApproval: boolean;
  internationalPurchaseApproval: boolean;
  subscriptionApproval: boolean;
  categoryChangeApproval: boolean;
  aboveLimitApproval: boolean;
}

// ============================================================================
// LEARNING STATE
// ============================================================================

/**
 * Learning state tracking the avatar's knowledge evolution
 */
export interface LearningState {
  stage: LearningStage;
  confidenceScore: number;
  interactionsCount: number;
  successRate: number;
  lastAdaptation: Date;
  learningMetrics: LearningMetrics;
}

/**
 * Detailed learning metrics
 */
export interface LearningMetrics {
  totalSearches: number;
  totalPurchases: number;
  totalRecommendations: number;
  acceptedRecommendations: number;
  feedbackReceived: number;
  positiveOutcomes: number;
  preferencesAdjusted: number;
}

// ============================================================================
// AVATAR ENTITY - Main Avatar Interface
// ============================================================================

/**
 * Complete Avatar entity aligned with VendeeX Technical Design
 */
export interface Avatar {
  id: string;
  memberId: string;
  memberClassification: MemberClassification;
  name: string;
  status: AvatarStatus;

  // Core configuration
  preferenceProfile: PreferenceProfile;
  authorityConfig: AuthorityConfiguration;
  learningState: LearningState;

  // Personality and behavior
  personalityTraits: PersonalityTrait[];
  buyingStyle: BuyingStyle;
  communicationStyle: CommunicationStyle;

  // Legacy preferences (for backward compatibility)
  preferences: AvatarPreferences;

  // Notification settings
  notificationSettings: NotificationSettings;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt?: Date;
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

// Avatar personality traits
export type PersonalityTrait =
  | 'analytical'
  | 'adventurous'
  | 'budget-conscious'
  | 'quality-focused'
  | 'trend-aware'
  | 'eco-conscious'
  | 'brand-loyal'
  | 'deal-hunter';

// Shopping behavior style
export type BuyingStyle =
  | 'quick-decider'
  | 'researcher'
  | 'comparison-buyer'
  | 'impulse-buyer'
  | 'planner';

// Communication preference
export type CommunicationStyle =
  | 'concise'
  | 'detailed'
  | 'visual'
  | 'conversational';

// Urgency levels for temporal preferences
export type UrgencyLevel =
  | 'flexible'
  | 'normal'
  | 'priority'
  | 'urgent';

// Delivery time window
export interface DeliveryWindow {
  startTime: string; // HH:mm format
  endTime: string;
  preferredDays: DayOfWeek[];
}

export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

// Avatar preferences (legacy structure maintained for compatibility)
export interface AvatarPreferences {
  budgetRange: BudgetRange;
  preferredCategories: ProductCategory[];
  excludedCategories: ProductCategory[];
  preferredBrands: string[];
  excludedBrands: string[];
  qualityPreference: QualityPreferenceLevel;
  shippingPreference: ShippingPreference;
  sustainabilityPreference: SustainabilityPreference;
  notificationSettings: NotificationSettings;
}

// Budget range settings
export interface BudgetRange {
  min: number;
  max: number;
  currency: string;
  flexibilityPercent: number;
}

// Product categories
export type ProductCategory =
  | 'electronics'
  | 'fashion'
  | 'home-garden'
  | 'sports-outdoors'
  | 'beauty-health'
  | 'food-grocery'
  | 'toys-games'
  | 'automotive'
  | 'books-media'
  | 'office-supplies'
  | 'pet-supplies'
  | 'baby-kids';

// Quality preference level
export type QualityPreferenceLevel =
  | 'budget'
  | 'value'
  | 'premium'
  | 'luxury';

// Shipping preference
export interface ShippingPreference {
  preferFreeShipping: boolean;
  maxShippingCost: number;
  preferFastShipping: boolean;
  maxDeliveryDays: number;
}

// Sustainability preferences
export interface SustainabilityPreference {
  preferEcoFriendly: boolean;
  preferLocalProducts: boolean;
  preferEthicalBrands: boolean;
  carbonFootprintAware: boolean;
}

// Notification settings for avatar
export interface NotificationSettings {
  priceDropAlerts: boolean;
  dealAlerts: boolean;
  restockAlerts: boolean;
  recommendationDigest: boolean;
  digestFrequency: 'daily' | 'weekly' | 'monthly';
  emailNotifications: boolean;
  pushNotifications: boolean;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

// Avatar creation request
export interface CreateAvatarRequest {
  name: string;
  personalityTraits: PersonalityTrait[];
  buyingStyle: BuyingStyle;
  communicationStyle: CommunicationStyle;
  initialPreferences: Partial<AvatarPreferences>;
  initialWeights?: Partial<PreferenceWeights>;
  authorityLevel?: AuthorityLevel;
}

// Avatar update request
export interface UpdateAvatarRequest {
  name?: string;
  personalityTraits?: PersonalityTrait[];
  buyingStyle?: BuyingStyle;
  communicationStyle?: CommunicationStyle;
  preferences?: Partial<AvatarPreferences>;
  preferenceWeights?: Partial<PreferenceWeights>;
  authorityConfig?: Partial<AuthorityConfiguration>;
  status?: AvatarStatus;
}

// ============================================================================
// ONBOARDING TYPES
// ============================================================================

// Avatar onboarding step
export interface OnboardingStep {
  id: number;
  title: string;
  description: string;
  component: string;
  isCompleted: boolean;
  isActive: boolean;
  isSkippable: boolean;
}

// Avatar onboarding state
export interface OnboardingState {
  currentStep: number;
  totalSteps: number;
  steps: OnboardingStep[];
  avatarData: Partial<CreateAvatarRequest>;
  isComplete: boolean;
}

// Avatar limits based on member classification
export interface AvatarLimits {
  classification: MemberClassification;
  maxAvatars: number;
  canCustomizePersonality: boolean;
  canAccessAdvancedPreferences: boolean;
  learningDataRetention: number; // days
  maxAuthorityLevel: AuthorityLevel;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Validates that preference weights sum to 1.0
 */
export function validatePreferenceWeights(weights: PreferenceWeights): boolean {
  const sum = weights.economic + weights.environmental + weights.social + weights.temporal + weights.quality;
  return Math.abs(sum - 1.0) < 0.001; // Allow small floating point tolerance
}

/**
 * Creates default preference weights
 */
export function createDefaultPreferenceWeights(): PreferenceWeights {
  return {
    economic: 0.25,
    environmental: 0.15,
    social: 0.15,
    temporal: 0.20,
    quality: 0.25,
  };
}

/**
 * Creates default authority configuration
 */
export function createDefaultAuthorityConfig(): AuthorityConfiguration {
  return {
    level: AuthorityLevel.OBSERVATION,
    transactionLimits: {
      singleTransactionMax: 100,
      dailyLimit: 200,
      weeklyLimit: 500,
      monthlyLimit: 1000,
      currency: 'GBP',
    },
    approvalRequired: {
      newVendorApproval: true,
      internationalPurchaseApproval: true,
      subscriptionApproval: true,
      categoryChangeApproval: false,
      aboveLimitApproval: true,
    },
    allowedCategories: [],
    blockedVendors: [],
    autoApproveBelow: 25,
  };
}

/**
 * Creates default learning state
 */
export function createDefaultLearningState(): LearningState {
  return {
    stage: LearningStage.ONBOARDING,
    confidenceScore: 0,
    interactionsCount: 0,
    successRate: 0,
    lastAdaptation: new Date(),
    learningMetrics: {
      totalSearches: 0,
      totalPurchases: 0,
      totalRecommendations: 0,
      acceptedRecommendations: 0,
      feedbackReceived: 0,
      positiveOutcomes: 0,
      preferencesAdjusted: 0,
    },
  };
}
