/**
 * Authentication Types for VendeeX 2.0
 * Member registration, login, and classification types
 * Aligned with VendeeX Avatar Technical Design Specification
 */

// ============================================================================
// MEMBER CLASSIFICATION - Entity Types (Not Pricing Tiers)
// ============================================================================

/**
 * Member Classification Enum
 * Defines the type of entity the member represents, not a pricing tier
 */
export enum MemberClassification {
  /** Individual consumers - personal buying assistance */
  PERSONAL_BUYER = 'PERSONAL_BUYER',
  /** Buying cooperatives - community-based group purchasing */
  COMMUNITY_GROUP = 'COMMUNITY_GROUP',
  /** Commercial organisations - business purchasing */
  BUSINESS_ENTITY = 'BUSINESS_ENTITY',
  /** Public sector entities - government purchasing (Coming Soon) */
  GOVERNMENT_AGENCY = 'GOVERNMENT_AGENCY',
  /** Demand consolidation services - aggregate buying (Coming Soon) */
  BUYING_AGGREGATOR = 'BUYING_AGGREGATOR',
}

/**
 * Member classification metadata for UI display
 */
export interface ClassificationMetadata {
  classification: MemberClassification;
  displayName: string;
  description: string;
  icon: string;
  isComingSoon: boolean;
  targetAudience: string;
  features: string[];
  requirements?: string[];
}

/**
 * Classification configuration data
 */
export const CLASSIFICATION_METADATA: ClassificationMetadata[] = [
  {
    classification: MemberClassification.PERSONAL_BUYER,
    displayName: 'Personal Buyer',
    description: 'AI-powered buying assistance for individual consumers',
    icon: 'user',
    isComingSoon: false,
    targetAudience: 'Individual consumers looking for personalised buying experiences',
    features: [
      'Personal AI buying avatar',
      'Preference learning over time',
      'Price tracking and alerts',
      'Personalised recommendations',
      'Budget management tools',
    ],
  },
  {
    classification: MemberClassification.COMMUNITY_GROUP,
    displayName: 'Community Group',
    description: 'Collective purchasing power for buying cooperatives',
    icon: 'users',
    isComingSoon: false,
    targetAudience: 'Buying cooperatives, neighbourhood groups, clubs, and community organisations',
    features: [
      'Group purchasing coordination',
      'Shared buying lists',
      'Bulk order management',
      'Cost splitting tools',
      'Community deals aggregation',
      'Multi-member avatar access',
    ],
    requirements: [
      'Minimum 3 members to form a group',
      'Designated group administrator',
    ],
  },
  {
    classification: MemberClassification.BUSINESS_ENTITY,
    displayName: 'Business Entity',
    description: 'Procurement solutions for commercial organisations',
    icon: 'building',
    isComingSoon: false,
    targetAudience: 'SMEs, corporations, and commercial organisations with procurement needs',
    features: [
      'Business procurement workflows',
      'Multi-user team access',
      'Approval hierarchies',
      'Expense categorisation',
      'Invoice management integration',
      'Vendor relationship tracking',
      'Budget controls and reporting',
    ],
    requirements: [
      'Valid business registration',
      'Designated procurement administrator',
    ],
  },
  {
    classification: MemberClassification.GOVERNMENT_AGENCY,
    displayName: 'Government Agency',
    description: 'Public sector procurement compliance and efficiency',
    icon: 'landmark',
    isComingSoon: true,
    targetAudience: 'Local authorities, government departments, and public sector organisations',
    features: [
      'Public procurement compliance',
      'Framework agreement integration',
      'Audit trail and transparency',
      'Social value tracking',
      'Accessibility requirements',
      'Inter-agency collaboration',
    ],
    requirements: [
      'Public sector verification',
      'Compliance officer designation',
    ],
  },
  {
    classification: MemberClassification.BUYING_AGGREGATOR,
    displayName: 'Buying Aggregator',
    description: 'Demand consolidation for maximum collective savings',
    icon: 'layers',
    isComingSoon: true,
    targetAudience: 'Organisations that aggregate demand across multiple buyers for better pricing',
    features: [
      'Demand aggregation tools',
      'Cross-organisation coordination',
      'Volume discount negotiation',
      'Market analytics',
      'Supplier tender management',
      'Distribution coordination',
    ],
    requirements: [
      'Aggregation licence verification',
      'Minimum volume commitments',
    ],
  },
];

// ============================================================================
// MEMBER STATUS AND AUTHENTICATION
// ============================================================================

/**
 * Member status
 */
export type MemberStatus =
  | 'pending'
  | 'active'
  | 'suspended'
  | 'deactivated';

/**
 * Authentication provider types
 */
export type AuthProvider =
  | 'email'
  | 'google'
  | 'apple'
  | 'facebook';

/**
 * User credentials for login
 */
export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

/**
 * Registration form data
 */
export interface RegistrationData {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  acceptTerms: boolean;
  acceptMarketing?: boolean;
  classification: MemberClassification;
  organisationName?: string;
  organisationSize?: OrganisationSize;
}

/**
 * Organisation size categories
 */
export type OrganisationSize =
  | 'individual'
  | 'small'      // 2-10 members
  | 'medium'     // 11-50 members
  | 'large'      // 51-200 members
  | 'enterprise'; // 200+ members

/**
 * Member profile
 */
export interface Member {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  classification: MemberClassification;
  status: MemberStatus;
  avatarId?: string;
  organisationId?: string;
  organisationName?: string;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  emailVerified: boolean;
  profileImageUrl?: string;
}

/**
 * Authentication state
 */
export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  member: Member | null;
  token: string | null;
  error: AuthError | null;
}

/**
 * Authentication error
 */
export interface AuthError {
  code: string;
  message: string;
  field?: string;
}

/**
 * Login response from API
 */
export interface LoginResponse {
  success: boolean;
  member: Member;
  token: string;
  refreshToken: string;
  expiresAt: Date;
}

/**
 * Registration response from API
 */
export interface RegistrationResponse {
  success: boolean;
  member: Member;
  token: string;
  refreshToken: string;
  requiresEmailVerification: boolean;
}

/**
 * Password reset request
 */
export interface PasswordResetRequest {
  email: string;
}

/**
 * Password reset confirmation
 */
export interface PasswordResetConfirmation {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * Session information
 */
export interface Session {
  id: string;
  memberId: string;
  token: string;
  refreshToken: string;
  expiresAt: Date;
  createdAt: Date;
  deviceInfo?: DeviceInfo;
}

/**
 * Device information for session tracking
 */
export interface DeviceInfo {
  userAgent: string;
  platform: string;
  ip?: string;
}

// ============================================================================
// CLASSIFICATION FEATURES (Legacy Support - Now Based on Entity Type)
// ============================================================================

/**
 * @deprecated Use ClassificationMetadata instead
 * Maintained for backward compatibility
 */
export interface ClassificationFeatures {
  classification: MemberClassification;
  displayName: string;
  description: string;
  price: number;
  billingPeriod: 'monthly' | 'yearly';
  features: string[];
  limits: {
    avatarsAllowed: number;
    searchesPerDay: number;
    savedProducts: number;
    priceAlerts: number;
  };
}

/**
 * Registration wizard step
 */
export interface RegistrationStep {
  id: number;
  title: string;
  description: string;
  isCompleted: boolean;
  isActive: boolean;
}

/**
 * Form validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a classification is coming soon
 */
export function isClassificationComingSoon(classification: MemberClassification): boolean {
  return classification === MemberClassification.GOVERNMENT_AGENCY ||
         classification === MemberClassification.BUYING_AGGREGATOR;
}

/**
 * Get classification metadata by type
 */
export function getClassificationMetadata(classification: MemberClassification): ClassificationMetadata | undefined {
  return CLASSIFICATION_METADATA.find(c => c.classification === classification);
}

/**
 * Get available (non-coming-soon) classifications
 */
export function getAvailableClassifications(): ClassificationMetadata[] {
  return CLASSIFICATION_METADATA.filter(c => !c.isComingSoon);
}
