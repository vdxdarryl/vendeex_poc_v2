/**
 * AuthContext for VendeeX 2.0
 * Provides authentication state management across the application
 */

import React, {
  createContext,
  useReducer,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { authService } from '../services/authService';
import type {
  AuthState,
  AuthError,
  LoginCredentials,
  RegistrationData,
  Member,
} from '../types/auth.types';

// Action types
type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: { member: Member; token: string } }
  | { type: 'AUTH_FAILURE'; payload: AuthError }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'UPDATE_MEMBER'; payload: Member }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_LOADING'; payload: boolean };

// Initial state
const initialState: AuthState = {
  isAuthenticated: false,
  isLoading: true, // Start as loading to check for existing session
  member: null,
  token: null,
  error: null,
};

// Reducer
function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'AUTH_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      };

    case 'AUTH_SUCCESS':
      return {
        ...state,
        isAuthenticated: true,
        isLoading: false,
        member: action.payload.member,
        token: action.payload.token,
        error: null,
      };

    case 'AUTH_FAILURE':
      return {
        ...state,
        isAuthenticated: false,
        isLoading: false,
        member: null,
        token: null,
        error: action.payload,
      };

    case 'AUTH_LOGOUT':
      return {
        ...state,
        isAuthenticated: false,
        isLoading: false,
        member: null,
        token: null,
        error: null,
      };

    case 'UPDATE_MEMBER':
      return {
        ...state,
        member: action.payload,
      };

    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };

    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
      };

    default:
      return state;
  }
}

// Context type
export interface AuthContextType {
  state: AuthState;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegistrationData) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  updateMember: (updates: Partial<Member>) => Promise<Member>;
  clearError: () => void;
  loginWithGoogle: () => void;
  loginWithApple: () => void;
  requestPasswordReset: (email: string) => Promise<void>;
  confirmPasswordReset: (token: string, newPassword: string) => Promise<void>;
  verifyEmail: (token: string) => Promise<void>;
  resendVerification: () => Promise<void>;
}

// Create context
export const AuthContext = createContext<AuthContextType | null>(null);

// Provider props
interface AuthProviderProps {
  children: ReactNode;
}

// Provider component
export function AuthProvider({ children }: AuthProviderProps) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check for existing session on mount
  useEffect(() => {
    const initializeAuth = async () => {
      const storedMember = authService.getStoredMember();
      const token = authService.getToken();

      if (storedMember && token) {
        try {
          // Verify the session is still valid
          const member = await authService.getCurrentMember();
          dispatch({
            type: 'AUTH_SUCCESS',
            payload: { member, token },
          });
        } catch (error) {
          // Token is invalid, clear it
          await authService.logout();
          dispatch({ type: 'AUTH_LOGOUT' });
        }
      } else {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    initializeAuth();
  }, []);

  // Listen for unauthorized events (e.g., token expiry)
  useEffect(() => {
    const handleUnauthorized = () => {
      dispatch({ type: 'AUTH_LOGOUT' });
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    dispatch({ type: 'AUTH_START' });

    try {
      const response = await authService.login(credentials);
      dispatch({
        type: 'AUTH_SUCCESS',
        payload: { member: response.member, token: response.token },
      });
    } catch (error: any) {
      dispatch({
        type: 'AUTH_FAILURE',
        payload: {
          code: error.code || 'LOGIN_ERROR',
          message: error.message || 'Failed to login',
          field: error.field,
        },
      });
      throw error;
    }
  }, []);

  const register = useCallback(async (data: RegistrationData) => {
    dispatch({ type: 'AUTH_START' });

    try {
      const response = await authService.register(data);
      dispatch({
        type: 'AUTH_SUCCESS',
        payload: { member: response.member, token: response.token },
      });
    } catch (error: any) {
      dispatch({
        type: 'AUTH_FAILURE',
        payload: {
          code: error.code || 'REGISTRATION_ERROR',
          message: error.message || 'Failed to register',
          field: error.field,
        },
      });
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    dispatch({ type: 'AUTH_START' });

    try {
      await authService.logout();
    } finally {
      dispatch({ type: 'AUTH_LOGOUT' });
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const token = await authService.refreshToken();
      const member = await authService.getCurrentMember();
      dispatch({
        type: 'AUTH_SUCCESS',
        payload: { member, token },
      });
    } catch (error) {
      dispatch({ type: 'AUTH_LOGOUT' });
      throw error;
    }
  }, []);

  const updateMember = useCallback(async (updates: Partial<Member>): Promise<Member> => {
    const member = await authService.updateMember(updates);
    dispatch({ type: 'UPDATE_MEMBER', payload: member });
    return member;
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  const loginWithGoogle = useCallback(() => {
    authService.initiateGoogleAuth();
  }, []);

  const loginWithApple = useCallback(() => {
    authService.initiateAppleAuth();
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    await authService.requestPasswordReset({ email });
  }, []);

  const confirmPasswordReset = useCallback(async (token: string, newPassword: string) => {
    await authService.confirmPasswordReset({
      token,
      newPassword,
      confirmPassword: newPassword,
    });
  }, []);

  const verifyEmail = useCallback(async (token: string) => {
    await authService.verifyEmail(token);
    // Refresh member data after verification
    const member = await authService.getCurrentMember();
    dispatch({ type: 'UPDATE_MEMBER', payload: member });
  }, []);

  const resendVerification = useCallback(async () => {
    await authService.resendVerificationEmail();
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      state,
      login,
      register,
      logout,
      refreshSession,
      updateMember,
      clearError,
      loginWithGoogle,
      loginWithApple,
      requestPasswordReset,
      confirmPasswordReset,
      verifyEmail,
      resendVerification,
    }),
    [
      state,
      login,
      register,
      logout,
      refreshSession,
      updateMember,
      clearError,
      loginWithGoogle,
      loginWithApple,
      requestPasswordReset,
      confirmPasswordReset,
      verifyEmail,
      resendVerification,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthContext;
