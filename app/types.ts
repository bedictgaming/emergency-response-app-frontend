export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar?: string;
}

export type EmergencyCategory = 'fire' | 'medical' | 'police' | 'hazard' | 'other';
export type ResponseService = 'FIRE' | 'MEDICAL' | 'POLICE' | 'HAZARD';

export interface EmergencyCategoryConfig {
  id: EmergencyCategory;
  label: string;
  icon: string;
  color: string;
  bgColor: string;
}

export interface EmergencyReport {
  id: string;
  category: EmergencyCategory;
  requestedServices?: ResponseService[];
  description: string;
  reporterName: string;
  contactNumber: string;
  location: string;
  latitude?: number;
  longitude?: number;
  timestamp: string;
  status: 'pending' | 'in-progress' | 'resolved';
  userId: string;
  photoUrl?: string;
}
