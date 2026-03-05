/**
 * useAvatar Hook for VendeeX 2.0
 * Provides Avatar state and methods to components
 */

import { useContext, useCallback, useMemo } from 'react';
import { AvatarContext } from '../context/AvatarContext';
import type {
  Avatar,
  CreateAvatarRequest,
  UpdateAvatarRequest,
  AvatarPreferences,
  AuthorityConfiguration,
} from '../types/avatar.types';
import type { CreateAvatarParams } from '../services/avatarService';

// Simple error type for demo
interface AvatarError {
  code: string;
  message: string;
  status?: number;
}

export interface UseAvatarReturn {
  // State
  avatars: Avatar[];
  activeAvatar: Avatar | null;
  isLoading: boolean;
  error: AvatarError | null;
  needsOnboarding: boolean;

  // Avatar CRUD
  createAvatar: (data: CreateAvatarRequest) => Promise<Avatar>;
  createAvatarWithParams: (params: CreateAvatarParams) => Promise<Avatar>;
  updateAvatar: (id: string, data: UpdateAvatarRequest) => Promise<Avatar>;
  deleteAvatar: (id: string) => Promise<void>;
  refreshAvatars: () => Promise<void>;

  // Active avatar management
  setActiveAvatar: (id: string) => void;
  activateAvatar: (id: string) => Promise<Avatar>;
  deactivateAvatar: (id: string) => Promise<Avatar>;

  // Preferences & Authority
  updatePreferences: (id: string, preferences: Partial<AvatarPreferences>) => Promise<AvatarPreferences>;
  updateAuthorityConfig: (id: string, config: Partial<AuthorityConfiguration>) => Promise<AuthorityConfiguration>;

  // Learning data
  resetLearningData: (id: string) => Promise<void>;

  // Onboarding
  setNeedsOnboarding: (needs: boolean) => void;

  // Utility
  clearError: () => void;
  getAvatarById: (id: string) => Avatar | undefined;
}

export function useAvatar(): UseAvatarReturn {
  const context = useContext(AvatarContext);

  if (!context) {
    throw new Error('useAvatar must be used within an AvatarProvider');
  }

  const {
    state,
    createAvatar: contextCreate,
    createAvatarWithParams: contextCreateWithParams,
    updateAvatar: contextUpdate,
    deleteAvatar: contextDelete,
    refreshAvatars: contextRefresh,
    setActiveAvatar: contextSetActive,
    activateAvatar: contextActivate,
    deactivateAvatar: contextDeactivate,
    updatePreferences: contextUpdatePreferences,
    updateAuthorityConfig: contextUpdateAuthorityConfig,
    resetLearningData: contextResetLearning,
    setNeedsOnboarding: contextSetNeedsOnboarding,
    clearError: contextClearError,
  } = context;

  const createAvatar = useCallback(
    async (data: CreateAvatarRequest): Promise<Avatar> => {
      return contextCreate(data);
    },
    [contextCreate]
  );

  const createAvatarWithParams = useCallback(
    async (params: CreateAvatarParams): Promise<Avatar> => {
      return contextCreateWithParams(params);
    },
    [contextCreateWithParams]
  );

  const updateAvatar = useCallback(
    async (id: string, data: UpdateAvatarRequest): Promise<Avatar> => {
      return contextUpdate(id, data);
    },
    [contextUpdate]
  );

  const deleteAvatar = useCallback(
    async (id: string): Promise<void> => {
      await contextDelete(id);
    },
    [contextDelete]
  );

  const refreshAvatars = useCallback(async (): Promise<void> => {
    await contextRefresh();
  }, [contextRefresh]);

  const setActiveAvatar = useCallback(
    (id: string): void => {
      contextSetActive(id);
    },
    [contextSetActive]
  );

  const activateAvatar = useCallback(
    async (id: string): Promise<Avatar> => {
      return contextActivate(id);
    },
    [contextActivate]
  );

  const deactivateAvatar = useCallback(
    async (id: string): Promise<Avatar> => {
      return contextDeactivate(id);
    },
    [contextDeactivate]
  );

  const updatePreferences = useCallback(
    async (id: string, preferences: Partial<AvatarPreferences>): Promise<AvatarPreferences> => {
      return contextUpdatePreferences(id, preferences);
    },
    [contextUpdatePreferences]
  );

  const updateAuthorityConfig = useCallback(
    async (id: string, config: Partial<AuthorityConfiguration>): Promise<AuthorityConfiguration> => {
      return contextUpdateAuthorityConfig(id, config);
    },
    [contextUpdateAuthorityConfig]
  );

  const resetLearningData = useCallback(
    async (id: string): Promise<void> => {
      await contextResetLearning(id);
    },
    [contextResetLearning]
  );

  const setNeedsOnboarding = useCallback((needs: boolean): void => {
    contextSetNeedsOnboarding(needs);
  }, [contextSetNeedsOnboarding]);

  const clearError = useCallback((): void => {
    contextClearError();
  }, [contextClearError]);

  const getAvatarById = useCallback(
    (id: string): Avatar | undefined => {
      return state.avatars.find((avatar) => avatar.id === id);
    },
    [state.avatars]
  );

  return {
    // State
    avatars: state.avatars,
    activeAvatar: state.activeAvatar,
    isLoading: state.isLoading,
    error: state.error,
    needsOnboarding: state.needsOnboarding,

    // Avatar CRUD
    createAvatar,
    createAvatarWithParams,
    updateAvatar,
    deleteAvatar,
    refreshAvatars,

    // Active avatar management
    setActiveAvatar,
    activateAvatar,
    deactivateAvatar,

    // Preferences & Authority
    updatePreferences,
    updateAuthorityConfig,

    // Learning data
    resetLearningData,

    // Onboarding
    setNeedsOnboarding,

    // Utility
    clearError,
    getAvatarById,
  };
}

// Utility hook for avatar statistics
export function useAvatarStats(avatarId?: string) {
  const { avatars, activeAvatar } = useAvatar();

  const avatar = useMemo(() => {
    if (avatarId) {
      return avatars.find((a) => a.id === avatarId);
    }
    return activeAvatar;
  }, [avatars, activeAvatar, avatarId]);

  return useMemo(() => {
    if (!avatar?.learningState) {
      return {
        totalSearches: 0,
        totalPurchases: 0,
        averageOrderValue: 0,
        feedbackScore: 0,
        topCategories: [],
        topBrands: [],
      };
    }

    const { learningMetrics } = avatar.learningState;

    return {
      totalSearches: learningMetrics.totalSearches,
      totalPurchases: learningMetrics.totalPurchases,
      averageOrderValue: 0, // Not tracked in current schema
      feedbackScore: learningMetrics.positiveOutcomes / Math.max(learningMetrics.feedbackReceived, 1),
      topCategories: [], // Not tracked in current schema
      topBrands: [], // Not tracked in current schema
    };
  }, [avatar]);
}

// Utility hook for checking avatar limits
export function useAvatarLimits() {
  const { avatars } = useAvatar();

  // These would typically come from the auth context based on member classification
  const limits = useMemo(() => {
    // Default limits for demo - would be fetched from member classification
    return {
      maxAvatars: 3,
      currentCount: avatars.length,
      canCreate: avatars.length < 3,
      remainingSlots: Math.max(0, 3 - avatars.length),
    };
  }, [avatars.length]);

  return limits;
}

export default useAvatar;
