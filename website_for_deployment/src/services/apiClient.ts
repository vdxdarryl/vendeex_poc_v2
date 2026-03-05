/**
 * API Client for VendeeX 2.0
 * Centralized HTTP client with authentication handling
 */

export interface ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
}

export interface ApiError {
  code: string;
  message: string;
  status: number;
  details?: Record<string, unknown>;
}

export interface RequestConfig {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
  timeout?: number;
  withCredentials?: boolean;
}

const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || '/api';
const DEFAULT_TIMEOUT = 30000;

class ApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private authToken: string | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  getAuthToken(): string | null {
    return this.authToken;
  }

  private getHeaders(customHeaders?: Record<string, string>): Record<string, string> {
    const headers = { ...this.defaultHeaders, ...customHeaders };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  private buildUrl(endpoint: string, params?: Record<string, string | number | boolean>): string {
    const url = new URL(endpoint, this.baseUrl.startsWith('http') ? this.baseUrl : window.location.origin + this.baseUrl);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }

    return url.toString();
  }

  private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    const contentType = response.headers.get('Content-Type');
    const isJson = contentType?.includes('application/json');

    let data: T;

    if (isJson) {
      data = await response.json();
    } else {
      data = await response.text() as unknown as T;
    }

    if (!response.ok) {
      const error: ApiError = {
        code: 'API_ERROR',
        message: (data as any)?.message || response.statusText || 'An error occurred',
        status: response.status,
        details: isJson ? (data as any) : undefined,
      };

      // Handle specific error codes
      if (response.status === 401) {
        error.code = 'UNAUTHORIZED';
        this.authToken = null;
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      } else if (response.status === 403) {
        error.code = 'FORBIDDEN';
      } else if (response.status === 404) {
        error.code = 'NOT_FOUND';
      } else if (response.status === 422) {
        error.code = 'VALIDATION_ERROR';
      } else if (response.status >= 500) {
        error.code = 'SERVER_ERROR';
      }

      throw error;
    }

    return {
      data,
      status: response.status,
      message: (data as any)?.message,
    };
  }

  async get<T>(
    endpoint: string,
    config: RequestConfig = {}
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(endpoint, config.params);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      config.timeout || DEFAULT_TIMEOUT
    );

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(config.headers),
        credentials: config.withCredentials ? 'include' : 'same-origin',
        signal: controller.signal,
      });

      return this.handleResponse<T>(response);
    } finally {
      clearTimeout(timeout);
    }
  }

  async post<T>(
    endpoint: string,
    body?: unknown,
    config: RequestConfig = {}
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(endpoint, config.params);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      config.timeout || DEFAULT_TIMEOUT
    );

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(config.headers),
        credentials: config.withCredentials ? 'include' : 'same-origin',
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      return this.handleResponse<T>(response);
    } finally {
      clearTimeout(timeout);
    }
  }

  async put<T>(
    endpoint: string,
    body?: unknown,
    config: RequestConfig = {}
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(endpoint, config.params);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      config.timeout || DEFAULT_TIMEOUT
    );

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: this.getHeaders(config.headers),
        credentials: config.withCredentials ? 'include' : 'same-origin',
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      return this.handleResponse<T>(response);
    } finally {
      clearTimeout(timeout);
    }
  }

  async patch<T>(
    endpoint: string,
    body?: unknown,
    config: RequestConfig = {}
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(endpoint, config.params);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      config.timeout || DEFAULT_TIMEOUT
    );

    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: this.getHeaders(config.headers),
        credentials: config.withCredentials ? 'include' : 'same-origin',
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      return this.handleResponse<T>(response);
    } finally {
      clearTimeout(timeout);
    }
  }

  async delete<T>(
    endpoint: string,
    config: RequestConfig = {}
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(endpoint, config.params);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      config.timeout || DEFAULT_TIMEOUT
    );

    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: this.getHeaders(config.headers),
        credentials: config.withCredentials ? 'include' : 'same-origin',
        signal: controller.signal,
      });

      return this.handleResponse<T>(response);
    } finally {
      clearTimeout(timeout);
    }
  }
}

// Singleton instance
export const apiClient = new ApiClient();

export default apiClient;
