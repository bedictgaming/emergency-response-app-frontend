export type AlertType = 'WEATHER' | 'SECURITY' | 'MEDICAL' | 'FIRE' | 'GENERAL';

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface AlertSender {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
}

export interface AlertIncident {
  incidentId: string;
  title: string;
  status: string;
  severityLevel: string;
}

export interface AlertLocation {
  locationId: string;
  locationName: string;
  address?: string | null;
  city?: string | null;
}

export interface Alert {
  alertId: string;
  alertType: AlertType;
  message: string;
  severity: AlertSeverity;
  incidentId?: string | null;
  locationId?: string | null;
  sentAt: string;
  sentBy: string;
  sender: AlertSender;
  incident?: AlertIncident | null;
  location?: AlertLocation | null;
}

// Public alert endpoints intentionally omit linked incidents, locations, and staff.
export type PublicAlert = Pick<Alert, 'alertId' | 'alertType' | 'message' | 'severity' | 'sentAt'>;

export interface CreateAlertPayload {
  alertType: AlertType;
  message: string;
  severity?: AlertSeverity;
  incidentId?: string;
  locationId?: string;
}

export interface AlertFilters {
  alertType?: AlertType;
  severity?: AlertSeverity;
  incidentId?: string;
  locationId?: string;
}
