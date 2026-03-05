import React, { useState, useEffect } from 'react';
import {
  governanceService,
  AuditEventType,
  AuditActor,
  type AuditEvent,
} from '../../services/governanceService';

interface AuditTrailViewerProps {
  avatarId: string;
  onClose?: () => void;
}

export const AuditTrailViewer: React.FC<AuditTrailViewerProps> = ({
  avatarId,
  onClose,
}) => {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filter, setFilter] = useState<AuditEventType | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAuditTrail();
  }, [avatarId]);

  const loadAuditTrail = () => {
    setIsLoading(true);
    try {
      const auditEvents = governanceService.getAuditTrail(avatarId);
      setEvents(auditEvents);
    } catch (error) {
      console.error('Failed to load audit trail:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredEvents =
    filter === 'all'
      ? events
      : events.filter((event) => event.event_type === filter);

  const formatTimestamp = (date: Date): string => {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  const getRelativeTime = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatTimestamp(date);
  };

  const getEventIcon = (eventType: AuditEventType): string => {
    return governanceService.getEventIcon(eventType);
  };

  const getEventDescription = (event: AuditEvent): string => {
    return governanceService.getEventDescription(event);
  };

  const getEventTypeLabel = (eventType: AuditEventType): string => {
    switch (eventType) {
      case AuditEventType.AVATAR_CREATED:
        return 'Avatar Created';
      case AuditEventType.PREFERENCE_UPDATED:
        return 'Preferences Updated';
      case AuditEventType.AUTHORITY_CHANGED:
        return 'Authority Changed';
      case AuditEventType.ONBOARDING_COMPLETED:
        return 'Onboarding Completed';
      default:
        return 'Unknown Event';
    }
  };

  const getActorBadge = (actor: AuditActor): { label: string; className: string } => {
    switch (actor) {
      case AuditActor.USER:
        return { label: 'User', className: 'actor-user' };
      case AuditActor.SYSTEM:
        return { label: 'System', className: 'actor-system' };
      default:
        return { label: 'Unknown', className: 'actor-unknown' };
    }
  };

  const renderEventDetails = (event: AuditEvent) => {
    const details = event.details;
    if (!details || Object.keys(details).length === 0) {
      return null;
    }

    return (
      <div className="event-details">
        {Object.entries(details).map(([key, value]) => {
          if (value === null || value === undefined) return null;

          const formattedKey = key
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, (str) => str.toUpperCase())
            .replace(/_/g, ' ');

          let displayValue: string;
          if (typeof value === 'object') {
            displayValue = JSON.stringify(value, null, 2);
          } else {
            displayValue = String(value);
          }

          return (
            <div key={key} className="detail-row">
              <span className="detail-key">{formattedKey}:</span>
              <span className="detail-value">
                {typeof value === 'object' ? (
                  <pre>{displayValue}</pre>
                ) : (
                  displayValue
                )}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const summary = governanceService.getAuditSummary(avatarId);

  return (
    <div className="audit-trail-viewer">
      <div className="audit-header">
        <div className="header-content">
          <h2>Activity Log</h2>
          <p className="subtitle">
            {summary.totalEvents} event{summary.totalEvents !== 1 ? 's' : ''} recorded
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            className="close-button"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        )}
      </div>

      <div className="audit-summary">
        <div className="summary-stat">
          <span className="stat-icon">{getEventIcon(AuditEventType.AVATAR_CREATED)}</span>
          <div className="stat-content">
            <span className="stat-value">
              {summary.eventsByType[AuditEventType.AVATAR_CREATED]}
            </span>
            <span className="stat-label">Created</span>
          </div>
        </div>
        <div className="summary-stat">
          <span className="stat-icon">{getEventIcon(AuditEventType.PREFERENCE_UPDATED)}</span>
          <div className="stat-content">
            <span className="stat-value">
              {summary.eventsByType[AuditEventType.PREFERENCE_UPDATED]}
            </span>
            <span className="stat-label">Preference Updates</span>
          </div>
        </div>
        <div className="summary-stat">
          <span className="stat-icon">{getEventIcon(AuditEventType.AUTHORITY_CHANGED)}</span>
          <div className="stat-content">
            <span className="stat-value">
              {summary.eventsByType[AuditEventType.AUTHORITY_CHANGED]}
            </span>
            <span className="stat-label">Authority Changes</span>
          </div>
        </div>
      </div>

      <div className="audit-filters">
        <label htmlFor="eventFilter">Filter by:</label>
        <select
          id="eventFilter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as AuditEventType | 'all')}
        >
          <option value="all">All Events</option>
          <option value={AuditEventType.AVATAR_CREATED}>Avatar Created</option>
          <option value={AuditEventType.PREFERENCE_UPDATED}>Preferences Updated</option>
          <option value={AuditEventType.AUTHORITY_CHANGED}>Authority Changed</option>
          <option value={AuditEventType.ONBOARDING_COMPLETED}>Onboarding Completed</option>
        </select>
      </div>

      <div className="audit-events">
        {isLoading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>Loading activity log...</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📋</span>
            <p>No events to display</p>
            {filter !== 'all' && (
              <button
                type="button"
                className="btn-text"
                onClick={() => setFilter('all')}
              >
                Clear filter
              </button>
            )}
          </div>
        ) : (
          <div className="events-list">
            {filteredEvents.map((event) => {
              const actorBadge = getActorBadge(event.actor);
              return (
                <div key={event.id} className="event-item">
                  <div className="event-icon">
                    {getEventIcon(event.event_type)}
                  </div>
                  <div className="event-content">
                    <div className="event-header">
                      <span className="event-type">
                        {getEventTypeLabel(event.event_type)}
                      </span>
                      <span className={`actor-badge ${actorBadge.className}`}>
                        {actorBadge.label}
                      </span>
                    </div>
                    <p className="event-description">
                      {getEventDescription(event)}
                    </p>
                    {renderEventDetails(event)}
                  </div>
                  <div className="event-time">
                    <span className="time-relative">
                      {getRelativeTime(event.timestamp)}
                    </span>
                    <span className="time-absolute">
                      {formatTimestamp(event.timestamp)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        .audit-trail-viewer {
          background: var(--card-bg, #fff);
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 12px;
          max-width: 800px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .audit-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 1.5rem;
          border-bottom: 1px solid var(--border-color, #e5e7eb);
        }

        .header-content h2 {
          margin: 0;
          font-size: 1.25rem;
          color: var(--text-primary, #111827);
        }

        .subtitle {
          margin: 0.25rem 0 0;
          font-size: 0.875rem;
          color: var(--text-secondary, #6b7280);
        }

        .close-button {
          background: none;
          border: none;
          font-size: 1.5rem;
          color: var(--text-tertiary, #9ca3af);
          cursor: pointer;
          padding: 0.25rem 0.5rem;
          line-height: 1;
        }

        .close-button:hover {
          color: var(--text-primary, #111827);
        }

        .audit-summary {
          display: flex;
          gap: 1.5rem;
          padding: 1rem 1.5rem;
          background: var(--card-bg-alt, #f9fafb);
          border-bottom: 1px solid var(--border-color, #e5e7eb);
        }

        .summary-stat {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .stat-icon {
          font-size: 1.5rem;
        }

        .stat-content {
          display: flex;
          flex-direction: column;
        }

        .stat-value {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text-primary, #111827);
        }

        .stat-label {
          font-size: 0.75rem;
          color: var(--text-tertiary, #9ca3af);
        }

        .audit-filters {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid var(--border-color, #e5e7eb);
        }

        .audit-filters label {
          font-size: 0.875rem;
          color: var(--text-secondary, #6b7280);
        }

        .audit-filters select {
          padding: 0.5rem 1rem;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 6px;
          font-size: 0.875rem;
          background: var(--card-bg, #fff);
          cursor: pointer;
        }

        .audit-events {
          flex: 1;
          overflow-y: auto;
          padding: 1rem 1.5rem;
        }

        .loading-state,
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 3rem;
          color: var(--text-secondary, #6b7280);
        }

        .empty-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }

        .loading-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid var(--border-color, #e5e7eb);
          border-top-color: var(--primary-color, #2563eb);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-bottom: 1rem;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .events-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .event-item {
          display: flex;
          gap: 1rem;
          padding: 1rem;
          background: var(--card-bg-alt, #f9fafb);
          border-radius: 8px;
          transition: background 0.2s;
        }

        .event-item:hover {
          background: var(--card-bg-hover, #f3f4f6);
        }

        .event-icon {
          font-size: 1.5rem;
          flex-shrink: 0;
        }

        .event-content {
          flex: 1;
          min-width: 0;
        }

        .event-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.25rem;
        }

        .event-type {
          font-weight: 600;
          color: var(--text-primary, #111827);
          font-size: 0.9rem;
        }

        .actor-badge {
          font-size: 0.7rem;
          padding: 0.125rem 0.5rem;
          border-radius: 4px;
          font-weight: 500;
        }

        .actor-user {
          background: #dbeafe;
          color: #1e40af;
        }

        .actor-system {
          background: #e0e7ff;
          color: #3730a3;
        }

        .actor-unknown {
          background: #f3f4f6;
          color: #6b7280;
        }

        .event-description {
          margin: 0;
          font-size: 0.875rem;
          color: var(--text-secondary, #6b7280);
        }

        .event-details {
          margin-top: 0.75rem;
          padding: 0.75rem;
          background: var(--card-bg, #fff);
          border-radius: 6px;
          border: 1px solid var(--border-color, #e5e7eb);
          font-size: 0.8rem;
        }

        .detail-row {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 0.25rem;
        }

        .detail-row:last-child {
          margin-bottom: 0;
        }

        .detail-key {
          color: var(--text-tertiary, #9ca3af);
          white-space: nowrap;
        }

        .detail-value {
          color: var(--text-primary, #111827);
          word-break: break-word;
        }

        .detail-value pre {
          margin: 0;
          font-family: monospace;
          font-size: 0.75rem;
          white-space: pre-wrap;
          background: var(--card-bg-alt, #f9fafb);
          padding: 0.5rem;
          border-radius: 4px;
          max-height: 100px;
          overflow-y: auto;
        }

        .event-time {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          flex-shrink: 0;
        }

        .time-relative {
          font-size: 0.8rem;
          color: var(--text-secondary, #6b7280);
          font-weight: 500;
        }

        .time-absolute {
          font-size: 0.7rem;
          color: var(--text-tertiary, #9ca3af);
        }

        .btn-text {
          background: transparent;
          border: none;
          color: var(--primary-color, #2563eb);
          cursor: pointer;
          font-size: 0.875rem;
          padding: 0.5rem 1rem;
        }

        .btn-text:hover {
          text-decoration: underline;
        }

        @media (max-width: 640px) {
          .audit-summary {
            flex-direction: column;
            gap: 1rem;
          }

          .event-item {
            flex-direction: column;
          }

          .event-time {
            flex-direction: row;
            gap: 0.5rem;
            justify-content: flex-start;
          }
        }
      `}</style>
    </div>
  );
};

export default AuditTrailViewer;
