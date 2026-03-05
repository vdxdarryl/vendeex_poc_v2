import React, { useState } from 'react';
import type {
  AvatarPreferences,
  ProductCategory,
  QualityPreference,
  BudgetRange,
  ShippingPreference,
  SustainabilityPreference,
  NotificationSettings,
} from '../../types/avatar.types';

interface PreferenceConfigurationProps {
  preferences?: Partial<AvatarPreferences>;
  onChange: (preferences: Partial<AvatarPreferences>) => void;
  compact?: boolean;
}

const PRODUCT_CATEGORIES: { category: ProductCategory; label: string; icon: string }[] = [
  { category: 'electronics', label: 'Electronics', icon: '📱' },
  { category: 'fashion', label: 'Fashion', icon: '👕' },
  { category: 'home-garden', label: 'Home & Garden', icon: '🏠' },
  { category: 'sports-outdoors', label: 'Sports & Outdoors', icon: '⚽' },
  { category: 'beauty-health', label: 'Beauty & Health', icon: '💄' },
  { category: 'food-grocery', label: 'Food & Grocery', icon: '🍎' },
  { category: 'toys-games', label: 'Toys & Games', icon: '🎮' },
  { category: 'automotive', label: 'Automotive', icon: '🚗' },
  { category: 'books-media', label: 'Books & Media', icon: '📚' },
  { category: 'office-supplies', label: 'Office Supplies', icon: '📎' },
  { category: 'pet-supplies', label: 'Pet Supplies', icon: '🐕' },
  { category: 'baby-kids', label: 'Baby & Kids', icon: '👶' },
];

const QUALITY_LEVELS: { level: QualityPreference; label: string; description: string }[] = [
  { level: 'budget', label: 'Budget', description: 'Most affordable options' },
  { level: 'value', label: 'Value', description: 'Best balance of price and quality' },
  { level: 'premium', label: 'Premium', description: 'High-quality products' },
  { level: 'luxury', label: 'Luxury', description: 'Top-tier, premium brands' },
];

const DEFAULT_PREFERENCES: Partial<AvatarPreferences> = {
  budgetRange: {
    min: 0,
    max: 500,
    currency: 'USD',
    flexibilityPercent: 10,
  },
  preferredCategories: [],
  excludedCategories: [],
  preferredBrands: [],
  excludedBrands: [],
  qualityPreference: 'value',
  shippingPreference: {
    preferFreeShipping: true,
    maxShippingCost: 10,
    preferFastShipping: false,
    maxDeliveryDays: 7,
  },
  sustainabilityPreference: {
    preferEcoFriendly: false,
    preferLocalProducts: false,
    preferEthicalBrands: false,
    carbonFootprintAware: false,
  },
  notificationSettings: {
    priceDropAlerts: true,
    dealAlerts: true,
    restockAlerts: false,
    recommendationDigest: true,
    digestFrequency: 'weekly',
    emailNotifications: true,
    pushNotifications: false,
  },
};

type PreferenceSection = 'budget' | 'categories' | 'quality' | 'shipping' | 'sustainability' | 'notifications';

export const PreferenceConfiguration: React.FC<PreferenceConfigurationProps> = ({
  preferences = DEFAULT_PREFERENCES,
  onChange,
  compact = false,
}) => {
  const [activeSection, setActiveSection] = useState<PreferenceSection>('budget');
  const [brandInput, setBrandInput] = useState('');

  const mergedPreferences = { ...DEFAULT_PREFERENCES, ...preferences };

  const updatePreferences = (updates: Partial<AvatarPreferences>) => {
    onChange({ ...mergedPreferences, ...updates });
  };

  const toggleCategory = (category: ProductCategory, type: 'preferred' | 'excluded') => {
    const key = type === 'preferred' ? 'preferredCategories' : 'excludedCategories';
    const current = mergedPreferences[key] || [];
    const otherKey = type === 'preferred' ? 'excludedCategories' : 'preferredCategories';
    const other = mergedPreferences[otherKey] || [];

    if (current.includes(category)) {
      updatePreferences({ [key]: current.filter(c => c !== category) });
    } else {
      // Remove from other list if present
      updatePreferences({
        [key]: [...current, category],
        [otherKey]: other.filter(c => c !== category),
      });
    }
  };

  const addBrand = (type: 'preferred' | 'excluded') => {
    if (!brandInput.trim()) return;
    const key = type === 'preferred' ? 'preferredBrands' : 'excludedBrands';
    const current = mergedPreferences[key] || [];
    if (!current.includes(brandInput.trim())) {
      updatePreferences({ [key]: [...current, brandInput.trim()] });
    }
    setBrandInput('');
  };

  const removeBrand = (brand: string, type: 'preferred' | 'excluded') => {
    const key = type === 'preferred' ? 'preferredBrands' : 'excludedBrands';
    const current = mergedPreferences[key] || [];
    updatePreferences({ [key]: current.filter(b => b !== brand) });
  };

  const renderBudgetSection = () => (
    <div className="preference-section">
      <h4>Budget Range</h4>
      <p className="section-description">
        Set your typical spending range for purchases
      </p>

      <div className="budget-inputs">
        <div className="budget-field">
          <label htmlFor="budgetMin">Minimum</label>
          <div className="currency-input">
            <span className="currency-symbol">$</span>
            <input
              id="budgetMin"
              type="number"
              min="0"
              value={mergedPreferences.budgetRange?.min || 0}
              onChange={(e) =>
                updatePreferences({
                  budgetRange: {
                    ...mergedPreferences.budgetRange!,
                    min: parseInt(e.target.value) || 0,
                  },
                })
              }
            />
          </div>
        </div>

        <span className="budget-separator">to</span>

        <div className="budget-field">
          <label htmlFor="budgetMax">Maximum</label>
          <div className="currency-input">
            <span className="currency-symbol">$</span>
            <input
              id="budgetMax"
              type="number"
              min="0"
              value={mergedPreferences.budgetRange?.max || 500}
              onChange={(e) =>
                updatePreferences({
                  budgetRange: {
                    ...mergedPreferences.budgetRange!,
                    max: parseInt(e.target.value) || 500,
                  },
                })
              }
            />
          </div>
        </div>
      </div>

      <div className="flexibility-slider">
        <label htmlFor="flexibility">
          Budget Flexibility: {mergedPreferences.budgetRange?.flexibilityPercent || 10}%
        </label>
        <input
          id="flexibility"
          type="range"
          min="0"
          max="50"
          value={mergedPreferences.budgetRange?.flexibilityPercent || 10}
          onChange={(e) =>
            updatePreferences({
              budgetRange: {
                ...mergedPreferences.budgetRange!,
                flexibilityPercent: parseInt(e.target.value),
              },
            })
          }
        />
        <p className="slider-hint">
          Allow products up to {mergedPreferences.budgetRange?.flexibilityPercent || 10}% above your max budget
        </p>
      </div>
    </div>
  );

  const renderCategoriesSection = () => (
    <div className="preference-section">
      <h4>Product Categories</h4>
      <p className="section-description">
        Select categories you're interested in or want to avoid
      </p>

      <div className="category-grid">
        {PRODUCT_CATEGORIES.map(({ category, label, icon }) => {
          const isPreferred = mergedPreferences.preferredCategories?.includes(category);
          const isExcluded = mergedPreferences.excludedCategories?.includes(category);

          return (
            <div key={category} className="category-item">
              <span className="category-icon">{icon}</span>
              <span className="category-label">{label}</span>
              <div className="category-toggles">
                <button
                  type="button"
                  className={`toggle-btn preferred ${isPreferred ? 'active' : ''}`}
                  onClick={() => toggleCategory(category, 'preferred')}
                  title="Add to preferred"
                >
                  ♥
                </button>
                <button
                  type="button"
                  className={`toggle-btn excluded ${isExcluded ? 'active' : ''}`}
                  onClick={() => toggleCategory(category, 'excluded')}
                  title="Exclude"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="brands-section">
        <h5>Preferred & Excluded Brands</h5>
        <div className="brand-input-row">
          <input
            type="text"
            value={brandInput}
            onChange={(e) => setBrandInput(e.target.value)}
            placeholder="Enter a brand name"
            onKeyPress={(e) => e.key === 'Enter' && addBrand('preferred')}
          />
          <button
            type="button"
            className="btn-small preferred"
            onClick={() => addBrand('preferred')}
          >
            + Prefer
          </button>
          <button
            type="button"
            className="btn-small excluded"
            onClick={() => addBrand('excluded')}
          >
            + Exclude
          </button>
        </div>

        <div className="brand-tags">
          {mergedPreferences.preferredBrands?.map(brand => (
            <span key={brand} className="brand-tag preferred">
              {brand}
              <button onClick={() => removeBrand(brand, 'preferred')}>×</button>
            </span>
          ))}
          {mergedPreferences.excludedBrands?.map(brand => (
            <span key={brand} className="brand-tag excluded">
              {brand}
              <button onClick={() => removeBrand(brand, 'excluded')}>×</button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );

  const renderQualitySection = () => (
    <div className="preference-section">
      <h4>Quality Preference</h4>
      <p className="section-description">
        What level of quality do you typically look for?
      </p>

      <div className="quality-options">
        {QUALITY_LEVELS.map(({ level, label, description }) => (
          <button
            key={level}
            type="button"
            className={`quality-option ${
              mergedPreferences.qualityPreference === level ? 'selected' : ''
            }`}
            onClick={() => updatePreferences({ qualityPreference: level })}
          >
            <span className="quality-label">{label}</span>
            <span className="quality-description">{description}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderShippingSection = () => (
    <div className="preference-section">
      <h4>Shipping Preferences</h4>
      <p className="section-description">
        Set your shipping and delivery preferences
      </p>

      <div className="toggle-options">
        <label className="toggle-option">
          <input
            type="checkbox"
            checked={mergedPreferences.shippingPreference?.preferFreeShipping ?? true}
            onChange={(e) =>
              updatePreferences({
                shippingPreference: {
                  ...mergedPreferences.shippingPreference!,
                  preferFreeShipping: e.target.checked,
                },
              })
            }
          />
          <span>Prefer free shipping options</span>
        </label>

        <label className="toggle-option">
          <input
            type="checkbox"
            checked={mergedPreferences.shippingPreference?.preferFastShipping ?? false}
            onChange={(e) =>
              updatePreferences({
                shippingPreference: {
                  ...mergedPreferences.shippingPreference!,
                  preferFastShipping: e.target.checked,
                },
              })
            }
          />
          <span>Prefer fast shipping (priority over free)</span>
        </label>
      </div>

      <div className="shipping-limits">
        <div className="limit-field">
          <label htmlFor="maxShipping">Maximum shipping cost</label>
          <div className="currency-input">
            <span className="currency-symbol">$</span>
            <input
              id="maxShipping"
              type="number"
              min="0"
              value={mergedPreferences.shippingPreference?.maxShippingCost || 10}
              onChange={(e) =>
                updatePreferences({
                  shippingPreference: {
                    ...mergedPreferences.shippingPreference!,
                    maxShippingCost: parseInt(e.target.value) || 10,
                  },
                })
              }
            />
          </div>
        </div>

        <div className="limit-field">
          <label htmlFor="maxDays">Maximum delivery days</label>
          <input
            id="maxDays"
            type="number"
            min="1"
            max="30"
            value={mergedPreferences.shippingPreference?.maxDeliveryDays || 7}
            onChange={(e) =>
              updatePreferences({
                shippingPreference: {
                  ...mergedPreferences.shippingPreference!,
                  maxDeliveryDays: parseInt(e.target.value) || 7,
                },
              })
            }
          />
        </div>
      </div>
    </div>
  );

  const renderSustainabilitySection = () => (
    <div className="preference-section">
      <h4>Sustainability Preferences</h4>
      <p className="section-description">
        Help us find more sustainable options
      </p>

      <div className="toggle-options">
        <label className="toggle-option">
          <input
            type="checkbox"
            checked={mergedPreferences.sustainabilityPreference?.preferEcoFriendly ?? false}
            onChange={(e) =>
              updatePreferences({
                sustainabilityPreference: {
                  ...mergedPreferences.sustainabilityPreference!,
                  preferEcoFriendly: e.target.checked,
                },
              })
            }
          />
          <span>Prefer eco-friendly products</span>
        </label>

        <label className="toggle-option">
          <input
            type="checkbox"
            checked={mergedPreferences.sustainabilityPreference?.preferLocalProducts ?? false}
            onChange={(e) =>
              updatePreferences({
                sustainabilityPreference: {
                  ...mergedPreferences.sustainabilityPreference!,
                  preferLocalProducts: e.target.checked,
                },
              })
            }
          />
          <span>Prefer locally made products</span>
        </label>

        <label className="toggle-option">
          <input
            type="checkbox"
            checked={mergedPreferences.sustainabilityPreference?.preferEthicalBrands ?? false}
            onChange={(e) =>
              updatePreferences({
                sustainabilityPreference: {
                  ...mergedPreferences.sustainabilityPreference!,
                  preferEthicalBrands: e.target.checked,
                },
              })
            }
          />
          <span>Prefer ethical/fair-trade brands</span>
        </label>

        <label className="toggle-option">
          <input
            type="checkbox"
            checked={mergedPreferences.sustainabilityPreference?.carbonFootprintAware ?? false}
            onChange={(e) =>
              updatePreferences({
                sustainabilityPreference: {
                  ...mergedPreferences.sustainabilityPreference!,
                  carbonFootprintAware: e.target.checked,
                },
              })
            }
          />
          <span>Show carbon footprint information</span>
        </label>
      </div>
    </div>
  );

  const renderNotificationsSection = () => (
    <div className="preference-section">
      <h4>Notification Settings</h4>
      <p className="section-description">
        Choose what updates you'd like to receive
      </p>

      <div className="toggle-options">
        <label className="toggle-option">
          <input
            type="checkbox"
            checked={mergedPreferences.notificationSettings?.priceDropAlerts ?? true}
            onChange={(e) =>
              updatePreferences({
                notificationSettings: {
                  ...mergedPreferences.notificationSettings!,
                  priceDropAlerts: e.target.checked,
                },
              })
            }
          />
          <span>Price drop alerts for saved items</span>
        </label>

        <label className="toggle-option">
          <input
            type="checkbox"
            checked={mergedPreferences.notificationSettings?.dealAlerts ?? true}
            onChange={(e) =>
              updatePreferences({
                notificationSettings: {
                  ...mergedPreferences.notificationSettings!,
                  dealAlerts: e.target.checked,
                },
              })
            }
          />
          <span>Deal alerts for preferred categories</span>
        </label>

        <label className="toggle-option">
          <input
            type="checkbox"
            checked={mergedPreferences.notificationSettings?.restockAlerts ?? false}
            onChange={(e) =>
              updatePreferences({
                notificationSettings: {
                  ...mergedPreferences.notificationSettings!,
                  restockAlerts: e.target.checked,
                },
              })
            }
          />
          <span>Restock alerts for out-of-stock items</span>
        </label>

        <label className="toggle-option">
          <input
            type="checkbox"
            checked={mergedPreferences.notificationSettings?.recommendationDigest ?? true}
            onChange={(e) =>
              updatePreferences({
                notificationSettings: {
                  ...mergedPreferences.notificationSettings!,
                  recommendationDigest: e.target.checked,
                },
              })
            }
          />
          <span>Weekly recommendation digest</span>
        </label>
      </div>

      <div className="notification-channels">
        <h5>Notification Channels</h5>
        <label className="toggle-option">
          <input
            type="checkbox"
            checked={mergedPreferences.notificationSettings?.emailNotifications ?? true}
            onChange={(e) =>
              updatePreferences({
                notificationSettings: {
                  ...mergedPreferences.notificationSettings!,
                  emailNotifications: e.target.checked,
                },
              })
            }
          />
          <span>Email notifications</span>
        </label>

        <label className="toggle-option">
          <input
            type="checkbox"
            checked={mergedPreferences.notificationSettings?.pushNotifications ?? false}
            onChange={(e) =>
              updatePreferences({
                notificationSettings: {
                  ...mergedPreferences.notificationSettings!,
                  pushNotifications: e.target.checked,
                },
              })
            }
          />
          <span>Push notifications</span>
        </label>
      </div>
    </div>
  );

  if (compact) {
    return (
      <div className="preference-configuration compact">
        {renderBudgetSection()}
        {renderQualitySection()}
      </div>
    );
  }

  const sections: { id: PreferenceSection; label: string }[] = [
    { id: 'budget', label: 'Budget' },
    { id: 'categories', label: 'Categories' },
    { id: 'quality', label: 'Quality' },
    { id: 'shipping', label: 'Shipping' },
    { id: 'sustainability', label: 'Sustainability' },
    { id: 'notifications', label: 'Notifications' },
  ];

  return (
    <div className="preference-configuration">
      <div className="preference-tabs">
        {sections.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`preference-tab ${activeSection === id ? 'active' : ''}`}
            onClick={() => setActiveSection(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="preference-content">
        {activeSection === 'budget' && renderBudgetSection()}
        {activeSection === 'categories' && renderCategoriesSection()}
        {activeSection === 'quality' && renderQualitySection()}
        {activeSection === 'shipping' && renderShippingSection()}
        {activeSection === 'sustainability' && renderSustainabilitySection()}
        {activeSection === 'notifications' && renderNotificationsSection()}
      </div>
    </div>
  );
};

export default PreferenceConfiguration;
