/**
 * VendeeX 2.0 Demo Application
 * Main App component with authentication flow and navigation
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { AvatarProvider } from './context/AvatarContext';
import { useAuth } from './hooks/useAuth';
import { LoginForm } from './components/auth/LoginForm';
import { RegistrationWizard } from './components/auth/RegistrationWizard';
import { AvatarOnboarding } from './components/avatar/AvatarOnboarding';
import { AuditTrailViewer } from './components/avatar/AuditTrailViewer';
import { avatarService } from './services/avatarService';
import type { Avatar, PreferenceWeights } from './types/avatar.types';
import { AvatarStatus, AuthorityLevel } from './types/avatar.types';

// View types for navigation
type AppView = 'login' | 'register' | 'onboarding' | 'dashboard';

// Dashboard component
interface DashboardProps {
  avatar: Avatar;
  onLogout: () => void;
  onViewAuditTrail: () => void;
  onRefreshAvatar: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  avatar,
  onLogout,
  onViewAuditTrail,
  onRefreshAvatar,
}) => {
  const { member } = useAuth();
  const weights = avatar.preferenceProfile.weights;

  const getAuthorityLevelDisplay = (level: AuthorityLevel): { name: string; description: string; icon: string } => {
    switch (level) {
      case AuthorityLevel.OBSERVATION:
        return { name: 'Conservative', description: 'Approves everything', icon: '👁️' };
      case AuthorityLevel.NEGOTIATION:
        return { name: 'Balanced', description: 'Finds deals, asks before buying', icon: '🤝' };
      case AuthorityLevel.TRANSACTION:
        return { name: 'Autonomous', description: 'Buys within limits', icon: '🚀' };
      case AuthorityLevel.FULL_AUTHORITY:
        return { name: 'Full Authority', description: 'Complete autonomy', icon: '⚡' };
    }
  };

  const formatWeight = (weight: number): string => {
    return `${Math.round(weight * 100)}%`;
  };

  const weightLabels: Record<keyof PreferenceWeights, { label: string; icon: string }> = {
    economic: { label: 'Price & Value', icon: '💰' },
    environmental: { label: 'Sustainability', icon: '🌱' },
    social: { label: 'Ethics & Community', icon: '🤝' },
    temporal: { label: 'Speed & Timing', icon: '⚡' },
    quality: { label: 'Quality & Brand', icon: '⭐' },
  };

  const sortedWeights = Object.entries(weights)
    .sort(([, a], [, b]) => b - a) as [keyof PreferenceWeights, number][];

  const authority = getAuthorityLevelDisplay(avatar.authorityConfig.level);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <h1 className="logo">VendeeX</h1>
          <span className="version-badge">2.0 Demo</span>
        </div>
        <div className="header-right">
          <span className="user-greeting">
            Welcome, {member?.firstName || 'User'}
          </span>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={onLogout}
          >
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard-content">
        <div className="avatar-card">
          <div className="avatar-hero">
            <div className="avatar-icon">🤖</div>
            <div className="avatar-info">
              <h2>{avatar.name}</h2>
              <span className={`status-badge status-${avatar.status.toLowerCase()}`}>
                {avatar.status === AvatarStatus.ACTIVE ? 'Active' : avatar.status}
              </span>
            </div>
          </div>
          <p className="avatar-description">
            Your personal AI buying assistant, learning your preferences and finding the best deals.
          </p>
        </div>

        <div className="dashboard-grid">
          <section className="dashboard-section preferences-section">
            <h3>Buying Priorities</h3>
            <p className="section-subtitle">
              How your Avatar weighs different factors when buying
            </p>
            <div className="preference-weights">
              {sortedWeights.map(([key, value], index) => (
                <div key={key} className={`weight-item rank-${index + 1}`}>
                  <div className="weight-header">
                    <span className="weight-icon">{weightLabels[key].icon}</span>
                    <span className="weight-label">{weightLabels[key].label}</span>
                    <span className="weight-value">{formatWeight(value)}</span>
                  </div>
                  <div className="weight-bar">
                    <div
                      className="weight-fill"
                      style={{ width: `${value * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="dashboard-section authority-section">
            <h3>Agent Authority</h3>
            <p className="section-subtitle">
              Current level of autonomy for your Avatar
            </p>
            <div className="authority-display">
              <div className="authority-icon">{authority.icon}</div>
              <div className="authority-info">
                <strong>{authority.name}</strong>
                <p>{authority.description}</p>
              </div>
            </div>
            <div className="authority-limits">
              <h4>Transaction Limits</h4>
              <div className="limits-grid">
                <div className="limit-item">
                  <span className="limit-label">Per Transaction</span>
                  <span className="limit-value">
                    {avatar.authorityConfig.transactionLimits.currency}{' '}
                    {avatar.authorityConfig.transactionLimits.singleTransactionMax}
                  </span>
                </div>
                <div className="limit-item">
                  <span className="limit-label">Daily Limit</span>
                  <span className="limit-value">
                    {avatar.authorityConfig.transactionLimits.currency}{' '}
                    {avatar.authorityConfig.transactionLimits.dailyLimit}
                  </span>
                </div>
                <div className="limit-item">
                  <span className="limit-label">Monthly Limit</span>
                  <span className="limit-value">
                    {avatar.authorityConfig.transactionLimits.currency}{' '}
                    {avatar.authorityConfig.transactionLimits.monthlyLimit}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="dashboard-section activity-section">
          <div className="section-header">
            <div>
              <h3>Activity & Governance</h3>
              <p className="section-subtitle">
                Track all changes and actions for your Avatar
              </p>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={onViewAuditTrail}
            >
              View Activity Log
            </button>
          </div>
        </section>

        <section className="dashboard-section quick-actions">
          <h3>Quick Actions</h3>
          <div className="actions-grid">
            <button type="button" className="action-card" disabled>
              <span className="action-icon">🔍</span>
              <span className="action-label">Start Buying</span>
              <span className="coming-soon">Coming Soon</span>
            </button>
            <button type="button" className="action-card" disabled>
              <span className="action-icon">⚙️</span>
              <span className="action-label">Edit Preferences</span>
              <span className="coming-soon">Coming Soon</span>
            </button>
            <button type="button" className="action-card" disabled>
              <span className="action-icon">📊</span>
              <span className="action-label">View Analytics</span>
              <span className="coming-soon">Coming Soon</span>
            </button>
            <button
              type="button"
              className="action-card"
              onClick={onViewAuditTrail}
            >
              <span className="action-icon">📋</span>
              <span className="action-label">Activity Log</span>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};

// Main App content (inside AuthProvider)
const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading, member, logout } = useAuth();
  const [view, setView] = useState<AppView>('login');
  const [avatar, setAvatar] = useState<Avatar | null>(null);
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const [isLoadingAvatar, setIsLoadingAvatar] = useState(false);

  // Load avatar when authenticated
  useEffect(() => {
    if (isAuthenticated && member) {
      loadAvatar();
    } else {
      setAvatar(null);
    }
  }, [isAuthenticated, member]);

  // Determine initial view based on auth state
  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        setView('login');
      } else if (!avatar) {
        // Check if we're still loading the avatar
        if (!isLoadingAvatar) {
          setView('onboarding');
        }
      } else if (avatar.status === AvatarStatus.PENDING_VERIFICATION) {
        setView('onboarding');
      } else {
        setView('dashboard');
      }
    }
  }, [isLoading, isAuthenticated, avatar, isLoadingAvatar]);

  const loadAvatar = async () => {
    if (!member) return;

    setIsLoadingAvatar(true);
    try {
      const response = await avatarService.listAvatars(1, 0);
      if (response.avatars.length > 0) {
        setAvatar(response.avatars[0]);
        if (response.avatars[0].status !== AvatarStatus.PENDING_VERIFICATION) {
          setView('dashboard');
        }
      }
    } catch (error) {
      console.error('Failed to load avatar:', error);
    } finally {
      setIsLoadingAvatar(false);
    }
  };

  const handleLoginSuccess = () => {
    // Will be handled by useEffect
  };

  const handleRegisterSuccess = () => {
    setView('onboarding');
  };

  const handleOnboardingComplete = async (newAvatar: Avatar) => {
    // Mark onboarding as complete and activate avatar
    try {
      const activatedAvatar = await avatarService.completeOnboarding(newAvatar.id);
      setAvatar(activatedAvatar);
      setView('dashboard');
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      setAvatar(newAvatar);
      setView('dashboard');
    }
  };

  const handleLogout = async () => {
    await logout();
    setAvatar(null);
    setView('login');
    setShowAuditTrail(false);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="loading-content">
          <div className="loading-spinner large" />
          <h2>VendeeX</h2>
          <p>Loading your experience...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Login View */}
      {view === 'login' && (
        <div className="auth-container">
          <LoginForm
            onSuccess={handleLoginSuccess}
            onRegister={() => setView('register')}
            onForgotPassword={() => alert('Password reset coming soon!')}
          />
        </div>
      )}

      {/* Registration View */}
      {view === 'register' && (
        <div className="auth-container wide">
          <RegistrationWizard
            onSuccess={handleRegisterSuccess}
            onLogin={() => setView('login')}
            onStartOnboarding={() => setView('onboarding')}
          />
        </div>
      )}

      {/* Onboarding View */}
      {view === 'onboarding' && (
        <div className="onboarding-container">
          <AvatarOnboarding
            onComplete={handleOnboardingComplete}
            onSkip={() => {
              if (avatar) {
                setView('dashboard');
              }
            }}
          />
        </div>
      )}

      {/* Dashboard View */}
      {view === 'dashboard' && avatar && (
        <>
          <Dashboard
            avatar={avatar}
            onLogout={handleLogout}
            onViewAuditTrail={() => setShowAuditTrail(true)}
            onRefreshAvatar={loadAvatar}
          />

          {/* Audit Trail Modal */}
          {showAuditTrail && (
            <div className="modal-overlay" onClick={() => setShowAuditTrail(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <AuditTrailViewer
                  avatarId={avatar.id}
                  onClose={() => setShowAuditTrail(false)}
                />
              </div>
            </div>
          )}
        </>
      )}

      <style>{`
        /* Global App Styles */
        .app {
          min-height: 100vh;
          background: var(--bg-color, #f9fafb);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        }

        /* Loading State */
        .app-loading {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .loading-content {
          text-align: center;
        }

        .loading-content h2 {
          margin: 1rem 0 0.5rem;
          font-size: 2rem;
        }

        .loading-content p {
          margin: 0;
          opacity: 0.8;
        }

        .loading-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto;
        }

        .loading-spinner.large {
          width: 48px;
          height: 48px;
          border-width: 4px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Auth Container */
        .auth-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .auth-container.wide {
          padding: 1rem;
        }

        /* Onboarding Container */
        .onboarding-container {
          min-height: 100vh;
          background: var(--bg-color, #f9fafb);
          padding: 2rem 1rem;
        }

        /* Dashboard */
        .dashboard {
          min-height: 100vh;
        }

        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 2rem;
          background: white;
          border-bottom: 1px solid var(--border-color, #e5e7eb);
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .logo {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 700;
          background: linear-gradient(135deg, #667eea, #764ba2);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .version-badge {
          font-size: 0.7rem;
          padding: 0.25rem 0.5rem;
          background: var(--card-bg-alt, #f3f4f6);
          border-radius: 4px;
          color: var(--text-tertiary, #9ca3af);
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .user-greeting {
          font-size: 0.9rem;
          color: var(--text-secondary, #6b7280);
        }

        .dashboard-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
        }

        /* Avatar Card */
        .avatar-card {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 16px;
          padding: 2rem;
          color: white;
          margin-bottom: 2rem;
        }

        .avatar-hero {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          margin-bottom: 1rem;
        }

        .avatar-icon {
          width: 80px;
          height: 80px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2.5rem;
        }

        .avatar-info h2 {
          margin: 0 0 0.5rem;
          font-size: 1.75rem;
        }

        .status-badge {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 500;
          text-transform: uppercase;
        }

        .status-active {
          background: rgba(16, 185, 129, 0.2);
          color: #10b981;
        }

        .status-pending_verification {
          background: rgba(245, 158, 11, 0.2);
          color: #f59e0b;
        }

        .avatar-description {
          margin: 0;
          opacity: 0.9;
          line-height: 1.6;
        }

        /* Dashboard Grid */
        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        /* Dashboard Sections */
        .dashboard-section {
          background: white;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 12px;
          padding: 1.5rem;
        }

        .dashboard-section h3 {
          margin: 0 0 0.25rem;
          font-size: 1.1rem;
          color: var(--text-primary, #111827);
        }

        .section-subtitle {
          margin: 0 0 1.5rem;
          font-size: 0.875rem;
          color: var(--text-secondary, #6b7280);
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
        }

        .section-header .section-subtitle {
          margin-bottom: 0;
        }

        /* Preference Weights */
        .preference-weights {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .weight-item {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .weight-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .weight-icon {
          font-size: 1.25rem;
        }

        .weight-label {
          flex: 1;
          font-size: 0.9rem;
          color: var(--text-primary, #111827);
        }

        .weight-value {
          font-weight: 600;
          color: var(--primary-color, #2563eb);
        }

        .weight-bar {
          height: 8px;
          background: var(--card-bg-alt, #f3f4f6);
          border-radius: 4px;
          overflow: hidden;
        }

        .weight-fill {
          height: 100%;
          background: linear-gradient(90deg, #667eea, #764ba2);
          border-radius: 4px;
          transition: width 0.3s ease;
        }

        .weight-item.rank-1 .weight-fill {
          background: linear-gradient(90deg, #2563eb, #3b82f6);
        }

        .weight-item.rank-2 .weight-fill {
          background: linear-gradient(90deg, #4f46e5, #6366f1);
        }

        .weight-item.rank-3 .weight-fill {
          background: linear-gradient(90deg, #7c3aed, #8b5cf6);
        }

        /* Authority Display */
        .authority-display {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          background: var(--card-bg-alt, #f9fafb);
          border-radius: 8px;
          margin-bottom: 1.5rem;
        }

        .authority-icon {
          font-size: 2.5rem;
        }

        .authority-info strong {
          display: block;
          font-size: 1.1rem;
          color: var(--text-primary, #111827);
        }

        .authority-info p {
          margin: 0.25rem 0 0;
          font-size: 0.875rem;
          color: var(--text-secondary, #6b7280);
        }

        .authority-limits h4 {
          margin: 0 0 0.75rem;
          font-size: 0.85rem;
          color: var(--text-tertiary, #9ca3af);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .limits-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
        }

        .limit-item {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .limit-label {
          font-size: 0.75rem;
          color: var(--text-tertiary, #9ca3af);
        }

        .limit-value {
          font-weight: 600;
          color: var(--text-primary, #111827);
        }

        /* Activity Section */
        .activity-section {
          margin-bottom: 2rem;
        }

        /* Quick Actions */
        .actions-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 1rem;
        }

        .action-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          padding: 1.5rem;
          background: var(--card-bg-alt, #f9fafb);
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
        }

        .action-card:not(:disabled):hover {
          background: white;
          border-color: var(--primary-color, #2563eb);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .action-card:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }

        .action-icon {
          font-size: 2rem;
        }

        .action-label {
          font-weight: 500;
          color: var(--text-primary, #111827);
        }

        .coming-soon {
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
          font-size: 0.65rem;
          padding: 0.125rem 0.5rem;
          background: var(--border-color, #e5e7eb);
          border-radius: 4px;
          color: var(--text-tertiary, #9ca3af);
        }

        /* Modal */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          z-index: 1000;
        }

        .modal-content {
          max-width: 100%;
          max-height: 100%;
          overflow: auto;
        }

        /* Buttons */
        .btn-primary {
          background: var(--primary-color, #2563eb);
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-weight: 500;
          font-size: 0.9rem;
          cursor: pointer;
          transition: background 0.2s;
        }

        .btn-primary:hover {
          background: #1d4ed8;
        }

        .btn-secondary {
          background: transparent;
          color: var(--text-primary, #111827);
          border: 1px solid var(--border-color, #e5e7eb);
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-weight: 500;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-secondary:hover {
          background: var(--card-bg-alt, #f3f4f6);
        }

        .btn-sm {
          padding: 0.5rem 1rem;
          font-size: 0.85rem;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .dashboard-header {
            padding: 1rem;
            flex-direction: column;
            gap: 1rem;
          }

          .header-right {
            width: 100%;
            justify-content: space-between;
          }

          .dashboard-content {
            padding: 1rem;
          }

          .avatar-card {
            padding: 1.5rem;
          }

          .avatar-hero {
            flex-direction: column;
            text-align: center;
          }

          .dashboard-grid {
            grid-template-columns: 1fr;
          }

          .limits-grid {
            grid-template-columns: 1fr;
          }

          .actions-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .section-header {
            flex-direction: column;
          }

          .section-header .btn-primary {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};

// Root App component with providers
const App: React.FC = () => {
  return (
    <AuthProvider>
      <AvatarProvider>
        <AppContent />
      </AvatarProvider>
    </AuthProvider>
  );
};

export default App;
