export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

export type EmergencyCategory = 'fire' | 'medical' | 'police' | 'hazard' | 'other';

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
  description: string;
  reporterName: string;
  contactNumber: string;
  location: string;
  latitude?: number;
  longitude?: number;
  timestamp: string;
  status: 'pending' | 'in-progress' | 'resolved';
  userId: string;
}
