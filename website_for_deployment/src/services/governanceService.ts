/**
 * Governance Service for VendeeX 2.0
 * Handles audit trail management and governance configuration
 *
 * This demo version uses localStorage for persistence
 */

// localStorage key for audit trail
const AUDIT_TRAIL_STORAGE_KEY = 'vendeex_audit_trail';

// Audit event types
export enum AuditEventType {
  AVATAR_CREATED = 'AVATAR_CREATED',
  PREFERENCE_UPDATED = 'PREFERENCE_UPDATED',
  AUTHORITY_CHANGED = 'AUTHORITY_CHANGED',
  ONBOARDING_COMPLETED = 'ONBOARDING_COMPLETED',
}

// Actor types (who initiated the action)
export enum AuditActor {
  USER = 'USER',
  SYSTEM = 'SYSTEM',
}

// Audit event structure
export interface AuditEvent {
  id: string;
  event_type: AuditEventType;
  avatar_id: string;
  timestamp: Date;
  details: Record<string, unknown>;
  actor: AuditActor;
}

// Stored audit event (with string timestamp for localStorage)
interface StoredAuditEvent {
  id: string;
  event_type: AuditEventType;
  avatar_id: string;
  timestamp: string;
  details: Record<string, unknown>;
  actor: AuditActor;
}

// Governance configuration for an Avatar
export interface PersonalGovernanceConfig {
  avatarId: string;
  createdAt: Date;
  auditingEnabled: boolean;
  dataRetentionDays: number;
  complianceLevel: 'basic' | 'standard' | 'enhanced';
  allowedActions: string[];
  restrictedActions: string[];
}

// Event input for recording
export interface RecordAuditEventInput {
  event_type: AuditEventType;
  avatar_id: string;
  details?: Record<string, unknown>;
  actor?: AuditActor;
}

// Generate UUID
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Get audit events from localStorage
function getStoredAuditEvents(): AuditEvent[] {
  try {
    const stored = localStorage.getItem(AUDIT_TRAIL_STORAGE_KEY);
    if (stored) {
      const parsed: StoredAuditEvent[] = JSON.parse(stored);
      return parsed.map((event) => ({
        ...event,
        timestamp: new Date(event.timestamp),
      }));
    }
  } catch (error) {
    console.error('Error reading audit trail from localStorage:', error);
  }
  return [];
}

// Save audit events to localStorage
function saveAuditEvents(events: AuditEvent[]): void {
  try {
    const toStore: StoredAuditEvent[] = events.map((event) => ({
      ...event,
      timestamp: event.timestamp.toISOString(),
    }));
    localStorage.setItem(AUDIT_TRAIL_STORAGE_KEY, JSON.stringify(toStore));
  } catch (error) {
    console.error('Error saving audit trail to localStorage:', error);
  }
}

class GovernanceService {
  /**
   * Create a personal governance instance for an Avatar
   */
  createPersonalGovernanceInstance(avatarId: string): PersonalGovernanceConfig {
    const config: PersonalGovernanceConfig = {
      avatarId,
      createdAt: new Date(),
      auditingEnabled: true,
      dataRetentionDays: 365,
      complianceLevel: 'standard',
      allowedActions: [
        'search',
        'compare',
        'save',
        'notify',
        'negotiate',
        'purchase',
      ],
      restrictedActions: [
        'delete_account',
        'change_payment_method',
        'export_all_data',
      ],
    };

    // Record governance instance creation
    this.recordAuditEvent({
      event_type: AuditEventType.AVATAR_CREATED,
      avatar_id: avatarId,
      details: {
        governance_config: {
          complianceLevel: config.complianceLevel,
          auditingEnabled: config.auditingEnabled,
          dataRetentionDays: config.dataRetentionDays,
        },
      },
      actor: AuditActor.SYSTEM,
    });

    return config;
  }

  /**
   * Record an audit event to the audit trail
   */
  recordAuditEvent(input: RecordAuditEventInput): AuditEvent {
    const event: AuditEvent = {
      id: generateUUID(),
      event_type: input.event_type,
      avatar_id: input.avatar_id,
      timestamp: new Date(),
      details: input.details || {},
      actor: input.actor || AuditActor.USER,
    };

    const events = getStoredAuditEvents();
    events.push(event);
    saveAuditEvents(events);

    return event;
  }

  /**
   * Get the audit trail for a specific Avatar
   */
  getAuditTrail(avatarId: string): AuditEvent[] {
    const allEvents = getStoredAuditEvents();
    return allEvents
      .filter((event) => event.avatar_id === avatarId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get all audit events (for admin purposes)
   */
  getAllAuditEvents(): AuditEvent[] {
    return getStoredAuditEvents().sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
  }

  /**
   * Get audit events by type
   */
  getAuditEventsByType(avatarId: string, eventType: AuditEventType): AuditEvent[] {
    return this.getAuditTrail(avatarId).filter(
      (event) => event.event_type === eventType
    );
  }

  /**
   * Get audit events within a date range
   */
  getAuditEventsInRange(
    avatarId: string,
    startDate: Date,
    endDate: Date
  ): AuditEvent[] {
    return this.getAuditTrail(avatarId).filter(
      (event) =>
        event.timestamp >= startDate && event.timestamp <= endDate
    );
  }

  /**
   * Get summary statistics for an Avatar's audit trail
   */
  getAuditSummary(avatarId: string): {
    totalEvents: number;
    eventsByType: Record<AuditEventType, number>;
    eventsByActor: Record<AuditActor, number>;
    firstEvent: Date | null;
    lastEvent: Date | null;
  } {
    const events = this.getAuditTrail(avatarId);

    const eventsByType: Record<AuditEventType, number> = {
      [AuditEventType.AVATAR_CREATED]: 0,
      [AuditEventType.PREFERENCE_UPDATED]: 0,
      [AuditEventType.AUTHORITY_CHANGED]: 0,
      [AuditEventType.ONBOARDING_COMPLETED]: 0,
    };

    const eventsByActor: Record<AuditActor, number> = {
      [AuditActor.USER]: 0,
      [AuditActor.SYSTEM]: 0,
    };

    events.forEach((event) => {
      eventsByType[event.event_type]++;
      eventsByActor[event.actor]++;
    });

    return {
      totalEvents: events.length,
      eventsByType,
      eventsByActor,
      firstEvent: events.length > 0 ? events[events.length - 1].timestamp : null,
      lastEvent: events.length > 0 ? events[0].timestamp : null,
    };
  }

  /**
   * Clear audit trail for an Avatar (for testing)
   */
  clearAuditTrail(avatarId: string): void {
    const events = getStoredAuditEvents();
    const filtered = events.filter((event) => event.avatar_id !== avatarId);
    saveAuditEvents(filtered);
  }

  /**
   * Clear all audit trails (for testing)
   */
  clearAllAuditTrails(): void {
    localStorage.removeItem(AUDIT_TRAIL_STORAGE_KEY);
  }

  /**
   * Export audit trail as JSON
   */
  exportAuditTrail(avatarId: string): string {
    const events = this.getAuditTrail(avatarId);
    return JSON.stringify(events, null, 2);
  }

  /**
   * Get human-readable description for an audit event
   */
  getEventDescription(event: AuditEvent): string {
    switch (event.event_type) {
      case AuditEventType.AVATAR_CREATED:
        return 'Avatar was created';
      case AuditEventType.PREFERENCE_UPDATED:
        return 'Preferences were updated';
      case AuditEventType.AUTHORITY_CHANGED:
        return 'Authority configuration was changed';
      case AuditEventType.ONBOARDING_COMPLETED:
        return 'Onboarding was completed';
      default:
        return 'Unknown event';
    }
  }

  /**
   * Get icon for an audit event type
   */
  getEventIcon(eventType: AuditEventType): string {
    switch (eventType) {
      case AuditEventType.AVATAR_CREATED:
        return '🤖';
      case AuditEventType.PREFERENCE_UPDATED:
        return '⚙️';
      case AuditEventType.AUTHORITY_CHANGED:
        return '🔐';
      case AuditEventType.ONBOARDING_COMPLETED:
        return '✅';
      default:
        return '📋';
    }
  }
}

// Singleton instance
export const governanceService = new GovernanceService();

export default governanceService;
