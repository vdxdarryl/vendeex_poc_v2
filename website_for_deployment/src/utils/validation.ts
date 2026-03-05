/**
 * Validation Utilities for VendeeX 2.0
 * Form validation and input sanitization
 */

export interface ValidationResult {
  isValid: boolean;
  message: string;
}

// Email validation
export function validateEmail(email: string): ValidationResult {
  if (!email) {
    return { isValid: false, message: 'Email is required' };
  }

  const trimmed = email.trim();

  if (trimmed.length === 0) {
    return { isValid: false, message: 'Email is required' };
  }

  // RFC 5322 compliant email regex (simplified)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(trimmed)) {
    return { isValid: false, message: 'Please enter a valid email address' };
  }

  if (trimmed.length > 254) {
    return { isValid: false, message: 'Email address is too long' };
  }

  return { isValid: true, message: '' };
}

// Password validation
export function validatePassword(password: string): ValidationResult {
  if (!password) {
    return { isValid: false, message: 'Password is required' };
  }

  if (password.length < 8) {
    return { isValid: false, message: 'Password must be at least 8 characters' };
  }

  if (password.length > 128) {
    return { isValid: false, message: 'Password is too long' };
  }

  if (!/[a-z]/.test(password)) {
    return { isValid: false, message: 'Password must contain at least one lowercase letter' };
  }

  if (!/[A-Z]/.test(password)) {
    return { isValid: false, message: 'Password must contain at least one uppercase letter' };
  }

  if (!/\d/.test(password)) {
    return { isValid: false, message: 'Password must contain at least one number' };
  }

  return { isValid: true, message: '' };
}

// Password match validation
export function validatePasswordMatch(
  password: string,
  confirmPassword: string
): ValidationResult {
  if (!confirmPassword) {
    return { isValid: false, message: 'Please confirm your password' };
  }

  if (password !== confirmPassword) {
    return { isValid: false, message: 'Passwords do not match' };
  }

  return { isValid: true, message: '' };
}

// Name validation
export function validateName(name: string, fieldName: string = 'Name'): ValidationResult {
  if (!name) {
    return { isValid: false, message: `${fieldName} is required` };
  }

  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return { isValid: false, message: `${fieldName} is required` };
  }

  if (trimmed.length < 2) {
    return { isValid: false, message: `${fieldName} must be at least 2 characters` };
  }

  if (trimmed.length > 50) {
    return { isValid: false, message: `${fieldName} is too long` };
  }

  // Allow letters, spaces, hyphens, and apostrophes
  if (!/^[a-zA-Z\s'-]+$/.test(trimmed)) {
    return { isValid: false, message: `${fieldName} contains invalid characters` };
  }

  return { isValid: true, message: '' };
}

// Phone number validation
export function validatePhone(phone: string): ValidationResult {
  if (!phone) {
    return { isValid: true, message: '' }; // Phone is optional
  }

  const trimmed = phone.trim();

  if (trimmed.length === 0) {
    return { isValid: true, message: '' };
  }

  // Remove common formatting characters for validation
  const digitsOnly = trimmed.replace(/[\s\-\(\)\+\.]/g, '');

  if (!/^\d+$/.test(digitsOnly)) {
    return { isValid: false, message: 'Phone number contains invalid characters' };
  }

  if (digitsOnly.length < 10) {
    return { isValid: false, message: 'Phone number is too short' };
  }

  if (digitsOnly.length > 15) {
    return { isValid: false, message: 'Phone number is too long' };
  }

  return { isValid: true, message: '' };
}

// URL validation
export function validateUrl(url: string): ValidationResult {
  if (!url) {
    return { isValid: false, message: 'URL is required' };
  }

  try {
    new URL(url);
    return { isValid: true, message: '' };
  } catch {
    return { isValid: false, message: 'Please enter a valid URL' };
  }
}

// Number range validation
export function validateNumberRange(
  value: number,
  min: number,
  max: number,
  fieldName: string = 'Value'
): ValidationResult {
  if (isNaN(value)) {
    return { isValid: false, message: `${fieldName} must be a number` };
  }

  if (value < min) {
    return { isValid: false, message: `${fieldName} must be at least ${min}` };
  }

  if (value > max) {
    return { isValid: false, message: `${fieldName} must be at most ${max}` };
  }

  return { isValid: true, message: '' };
}

// Required field validation
export function validateRequired(
  value: string | number | boolean | null | undefined,
  fieldName: string = 'This field'
): ValidationResult {
  if (value === null || value === undefined) {
    return { isValid: false, message: `${fieldName} is required` };
  }

  if (typeof value === 'string' && value.trim().length === 0) {
    return { isValid: false, message: `${fieldName} is required` };
  }

  return { isValid: true, message: '' };
}

// Array length validation
export function validateArrayLength(
  arr: unknown[],
  min: number,
  max: number,
  fieldName: string = 'Selection'
): ValidationResult {
  if (!Array.isArray(arr)) {
    return { isValid: false, message: `${fieldName} is invalid` };
  }

  if (arr.length < min) {
    return {
      isValid: false,
      message: `Please select at least ${min} ${min === 1 ? 'item' : 'items'}`,
    };
  }

  if (arr.length > max) {
    return {
      isValid: false,
      message: `Please select at most ${max} ${max === 1 ? 'item' : 'items'}`,
    };
  }

  return { isValid: true, message: '' };
}

// Password strength calculator
export interface PasswordStrength {
  score: number; // 0-4
  label: 'Weak' | 'Fair' | 'Good' | 'Strong' | 'Very Strong';
  color: string;
  suggestions: string[];
}

export function calculatePasswordStrength(password: string): PasswordStrength {
  let score = 0;
  const suggestions: string[] = [];

  if (!password) {
    return {
      score: 0,
      label: 'Weak',
      color: '#ef4444',
      suggestions: ['Enter a password'],
    };
  }

  // Length checks
  if (password.length >= 8) score++;
  else suggestions.push('Use at least 8 characters');

  if (password.length >= 12) score++;
  else if (password.length >= 8) suggestions.push('Consider using 12+ characters');

  // Character type checks
  if (/[a-z]/.test(password)) score += 0.5;
  else suggestions.push('Add lowercase letters');

  if (/[A-Z]/.test(password)) score += 0.5;
  else suggestions.push('Add uppercase letters');

  if (/\d/.test(password)) score += 0.5;
  else suggestions.push('Add numbers');

  if (/[^a-zA-Z0-9]/.test(password)) score += 0.5;
  else suggestions.push('Add special characters (!@#$%^&*)');

  // Normalize score to 0-4
  score = Math.min(4, Math.floor(score));

  const labels: PasswordStrength['label'][] = [
    'Weak',
    'Fair',
    'Good',
    'Strong',
    'Very Strong',
  ];

  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];

  return {
    score,
    label: labels[score],
    color: colors[score],
    suggestions: score < 4 ? suggestions.slice(0, 3) : [],
  };
}

// Input sanitization
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/\s+/g, ' '); // Normalize whitespace
}

// Form validation helper
export interface FormErrors {
  [key: string]: string;
}

export function validateForm<T extends Record<string, unknown>>(
  data: T,
  validators: {
    [K in keyof T]?: (value: T[K]) => ValidationResult;
  }
): { isValid: boolean; errors: FormErrors } {
  const errors: FormErrors = {};
  let isValid = true;

  for (const [field, validator] of Object.entries(validators)) {
    if (validator) {
      const result = (validator as (value: unknown) => ValidationResult)(
        data[field as keyof T]
      );
      if (!result.isValid) {
        errors[field] = result.message;
        isValid = false;
      }
    }
  }

  return { isValid, errors };
}

// Debounced validation
export function createDebouncedValidator<T>(
  validator: (value: T) => ValidationResult,
  delay: number = 300
): (value: T, callback: (result: ValidationResult) => void) => void {
  let timeoutId: ReturnType<typeof setTimeout>;

  return (value: T, callback: (result: ValidationResult) => void) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      callback(validator(value));
    }, delay);
  };
}

export default {
  validateEmail,
  validatePassword,
  validatePasswordMatch,
  validateName,
  validatePhone,
  validateUrl,
  validateNumberRange,
  validateRequired,
  validateArrayLength,
  calculatePasswordStrength,
  sanitizeInput,
  validateForm,
  createDebouncedValidator,
};
