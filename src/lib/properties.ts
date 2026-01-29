// src/lib/properties.ts

export interface Property {
  fullName: string;
  nickname: string;
  shortCode: string;
  isActive: boolean;
}

// Static fallback for SSR and initial render
export const PROPERTIES = [
  { name: 'HIGHPOINT Countryside Residences', nickname: 'Countryside C' },
  { name: 'HIGHPOINT Countryside Townhomes', nickname: 'Countryside T' },
  { name: 'HIGHPOINT Avondale', nickname: 'Elston' },
  { name: 'HIGHPOINT Jefferson Park', nickname: 'Kennedy' },
  { name: 'HIGHPOINT Lincoln Park on Clark', nickname: 'North Clark' },
  { name: 'HIGHPOINT Clarendon Hills', nickname: 'Park' },
  { name: 'HIGHPOINT Downers Grove on Rogers', nickname: 'Rogers' },
  { name: 'HIGHPOINT Wicker Park', nickname: 'Talman' },
  { name: 'HIGHPOINT Highwood Station 246', nickname: 'Green Bay 246' },
  { name: 'HIGHPOINT Highwood Station 440', nickname: 'Green Bay 440' },
  { name: 'HIGHPOINT Highwood Station 546', nickname: 'Green Bay 546' },
  { name: 'HIGHPOINT Wilmette', nickname: 'Greenleaf' },
  { name: 'HIGHPOINT Barrington', nickname: 'Liberty' },
  { name: 'HIGHPOINT Buena Park', nickname: 'Broadway' },
  { name: 'HIGHPOINT Lincoln Park on Fullerton', nickname: 'Fullerton' },
  { name: 'HIGHPOINT Albany Park on Kedzie', nickname: 'Kedzie' },
  { name: 'HIGHPOINT Lakeview on Sheffield', nickname: 'Sheffield' },
  { name: 'HIGHPOINT West Loop', nickname: 'Warren' },
  { name: 'HIGHPOINT West Town', nickname: 'W. Chicago' },
  { name: 'HIGHPOINT Albany Park on Montrose', nickname: 'W. Montrose' },
] as const;

// Helper functions (static - for backward compatibility)
export const getPropertyNames = () => PROPERTIES.map(p => p.name);
export const getPropertyNicknames = () => PROPERTIES.map(p => p.nickname);
export const getPropertyNickname = (name: string) => 
  PROPERTIES.find(p => p.name === name)?.nickname || name;
export const getPropertyName = (nickname: string) =>
  PROPERTIES.find(p => p.nickname === nickname)?.name || nickname;
export const getPropertyByNickname = (nickname: string) =>
  PROPERTIES.find(p => p.nickname === nickname);

// Dynamic fetch function for client-side use
export async function fetchProperties(): Promise<Property[]> {
  try {
    const response = await fetch('/api/properties');
    const data = await response.json();
    if (data.success) {
      return data.properties;
    }
    return PROPERTIES.map(p => ({
      fullName: p.name,
      nickname: p.nickname,
      shortCode: '',
      isActive: true,
    }));
  } catch (error) {
    console.error('Failed to fetch properties:', error);
    return PROPERTIES.map(p => ({
      fullName: p.name,
      nickname: p.nickname,
      shortCode: '',
      isActive: true,
    }));
  }
}

// Dynamic helper functions that work with fetched properties
export function getPropertyNicknameFromList(properties: Property[], name: string): string {
  const prop = properties.find(p => 
    p.fullName.toLowerCase() === name.toLowerCase() ||
    p.fullName.toLowerCase().includes(name.toLowerCase()) ||
    name.toLowerCase().includes(p.nickname.toLowerCase())
  );
  return prop?.nickname || name;
}

export function getPropertyFullNameFromList(properties: Property[], nickname: string): string {
  const prop = properties.find(p => 
    p.nickname.toLowerCase() === nickname.toLowerCase()
  );
  return prop?.fullName || nickname;
}