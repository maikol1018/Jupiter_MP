export interface BirthData {
  year: number;
  month: number;
  day: number;
  hour: number; // Decimal hour for calculation
  lat: number;
  lon: number;
  city?: string; // For display
  minute?: number; // For UI restoration
  timezone?: number; // Optional timezone offset in hours
  name?: string; // User name
}

export interface Planet {
  name: string;
  lon: number;
  speed: number;
}

export interface Houses {
  cusps: number[]; // 0-indexed, usually 13 elements (index 0 unused or same as 12)
  asc: number;
  mc: number;
}

export interface NatalData {
  jd: number;
  planets: Planet[];
  houses: Houses;
  angles: {
    ASC: number;
    MC: number;
  };
}

export interface UserProfileRecord {
  id: string;
  category: string;
  birthConfig: BirthData;
  natalData: NatalData;
  astroCalcVersion?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TransitRequest {
  base_jd: number;
  target_date_str: string;
  mode: 'transit' | 'progression';
}

export interface OverlayResponse {
  mode: string;
  calculation_jd: number;
  planets: Planet[];
}

// For UI selection
export enum ViewMode {
  TRANSIT = 'transit',
  PROGRESSION = 'progression'
}