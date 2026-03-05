/**
 * Authentication Service for VendeeX 2.0
 * Handles member registration, login, and session management
 */

import { apiClient } from './apiClient';
import type {
  LoginCredentials,
  LoginResponse,
  RegistrationData,
  RegistrationResponse,
  Member,
  Session,
  PasswordResetRequest,
  PasswordResetConfirmation,
  AuthError,
} from '../types/auth.types';

const AUTH_ENDPOINTS = {
  LOGIN: '/auth/login',
  REGISTER: '/auth/register',
  LOGOUT: '/auth/logout',
  REFRESH: '/auth/refresh',
  ME: '/auth/me',
  PASSWORD_RESET_REQUEST: '/auth/password-reset/request',
  PASSWORD_RESET_CONFIRM: '/auth/password-reset/confirm',
  VERIFY_EMAIL: '/auth/verify-email',
  RESEND_VERIFICATION: '/auth/resend-verification',
} as const;

const TOKEN_STORAGE_KEY = 'vendeex_auth_token';
const REFRESH_TOKEN_STORAGE_KEY = 'vendeex_refresh_token';
const MEMBER_STORAGE_KEY = 'vendeex_member';

class AuthService {
  private refreshPromise: Promise<string> | null = null;

  constructor() {
    // Initialize token from storage
    const token = this.getStoredToken();
    if (token) {
      apiClient.setAuthToken(token);
    }
  }

  private getStoredToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  private getStoredRefreshToken(): string | null {
    try {
      return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  private storeTokens(token: string, refreshToken: string): void {
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
    } catch (error) {
      console.error('Failed to store tokens:', error);
    }
  }

  private clearTokens(): void {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
      localStorage.removeItem(MEMBER_STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear tokens:', error);
    }
  }

  private storeMember(member: Member): void {
    try {
      localStorage.setItem(MEMBER_STORAGE_KEY, JSON.stringify(member));
    } catch (error) {
      console.error('Failed to store member:', error);
    }
  }

  getStoredMember(): Member | null {
    try {
      const memberJson = localStorage.getItem(MEMBER_STORAGE_KEY);
      return memberJson ? JSON.parse(memberJson) : null;
    } catch {
      return null;
    }
  }

  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await apiClient.post<LoginResponse>(
      AUTH_ENDPOINTS.LOGIN,
      credentials
    );

    const { token, refreshToken, member } = response.data;

    this.storeTokens(token, refreshToken);
    this.storeMember(member);
    apiClient.setAuthToken(token);

    return response.data;
  }

  async register(data: RegistrationData): Promise<RegistrationResponse> {
    const response = await apiClient.post<RegistrationResponse>(
      AUTH_ENDPOINTS.REGISTER,
      data
    );

    const { token, refreshToken, member } = response.data;

    this.storeTokens(token, refreshToken);
    this.storeMember(member);
    apiClient.setAuthToken(token);

    return response.data;
  }

  async logout(): Promise<void> {
    try {
      await apiClient.post(AUTH_ENDPOINTS.LOGOUT);
    } catch (error) {
      // Log out locally even if server request fails
      console.error('Logout request failed:', error);
    } finally {
      this.clearTokens();
      apiClient.setAuthToken(null);
    }
  }

  async refreshToken(): Promise<string> {
    // Prevent multiple simultaneous refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const refreshToken = this.getStoredRefreshToken();

    if (!refreshToken) {
      throw {
        code: 'NO_REFRESH_TOKEN',
        message: 'No refresh token available',
        status: 401,
      } as AuthError;
    }

    this.refreshPromise = (async () => {
      try {
        const response = await apiClient.post<{ token: string; refreshToken: string }>(
          AUTH_ENDPOINTS.REFRESH,
          { refreshToken }
        );

        const { token, refreshToken: newRefreshToken } = response.data;

        this.storeTokens(token, newRefreshToken);
        apiClient.setAuthToken(token);

        return token;
      } catch (error) {
        this.clearTokens();
        apiClient.setAuthToken(null);
        throw error;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async getCurrentMember(): Promise<Member> {
    const response = await apiClient.get<Member>(AUTH_ENDPOINTS.ME);
    this.storeMember(response.data);
    return response.data;
  }

  async updateMember(updates: Partial<Member>): Promise<Member> {
    const response = await apiClient.patch<Member>(AUTH_ENDPOINTS.ME, updates);
    this.storeMember(response.data);
    return response.data;
  }

  async requestPasswordReset(data: PasswordResetRequest): Promise<void> {
    await apiClient.post(AUTH_ENDPOINTS.PASSWORD_RESET_REQUEST, data);
  }

  async confirmPasswordReset(data: PasswordResetConfirmation): Promise<void> {
    await apiClient.post(AUTH_ENDPOINTS.PASSWORD_RESET_CONFIRM, data);
  }

  async verifyEmail(token: string): Promise<void> {
    await apiClient.post(AUTH_ENDPOINTS.VERIFY_EMAIL, { token });
  }

  async resendVerificationEmail(): Promise<void> {
    await apiClient.post(AUTH_ENDPOINTS.RESEND_VERIFICATION);
  }

  isAuthenticated(): boolean {
    return Boolean(this.getStoredToken());
  }

  getToken(): string | null {
    return this.getStoredToken();
  }

  // Social auth methods (redirect to OAuth providers)
  initiateGoogleAuth(): void {
    window.location.href = `${apiClient['baseUrl']}/auth/google`;
  }

  initiateAppleAuth(): void {
    window.location.href = `${apiClient['baseUrl']}/auth/apple`;
  }

  initiateFacebookAuth(): void {
    window.location.href = `${apiClient['baseUrl']}/auth/facebook`;
  }

  // Handle OAuth callback
  async handleOAuthCallback(provider: string, code: string): Promise<LoginResponse> {
    const response = await apiClient.post<LoginResponse>(
      `/auth/${provider}/callback`,
      { code }
    );

    const { token, refreshToken, member } = response.data;

    this.storeTokens(token, refreshToken);
    this.storeMember(member);
    apiClient.setAuthToken(token);

    return response.data;
  }
}

// Singleton instance
export const authService = new AuthService();

export default authService;
