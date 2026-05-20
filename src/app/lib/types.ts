export interface Parking {
  id: string;
  name: string;
  address: string;
  totalSpots: number;
  availableSpots: number;
  pricePerHour: number;
  features?: string[];
  latitude?: number;
  longitude?: number;
}

export interface Spot {
  id: string;
  parkingId?: string;
  number: number;
  status: 'available' | 'occupied' | 'booked';
  plateNumber?: string;
  userId?: string;
}

export interface ActiveSession {
  id: string;
  userId?: string;
  plateNumber: string;
  driverName?: string;
  parkingId: string;
  parkingName: string;
  spotId?: string;
  spotNumber: number;
  startTime: string;
  pricePerHour?: number;
  freeDuration?: number;
  status: string;
}

export interface Booking {
  id: string;
  userId?: string;
  plateNumber: string;
  parkingId: string;
  parkingName: string;
  spotNumber: number;
  startTime: string;
  endTime?: string;
  status: 'active' | 'cancelled' | 'completed';
}

export interface HistoryEntry {
  id: string;
  plateNumber: string;
  parkingName: string;
  spotNumber: number;
  startTime: string;
  endTime: string;
  duration: number;
  cost: number;
}

export interface OfflineSession {
  id: string;
  plateNumber: string;
  /** driver name — stored as "name" in localStorage per spec */
  name?: string;
  parkingId: string;
  parkingName: string;
  spotNumber: number;
  startTime: string;
  endTime?: string;
  cost?: number;
  pricePerHour?: number;
  status: 'active' | 'completed';
  synced?: boolean;
}

export interface QRData {
  userId: string;
  plateNumber: string;
  name: string;
  timestamp: string;
}