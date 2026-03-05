/**
 * useAuth Hook for VendeeX 2.0
 * Provides authentication state and methods to components
 */

import { useContext, useCallback } from 'react';
import { AuthContext } from '../context/AuthContext';
import type {
  LoginCredentials,
  RegistrationData,
  Member,
  AuthError,
} from '../types/auth.types';

export interface UseAuthReturn {
  // State
  isAuthenticated: boolean;
  isLoading: boolean;
  member: Member | null;
  error: AuthError | null;

  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegistrationData) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  updateMember: (updates: Partial<Member>) => Promise<Member>;
  clearError: () => void;

  // Social auth
  loginWithGoogle: () => void;
  loginWithApple: () => void;

  // Password reset
  requestPasswordReset: (email: string) => Promise<void>;
  confirmPasswordReset: (token: string, newPassword: string) => Promise<void>;

  // Email verification
  verifyEmail: (token: string) => Promise<void>;
  resendVerification: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  const {
    state,
    login: contextLogin,
    register: contextRegister,
    logout: contextLogout,
    refreshSession: contextRefresh,
    updateMember: contextUpdateMember,
    clearError: contextClearError,
    loginWithGoogle: contextGoogleLogin,
    loginWithApple: contextAppleLogin,
    requestPasswordReset: contextRequestReset,
    confirmPasswordReset: contextConfirmReset,
    verifyEmail: contextVerifyEmail,
    resendVerification: contextResendVerification,
  } = context;

  const login = useCallback(
    async (credentials: LoginCredentials): Promise<void> => {
      await contextLogin(credentials);
    },
    [contextLogin]
  );

  const register = useCallback(
    async (data: RegistrationData): Promise<void> => {
      await contextRegister(data);
    },
    [contextRegister]
  );

  const logout = useCallback(async (): Promise<void> => {
    await contextLogout();
  }, [contextLogout]);

  const refreshSession = useCallback(async (): Promise<void> => {
    await contextRefresh();
  }, [contextRefresh]);

  const updateMember = useCallback(
    async (updates: Partial<Member>): Promise<Member> => {
      return contextUpdateMember(updates);
    },
    [contextUpdateMember]
  );

  const clearError = useCallback((): void => {
    contextClearError();
  }, [contextClearError]);

  const loginWithGoogle = useCallback((): void => {
    contextGoogleLogin();
  }, [contextGoogleLogin]);

  const loginWithApple = useCallback((): void => {
    contextAppleLogin();
  }, [contextAppleLogin]);

  const requestPasswordReset = useCallback(
    async (email: string): Promise<void> => {
      await contextRequestReset(email);
    },
    [contextRequestReset]
  );

  const confirmPasswordReset = useCallback(
    async (token: string, newPassword: string): Promise<void> => {
      await contextConfirmReset(token, newPassword);
    },
    [contextConfirmReset]
  );

  const verifyEmail = useCallback(
    async (token: string): Promise<void> => {
      await contextVerifyEmail(token);
    },
    [contextVerifyEmail]
  );

  const resendVerification = useCallback(async (): Promise<void> => {
    await contextResendVerification();
  }, [contextResendVerification]);

  return {
    // State
    isAuthenticated: state.isAuthenticated,
    isLoading: state.isLoading,
    member: state.member,
    error: state.error,

    // Actions
    login,
    register,
    logout,
    refreshSession,
    updateMember,
    clearError,

    // Social auth
    loginWithGoogle,
    loginWithApple,

    // Password reset
    requestPasswordReset,
    confirmPasswordReset,

    // Email verification
    verifyEmail,
    resendVerification,
  };
}

// Utility hook for checking if user has specific membership level
export function useMemberClassification() {
  const { member } = useAuth();

  const isPremium = member?.classification === 'premium' || member?.classification === 'enterprise';
  const isEnterprise = member?.classification === 'enterprise';
  const isFree = member?.classification === 'free';
  const isBasic = member?.classification === 'basic';

  return {
    classification: member?.classification || null,
    isPremium,
    isEnterprise,
    isFree,
    isBasic,
    canAccessFeature: (requiredLevel: 'free' | 'basic' | 'premium' | 'enterprise') => {
      if (!member) return false;

      const levels = ['free', 'basic', 'premium', 'enterprise'];
      const memberLevel = levels.indexOf(member.classification);
      const required = levels.indexOf(requiredLevel);

      return memberLevel >= required;
    },
  };
}

export default useAuth;
