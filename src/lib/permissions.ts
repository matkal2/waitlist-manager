// Role-based access control permissions

export type UserRole =
  | 'admin'
  | 'leasing_agent'
  | 'property_manager'
  | 'accounting'
  | 'maintenance';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  leasing_agent: 'Leasing Agent',
  property_manager: 'Property Manager',
  accounting: 'Accounting',
  maintenance: 'Maintenance',
};

export const ALL_ROLES = Object.keys(ROLE_LABELS) as UserRole[];

// Accounting and Maintenance currently share Property Manager permissions
const WAITLIST_ROLES: UserRole[] = ['admin', 'leasing_agent'];
const RESERVATION_ROLES: UserRole[] = ['admin', 'leasing_agent'];

const hasRole = (role: UserRole | null, allowed: UserRole[]) =>
  role !== null && allowed.includes(role);

export const permissions = {
  // Module access
  canAccessWaitlist: (role: UserRole | null): boolean => hasRole(role, WAITLIST_ROLES),

  canAccessParking: (role: UserRole | null): boolean =>
    role !== null, // All authenticated users

  canAccessAdmin: (role: UserRole | null): boolean => role === 'admin',

  // Parking reservation actions
  canReserveSpot: (role: UserRole | null): boolean => hasRole(role, RESERVATION_ROLES),

  canCancelReservation: (role: UserRole | null): boolean => hasRole(role, RESERVATION_ROLES),

  // Parking change requests
  canSubmitChangeRequest: (role: UserRole | null): boolean =>
    role !== null,

  // User management
  canManageUsers: (role: UserRole | null): boolean => role === 'admin',
};

// Helper to get role from string (with validation)
export function parseRole(roleStr: string | null | undefined): UserRole | null {
  if (!roleStr) return null;
  const normalized = roleStr.toLowerCase();
  if ((ALL_ROLES as string[]).includes(normalized)) {
    return normalized as UserRole;
  }
  // Fallback for legacy 'general' role
  if (normalized === 'general') {
    return 'leasing_agent';
  }
  return null;
}
