/**
 * Avatar Service for VendeeX 2.0
 * Handles Avatar creation, configuration, and management
 *
 * This demo version uses localStorage for persistence
 */

import type {
  Avatar,
  CreateAvatarRequest,
  UpdateAvatarRequest,
  AvatarPreferences,
  AvatarStatus,
  PreferenceWeights,
  PreferenceProfile,
  AuthorityConfiguration,
  AuthorityLevel,
  LearningStage,
  LearningState,
  BudgetRange,
  TransactionLimits,
  validatePreferenceWeights,
} from '../types/avatar.types';
import { MemberClassification } from '../types/auth.types';
import { governanceService, AuditEventType, AuditActor } from './governanceService';

// localStorage keys
const AVATARS_STORAGE_KEY = 'vendeex_avatars';
const ACTIVE_AVATAR_KEY = 'vendeex_active_avatar_id';

// Default preference weights by member classification
const DEFAULT_WEIGHTS_BY_CLASSIFICATION: Record<MemberClassification, PreferenceWeights> = {
  [MemberClassification.PERSONAL_SHOPPER]: {
    economic: 0.25,
    environmental: 0.15,
    social: 0.15,
    temporal: 0.20,
    quality: 0.25,
  },
  [MemberClassification.BUSINESS_ENTITY]: {
    economic: 0.35,
    environmental: 0.10,
    social: 0.10,
    temporal: 0.25,
    quality: 0.20,
  },
  [MemberClassification.COMMUNITY_GROUP]: {
    economic: 0.30,
    environmental: 0.20,
    social: 0.25,
    temporal: 0.10,
    quality: 0.15,
  },
  [MemberClassification.GOVERNMENT_AGENCY]: {
    economic: 0.25,
    environmental: 0.20,
    social: 0.25,
    temporal: 0.15,
    quality: 0.15,
  },
  [MemberClassification.BUYING_AGGREGATOR]: {
    economic: 0.40,
    environmental: 0.10,
    social: 0.10,
    temporal: 0.20,
    quality: 0.20,
  },
};

interface AvatarListResponse {
  avatars: Avatar[];
  total: number;
  limit: number;
  offset: number;
}

interface AvatarSearchRequest {
  query: string;
  avatarId?: string;
}

interface AvatarSearchResponse {
  sessionId: string;
  query: string;
  status: 'processing' | 'complete' | 'error';
}

// Avatar creation parameters for the new onboarding flow
export interface CreateAvatarParams {
  memberId: string;
  memberClassification: MemberClassification;
  name: string;
  preferenceWeights?: PreferenceWeights;
  budgetSettings?: {
    currency: string;
    minPrice: number;
    maxPrice: number;
    monthlyBudget?: number;
  };
  authorityLevel?: AuthorityLevel;
  personalityTraits?: string[];
  shoppingStyle?: string;
  communicationStyle?: string;
}

// Generate UUID
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Get avatars from localStorage
function getStoredAvatars(): Avatar[] {
  try {
    const stored = localStorage.getItem(AVATARS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Convert date strings back to Date objects
      return parsed.map((avatar: any) => ({
        ...avatar,
        createdAt: new Date(avatar.createdAt),
        updatedAt: new Date(avatar.updatedAt),
        lastActiveAt: avatar.lastActiveAt ? new Date(avatar.lastActiveAt) : undefined,
        learningState: {
          ...avatar.learningState,
          lastAdaptation: new Date(avatar.learningState.lastAdaptation),
        },
      }));
    }
  } catch (error) {
    console.error('Error reading avatars from localStorage:', error);
  }
  return [];
}

// Save avatars to localStorage
function saveAvatars(avatars: Avatar[]): void {
  try {
    localStorage.setItem(AVATARS_STORAGE_KEY, JSON.stringify(avatars));
  } catch (error) {
    console.error('Error saving avatars to localStorage:', error);
  }
}

class AvatarService {
  /**
   * Get default preference weights for a member classification
   */
  getDefaultWeightsForClassification(classification: MemberClassification): PreferenceWeights {
    return { ...DEFAULT_WEIGHTS_BY_CLASSIFICATION[classification] };
  }

  /**
   * Create a new Avatar with classification-based defaults
   */
  async createAvatar(params: CreateAvatarParams): Promise<Avatar> {
    const avatarId = generateUUID();
    const now = new Date();

    // Get default weights for the member classification
    const defaultWeights = this.getDefaultWeightsForClassification(params.memberClassification);
    const weights = params.preferenceWeights || defaultWeights;

    // Validate that weights sum to 1.0
    if (!validatePreferenceWeights(weights)) {
      throw new Error('Preference weights must sum to 1.0');
    }

    // Create default budget range
    const budgetRange: BudgetRange = {
      currency: params.budgetSettings?.currency || 'GBP',
      min: params.budgetSettings?.minPrice || 0,
      max: params.budgetSettings?.maxPrice || 500,
      flexibilityPercent: 10,
    };

    // Create default transaction limits based on authority level
    const authorityLevel = params.authorityLevel || AuthorityLevel.NEGOTIATION;
    const transactionLimits: TransactionLimits = this.getTransactionLimitsForAuthority(
      authorityLevel,
      budgetRange.currency
    );

    // Create authority configuration
    const authorityConfig: AuthorityConfiguration = {
      level: authorityLevel,
      transactionLimits,
      approvalRequired: {
        newVendorApproval: authorityLevel !== AuthorityLevel.FULL_AUTHORITY,
        internationalPurchaseApproval: authorityLevel !== AuthorityLevel.FULL_AUTHORITY,
        subscriptionApproval: true,
        categoryChangeApproval: false,
        aboveLimitApproval: true,
      },
      allowedCategories: [],
      blockedVendors: [],
      autoApproveBelow: authorityLevel === AuthorityLevel.TRANSACTION ? 50 : 0,
    };

    // Create learning state in ONBOARDING stage
    const learningState: LearningState = {
      stage: LearningStage.ONBOARDING,
      confidenceScore: 0,
      interactionsCount: 0,
      successRate: 0,
      lastAdaptation: now,
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

    // Create preference profile
    const preferenceProfile: PreferenceProfile = {
      weights,
      economicDetails: {
        budgetRange,
        priceAlertThreshold: budgetRange.max * 0.8,
        preferDeals: true,
        maxPriceFlexibilityPercent: 10,
        bulkBuyingEnabled: params.memberClassification !== MemberClassification.PERSONAL_SHOPPER,
      },
      environmentalDetails: {
        preferEcoFriendly: weights.environmental >= 0.15,
        minimalPackaging: weights.environmental >= 0.20,
        carbonFootprintAware: weights.environmental >= 0.15,
        preferRecyclableMaterials: weights.environmental >= 0.15,
        sustainabilityCertifications: [],
      },
      socialDetails: {
        preferLocalBusiness: weights.social >= 0.20,
        preferEthicalSourcing: weights.social >= 0.15,
        preferFairTrade: weights.social >= 0.20,
        supportSmallBusiness: weights.social >= 0.15,
        avoidControversialBrands: true,
        preferredCertifications: [],
      },
      temporalDetails: {
        maxDeliveryDays: weights.temporal >= 0.25 ? 3 : weights.temporal >= 0.15 ? 7 : 14,
        preferExpressShipping: weights.temporal >= 0.20,
        flexibleScheduling: weights.temporal < 0.15,
        preferredDeliveryWindow: null,
        urgencyLevel: weights.temporal >= 0.25 ? 'priority' : 'normal',
      },
      qualityDetails: {
        minimumRating: weights.quality >= 0.25 ? 4.0 : 3.5,
        preferPremiumBrands: weights.quality >= 0.25,
        acceptRefurbished: weights.economic >= 0.30 && weights.quality < 0.20,
        warrantyRequired: weights.quality >= 0.20,
        preferredBrands: [],
        excludedBrands: [],
      },
    };

    // Create legacy preferences for backward compatibility
    const preferences: AvatarPreferences = {
      budgetRange,
      preferredCategories: [],
      excludedCategories: [],
      preferredBrands: [],
      excludedBrands: [],
      qualityPreference: weights.quality >= 0.25 ? 'premium' : weights.quality >= 0.20 ? 'value' : 'budget',
      shippingPreference: {
        preferFreeShipping: weights.economic >= 0.25,
        maxShippingCost: weights.economic >= 0.30 ? 5 : 10,
        preferFastShipping: weights.temporal >= 0.20,
        maxDeliveryDays: weights.temporal >= 0.25 ? 3 : 7,
      },
      sustainabilityPreference: {
        preferEcoFriendly: weights.environmental >= 0.15,
        preferLocalProducts: weights.social >= 0.20,
        preferEthicalBrands: weights.social >= 0.15,
        carbonFootprintAware: weights.environmental >= 0.15,
      },
      notificationSettings: {
        priceDropAlerts: true,
        dealAlerts: true,
        restockAlerts: false,
        recommendationDigest: true,
        digestFrequency: 'weekly',
        emailNotifications: true,
        pushNotifications: false,
      },
    };

    // Create the avatar
    const avatar: Avatar = {
      id: avatarId,
      memberId: params.memberId,
      memberClassification: params.memberClassification,
      name: params.name,
      status: AvatarStatus.PENDING_VERIFICATION,
      preferenceProfile,
      authorityConfig,
      learningState,
      personalityTraits: (params.personalityTraits || []) as any,
      shoppingStyle: (params.shoppingStyle || 'researcher') as any,
      communicationStyle: (params.communicationStyle || 'detailed') as any,
      preferences,
      notificationSettings: preferences.notificationSettings,
      createdAt: now,
      updatedAt: now,
    };

    // Save to localStorage
    const avatars = getStoredAvatars();
    avatars.push(avatar);
    saveAvatars(avatars);

    // Set as active avatar
    localStorage.setItem(ACTIVE_AVATAR_KEY, avatarId);

    // Record audit event for Avatar creation
    governanceService.recordAuditEvent({
      event_type: AuditEventType.AVATAR_CREATED,
      avatar_id: avatarId,
      details: {
        name: params.name,
        memberClassification: params.memberClassification,
        authorityLevel: authorityLevel,
        preferenceWeights: weights,
      },
      actor: AuditActor.USER,
    });

    return avatar;
  }

  /**
   * Get transaction limits based on authority level
   */
  private getTransactionLimitsForAuthority(level: AuthorityLevel, currency: string): TransactionLimits {
    switch (level) {
      case AuthorityLevel.OBSERVATION:
        return {
          singleTransactionMax: 0,
          dailyLimit: 0,
          weeklyLimit: 0,
          monthlyLimit: 0,
          currency,
        };
      case AuthorityLevel.NEGOTIATION:
        return {
          singleTransactionMax: 100,
          dailyLimit: 200,
          weeklyLimit: 500,
          monthlyLimit: 1000,
          currency,
        };
      case AuthorityLevel.TRANSACTION:
        return {
          singleTransactionMax: 250,
          dailyLimit: 500,
          weeklyLimit: 1500,
          monthlyLimit: 3000,
          currency,
        };
      case AuthorityLevel.FULL_AUTHORITY:
        return {
          singleTransactionMax: 1000,
          dailyLimit: 2000,
          weeklyLimit: 5000,
          monthlyLimit: 10000,
          currency,
        };
    }
  }

  /**
   * Update preference weights (must sum to 1.0)
   */
  async updatePreferences(
    avatarId: string,
    preferences: Partial<AvatarPreferences> & { weights?: PreferenceWeights }
  ): Promise<AvatarPreferences> {
    const avatars = getStoredAvatars();
    const avatarIndex = avatars.findIndex(a => a.id === avatarId);

    if (avatarIndex === -1) {
      throw new Error('Avatar not found');
    }

    const avatar = avatars[avatarIndex];

    // Validate weights if provided
    if (preferences.weights) {
      if (!validatePreferenceWeights(preferences.weights)) {
        throw new Error('Preference weights must sum to 1.0');
      }
      avatar.preferenceProfile.weights = preferences.weights;
    }

    // Update legacy preferences
    avatar.preferences = {
      ...avatar.preferences,
      ...preferences,
    };

    avatar.updatedAt = new Date();
    saveAvatars(avatars);

    // Record audit event for preference update
    governanceService.recordAuditEvent({
      event_type: AuditEventType.PREFERENCE_UPDATED,
      avatar_id: avatarId,
      details: {
        updatedFields: Object.keys(preferences),
        weightsChanged: !!preferences.weights,
        newWeights: preferences.weights || null,
      },
      actor: AuditActor.USER,
    });

    return avatar.preferences;
  }

  /**
   * Update authority configuration
   */
  async updateAuthorityConfig(
    avatarId: string,
    config: Partial<AuthorityConfiguration>
  ): Promise<AuthorityConfiguration> {
    const avatars = getStoredAvatars();
    const avatarIndex = avatars.findIndex(a => a.id === avatarId);

    if (avatarIndex === -1) {
      throw new Error('Avatar not found');
    }

    const avatar = avatars[avatarIndex];

    // If authority level changes, update transaction limits
    if (config.level && config.level !== avatar.authorityConfig.level) {
      const currency = avatar.authorityConfig.transactionLimits.currency;
      config.transactionLimits = this.getTransactionLimitsForAuthority(config.level, currency);
    }

    const previousLevel = avatar.authorityConfig.level;

    avatar.authorityConfig = {
      ...avatar.authorityConfig,
      ...config,
    };

    avatar.updatedAt = new Date();
    saveAvatars(avatars);

    // Record audit event for authority change
    governanceService.recordAuditEvent({
      event_type: AuditEventType.AUTHORITY_CHANGED,
      avatar_id: avatarId,
      details: {
        previousLevel,
        newLevel: avatar.authorityConfig.level,
        updatedFields: Object.keys(config),
        transactionLimits: avatar.authorityConfig.transactionLimits,
      },
      actor: AuditActor.USER,
    });

    return avatar.authorityConfig;
  }

  /**
   * List all avatars for the current member
   */
  async listAvatars(
    limit: number = 10,
    offset: number = 0
  ): Promise<AvatarListResponse> {
    const avatars = getStoredAvatars();
    const paginatedAvatars = avatars.slice(offset, offset + limit);

    return {
      avatars: paginatedAvatars,
      total: avatars.length,
      limit,
      offset,
    };
  }

  /**
   * Get avatar by ID
   */
  async getAvatar(id: string): Promise<Avatar> {
    const avatars = getStoredAvatars();
    const avatar = avatars.find(a => a.id === id);

    if (!avatar) {
      throw new Error('Avatar not found');
    }

    return avatar;
  }

  /**
   * Update avatar
   */
  async updateAvatar(id: string, data: UpdateAvatarRequest): Promise<Avatar> {
    const avatars = getStoredAvatars();
    const avatarIndex = avatars.findIndex(a => a.id === id);

    if (avatarIndex === -1) {
      throw new Error('Avatar not found');
    }

    const avatar = avatars[avatarIndex];

    // Update fields
    if (data.name) avatar.name = data.name;
    if (data.personalityTraits) avatar.personalityTraits = data.personalityTraits;
    if (data.shoppingStyle) avatar.shoppingStyle = data.shoppingStyle;
    if (data.communicationStyle) avatar.communicationStyle = data.communicationStyle;
    if (data.preferences) avatar.preferences = { ...avatar.preferences, ...data.preferences };
    if (data.preferenceWeights) avatar.preferenceProfile.weights = data.preferenceWeights;
    if (data.authorityConfig) avatar.authorityConfig = { ...avatar.authorityConfig, ...data.authorityConfig };
    if (data.status) avatar.status = data.status;

    avatar.updatedAt = new Date();
    saveAvatars(avatars);

    return avatar;
  }

  /**
   * Delete avatar
   */
  async deleteAvatar(id: string): Promise<void> {
    const avatars = getStoredAvatars();
    const filteredAvatars = avatars.filter(a => a.id !== id);

    if (filteredAvatars.length === avatars.length) {
      throw new Error('Avatar not found');
    }

    saveAvatars(filteredAvatars);

    // Clear active avatar if it was deleted
    if (localStorage.getItem(ACTIVE_AVATAR_KEY) === id) {
      localStorage.removeItem(ACTIVE_AVATAR_KEY);
    }
  }

  /**
   * Get preferences for avatar
   */
  async getPreferences(id: string): Promise<AvatarPreferences> {
    const avatar = await this.getAvatar(id);
    return avatar.preferences;
  }

  /**
   * Reset learning data
   */
  async resetLearningData(id: string): Promise<void> {
    const avatars = getStoredAvatars();
    const avatarIndex = avatars.findIndex(a => a.id === id);

    if (avatarIndex === -1) {
      throw new Error('Avatar not found');
    }

    avatars[avatarIndex].learningState = {
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

    avatars[avatarIndex].updatedAt = new Date();
    saveAvatars(avatars);
  }

  /**
   * Set avatar status
   */
  async setStatus(id: string, status: AvatarStatus): Promise<Avatar> {
    return this.updateAvatar(id, { status });
  }

  /**
   * Activate avatar
   */
  async activateAvatar(id: string): Promise<Avatar> {
    return this.updateAvatar(id, { status: AvatarStatus.ACTIVE });
  }

  /**
   * Deactivate avatar
   */
  async deactivateAvatar(id: string): Promise<Avatar> {
    return this.updateAvatar(id, { status: AvatarStatus.SUSPENDED });
  }

  /**
   * Mark onboarding as completed for an avatar
   */
  async completeOnboarding(id: string): Promise<Avatar> {
    const avatar = await this.updateAvatar(id, { status: AvatarStatus.ACTIVE });

    // Record audit event for onboarding completion
    governanceService.recordAuditEvent({
      event_type: AuditEventType.ONBOARDING_COMPLETED,
      avatar_id: id,
      details: {
        completedAt: new Date().toISOString(),
        finalStatus: AvatarStatus.ACTIVE,
        preferenceWeights: avatar.preferenceProfile.weights,
        authorityLevel: avatar.authorityConfig.level,
      },
      actor: AuditActor.SYSTEM,
    });

    return avatar;
  }

  /**
   * Initiate search (demo stub)
   */
  async initiateSearch(request: AvatarSearchRequest): Promise<AvatarSearchResponse> {
    return {
      sessionId: generateUUID(),
      query: request.query,
      status: 'processing',
    };
  }

  /**
   * Get suggested traits based on member (demo stub)
   */
  async getSuggestedTraits(memberId: string): Promise<{
    suggestedTraits: string[];
    suggestedStyle: string;
    suggestedCategories: string[];
  }> {
    return {
      suggestedTraits: ['analytical', 'budget-conscious', 'quality-focused'],
      suggestedStyle: 'researcher',
      suggestedCategories: ['electronics', 'home-garden'],
    };
  }

  /**
   * Clone avatar
   */
  async cloneAvatar(id: string, newName: string): Promise<Avatar> {
    const original = await this.getAvatar(id);
    const avatars = getStoredAvatars();

    const cloned: Avatar = {
      ...original,
      id: generateUUID(),
      name: newName,
      createdAt: new Date(),
      updatedAt: new Date(),
      learningState: {
        ...original.learningState,
        stage: LearningStage.ONBOARDING,
        confidenceScore: 0,
        interactionsCount: 0,
        lastAdaptation: new Date(),
      },
    };

    avatars.push(cloned);
    saveAvatars(avatars);

    return cloned;
  }

  /**
   * Export configuration
   */
  async exportConfiguration(id: string): Promise<{
    version: string;
    exportedAt: Date;
    configuration: CreateAvatarRequest & { preferences: AvatarPreferences };
  }> {
    const avatar = await this.getAvatar(id);

    return {
      version: '2.0.0',
      exportedAt: new Date(),
      configuration: {
        name: avatar.name,
        personalityTraits: avatar.personalityTraits,
        shoppingStyle: avatar.shoppingStyle,
        communicationStyle: avatar.communicationStyle,
        initialPreferences: avatar.preferences,
        initialWeights: avatar.preferenceProfile.weights,
        authorityLevel: avatar.authorityConfig.level,
        preferences: avatar.preferences,
      },
    };
  }

  /**
   * Import configuration
   */
  async importConfiguration(
    configuration: CreateAvatarRequest & { preferences?: Partial<AvatarPreferences> }
  ): Promise<Avatar> {
    // For demo, create a new avatar with the imported configuration
    const memberId = localStorage.getItem('vendeex_member')
      ? JSON.parse(localStorage.getItem('vendeex_member')!).id
      : 'demo-member';

    const member = localStorage.getItem('vendeex_member')
      ? JSON.parse(localStorage.getItem('vendeex_member')!)
      : { classification: MemberClassification.PERSONAL_SHOPPER };

    return this.createAvatar({
      memberId,
      memberClassification: member.classification,
      name: configuration.name,
      preferenceWeights: configuration.initialWeights as PreferenceWeights,
      authorityLevel: configuration.authorityLevel,
      personalityTraits: configuration.personalityTraits,
      shoppingStyle: configuration.shoppingStyle,
      communicationStyle: configuration.communicationStyle,
    });
  }

  /**
   * Get activity history (demo stub)
   */
  async getActivityHistory(
    id: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{
    activities: Array<{
      id: string;
      type: 'search' | 'purchase' | 'save' | 'feedback';
      timestamp: Date;
      details: Record<string, unknown>;
    }>;
    total: number;
  }> {
    return {
      activities: [],
      total: 0,
    };
  }

  /**
   * Submit feedback (demo stub)
   */
  async submitFeedback(
    id: string,
    feedback: {
      productId: string;
      rating: 1 | 2 | 3 | 4 | 5;
      helpful: boolean;
      comment?: string;
    }
  ): Promise<void> {
    const avatars = getStoredAvatars();
    const avatarIndex = avatars.findIndex(a => a.id === id);

    if (avatarIndex !== -1) {
      avatars[avatarIndex].learningState.learningMetrics.feedbackReceived += 1;
      if (feedback.rating >= 4) {
        avatars[avatarIndex].learningState.learningMetrics.positiveOutcomes += 1;
      }
      saveAvatars(avatars);
    }
  }

  /**
   * Convert ranking to weights
   * Takes a ranking of dimensions (1 = most important, 5 = least important)
   * and converts to weights that sum to 1.0
   */
  rankingToWeights(ranking: Record<keyof PreferenceWeights, number>): PreferenceWeights {
    // Invert rankings so highest rank (1) gets highest weight
    const dimensions = ['economic', 'environmental', 'social', 'temporal', 'quality'] as const;
    const invertedRanks: Record<string, number> = {};
    let total = 0;

    for (const dim of dimensions) {
      // Convert rank 1-5 to weight factor (5 for rank 1, 1 for rank 5)
      invertedRanks[dim] = 6 - ranking[dim];
      total += invertedRanks[dim];
    }

    // Normalize to sum to 1.0
    const weights: PreferenceWeights = {
      economic: Math.round((invertedRanks.economic / total) * 100) / 100,
      environmental: Math.round((invertedRanks.environmental / total) * 100) / 100,
      social: Math.round((invertedRanks.social / total) * 100) / 100,
      temporal: Math.round((invertedRanks.temporal / total) * 100) / 100,
      quality: 0, // Calculate last to ensure sum is exactly 1.0
    };

    // Adjust quality to make sum exactly 1.0
    weights.quality = Math.round((1 - weights.economic - weights.environmental - weights.social - weights.temporal) * 100) / 100;

    return weights;
  }

  /**
   * Clear all avatars (for testing)
   */
  clearAllAvatars(): void {
    localStorage.removeItem(AVATARS_STORAGE_KEY);
    localStorage.removeItem(ACTIVE_AVATAR_KEY);
  }
}

// Singleton instance
export const avatarService = new AvatarService();

export default avatarService;
