// Centralized color configuration for TimeIsMoney
// Blue & White theme

export const colors = {
  // Primary Blue Colors
  primary: {
    main: '#2563eb', // Blue-600
    light: '#3b82f6', // Blue-500
    dark: '#1d4ed8', // Blue-700
    lighter: '#60a5fa', // Blue-400
    darkest: '#1e40af', // Blue-800
  },

  // White & Grays
  white: '#ffffff',
  background: '#ffffff',
  surface: '#f8fafc', // Slate-50
  border: '#e2e8f0', // Slate-200

  // Text Colors
  text: {
    primary: '#1e293b', // Slate-800
    secondary: '#64748b', // Slate-500
    light: '#94a3b8', // Slate-400
  },

  // Status Colors
  status: {
    success: '#10b981', // Green-500
    error: '#ef4444', // Red-500
    warning: '#f59e0b', // Amber-500
    info: '#2563eb', // Blue-600
  },

  // Interactive States
  hover: {
    primary: '#1d4ed8', // Blue-700
    background: '#f1f5f9', // Slate-100
  },

  // Shadows
  shadow: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
  },
} as const;

