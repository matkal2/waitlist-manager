// Role-based access control permissions

export type UserRole = 'admin' | 'leasing_agent' | 'property_manager';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  leasing_agent: 'Leasing Agent',
  property_manager: 'Property Manager',
};

export const permissions = {
  // Module access
  canAccessWaitlist: (role: UserRole | null): boolean => 
    role === 'admin' || role === 'leasing_agent',
  
  canAccessParking: (role: UserRole | null): boolean => 
    role !== null, // All authenticated users
  
  canAccessAdmin: (role: UserRole | null): boolean => 
    role === 'admin',

  // Parking reservation actions
  canReserveSpot: (role: UserRole | null): boolean => 
    role === 'admin' || role === 'leasing_agent',
  
  canCancelReservation: (role: UserRole | null): boolean => 
    role === 'admin' || role === 'leasing_agent',

  // Parking change requests
  canSubmitChangeRequest: (role: UserRole | null): boolean => 
    role === 'admin' || role === 'leasing_agent',

  // User management
  canManageUsers: (role: UserRole | null): boolean => 
    role === 'admin',
};

// Helper to get role from string (with validation)
export function parseRole(roleStr: string | null | undefined): UserRole | null {
  if (!roleStr) return null;
  const normalized = roleStr.toLowerCase();
  if (normalized === 'admin' || normalized === 'leasing_agent' || normalized === 'property_manager') {
    return normalized as UserRole;
  }
  // Fallback for legacy 'general' role
  if (normalized === 'general') {
    return 'leasing_agent';
  }
  return null;
}
