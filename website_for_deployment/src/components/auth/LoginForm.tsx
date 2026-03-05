import React, { useState } from 'react';
import type { LoginCredentials, AuthError } from '../../types/auth.types';
import { useAuth } from '../../hooks/useAuth';
import { FormField } from '../common/FormField';
import { validateEmail, validatePassword } from '../../utils/validation';

interface LoginFormProps {
  onSuccess?: () => void;
  onForgotPassword?: () => void;
  onRegister?: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  onSuccess,
  onForgotPassword,
  onRegister,
}) => {
  const { login, isLoading, error: authError } = useAuth();

  const [credentials, setCredentials] = useState<LoginCredentials>({
    email: '',
    password: '',
    rememberMe: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    const emailValidation = validateEmail(credentials.email);
    if (!emailValidation.isValid) {
      newErrors.email = emailValidation.message;
    }

    const passwordValidation = validatePassword(credentials.password);
    if (!passwordValidation.isValid) {
      newErrors.password = passwordValidation.message;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (field: keyof LoginCredentials, value: string | boolean) => {
    setCredentials(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      await login(credentials);
      onSuccess?.();
    } catch (err) {
      // Error is handled by useAuth hook
    }
  };

  return (
    <div className="login-form-container">
      <div className="login-form-header">
        <h2 className="login-form-title">Welcome Back</h2>
        <p className="login-form-subtitle">
          Sign in to your VendeeX account
        </p>
      </div>

      <form onSubmit={handleSubmit} className="login-form">
        {authError && (
          <div className="login-form-error" role="alert">
            <span className="error-icon">!</span>
            <span>{authError.message}</span>
          </div>
        )}

        <FormField
          id="email"
          label="Email Address"
          type="email"
          value={credentials.email}
          onChange={(value) => handleChange('email', value)}
          error={errors.email}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />

        <FormField
          id="password"
          label="Password"
          type={showPassword ? 'text' : 'password'}
          value={credentials.password}
          onChange={(value) => handleChange('password', value)}
          error={errors.password}
          placeholder="Enter your password"
          autoComplete="current-password"
          required
          suffix={
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          }
        />

        <div className="login-form-options">
          <label className="remember-me">
            <input
              type="checkbox"
              checked={credentials.rememberMe}
              onChange={(e) => handleChange('rememberMe', e.target.checked)}
            />
            <span>Remember me</span>
          </label>

          <button
            type="button"
            className="forgot-password-link"
            onClick={onForgotPassword}
          >
            Forgot password?
          </button>
        </div>

        <button
          type="submit"
          className="login-submit-btn"
          disabled={isLoading}
        >
          {isLoading ? (
            <span className="loading-spinner" />
          ) : (
            'Sign In'
          )}
        </button>

        <div className="login-form-divider">
          <span>or continue with</span>
        </div>

        <div className="social-login-buttons">
          <button type="button" className="social-btn google">
            <span className="social-icon">G</span>
            <span>Google</span>
          </button>
          <button type="button" className="social-btn apple">
            <span className="social-icon">A</span>
            <span>Apple</span>
          </button>
        </div>

        <p className="login-form-footer">
          Don't have an account?{' '}
          <button
            type="button"
            className="register-link"
            onClick={onRegister}
          >
            Sign up
          </button>
        </p>
      </form>
    </div>
  );
};

export default LoginForm;
