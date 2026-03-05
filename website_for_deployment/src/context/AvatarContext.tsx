/**
 * AvatarContext for VendeeX 2.0
 * Provides Avatar state management across the application
 * Updated for localStorage-based demo mode
 */

import React, {
  createContext,
  useReducer,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { avatarService, type CreateAvatarParams } from '../services/avatarService';
import { useAuth } from '../hooks/useAuth';
import type {
  Avatar,
  CreateAvatarRequest,
  UpdateAvatarRequest,
  AvatarPreferences,
  AuthorityConfiguration,
} from '../types/avatar.types';

// Simple error type for demo
interface AvatarError {
  code: string;
  message: string;
  status?: number;
}

// State type
interface AvatarState {
  avatars: Avatar[];
  activeAvatar: Avatar | null;
  isLoading: boolean;
  error: AvatarError | null;
  needsOnboarding: boolean;
}

// Action types
type AvatarAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: Avatar[] }
  | { type: 'FETCH_FAILURE'; payload: AvatarError }
  | { type: 'CREATE_SUCCESS'; payload: Avatar }
  | { type: 'UPDATE_SUCCESS'; payload: Avatar }
  | { type: 'DELETE_SUCCESS'; payload: string }
  | { type: 'SET_ACTIVE'; payload: Avatar | null }
  | { type: 'SET_NEEDS_ONBOARDING'; payload: boolean }
  | { type: 'CLEAR_ERROR' }
  | { type: 'RESET' };

// Initial state
const initialState: AvatarState = {
  avatars: [],
  activeAvatar: null,
  isLoading: false,
  error: null,
  needsOnboarding: false,
};

// Active avatar storage key
const ACTIVE_AVATAR_KEY = 'vendeex_active_avatar_id';

// Reducer
function avatarReducer(state: AvatarState, action: AvatarAction): AvatarState {
  switch (action.type) {
    case 'FETCH_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      };

    case 'FETCH_SUCCESS':
      return {
        ...state,
        isLoading: false,
        avatars: action.payload,
        error: null,
      };

    case 'FETCH_FAILURE':
      return {
        ...state,
        isLoading: false,
        error: action.payload,
      };

    case 'CREATE_SUCCESS':
      return {
        ...state,
        isLoading: false,
        avatars: [...state.avatars, action.payload],
        activeAvatar: state.activeAvatar || action.payload,
        error: null,
      };

    case 'UPDATE_SUCCESS':
      return {
        ...state,
        isLoading: false,
        avatars: state.avatars.map((a) =>
          a.id === action.payload.id ? action.payload : a
        ),
        activeAvatar:
          state.activeAvatar?.id === action.payload.id
            ? action.payload
            : state.activeAvatar,
        error: null,
      };

    case 'DELETE_SUCCESS':
      const filteredAvatars = state.avatars.filter((a) => a.id !== action.payload);
      return {
        ...state,
        isLoading: false,
        avatars: filteredAvatars,
        activeAvatar:
          state.activeAvatar?.id === action.payload
            ? filteredAvatars[0] || null
            : state.activeAvatar,
        error: null,
      };

    case 'SET_ACTIVE':
      return {
        ...state,
        activeAvatar: action.payload,
      };

    case 'SET_NEEDS_ONBOARDING':
      return {
        ...state,
        needsOnboarding: action.payload,
      };

    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// Context type
export interface AvatarContextType {
  state: AvatarState;
  createAvatar: (data: CreateAvatarRequest) => Promise<Avatar>;
  createAvatarWithParams: (params: CreateAvatarParams) => Promise<Avatar>;
  updateAvatar: (id: string, data: UpdateAvatarRequest) => Promise<Avatar>;
  deleteAvatar: (id: string) => Promise<void>;
  refreshAvatars: () => Promise<void>;
  setActiveAvatar: (id: string) => void;
  activateAvatar: (id: string) => Promise<Avatar>;
  deactivateAvatar: (id: string) => Promise<Avatar>;
  updatePreferences: (id: string, preferences: Partial<AvatarPreferences>) => Promise<AvatarPreferences>;
  updateAuthorityConfig: (id: string, config: Partial<AuthorityConfiguration>) => Promise<AuthorityConfiguration>;
  resetLearningData: (id: string) => Promise<void>;
  setNeedsOnboarding: (needs: boolean) => void;
  clearError: () => void;
}

// Create context
export const AvatarContext = createContext<AvatarContextType | null>(null);

// Provider props
interface AvatarProviderProps {
  children: ReactNode;
}

// Provider component
export function AvatarProvider({ children }: AvatarProviderProps) {
  const [state, dispatch] = useReducer(avatarReducer, initialState);
  const { isAuthenticated, member } = useAuth();

  // Fetch avatars when user is authenticated
  useEffect(() => {
    if (isAuthenticated && member) {
      fetchAvatars().then(() => {
        // Check if user needs onboarding (no avatars)
        const avatars = avatarService.listAvatars().then(response => {
          if (response.avatars.length === 0) {
            dispatch({ type: 'SET_NEEDS_ONBOARDING', payload: true });
          }
        });
      });
    } else {
      dispatch({ type: 'RESET' });
    }
  }, [isAuthenticated, member?.id]);

  // Restore active avatar from storage
  useEffect(() => {
    if (state.avatars.length > 0 && !state.activeAvatar) {
      const storedActiveId = localStorage.getItem(ACTIVE_AVATAR_KEY);
      const activeAvatar = storedActiveId
        ? state.avatars.find((a) => a.id === storedActiveId)
        : state.avatars[0];

      if (activeAvatar) {
        dispatch({ type: 'SET_ACTIVE', payload: activeAvatar });
      }
    }
  }, [state.avatars, state.activeAvatar]);

  const fetchAvatars = async () => {
    dispatch({ type: 'FETCH_START' });

    try {
      const response = await avatarService.listAvatars();
      dispatch({ type: 'FETCH_SUCCESS', payload: response.avatars });
    } catch (error: any) {
      dispatch({
        type: 'FETCH_FAILURE',
        payload: {
          code: error.code || 'FETCH_ERROR',
          message: error.message || 'Failed to fetch avatars',
          status: error.status || 500,
        },
      });
    }
  };

  const createAvatar = useCallback(async (data: CreateAvatarRequest): Promise<Avatar> => {
    dispatch({ type: 'FETCH_START' });

    try {
      // Convert legacy CreateAvatarRequest to CreateAvatarParams
      const memberId = member?.id || 'demo-member';
      const memberClassification = member?.classification || 'PERSONAL_SHOPPER';

      const params: CreateAvatarParams = {
        memberId,
        memberClassification: memberClassification as any,
        name: data.name,
        preferenceWeights: data.initialWeights as any,
        authorityLevel: data.authorityLevel,
        personalityTraits: data.personalityTraits,
        shoppingStyle: data.shoppingStyle,
        communicationStyle: data.communicationStyle,
      };

      const avatar = await avatarService.createAvatar(params);
      dispatch({ type: 'CREATE_SUCCESS', payload: avatar });
      dispatch({ type: 'SET_NEEDS_ONBOARDING', payload: false });

      // Set as active if it's the first avatar
      if (state.avatars.length === 0) {
        localStorage.setItem(ACTIVE_AVATAR_KEY, avatar.id);
      }

      return avatar;
    } catch (error: any) {
      dispatch({
        type: 'FETCH_FAILURE',
        payload: {
          code: error.code || 'CREATE_ERROR',
          message: error.message || 'Failed to create avatar',
          status: error.status || 500,
        },
      });
      throw error;
    }
  }, [state.avatars.length, member]);

  const createAvatarWithParams = useCallback(async (params: CreateAvatarParams): Promise<Avatar> => {
    dispatch({ type: 'FETCH_START' });

    try {
      const avatar = await avatarService.createAvatar(params);
      dispatch({ type: 'CREATE_SUCCESS', payload: avatar });
      dispatch({ type: 'SET_NEEDS_ONBOARDING', payload: false });

      // Set as active if it's the first avatar
      if (state.avatars.length === 0) {
        localStorage.setItem(ACTIVE_AVATAR_KEY, avatar.id);
      }

      return avatar;
    } catch (error: any) {
      dispatch({
        type: 'FETCH_FAILURE',
        payload: {
          code: error.code || 'CREATE_ERROR',
          message: error.message || 'Failed to create avatar',
          status: error.status || 500,
        },
      });
      throw error;
    }
  }, [state.avatars.length]);

  const updateAvatar = useCallback(async (id: string, data: UpdateAvatarRequest): Promise<Avatar> => {
    dispatch({ type: 'FETCH_START' });

    try {
      const avatar = await avatarService.updateAvatar(id, data);
      dispatch({ type: 'UPDATE_SUCCESS', payload: avatar });
      return avatar;
    } catch (error: any) {
      dispatch({
        type: 'FETCH_FAILURE',
        payload: {
          code: error.code || 'UPDATE_ERROR',
          message: error.message || 'Failed to update avatar',
          status: error.status || 500,
        },
      });
      throw error;
    }
  }, []);

  const deleteAvatar = useCallback(async (id: string): Promise<void> => {
    dispatch({ type: 'FETCH_START' });

    try {
      await avatarService.deleteAvatar(id);
      dispatch({ type: 'DELETE_SUCCESS', payload: id });

      // Clear from storage if it was the active one
      if (localStorage.getItem(ACTIVE_AVATAR_KEY) === id) {
        localStorage.removeItem(ACTIVE_AVATAR_KEY);
      }
    } catch (error: any) {
      dispatch({
        type: 'FETCH_FAILURE',
        payload: {
          code: error.code || 'DELETE_ERROR',
          message: error.message || 'Failed to delete avatar',
          status: error.status || 500,
        },
      });
      throw error;
    }
  }, []);

  const refreshAvatars = useCallback(async (): Promise<void> => {
    await fetchAvatars();
  }, []);

  const setActiveAvatar = useCallback((id: string): void => {
    const avatar = state.avatars.find((a) => a.id === id);
    if (avatar) {
      localStorage.setItem(ACTIVE_AVATAR_KEY, id);
      dispatch({ type: 'SET_ACTIVE', payload: avatar });
    }
  }, [state.avatars]);

  const activateAvatar = useCallback(async (id: string): Promise<Avatar> => {
    const avatar = await avatarService.activateAvatar(id);
    dispatch({ type: 'UPDATE_SUCCESS', payload: avatar });
    return avatar;
  }, []);

  const deactivateAvatar = useCallback(async (id: string): Promise<Avatar> => {
    const avatar = await avatarService.deactivateAvatar(id);
    dispatch({ type: 'UPDATE_SUCCESS', payload: avatar });
    return avatar;
  }, []);

  const updatePreferences = useCallback(
    async (id: string, preferences: Partial<AvatarPreferences>): Promise<AvatarPreferences> => {
      const updated = await avatarService.updatePreferences(id, preferences);

      // Refresh the avatar to get updated data
      const avatar = await avatarService.getAvatar(id);
      dispatch({ type: 'UPDATE_SUCCESS', payload: avatar });

      return updated;
    },
    []
  );

  const updateAuthorityConfig = useCallback(
    async (id: string, config: Partial<AuthorityConfiguration>): Promise<AuthorityConfiguration> => {
      const updated = await avatarService.updateAuthorityConfig(id, config);

      // Refresh the avatar to get updated data
      const avatar = await avatarService.getAvatar(id);
      dispatch({ type: 'UPDATE_SUCCESS', payload: avatar });

      return updated;
    },
    []
  );

  const resetLearningData = useCallback(async (id: string): Promise<void> => {
    await avatarService.resetLearningData(id);

    // Refresh the avatar to get updated data
    const avatar = await avatarService.getAvatar(id);
    dispatch({ type: 'UPDATE_SUCCESS', payload: avatar });
  }, []);

  const setNeedsOnboarding = useCallback((needs: boolean): void => {
    dispatch({ type: 'SET_NEEDS_ONBOARDING', payload: needs });
  }, []);

  const clearError = useCallback((): void => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  const value = useMemo<AvatarContextType>(
    () => ({
      state,
      createAvatar,
      createAvatarWithParams,
      updateAvatar,
      deleteAvatar,
      refreshAvatars,
      setActiveAvatar,
      activateAvatar,
      deactivateAvatar,
      updatePreferences,
      updateAuthorityConfig,
      resetLearningData,
      setNeedsOnboarding,
      clearError,
    }),
    [
      state,
      createAvatar,
      createAvatarWithParams,
      updateAvatar,
      deleteAvatar,
      refreshAvatars,
      setActiveAvatar,
      activateAvatar,
      deactivateAvatar,
      updatePreferences,
      updateAuthorityConfig,
      resetLearningData,
      setNeedsOnboarding,
      clearError,
    ]
  );

  return <AvatarContext.Provider value={value}>{children}</AvatarContext.Provider>;
}

export default AvatarContext;
