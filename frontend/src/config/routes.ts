import type { UserRole } from '../types';

export interface PageConfig {
  path: string;
  label: string;
  icon?: string;
  roles: UserRole[];
}

// Central role-to-page mapping configuration
export const PAGES: PageConfig[] = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    icon: '📊',
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE'],
  },
  {
    path: '/timesheet',
    label: 'Timesheet',
    icon: '⏰',
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE'],
  },
  {
    path: '/approval',
    label: 'Approval',
    icon: '✅',
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'],
  },
  {
    path: '/projects',
    label: 'Projects',
    icon: '📁',
    roles: ['SUPER_ADMIN', 'ADMIN'],
  },
  {
    path: '/manage-users',
    label: 'Manage Users',
    icon: '👥',
    roles: ['SUPER_ADMIN', 'ADMIN'],
  },
  {
    path: '/roles',
    label: 'Roles',
    icon: '🔐',
    roles: ['SUPER_ADMIN', 'ADMIN'],
  },
  {
    path: '/profile',
    label: 'Profile',
    icon: '👤',
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE'],
  },
];

// Special page for super admin (not in sidebar, accessed via link)
export const PLATFORM_PAGE: PageConfig = {
  path: '/platform',
  label: 'Platform',
  icon: '🏢',
  roles: ['SUPER_ADMIN'],
};

/**
 * Get all pages allowed for a specific role or roles array
 */
export function getPagesForRole(role: UserRole | null, roles?: string[]): PageConfig[] {
  const userRoles = role === 'SUPER_ADMIN' ? ['SUPER_ADMIN'] : (roles || []);
  return PAGES.filter((page) => 
    userRoles.some(userRole => page.roles.includes(userRole as UserRole))
  );
}

/**
 * Check if a role or roles can access a specific page path
 */
export function canAccessPage(role: UserRole | null, path: string, roles?: string[]): boolean {
  const userRoles = role === 'SUPER_ADMIN' ? ['SUPER_ADMIN'] : (roles || []);
  
  // Check regular pages
  const page = PAGES.find((p) => p.path === path);
  if (page) {
    return userRoles.some(userRole => page.roles.includes(userRole as UserRole));
  }

  // Check platform page
  if (path === PLATFORM_PAGE.path) {
    return userRoles.some(userRole => PLATFORM_PAGE.roles.includes(userRole as UserRole));
  }

  // Allow signin for everyone (not authenticated)
  if (path === '/signin') {
    return true;
  }

  // Default: deny access
  return false;
}

/**
 * Get page configuration by path
 */
export function getPageConfig(path: string): PageConfig | undefined {
  return PAGES.find((p) => p.path === path) || (path === PLATFORM_PAGE.path ? PLATFORM_PAGE : undefined);
}

