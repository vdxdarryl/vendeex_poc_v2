import React, { useState, useCallback } from 'react';
import {
  MemberClassification,
  getClassificationMetadata,
  type RegistrationStep,
} from '../../types/auth.types';
import { useAuth } from '../../hooks/useAuth';
import { useAvatar } from '../../hooks/useAvatar';
import { FormField } from '../common/FormField';
import { MemberClassificationSelector } from './MemberClassificationSelector';
import {
  validateEmail,
  validatePassword,
  validateName,
  validatePhone,
  validatePasswordMatch,
} from '../../utils/validation';

interface RegistrationWizardProps {
  onSuccess?: () => void;
  onLogin?: () => void;
  onStartOnboarding?: () => void;
}

interface RegistrationFormData {
  memberClassification: MemberClassification | null;
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  organisationName: string;
  acceptTerms: boolean;
  acceptMarketing: boolean;
}

const REGISTRATION_STEPS: RegistrationStep[] = [
  {
    id: 1,
    title: 'Member Type',
    description: 'Select your classification',
    isCompleted: false,
    isActive: true,
  },
  {
    id: 2,
    title: 'Account Details',
    description: 'Create your login credentials',
    isCompleted: false,
    isActive: false,
  },
  {
    id: 3,
    title: 'Personal Information',
    description: 'Tell us about yourself',
    isCompleted: false,
    isActive: false,
  },
  {
    id: 4,
    title: 'Confirmation',
    description: 'Review and confirm',
    isCompleted: false,
    isActive: false,
  },
];

const initialFormData: RegistrationFormData = {
  memberClassification: null,
  email: '',
  password: '',
  confirmPassword: '',
  firstName: '',
  lastName: '',
  phoneNumber: '',
  organisationName: '',
  acceptTerms: false,
  acceptMarketing: false,
};

export const RegistrationWizard: React.FC<RegistrationWizardProps> = ({
  onSuccess,
  onLogin,
  onStartOnboarding,
}) => {
  const { register, isLoading, error: authError } = useAuth();
  const { setNeedsOnboarding } = useAvatar();

  const [currentStep, setCurrentStep] = useState(1);
  const [steps, setSteps] = useState(REGISTRATION_STEPS);
  const [formData, setFormData] = useState<RegistrationFormData>(initialFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const updateField = useCallback(
    (field: keyof RegistrationFormData, value: string | boolean | MemberClassification | null) => {
      setFormData(prev => ({ ...prev, [field]: value }));
      if (errors[field]) {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[field];
          return newErrors;
        });
      }
    },
    [errors]
  );

  const requiresOrganisationName = (classification: MemberClassification | null): boolean => {
    return classification === MemberClassification.COMMUNITY_GROUP ||
           classification === MemberClassification.BUSINESS_ENTITY;
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (step === 1) {
      if (!formData.memberClassification) {
        newErrors.memberClassification = 'Please select a member type';
      }
    }

    if (step === 2) {
      const emailValidation = validateEmail(formData.email);
      if (!emailValidation.isValid) {
        newErrors.email = emailValidation.message;
      }

      const passwordValidation = validatePassword(formData.password);
      if (!passwordValidation.isValid) {
        newErrors.password = passwordValidation.message;
      }

      const passwordMatchValidation = validatePasswordMatch(
        formData.password,
        formData.confirmPassword
      );
      if (!passwordMatchValidation.isValid) {
        newErrors.confirmPassword = passwordMatchValidation.message;
      }
    }

    if (step === 3) {
      const firstNameValidation = validateName(formData.firstName, 'First name');
      if (!firstNameValidation.isValid) {
        newErrors.firstName = firstNameValidation.message;
      }

      const lastNameValidation = validateName(formData.lastName, 'Last name');
      if (!lastNameValidation.isValid) {
        newErrors.lastName = lastNameValidation.message;
      }

      if (formData.phoneNumber) {
        const phoneValidation = validatePhone(formData.phoneNumber);
        if (!phoneValidation.isValid) {
          newErrors.phoneNumber = phoneValidation.message;
        }
      }

      if (requiresOrganisationName(formData.memberClassification) && !formData.organisationName?.trim()) {
        newErrors.organisationName = 'Organisation name is required for this classification';
      }
    }

    if (step === 4) {
      if (!formData.acceptTerms) {
        newErrors.acceptTerms = 'You must accept the terms and conditions';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const goToStep = (step: number) => {
    if (step < currentStep || validateStep(currentStep)) {
      setSteps(prev =>
        prev.map(s => ({
          ...s,
          isActive: s.id === step,
          isCompleted: s.id < step,
        }))
      );
      setCurrentStep(step);
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      goToStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    goToStep(currentStep - 1);
  };

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) {
      return;
    }

    if (!formData.memberClassification) {
      return;
    }

    try {
      await register({
        email: formData.email,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
        firstName: formData.firstName,
        lastName: formData.lastName,
        phoneNumber: formData.phoneNumber || undefined,
        acceptTerms: formData.acceptTerms,
        acceptMarketing: formData.acceptMarketing,
        classification: formData.memberClassification,
        organisationName: formData.organisationName || undefined,
      });
      // Trigger avatar onboarding after successful registration
      setNeedsOnboarding(true);
      if (onStartOnboarding) {
        onStartOnboarding();
      } else {
        onSuccess?.();
      }
    } catch (err) {
      // Error is handled by useAuth hook
    }
  };

  const renderStepIndicator = () => (
    <div className="registration-steps">
      {steps.map((step, index) => (
        <React.Fragment key={step.id}>
          <button
            type="button"
            className={`step-indicator ${step.isActive ? 'active' : ''} ${
              step.isCompleted ? 'completed' : ''
            }`}
            onClick={() => goToStep(step.id)}
            disabled={step.id > currentStep && !steps[step.id - 2]?.isCompleted}
          >
            <span className="step-number">
              {step.isCompleted ? '✓' : step.id}
            </span>
            <span className="step-title">{step.title}</span>
          </button>
          {index < steps.length - 1 && <div className="step-connector" />}
        </React.Fragment>
      ))}
    </div>
  );

  const renderStep1 = () => (
    <div className="registration-step-content">
      <h3>Select Your Member Type</h3>
      <p className="step-description">
        Choose the classification that best describes how you'll use VendeeX
      </p>

      <MemberClassificationSelector
        selectedClassification={formData.memberClassification}
        onSelect={(classification) => setFormData({ ...formData, memberClassification: classification })}
      />

      {errors.memberClassification && (
        <p className="field-error text-center mt-4">{errors.memberClassification}</p>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="registration-step-content">
      <h3>Create Your Account</h3>
      <p className="step-description">
        Enter your email and create a secure password
      </p>

      <FormField
        id="email"
        label="Email Address"
        type="email"
        value={formData.email}
        onChange={(value) => updateField('email', value)}
        error={errors.email}
        placeholder="you@example.com"
        autoComplete="email"
        required
      />

      <FormField
        id="password"
        label="Password"
        type={showPassword ? 'text' : 'password'}
        value={formData.password}
        onChange={(value) => updateField('password', value)}
        error={errors.password}
        placeholder="Create a strong password"
        autoComplete="new-password"
        required
        hint="At least 8 characters with uppercase, lowercase, and number"
        suffix={
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        }
      />

      <FormField
        id="confirmPassword"
        label="Confirm Password"
        type={showConfirmPassword ? 'text' : 'password'}
        value={formData.confirmPassword}
        onChange={(value) => updateField('confirmPassword', value)}
        error={errors.confirmPassword}
        placeholder="Confirm your password"
        autoComplete="new-password"
        required
        suffix={
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
          >
            {showConfirmPassword ? 'Hide' : 'Show'}
          </button>
        }
      />
    </div>
  );

  const renderStep3 = () => (
    <div className="registration-step-content">
      <h3>Personal Information</h3>
      <p className="step-description">
        Help us personalise your experience
      </p>

      <div className="form-row">
        <FormField
          id="firstName"
          label="First Name"
          type="text"
          value={formData.firstName}
          onChange={(value) => updateField('firstName', value)}
          error={errors.firstName}
          placeholder="John"
          autoComplete="given-name"
          required
        />

        <FormField
          id="lastName"
          label="Last Name"
          type="text"
          value={formData.lastName}
          onChange={(value) => updateField('lastName', value)}
          error={errors.lastName}
          placeholder="Doe"
          autoComplete="family-name"
          required
        />
      </div>

      <FormField
        id="phoneNumber"
        label="Phone Number"
        type="tel"
        value={formData.phoneNumber || ''}
        onChange={(value) => updateField('phoneNumber', value)}
        error={errors.phoneNumber}
        placeholder="+44 (0) 7123 456789"
        autoComplete="tel"
        hint="Optional - for order updates and security"
      />

      {requiresOrganisationName(formData.memberClassification) && (
        <FormField
          id="organisationName"
          label={formData.memberClassification === MemberClassification.COMMUNITY_GROUP
            ? 'Group / Organisation Name'
            : 'Business Name'}
          type="text"
          value={formData.organisationName || ''}
          onChange={(value) => updateField('organisationName', value)}
          error={errors.organisationName}
          placeholder={formData.memberClassification === MemberClassification.COMMUNITY_GROUP
            ? 'e.g., Riverside Buying Cooperative'
            : 'e.g., Acme Corporation Ltd'}
          autoComplete="organization"
          required
        />
      )}
    </div>
  );

  const renderStep4 = () => {
    const classificationMeta = formData.memberClassification
      ? getClassificationMetadata(formData.memberClassification)
      : null;

    return (
      <div className="registration-step-content">
        <h3>Review & Confirm</h3>
        <p className="step-description">
          Please review your details before creating your account
        </p>

        <div className="review-section">
          <div className="review-card">
            <h4>Member Classification</h4>
            <div className="review-value highlight">
              {classificationMeta?.displayName || formData.memberClassification}
            </div>
            <p className="review-description">
              {classificationMeta?.description}
            </p>
          </div>

          <div className="review-card">
            <h4>Account Details</h4>
            <div className="review-row">
              <span className="review-label">Email:</span>
              <span className="review-value">{formData.email}</span>
            </div>
          </div>

          <div className="review-card">
            <h4>Personal Information</h4>
            <div className="review-row">
              <span className="review-label">Name:</span>
              <span className="review-value">{formData.firstName} {formData.lastName}</span>
            </div>
            {formData.phoneNumber && (
              <div className="review-row">
                <span className="review-label">Phone:</span>
                <span className="review-value">{formData.phoneNumber}</span>
              </div>
            )}
            {formData.organisationName && (
              <div className="review-row">
                <span className="review-label">Organisation:</span>
                <span className="review-value">{formData.organisationName}</span>
              </div>
            )}
          </div>
        </div>

        <div className="terms-section">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={formData.acceptTerms}
              onChange={(e) => updateField('acceptTerms', e.target.checked)}
            />
            <span>
              I agree to the{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer">
                Privacy Policy
              </a>
            </span>
          </label>
          {errors.acceptTerms && (
            <span className="field-error">{errors.acceptTerms}</span>
          )}

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={formData.acceptMarketing}
              onChange={(e) => updateField('acceptMarketing', e.target.checked)}
            />
            <span>
              Send me personalised product recommendations and deals (optional)
            </span>
          </label>
        </div>
      </div>
    );
  };

  // Determine if Next button should be disabled for step 1
  const isNextDisabled = currentStep === 1 && !formData.memberClassification;

  return (
    <div className="registration-wizard">
      <div className="registration-header">
        <h2>Create Your VendeeX Account</h2>
        <p>Join thousands of smart buyers using AI-powered assistance</p>
      </div>

      {renderStepIndicator()}

      {authError && (
        <div className="registration-error" role="alert">
          <span className="error-icon">!</span>
          <span>{authError.message}</span>
        </div>
      )}

      <form onSubmit={(e) => e.preventDefault()}>
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
        {currentStep === 4 && renderStep4()}

        <div className="registration-actions">
          {currentStep > 1 && (
            <button
              type="button"
              className="btn-secondary"
              onClick={handleBack}
              disabled={isLoading}
            >
              Back
            </button>
          )}

          {currentStep < 4 ? (
            <button
              type="button"
              className="btn-primary"
              onClick={handleNext}
              disabled={isNextDisabled}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? <span className="loading-spinner" /> : 'Create Account'}
            </button>
          )}
        </div>
      </form>

      <p className="registration-footer">
        Already have an account?{' '}
        <button type="button" className="login-link" onClick={onLogin}>
          Sign in
        </button>
      </p>

      <style>{`
        /* Registration Wizard Layout */
        .registration-wizard {
          background: white;
          border-radius: 16px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
          padding: 2rem;
          width: 100%;
          max-width: 900px;
          margin: 0 auto;
        }

        .registration-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .registration-header h2 {
          margin: 0 0 0.5rem;
          font-size: 1.75rem;
          color: var(--text-primary, #111827);
        }

        .registration-header p {
          margin: 0;
          color: var(--text-secondary, #6b7280);
          font-size: 0.95rem;
        }

        /* Step Indicator */
        .registration-steps {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0;
          margin-bottom: 2rem;
          flex-wrap: wrap;
        }

        .step-indicator {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          background: transparent;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
        }

        .step-indicator:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .step-number {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: var(--border-color, #e5e7eb);
          color: var(--text-secondary, #6b7280);
          font-weight: 600;
          font-size: 0.9rem;
          transition: all 0.2s;
        }

        .step-indicator.active .step-number {
          background: var(--primary-color, #2563eb);
          color: white;
        }

        .step-indicator.completed .step-number {
          background: var(--success-color, #10b981);
          color: white;
        }

        .step-title {
          font-size: 0.8rem;
          color: var(--text-tertiary, #9ca3af);
          font-weight: 500;
          white-space: nowrap;
        }

        .step-indicator.active .step-title {
          color: var(--primary-color, #2563eb);
        }

        .step-indicator.completed .step-title {
          color: var(--success-color, #10b981);
        }

        .step-connector {
          width: 40px;
          height: 2px;
          background: var(--border-color, #e5e7eb);
          margin: 0 0.25rem;
          margin-bottom: 1.5rem;
        }

        /* Step Content */
        .registration-step-content {
          margin-bottom: 2rem;
        }

        .registration-step-content h3 {
          margin: 0 0 0.5rem;
          font-size: 1.25rem;
          color: var(--text-primary, #111827);
          text-align: center;
        }

        .step-description {
          text-align: center;
          color: var(--text-secondary, #6b7280);
          margin: 0 0 1.5rem;
          font-size: 0.9rem;
        }

        /* Form Row */
        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        @media (max-width: 600px) {
          .form-row {
            grid-template-columns: 1fr;
          }
        }

        /* Terms Section */
        .terms-section {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .checkbox-label {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          cursor: pointer;
          font-size: 0.9rem;
          color: var(--text-secondary, #6b7280);
          line-height: 1.4;
        }

        .checkbox-label input[type="checkbox"] {
          width: 18px;
          height: 18px;
          margin-top: 0.1rem;
          flex-shrink: 0;
          cursor: pointer;
          accent-color: var(--primary-color, #2563eb);
        }

        .checkbox-label a {
          color: var(--primary-color, #2563eb);
          text-decoration: none;
        }

        .checkbox-label a:hover {
          text-decoration: underline;
        }

        .field-error {
          color: var(--error-color, #ef4444);
          font-size: 0.8rem;
          margin-top: 0.25rem;
        }

        /* Password Toggle */
        .password-toggle {
          background: transparent;
          border: none;
          color: var(--primary-color, #2563eb);
          font-size: 0.85rem;
          cursor: pointer;
          padding: 0.25rem 0.5rem;
        }

        .password-toggle:hover {
          text-decoration: underline;
        }

        /* Registration Actions */
        .registration-actions {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--border-color, #e5e7eb);
        }

        .registration-actions .btn-primary {
          background: var(--primary-color, #2563eb);
          color: white;
          border: none;
          padding: 0.875rem 2rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.2s;
          margin-left: auto;
        }

        .registration-actions .btn-primary:hover:not(:disabled) {
          background: #1d4ed8;
        }

        .registration-actions .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .registration-actions .btn-secondary {
          background: transparent;
          color: var(--text-secondary, #6b7280);
          border: 1px solid var(--border-color, #e5e7eb);
          padding: 0.875rem 1.5rem;
          border-radius: 8px;
          font-weight: 500;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .registration-actions .btn-secondary:hover {
          background: var(--card-bg, #f9fafb);
          border-color: var(--text-tertiary, #9ca3af);
        }

        .registration-actions .btn-secondary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Registration Error */
        .registration-error {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem;
          background: var(--error-bg, #fef2f2);
          border: 1px solid var(--error-border, #fecaca);
          border-radius: 8px;
          margin-bottom: 1.5rem;
          color: var(--error-color, #ef4444);
        }

        .error-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          background: var(--error-color, #ef4444);
          color: white;
          border-radius: 50%;
          font-weight: bold;
          font-size: 0.9rem;
          flex-shrink: 0;
        }

        /* Registration Footer */
        .registration-footer {
          text-align: center;
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--border-color, #e5e7eb);
          color: var(--text-secondary, #6b7280);
          font-size: 0.9rem;
        }

        .login-link {
          background: transparent;
          border: none;
          color: var(--primary-color, #2563eb);
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          padding: 0;
        }

        .login-link:hover {
          text-decoration: underline;
        }

        /* Review Section */
        .review-section {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .review-card {
          padding: 1rem;
          background: var(--card-bg, #f9fafb);
          border-radius: 8px;
          border: 1px solid var(--border-color, #e5e7eb);
        }

        .review-card h4 {
          margin: 0 0 0.75rem 0;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-tertiary, #9ca3af);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .review-row {
          display: flex;
          justify-content: space-between;
          padding: 0.375rem 0;
        }

        .review-label {
          color: var(--text-secondary, #6b7280);
          font-size: 0.9rem;
        }

        .review-value {
          color: var(--text-primary, #111827);
          font-weight: 500;
          font-size: 0.9rem;
        }

        .review-value.highlight {
          font-size: 1.1rem;
          color: var(--primary-color, #2563eb);
          margin-bottom: 0.5rem;
        }

        .review-description {
          margin: 0;
          font-size: 0.85rem;
          color: var(--text-secondary, #6b7280);
        }

        /* Responsive */
        @media (max-width: 640px) {
          .registration-wizard {
            padding: 1.5rem;
            border-radius: 12px;
          }

          .registration-steps {
            gap: 0;
          }

          .step-indicator {
            padding: 0.5rem;
          }

          .step-title {
            font-size: 0.7rem;
          }

          .step-connector {
            width: 20px;
          }

          .registration-actions {
            flex-direction: column;
          }

          .registration-actions .btn-secondary {
            order: 2;
          }

          .registration-actions .btn-primary {
            order: 1;
            margin-left: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default RegistrationWizard;
