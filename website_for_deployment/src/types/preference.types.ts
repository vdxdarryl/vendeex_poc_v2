/**
 * Preference Types for VendeeX 2.0
 * User and Avatar preference configuration types
 */

import type { ProductCategory, QualityPreference } from './avatar.types';

// Preference category groupings
export type PreferenceCategory =
  | 'buying'
  | 'notification'
  | 'privacy'
  | 'accessibility'
  | 'display';

// Buying preferences
export interface BuyingPreferences {
  defaultCurrency: CurrencyCode;
  defaultCountry: CountryCode;
  priceDisplayFormat: PriceDisplayFormat;
  showOriginalPrices: boolean;
  showPriceHistory: boolean;
  autoApplyCoupons: boolean;
  compareAcrossStores: boolean;
  defaultSortOrder: SortOrder;
  resultsPerPage: number;
}

// Currency codes (ISO 4217)
export type CurrencyCode =
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'CAD'
  | 'AUD'
  | 'JPY'
  | 'CNY'
  | 'INR';

// Country codes (ISO 3166-1 alpha-2)
export type CountryCode =
  | 'US'
  | 'GB'
  | 'CA'
  | 'AU'
  | 'DE'
  | 'FR'
  | 'JP'
  | 'CN'
  | 'IN';

// Price display format
export type PriceDisplayFormat =
  | 'symbol-first'   // $100
  | 'symbol-last'    // 100$
  | 'code-first'     // USD 100
  | 'code-last';     // 100 USD

// Sort order options
export type SortOrder =
  | 'relevance'
  | 'price-low-high'
  | 'price-high-low'
  | 'rating'
  | 'reviews'
  | 'newest'
  | 'best-match';

// Notification preferences
export interface NotificationPreferences {
  emailEnabled: boolean;
  pushEnabled: boolean;
  smsEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // HH:mm format
  quietHoursEnd: string;
  notificationTypes: NotificationTypeSettings;
}

// Notification type toggles
export interface NotificationTypeSettings {
  orderUpdates: boolean;
  priceAlerts: boolean;
  dealAlerts: boolean;
  productRecommendations: boolean;
  accountAlerts: boolean;
  marketingEmails: boolean;
  weeklyDigest: boolean;
}

// Privacy preferences
export interface PrivacyPreferences {
  shareSearchHistory: boolean;
  sharePurchaseHistory: boolean;
  allowPersonalization: boolean;
  allowThirdPartyTracking: boolean;
  showProfilePublicly: boolean;
  dataRetentionPeriod: DataRetentionPeriod;
}

// Data retention periods
export type DataRetentionPeriod =
  | '30-days'
  | '90-days'
  | '1-year'
  | 'indefinite';

// Accessibility preferences
export interface AccessibilityPreferences {
  highContrastMode: boolean;
  reducedMotion: boolean;
  fontSize: FontSize;
  screenReaderOptimized: boolean;
  keyboardNavigationEnhanced: boolean;
}

// Font size options
export type FontSize =
  | 'small'
  | 'medium'
  | 'large'
  | 'extra-large';

// Display preferences
export interface DisplayPreferences {
  theme: Theme;
  colorScheme: ColorScheme;
  compactMode: boolean;
  showImages: boolean;
  showRatings: boolean;
  showReviewCounts: boolean;
  gridViewDefault: boolean;
  cardsPerRow: number;
}

// Theme options
export type Theme =
  | 'light'
  | 'dark'
  | 'system';

// Color scheme customization
export interface ColorScheme {
  primary: string;
  secondary: string;
  accent: string;
}

// Combined user preferences
export interface UserPreferences {
  buying: BuyingPreferences;
  notifications: NotificationPreferences;
  privacy: PrivacyPreferences;
  accessibility: AccessibilityPreferences;
  display: DisplayPreferences;
}

// Preference update request
export interface PreferenceUpdateRequest {
  category: PreferenceCategory;
  preferences: Partial<
    | BuyingPreferences
    | NotificationPreferences
    | PrivacyPreferences
    | AccessibilityPreferences
    | DisplayPreferences
  >;
}

// Preference configuration field
export interface PreferenceField {
  id: string;
  label: string;
  description: string;
  type: PreferenceFieldType;
  category: PreferenceCategory;
  defaultValue: unknown;
  options?: PreferenceOption[];
  validation?: PreferenceValidation;
}

// Preference field types
export type PreferenceFieldType =
  | 'toggle'
  | 'select'
  | 'multi-select'
  | 'range'
  | 'text'
  | 'number'
  | 'time'
  | 'color';

// Preference option for select fields
export interface PreferenceOption {
  value: string;
  label: string;
  description?: string;
  icon?: string;
}

// Preference validation rules
export interface PreferenceValidation {
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  customValidator?: string;
}

// Preference section for UI grouping
export interface PreferenceSection {
  id: string;
  title: string;
  description: string;
  category: PreferenceCategory;
  fields: PreferenceField[];
  icon?: string;
}

// Quick preference presets
export interface PreferencePreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  preferences: Partial<UserPreferences>;
}

// Preference import/export
export interface PreferenceExport {
  version: string;
  exportedAt: Date;
  preferences: UserPreferences;
}
