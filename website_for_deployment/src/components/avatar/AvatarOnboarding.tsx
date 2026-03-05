import React, { useState, useEffect } from 'react';
import type {
  Avatar,
  PreferenceWeights,
  OnboardingState,
  OnboardingStep,
} from '../../types/avatar.types';
import { AuthorityLevel } from '../../types/avatar.types';
import { MemberClassification } from '../../types/auth.types';
import { useAuth } from '../../hooks/useAuth';
import { avatarService, type CreateAvatarParams } from '../../services/avatarService';

interface AvatarOnboardingProps {
  onComplete?: (avatar: Avatar) => void;
  onSkip?: () => void;
}

// Currency options
const CURRENCIES = [
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
];

// Dimension info for ranking
const PREFERENCE_DIMENSIONS: {
  key: keyof PreferenceWeights;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    key: 'economic',
    label: 'Price & Value',
    description: 'Budget consciousness, finding the best deals',
    icon: '💰',
  },
  {
    key: 'environmental',
    label: 'Sustainability',
    description: 'Eco-friendly products, minimal packaging',
    icon: '🌱',
  },
  {
    key: 'social',
    label: 'Ethics & Community',
    description: 'Fair trade, local businesses, ethical sourcing',
    icon: '🤝',
  },
  {
    key: 'temporal',
    label: 'Speed & Timing',
    description: 'Fast delivery, scheduling flexibility',
    icon: '⚡',
  },
  {
    key: 'quality',
    label: 'Quality & Brand',
    description: 'Premium products, trusted brands',
    icon: '⭐',
  },
];

// Authority level options
const AUTHORITY_OPTIONS: {
  level: AuthorityLevel;
  name: string;
  tagline: string;
  description: string;
  icon: string;
}[] = [
  {
    level: AuthorityLevel.OBSERVATION,
    name: 'Conservative',
    tagline: 'I want to approve everything',
    description: 'Your Avatar will research and suggest options, but won\'t take any action without your explicit approval.',
    icon: '👁️',
  },
  {
    level: AuthorityLevel.NEGOTIATION,
    name: 'Balanced',
    tagline: 'Find deals but ask before buying',
    description: 'Your Avatar can negotiate prices and hold items, but will ask for confirmation before making purchases.',
    icon: '🤝',
  },
  {
    level: AuthorityLevel.TRANSACTION,
    name: 'Autonomous',
    tagline: 'Buy within my limits automatically',
    description: 'Your Avatar can complete purchases automatically within your set budget limits, notifying you after.',
    icon: '🚀',
  },
];

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 1,
    title: 'Welcome',
    description: 'Meet your Avatar',
    component: 'welcome',
    isCompleted: false,
    isActive: true,
    isSkippable: false,
  },
  {
    id: 2,
    title: 'Buying Priorities',
    description: 'What matters most to you',
    component: 'priorities',
    isCompleted: false,
    isActive: false,
    isSkippable: false,
  },
  {
    id: 3,
    title: 'Budget Settings',
    description: 'Set your spending limits',
    component: 'budget',
    isCompleted: false,
    isActive: false,
    isSkippable: true,
  },
  {
    id: 4,
    title: 'Agent Authority',
    description: 'How much control for your Avatar',
    component: 'authority',
    isCompleted: false,
    isActive: false,
    isSkippable: false,
  },
  {
    id: 5,
    title: 'Review',
    description: 'Confirm your settings',
    component: 'review',
    isCompleted: false,
    isActive: false,
    isSkippable: false,
  },
];

interface BudgetSettings {
  currency: string;
  minPrice: number;
  maxPrice: number;
  monthlyBudget?: number;
}

export const AvatarOnboarding: React.FC<AvatarOnboardingProps> = ({
  onComplete,
  onSkip,
}) => {
  const { member } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [onboardingState, setOnboardingState] = useState<OnboardingState>({
    currentStep: 1,
    totalSteps: ONBOARDING_STEPS.length,
    steps: ONBOARDING_STEPS,
    avatarData: {},
    isComplete: false,
  });

  // Avatar name
  const [avatarName, setAvatarName] = useState('');
  const [nameError, setNameError] = useState('');

  // Priority ranking (1 = most important, 5 = least important)
  const [priorityRanking, setPriorityRanking] = useState<Record<keyof PreferenceWeights, number>>({
    economic: 1,
    environmental: 4,
    social: 5,
    temporal: 3,
    quality: 2,
  });
  const [draggedItem, setDraggedItem] = useState<keyof PreferenceWeights | null>(null);

  // Budget settings
  const [budgetSettings, setBudgetSettings] = useState<BudgetSettings>({
    currency: 'GBP',
    minPrice: 0,
    maxPrice: 200,
    monthlyBudget: undefined,
  });

  // Authority level
  const [authorityLevel, setAuthorityLevel] = useState<AuthorityLevel>(AuthorityLevel.NEGOTIATION);

  // Initialize default weights based on member classification
  useEffect(() => {
    if (member?.classification) {
      const defaultWeights = avatarService.getDefaultWeightsForClassification(
        member.classification as MemberClassification
      );
      // Convert weights to ranking (higher weight = lower rank number)
      const sortedDimensions = (Object.entries(defaultWeights) as [keyof PreferenceWeights, number][])
        .sort((a, b) => b[1] - a[1]);

      const newRanking: Record<keyof PreferenceWeights, number> = {} as any;
      sortedDimensions.forEach(([key], index) => {
        newRanking[key] = index + 1;
      });
      setPriorityRanking(newRanking);
    }
  }, [member?.classification]);

  const goToStep = (step: number) => {
    setOnboardingState(prev => ({
      ...prev,
      currentStep: step,
      steps: prev.steps.map(s => ({
        ...s,
        isActive: s.id === step,
        isCompleted: s.id < step,
      })),
    }));
  };

  const validateStep = (step: number): boolean => {
    if (step === 1) {
      if (!avatarName.trim()) {
        setNameError('Please give your Avatar a name');
        return false;
      }
      if (avatarName.length < 2) {
        setNameError('Name must be at least 2 characters');
        return false;
      }
      setNameError('');
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep(onboardingState.currentStep)) {
      if (onboardingState.currentStep < onboardingState.totalSteps) {
        goToStep(onboardingState.currentStep + 1);
      }
    }
  };

  const handleBack = () => {
    if (onboardingState.currentStep > 1) {
      goToStep(onboardingState.currentStep - 1);
    }
  };

  const handleComplete = async () => {
    if (!member) {
      setError('You must be logged in to create an Avatar');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Convert ranking to weights
      const weights = avatarService.rankingToWeights(priorityRanking);

      const params: CreateAvatarParams = {
        memberId: member.id,
        memberClassification: member.classification as MemberClassification,
        name: avatarName,
        preferenceWeights: weights,
        budgetSettings,
        authorityLevel,
      };

      const avatar = await avatarService.createAvatar(params);
      onComplete?.(avatar);
    } catch (err: any) {
      setError(err.message || 'Failed to create Avatar');
    } finally {
      setIsLoading(false);
    }
  };

  // Drag and drop handlers for priority ranking
  const handleDragStart = (e: React.DragEvent, dimension: keyof PreferenceWeights) => {
    setDraggedItem(dimension);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetDimension: keyof PreferenceWeights) => {
    e.preventDefault();
    if (!draggedItem || draggedItem === targetDimension) {
      setDraggedItem(null);
      return;
    }

    // Swap rankings
    const draggedRank = priorityRanking[draggedItem];
    const targetRank = priorityRanking[targetDimension];

    setPriorityRanking(prev => ({
      ...prev,
      [draggedItem]: targetRank,
      [targetDimension]: draggedRank,
    }));
    setDraggedItem(null);
  };

  // Click to swap rankings
  const handleRankClick = (dimension: keyof PreferenceWeights, newRank: number) => {
    // Find which dimension currently has this rank
    const currentHolder = Object.entries(priorityRanking).find(([, rank]) => rank === newRank)?.[0] as keyof PreferenceWeights | undefined;

    if (currentHolder && currentHolder !== dimension) {
      // Swap
      setPriorityRanking(prev => ({
        ...prev,
        [dimension]: newRank,
        [currentHolder]: prev[dimension],
      }));
    } else {
      setPriorityRanking(prev => ({
        ...prev,
        [dimension]: newRank,
      }));
    }
  };

  const renderProgressBar = () => (
    <div className="onboarding-progress">
      <div className="progress-steps">
        {onboardingState.steps.map((step, index) => (
          <React.Fragment key={step.id}>
            <button
              type="button"
              className={`progress-step ${step.isActive ? 'active' : ''} ${step.isCompleted ? 'completed' : ''}`}
              onClick={() => step.isCompleted && goToStep(step.id)}
              disabled={!step.isCompleted && !step.isActive}
            >
              <span className="step-number">{step.isCompleted ? '✓' : step.id}</span>
              <span className="step-label">{step.title}</span>
            </button>
            {index < onboardingState.steps.length - 1 && (
              <div className={`step-connector ${step.isCompleted ? 'completed' : ''}`} />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );

  const renderWelcomeStep = () => (
    <div className="onboarding-step-content welcome-step">
      <div className="welcome-illustration">
        <div className="avatar-hero">
          <span className="avatar-emoji">🤖</span>
        </div>
      </div>

      <h2>Meet Your Buying Avatar</h2>
      <p className="welcome-description">
        Your Avatar is an AI-powered buying assistant that learns your preferences
        and helps you find the best products. It can search for deals, compare prices,
        and even make purchases on your behalf.
      </p>

      <div className="avatar-benefits">
        <div className="benefit">
          <span className="benefit-icon">🔍</span>
          <div>
            <strong>Smart Search</strong>
            <p>Finds products matching your exact preferences</p>
          </div>
        </div>
        <div className="benefit">
          <span className="benefit-icon">💡</span>
          <div>
            <strong>Learns Over Time</strong>
            <p>Gets better at understanding what you want</p>
          </div>
        </div>
        <div className="benefit">
          <span className="benefit-icon">🛡️</span>
          <div>
            <strong>You're in Control</strong>
            <p>Set limits and approve decisions</p>
          </div>
        </div>
      </div>

      <div className="avatar-name-section">
        <label htmlFor="avatarName">Give your Avatar a name</label>
        <input
          id="avatarName"
          type="text"
          value={avatarName}
          onChange={(e) => {
            setAvatarName(e.target.value);
            setNameError('');
          }}
          placeholder="e.g., Max, Luna, Scout..."
          maxLength={20}
          className={nameError ? 'error' : ''}
        />
        {nameError && <span className="field-error">{nameError}</span>}
        <div className="name-suggestions">
          <span>Try:</span>
          {['Scout', 'Nova', 'Atlas', 'Echo', 'Sage'].map(name => (
            <button
              key={name}
              type="button"
              className="suggestion-chip"
              onClick={() => setAvatarName(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderPrioritiesStep = () => {
    const sortedDimensions = [...PREFERENCE_DIMENSIONS].sort(
      (a, b) => priorityRanking[a.key] - priorityRanking[b.key]
    );

    return (
      <div className="onboarding-step-content priorities-step">
        <h2>What Matters Most to You?</h2>
        <p className="step-description">
          Rank these buying priorities from most important (1) to least important (5).
          Drag to reorder or click the numbers to change ranking.
        </p>

        <div className="priority-list">
          {sortedDimensions.map((dim) => (
            <div
              key={dim.key}
              className={`priority-item ${draggedItem === dim.key ? 'dragging' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, dim.key)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, dim.key)}
            >
              <div className="priority-rank">
                <select
                  value={priorityRanking[dim.key]}
                  onChange={(e) => handleRankClick(dim.key, parseInt(e.target.value))}
                >
                  {[1, 2, 3, 4, 5].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div className="priority-icon">{dim.icon}</div>
              <div className="priority-content">
                <strong>{dim.label}</strong>
                <p>{dim.description}</p>
              </div>
              <div className="priority-handle">⋮⋮</div>
            </div>
          ))}
        </div>

        <div className="priority-preview">
          <h4>Preview: Your Avatar will prioritise...</h4>
          <div className="preview-weights">
            {sortedDimensions.slice(0, 3).map((dim, index) => (
              <span key={dim.key} className={`preview-weight rank-${index + 1}`}>
                {index + 1}. {dim.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderBudgetStep = () => {
    const selectedCurrency = CURRENCIES.find(c => c.code === budgetSettings.currency);

    return (
      <div className="onboarding-step-content budget-step">
        <h2>Set Your Budget Preferences</h2>
        <p className="step-description">
          Help your Avatar understand your comfortable spending range.
          These can be adjusted anytime.
        </p>

        <div className="budget-form">
          <div className="form-group">
            <label htmlFor="currency">Currency</label>
            <select
              id="currency"
              value={budgetSettings.currency}
              onChange={(e) => setBudgetSettings(prev => ({ ...prev, currency: e.target.value }))}
            >
              {CURRENCIES.map(currency => (
                <option key={currency.code} value={currency.code}>
                  {currency.symbol} {currency.name} ({currency.code})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Comfortable Price Range (per transaction)</label>
            <div className="price-range-inputs">
              <div className="price-input">
                <span className="currency-symbol">{selectedCurrency?.symbol}</span>
                <input
                  type="number"
                  value={budgetSettings.minPrice}
                  onChange={(e) => setBudgetSettings(prev => ({
                    ...prev,
                    minPrice: Math.max(0, parseInt(e.target.value) || 0)
                  }))}
                  min={0}
                  placeholder="Min"
                />
              </div>
              <span className="range-separator">to</span>
              <div className="price-input">
                <span className="currency-symbol">{selectedCurrency?.symbol}</span>
                <input
                  type="number"
                  value={budgetSettings.maxPrice}
                  onChange={(e) => setBudgetSettings(prev => ({
                    ...prev,
                    maxPrice: Math.max(prev.minPrice, parseInt(e.target.value) || 0)
                  }))}
                  min={budgetSettings.minPrice}
                  placeholder="Max"
                />
              </div>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="monthlyBudget">
              Monthly Budget Limit (optional)
              <span className="optional-badge">Optional</span>
            </label>
            <div className="price-input">
              <span className="currency-symbol">{selectedCurrency?.symbol}</span>
              <input
                id="monthlyBudget"
                type="number"
                value={budgetSettings.monthlyBudget || ''}
                onChange={(e) => setBudgetSettings(prev => ({
                  ...prev,
                  monthlyBudget: e.target.value ? parseInt(e.target.value) : undefined
                }))}
                min={0}
                placeholder="No limit set"
              />
            </div>
            <span className="field-hint">
              Your Avatar will alert you when approaching this limit
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderAuthorityStep = () => (
    <div className="onboarding-step-content authority-step">
      <h2>How Much Control for Your Avatar?</h2>
      <p className="step-description">
        Choose how independently your Avatar can act. You can change this later.
      </p>

      <div className="authority-options">
        {AUTHORITY_OPTIONS.map(option => (
          <button
            key={option.level}
            type="button"
            className={`authority-card ${authorityLevel === option.level ? 'selected' : ''}`}
            onClick={() => setAuthorityLevel(option.level)}
          >
            <div className="authority-icon">{option.icon}</div>
            <div className="authority-content">
              <h3>{option.name}</h3>
              <p className="authority-tagline">{option.tagline}</p>
              <p className="authority-description">{option.description}</p>
            </div>
            {authorityLevel === option.level && (
              <span className="selected-indicator">✓</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );

  const renderReviewStep = () => {
    const weights = avatarService.rankingToWeights(priorityRanking);
    const sortedDimensions = [...PREFERENCE_DIMENSIONS].sort(
      (a, b) => priorityRanking[a.key] - priorityRanking[b.key]
    );
    const selectedAuthority = AUTHORITY_OPTIONS.find(o => o.level === authorityLevel);
    const selectedCurrency = CURRENCIES.find(c => c.code === budgetSettings.currency);

    return (
      <div className="onboarding-step-content review-step">
        <h2>Review Your Settings</h2>
        <p className="step-description">
          Here's how your Avatar "{avatarName}" will be configured.
        </p>

        <div className="review-sections">
          <div className="review-section">
            <h4>Avatar Name</h4>
            <div className="review-value">{avatarName}</div>
          </div>

          <div className="review-section">
            <h4>Buying Priorities</h4>
            <div className="review-priorities">
              {sortedDimensions.map((dim, index) => (
                <div key={dim.key} className="review-priority">
                  <span className="rank">#{index + 1}</span>
                  <span className="icon">{dim.icon}</span>
                  <span className="label">{dim.label}</span>
                  <span className="weight">{Math.round(weights[dim.key] * 100)}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="review-section">
            <h4>Budget Settings</h4>
            <div className="review-budget">
              <div className="review-row">
                <span>Currency:</span>
                <span>{selectedCurrency?.symbol} {selectedCurrency?.code}</span>
              </div>
              <div className="review-row">
                <span>Price Range:</span>
                <span>
                  {selectedCurrency?.symbol}{budgetSettings.minPrice} - {selectedCurrency?.symbol}{budgetSettings.maxPrice}
                </span>
              </div>
              {budgetSettings.monthlyBudget && (
                <div className="review-row">
                  <span>Monthly Limit:</span>
                  <span>{selectedCurrency?.symbol}{budgetSettings.monthlyBudget}</span>
                </div>
              )}
            </div>
          </div>

          <div className="review-section">
            <h4>Agent Authority</h4>
            <div className="review-authority">
              <span className="authority-icon">{selectedAuthority?.icon}</span>
              <div>
                <strong>{selectedAuthority?.name}</strong>
                <p>{selectedAuthority?.tagline}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="review-note">
          <span className="note-icon">💡</span>
          <p>
            You can modify any of these settings later from your Avatar's dashboard.
          </p>
        </div>
      </div>
    );
  };

  const currentStepData = onboardingState.steps[onboardingState.currentStep - 1];

  return (
    <div className="avatar-onboarding">
      {renderProgressBar()}

      {error && (
        <div className="onboarding-error" role="alert">
          <span className="error-icon">!</span>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="dismiss-error">×</button>
        </div>
      )}

      <div className="onboarding-content">
        {onboardingState.currentStep === 1 && renderWelcomeStep()}
        {onboardingState.currentStep === 2 && renderPrioritiesStep()}
        {onboardingState.currentStep === 3 && renderBudgetStep()}
        {onboardingState.currentStep === 4 && renderAuthorityStep()}
        {onboardingState.currentStep === 5 && renderReviewStep()}
      </div>

      <div className="onboarding-actions">
        <div className="action-left">
          {onboardingState.currentStep > 1 && (
            <button
              type="button"
              className="btn-secondary"
              onClick={handleBack}
              disabled={isLoading}
            >
              Back
            </button>
          )}
        </div>

        <div className="action-center">
          {currentStepData?.isSkippable && onboardingState.currentStep < onboardingState.totalSteps && (
            <button
              type="button"
              className="btn-text"
              onClick={handleNext}
              disabled={isLoading}
            >
              Skip this step
            </button>
          )}
        </div>

        <div className="action-right">
          {onSkip && onboardingState.currentStep === 1 && (
            <button
              type="button"
              className="btn-text"
              onClick={onSkip}
              disabled={isLoading}
            >
              Skip for now
            </button>
          )}

          {onboardingState.currentStep < onboardingState.totalSteps ? (
            <button
              type="button"
              className="btn-primary"
              onClick={handleNext}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={handleComplete}
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="loading-spinner" />
              ) : (
                'Looks Good!'
              )}
            </button>
          )}
        </div>
      </div>

      <style>{`
        .avatar-onboarding {
          max-width: 700px;
          margin: 0 auto;
          padding: 2rem;
        }

        .onboarding-progress {
          margin-bottom: 2rem;
        }

        .progress-steps {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .progress-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0.5rem;
        }

        .progress-step:disabled {
          cursor: default;
        }

        .step-number {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: var(--border-color, #e5e7eb);
          color: var(--text-secondary, #6b7280);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 0.9rem;
          transition: all 0.2s;
        }

        .progress-step.active .step-number {
          background: var(--primary-color, #2563eb);
          color: white;
        }

        .progress-step.completed .step-number {
          background: #10b981;
          color: white;
        }

        .step-label {
          font-size: 0.75rem;
          color: var(--text-tertiary, #9ca3af);
          white-space: nowrap;
        }

        .progress-step.active .step-label {
          color: var(--primary-color, #2563eb);
          font-weight: 500;
        }

        .step-connector {
          flex: 1;
          height: 2px;
          background: var(--border-color, #e5e7eb);
          margin: 0 0.5rem;
          margin-bottom: 1.5rem;
        }

        .step-connector.completed {
          background: #10b981;
        }

        .onboarding-error {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          color: #991b1b;
          margin-bottom: 1.5rem;
        }

        .error-icon {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #991b1b;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          flex-shrink: 0;
        }

        .dismiss-error {
          margin-left: auto;
          background: none;
          border: none;
          color: #991b1b;
          font-size: 1.25rem;
          cursor: pointer;
          padding: 0 0.5rem;
        }

        .onboarding-content {
          background: var(--card-bg, #fff);
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 12px;
          padding: 2rem;
          margin-bottom: 1.5rem;
        }

        .onboarding-step-content h2 {
          margin: 0 0 0.5rem 0;
          font-size: 1.5rem;
          color: var(--text-primary, #111827);
        }

        .step-description {
          color: var(--text-secondary, #6b7280);
          margin-bottom: 1.5rem;
        }

        /* Welcome Step */
        .welcome-step {
          text-align: center;
        }

        .welcome-illustration {
          margin-bottom: 1.5rem;
        }

        .avatar-hero {
          width: 100px;
          height: 100px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto;
          box-shadow: 0 10px 40px rgba(102, 126, 234, 0.3);
        }

        .avatar-emoji {
          font-size: 3rem;
        }

        .welcome-description {
          max-width: 500px;
          margin: 0 auto 2rem;
          color: var(--text-secondary, #6b7280);
          line-height: 1.6;
        }

        .avatar-benefits {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-bottom: 2rem;
          text-align: left;
        }

        .benefit {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1rem;
          background: var(--card-bg-alt, #f9fafb);
          border-radius: 8px;
        }

        .benefit-icon {
          font-size: 1.5rem;
          flex-shrink: 0;
        }

        .benefit strong {
          display: block;
          margin-bottom: 0.25rem;
          color: var(--text-primary, #111827);
        }

        .benefit p {
          margin: 0;
          font-size: 0.875rem;
          color: var(--text-secondary, #6b7280);
        }

        .avatar-name-section {
          max-width: 400px;
          margin: 0 auto;
          text-align: left;
        }

        .avatar-name-section label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: var(--text-primary, #111827);
        }

        .avatar-name-section input {
          width: 100%;
          padding: 0.75rem 1rem;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 8px;
          font-size: 1rem;
          transition: border-color 0.2s;
        }

        .avatar-name-section input:focus {
          outline: none;
          border-color: var(--primary-color, #2563eb);
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }

        .avatar-name-section input.error {
          border-color: #ef4444;
        }

        .field-error {
          display: block;
          color: #ef4444;
          font-size: 0.875rem;
          margin-top: 0.5rem;
        }

        .name-suggestions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.75rem;
          flex-wrap: wrap;
        }

        .name-suggestions span {
          color: var(--text-tertiary, #9ca3af);
          font-size: 0.875rem;
        }

        .suggestion-chip {
          background: var(--card-bg-alt, #f3f4f6);
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 16px;
          padding: 0.375rem 0.75rem;
          font-size: 0.875rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .suggestion-chip:hover {
          background: var(--primary-color, #2563eb);
          color: white;
          border-color: var(--primary-color, #2563eb);
        }

        /* Priorities Step */
        .priority-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }

        .priority-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          background: var(--card-bg, #fff);
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 8px;
          cursor: grab;
          transition: all 0.2s;
        }

        .priority-item:hover {
          border-color: var(--primary-color, #2563eb);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        .priority-item.dragging {
          opacity: 0.5;
          transform: scale(1.02);
        }

        .priority-rank select {
          width: 48px;
          padding: 0.5rem;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 6px;
          font-weight: 600;
          font-size: 1rem;
          text-align: center;
          cursor: pointer;
        }

        .priority-icon {
          font-size: 1.5rem;
          flex-shrink: 0;
        }

        .priority-content {
          flex: 1;
        }

        .priority-content strong {
          display: block;
          color: var(--text-primary, #111827);
        }

        .priority-content p {
          margin: 0.25rem 0 0;
          font-size: 0.875rem;
          color: var(--text-secondary, #6b7280);
        }

        .priority-handle {
          color: var(--text-tertiary, #9ca3af);
          cursor: grab;
        }

        .priority-preview {
          padding: 1rem;
          background: var(--card-bg-alt, #f9fafb);
          border-radius: 8px;
        }

        .priority-preview h4 {
          margin: 0 0 0.75rem;
          font-size: 0.875rem;
          color: var(--text-secondary, #6b7280);
        }

        .preview-weights {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .preview-weight {
          padding: 0.375rem 0.75rem;
          border-radius: 16px;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .preview-weight.rank-1 {
          background: #dbeafe;
          color: #1e40af;
        }

        .preview-weight.rank-2 {
          background: #e0e7ff;
          color: #3730a3;
        }

        .preview-weight.rank-3 {
          background: #f3e8ff;
          color: #6b21a8;
        }

        /* Budget Step */
        .budget-form {
          max-width: 450px;
          margin: 0 auto;
        }

        .form-group {
          margin-bottom: 1.5rem;
        }

        .form-group label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: var(--text-primary, #111827);
        }

        .optional-badge {
          font-size: 0.75rem;
          font-weight: 400;
          color: var(--text-tertiary, #9ca3af);
          background: var(--card-bg-alt, #f3f4f6);
          padding: 0.125rem 0.5rem;
          border-radius: 4px;
        }

        .form-group select,
        .form-group input {
          width: 100%;
          padding: 0.75rem 1rem;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 8px;
          font-size: 1rem;
        }

        .price-range-inputs {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .price-input {
          display: flex;
          align-items: center;
          flex: 1;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 8px;
          overflow: hidden;
        }

        .price-input input {
          border: none;
          padding: 0.75rem;
          width: 100%;
        }

        .currency-symbol {
          padding: 0 0.75rem;
          background: var(--card-bg-alt, #f3f4f6);
          color: var(--text-secondary, #6b7280);
          font-weight: 500;
        }

        .range-separator {
          color: var(--text-tertiary, #9ca3af);
        }

        .field-hint {
          display: block;
          margin-top: 0.5rem;
          font-size: 0.875rem;
          color: var(--text-tertiary, #9ca3af);
        }

        /* Authority Step */
        .authority-options {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .authority-card {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1.25rem;
          background: var(--card-bg, #fff);
          border: 2px solid var(--border-color, #e5e7eb);
          border-radius: 12px;
          cursor: pointer;
          text-align: left;
          transition: all 0.2s;
          position: relative;
        }

        .authority-card:hover {
          border-color: var(--primary-color, #2563eb);
        }

        .authority-card.selected {
          border-color: var(--primary-color, #2563eb);
          background: rgba(37, 99, 235, 0.04);
        }

        .authority-icon {
          font-size: 2rem;
          flex-shrink: 0;
        }

        .authority-content h3 {
          margin: 0 0 0.25rem;
          font-size: 1.1rem;
          color: var(--text-primary, #111827);
        }

        .authority-tagline {
          margin: 0 0 0.5rem;
          font-weight: 500;
          color: var(--primary-color, #2563eb);
          font-size: 0.95rem;
        }

        .authority-description {
          margin: 0;
          font-size: 0.875rem;
          color: var(--text-secondary, #6b7280);
          line-height: 1.5;
        }

        .selected-indicator {
          position: absolute;
          top: 1rem;
          right: 1rem;
          width: 24px;
          height: 24px;
          background: var(--primary-color, #2563eb);
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.875rem;
        }

        /* Review Step */
        .review-sections {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .review-section {
          padding: 1rem;
          background: var(--card-bg-alt, #f9fafb);
          border-radius: 8px;
        }

        .review-section h4 {
          margin: 0 0 0.75rem;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-tertiary, #9ca3af);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .review-value {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--primary-color, #2563eb);
        }

        .review-priorities {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .review-priority {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem;
          background: var(--card-bg, #fff);
          border-radius: 6px;
        }

        .review-priority .rank {
          font-weight: 600;
          color: var(--text-secondary, #6b7280);
          width: 24px;
        }

        .review-priority .icon {
          font-size: 1.25rem;
        }

        .review-priority .label {
          flex: 1;
          color: var(--text-primary, #111827);
        }

        .review-priority .weight {
          font-weight: 500;
          color: var(--primary-color, #2563eb);
        }

        .review-budget {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .review-row {
          display: flex;
          justify-content: space-between;
        }

        .review-row span:first-child {
          color: var(--text-secondary, #6b7280);
        }

        .review-row span:last-child {
          font-weight: 500;
          color: var(--text-primary, #111827);
        }

        .review-authority {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .review-authority .authority-icon {
          font-size: 2rem;
        }

        .review-authority strong {
          display: block;
          color: var(--text-primary, #111827);
        }

        .review-authority p {
          margin: 0.25rem 0 0;
          font-size: 0.875rem;
          color: var(--text-secondary, #6b7280);
        }

        .review-note {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 1rem;
          background: #fffbeb;
          border-radius: 8px;
          margin-top: 1.5rem;
        }

        .note-icon {
          font-size: 1.25rem;
          flex-shrink: 0;
        }

        .review-note p {
          margin: 0;
          font-size: 0.875rem;
          color: #92400e;
        }

        /* Actions */
        .onboarding-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .action-left,
        .action-center,
        .action-right {
          display: flex;
          gap: 0.75rem;
        }

        .action-center {
          flex: 1;
          justify-content: center;
        }

        .btn-primary {
          background: var(--primary-color, #2563eb);
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-weight: 500;
          font-size: 1rem;
          cursor: pointer;
          transition: background 0.2s;
        }

        .btn-primary:hover {
          background: #1d4ed8;
        }

        .btn-primary:disabled {
          background: var(--border-color, #e5e7eb);
          cursor: not-allowed;
        }

        .btn-secondary {
          background: transparent;
          color: var(--text-primary, #111827);
          border: 1px solid var(--border-color, #e5e7eb);
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-weight: 500;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-secondary:hover {
          background: var(--card-bg-alt, #f3f4f6);
        }

        .btn-text {
          background: transparent;
          color: var(--text-secondary, #6b7280);
          border: none;
          padding: 0.75rem 1rem;
          font-size: 0.9rem;
          cursor: pointer;
        }

        .btn-text:hover {
          color: var(--text-primary, #111827);
        }

        .loading-spinner {
          display: inline-block;
          width: 20px;
          height: 20px;
          border: 2px solid transparent;
          border-top-color: currentColor;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        /* Responsive */
        @media (max-width: 640px) {
          .avatar-onboarding {
            padding: 1rem;
          }

          .onboarding-content {
            padding: 1.5rem 1rem;
          }

          .progress-steps {
            overflow-x: auto;
            padding-bottom: 0.5rem;
          }

          .step-label {
            display: none;
          }

          .avatar-benefits {
            gap: 0.75rem;
          }

          .benefit {
            padding: 0.75rem;
          }

          .price-range-inputs {
            flex-direction: column;
            gap: 0.5rem;
          }

          .range-separator {
            display: none;
          }

          .authority-card {
            flex-direction: column;
            text-align: center;
          }

          .authority-icon {
            align-self: center;
          }

          .selected-indicator {
            top: 0.5rem;
            right: 0.5rem;
          }

          .onboarding-actions {
            flex-direction: column;
            gap: 1rem;
          }

          .action-left,
          .action-center,
          .action-right {
            width: 100%;
            justify-content: center;
          }

          .action-center {
            order: -1;
          }
        }
      `}</style>
    </div>
  );
};

export default AvatarOnboarding;
