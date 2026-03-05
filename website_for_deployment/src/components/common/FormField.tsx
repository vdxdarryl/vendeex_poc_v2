import React, { forwardRef, useId } from 'react';

type InputType =
  | 'text'
  | 'email'
  | 'password'
  | 'tel'
  | 'number'
  | 'url'
  | 'search'
  | 'date'
  | 'time'
  | 'datetime-local';

interface FormFieldProps {
  id?: string;
  label: string;
  type?: InputType;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  error?: string;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  readOnly?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  maxLength?: number;
  minLength?: number;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  pattern?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  className?: string;
  inputClassName?: string;
  labelClassName?: string;
  size?: 'small' | 'medium' | 'large';
  variant?: 'default' | 'filled' | 'outlined';
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  (
    {
      id: providedId,
      label,
      type = 'text',
      value,
      onChange,
      onBlur,
      onFocus,
      error,
      hint,
      placeholder,
      disabled = false,
      required = false,
      readOnly = false,
      autoComplete,
      autoFocus = false,
      maxLength,
      minLength,
      min,
      max,
      step,
      pattern,
      prefix,
      suffix,
      className = '',
      inputClassName = '',
      labelClassName = '',
      size = 'medium',
      variant = 'default',
    },
    ref
  ) => {
    const generatedId = useId();
    const fieldId = providedId || generatedId;
    const errorId = `${fieldId}-error`;
    const hintId = `${fieldId}-hint`;

    const hasError = Boolean(error);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    };

    const containerClasses = [
      'form-field',
      `form-field--${size}`,
      `form-field--${variant}`,
      hasError ? 'form-field--error' : '',
      disabled ? 'form-field--disabled' : '',
      prefix ? 'form-field--has-prefix' : '',
      suffix ? 'form-field--has-suffix' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const inputClasses = [
      'form-field__input',
      inputClassName,
    ]
      .filter(Boolean)
      .join(' ');

    const labelClasses = [
      'form-field__label',
      required ? 'form-field__label--required' : '',
      labelClassName,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={containerClasses}>
        <label htmlFor={fieldId} className={labelClasses}>
          {label}
          {required && <span className="form-field__required-indicator" aria-hidden="true">*</span>}
        </label>

        <div className="form-field__input-wrapper">
          {prefix && (
            <span className="form-field__prefix" aria-hidden="true">
              {prefix}
            </span>
          )}

          <input
            ref={ref}
            id={fieldId}
            type={type}
            value={value}
            onChange={handleChange}
            onBlur={onBlur}
            onFocus={onFocus}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={readOnly}
            required={required}
            autoComplete={autoComplete}
            autoFocus={autoFocus}
            maxLength={maxLength}
            minLength={minLength}
            min={min}
            max={max}
            step={step}
            pattern={pattern}
            className={inputClasses}
            aria-invalid={hasError}
            aria-describedby={
              [
                hasError ? errorId : null,
                hint ? hintId : null,
              ]
                .filter(Boolean)
                .join(' ') || undefined
            }
          />

          {suffix && (
            <span className="form-field__suffix">
              {suffix}
            </span>
          )}
        </div>

        {hint && !hasError && (
          <span id={hintId} className="form-field__hint">
            {hint}
          </span>
        )}

        {hasError && (
          <span id={errorId} className="form-field__error" role="alert">
            {error}
          </span>
        )}
      </div>
    );
  }
);

FormField.displayName = 'FormField';

// Textarea variant
interface TextareaFieldProps extends Omit<FormFieldProps, 'type' | 'prefix' | 'suffix' | 'min' | 'max' | 'step' | 'pattern'> {
  rows?: number;
  resize?: 'none' | 'vertical' | 'horizontal' | 'both';
}

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  (
    {
      id: providedId,
      label,
      value,
      onChange,
      onBlur,
      onFocus,
      error,
      hint,
      placeholder,
      disabled = false,
      required = false,
      readOnly = false,
      autoFocus = false,
      maxLength,
      minLength,
      className = '',
      inputClassName = '',
      labelClassName = '',
      size = 'medium',
      variant = 'default',
      rows = 4,
      resize = 'vertical',
    },
    ref
  ) => {
    const generatedId = useId();
    const fieldId = providedId || generatedId;
    const errorId = `${fieldId}-error`;
    const hintId = `${fieldId}-hint`;

    const hasError = Boolean(error);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    };

    return (
      <div
        className={`form-field form-field--textarea form-field--${size} form-field--${variant} ${
          hasError ? 'form-field--error' : ''
        } ${disabled ? 'form-field--disabled' : ''} ${className}`}
      >
        <label
          htmlFor={fieldId}
          className={`form-field__label ${required ? 'form-field__label--required' : ''} ${labelClassName}`}
        >
          {label}
          {required && <span className="form-field__required-indicator">*</span>}
        </label>

        <textarea
          ref={ref}
          id={fieldId}
          value={value}
          onChange={handleChange}
          onBlur={onBlur}
          onFocus={onFocus}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          autoFocus={autoFocus}
          maxLength={maxLength}
          minLength={minLength}
          rows={rows}
          className={`form-field__textarea ${inputClassName}`}
          style={{ resize }}
          aria-invalid={hasError}
          aria-describedby={
            [hasError ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
          }
        />

        {hint && !hasError && (
          <span id={hintId} className="form-field__hint">
            {hint}
          </span>
        )}

        {hasError && (
          <span id={errorId} className="form-field__error" role="alert">
            {error}
          </span>
        )}
      </div>
    );
  }
);

TextareaField.displayName = 'TextareaField';

// Select variant
interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectFieldProps extends Omit<FormFieldProps, 'type' | 'prefix' | 'suffix' | 'min' | 'max' | 'step' | 'pattern' | 'maxLength' | 'minLength'> {
  options: SelectOption[];
  emptyOptionLabel?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  (
    {
      id: providedId,
      label,
      value,
      onChange,
      onBlur,
      onFocus,
      error,
      hint,
      disabled = false,
      required = false,
      className = '',
      inputClassName = '',
      labelClassName = '',
      size = 'medium',
      variant = 'default',
      options,
      emptyOptionLabel = 'Select an option',
    },
    ref
  ) => {
    const generatedId = useId();
    const fieldId = providedId || generatedId;
    const errorId = `${fieldId}-error`;
    const hintId = `${fieldId}-hint`;

    const hasError = Boolean(error);

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(e.target.value);
    };

    return (
      <div
        className={`form-field form-field--select form-field--${size} form-field--${variant} ${
          hasError ? 'form-field--error' : ''
        } ${disabled ? 'form-field--disabled' : ''} ${className}`}
      >
        <label
          htmlFor={fieldId}
          className={`form-field__label ${required ? 'form-field__label--required' : ''} ${labelClassName}`}
        >
          {label}
          {required && <span className="form-field__required-indicator">*</span>}
        </label>

        <div className="form-field__select-wrapper">
          <select
            ref={ref}
            id={fieldId}
            value={value}
            onChange={handleChange}
            onBlur={onBlur}
            onFocus={onFocus}
            disabled={disabled}
            required={required}
            className={`form-field__select ${inputClassName}`}
            aria-invalid={hasError}
            aria-describedby={
              [hasError ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
            }
          >
            <option value="" disabled>
              {emptyOptionLabel}
            </option>
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="form-field__select-arrow" aria-hidden="true">
            ▼
          </span>
        </div>

        {hint && !hasError && (
          <span id={hintId} className="form-field__hint">
            {hint}
          </span>
        )}

        {hasError && (
          <span id={errorId} className="form-field__error" role="alert">
            {error}
          </span>
        )}
      </div>
    );
  }
);

SelectField.displayName = 'SelectField';

export default FormField;
