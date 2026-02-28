export interface City {
  name: string;
  latitude: number;
  longitude: number;
}

export const CITIES: City[] = [
  { name: 'New York', latitude: 40.7128, longitude: -74.006 },
  { name: 'London', latitude: 51.5074, longitude: -0.1278 },
  { name: 'Tokyo', latitude: 35.6762, longitude: 139.6503 },
  { name: 'Paris', latitude: 48.8566, longitude: 2.3522 },
  { name: 'Sydney', latitude: -33.8688, longitude: 151.2093 },
  { name: 'Dubai', latitude: 25.2048, longitude: 55.2708 },
  { name: 'Singapore', latitude: 1.3521, longitude: 103.8198 },
  { name: 'Hong Kong', latitude: 22.3193, longitude: 114.1694 },
  { name: 'Los Angeles', latitude: 34.0522, longitude: -118.2437 },
  { name: 'Shanghai', latitude: 31.2304, longitude: 121.4737 },
  { name: 'Mumbai', latitude: 19.076, longitude: 72.8777 },
  { name: 'São Paulo', latitude: -23.5505, longitude: -46.6333 },
  { name: 'Mexico City', latitude: 19.4326, longitude: -99.1332 },
  { name: 'Cairo', latitude: 30.0444, longitude: 31.2357 },
  { name: 'Moscow', latitude: 55.7558, longitude: 37.6173 },
  { name: 'Istanbul', latitude: 41.0082, longitude: 28.9784 },
  { name: 'Buenos Aires', latitude: -34.6037, longitude: -58.3816 },
  { name: 'Seoul', latitude: 37.5665, longitude: 126.978 },
  { name: 'Lagos', latitude: 6.5244, longitude: 3.3792 },
  { name: 'Jakarta', latitude: -6.2088, longitude: 106.8456 },
  { name: 'Berlin', latitude: 52.52, longitude: 13.405 },
  { name: 'Madrid', latitude: 40.4168, longitude: -3.7038 },
  { name: 'Rome', latitude: 41.9028, longitude: 12.4964 },
  { name: 'Bangkok', latitude: 13.7563, longitude: 100.5018 },
  { name: 'Toronto', latitude: 43.6532, longitude: -79.3832 },
  { name: 'Chicago', latitude: 41.8781, longitude: -87.6298 },
  { name: 'Nairobi', latitude: -1.2921, longitude: 36.8219 },
  { name: 'Lima', latitude: -12.0464, longitude: -77.0428 },
  { name: 'Tehran', latitude: 35.6892, longitude: 51.389 },
  { name: 'Bogotá', latitude: 4.711, longitude: -74.0721 },
  { name: 'Delhi', latitude: 28.6139, longitude: 77.209 },
  { name: 'Ho Chi Minh City', latitude: 10.8231, longitude: 106.6297 },
  { name: 'Johannesburg', latitude: -26.2041, longitude: 28.0473 },
  { name: 'Stockholm', latitude: 59.3293, longitude: 18.0686 },
  { name: 'Athens', latitude: 37.9838, longitude: 23.7275 },
  { name: 'Lisbon', latitude: 38.7223, longitude: -9.1393 },
  { name: 'Vienna', latitude: 48.2082, longitude: 16.3738 },
  { name: 'Warsaw', latitude: 52.2297, longitude: 21.0122 },
  { name: 'Riyadh', latitude: 24.7136, longitude: 46.6753 },
  { name: 'Kuala Lumpur', latitude: 3.139, longitude: 101.6869 },
  { name: 'Cape Town', latitude: -33.9249, longitude: 18.4241 },
  { name: 'Santiago', latitude: -33.4489, longitude: -70.6693 },
  { name: 'Manila', latitude: 14.5995, longitude: 120.9842 },
  { name: 'Taipei', latitude: 25.033, longitude: 121.5654 },
  { name: 'San Francisco', latitude: 37.7749, longitude: -122.4194 },
  { name: 'Auckland', latitude: -36.8485, longitude: 174.7633 },
  { name: 'Reykjavik', latitude: 64.1466, longitude: -21.9426 },
  { name: 'Anchorage', latitude: 61.2181, longitude: -149.9003 },
  { name: 'Beijing', latitude: 39.9042, longitude: 116.4074 },
  { name: 'Casablanca', latitude: 33.5731, longitude: -7.5898 },
];

export const DEFAULT_CITY_INDEX = 0;

// Keep these for backward compat
export const LATITUDE = CITIES[0].latitude;
export const LONGITUDE = CITIES[0].longitude;
export const LOCATION_NAME = CITIES[0].name;
