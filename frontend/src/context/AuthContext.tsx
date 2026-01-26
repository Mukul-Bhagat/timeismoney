import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import api from '../config/api';
import type { UserRole } from '../types';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  organizationId: string | null;
  timezone: string;
}

// Re-export UserRole for convenience
export type { UserRole };

interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  organizationId: string | null;
  timezone: string;
  iat?: number;
  exp?: number;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Decode JWT token and set user state
  const decodeToken = (token: string): UserProfile | null => {
    try {
      const decoded = jwtDecode<JWTPayload>(token);
      
      // Check if token is expired
      if (decoded.exp && decoded.exp * 1000 < Date.now()) {
        console.warn('Token is expired');
        localStorage.removeItem('token');
        return null;
      }

      return {
        id: decoded.userId,
        email: decoded.email,
        role: decoded.role as UserRole,
        organizationId: decoded.organizationId,
        timezone: decoded.timezone || 'Asia/Kolkata',
      };
    } catch (error) {
      console.error('Failed to decode token:', error);
      localStorage.removeItem('token');
      return null;
    }
  };

  // Initialize auth state on app load
  useEffect(() => {
    const token = localStorage.getItem('token');

    if (!token) {
      setLoading(false);
      return;
    }

    // Decode token and set user
    const decodedUser = decodeToken(token);
    if (decodedUser) {
      setUser(decodedUser);
    }

    // Always set loading to false (no infinite loaders)
    setLoading(false);
  }, []);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    setError(null);

    try {
      console.log('Attempting login for:', email);
      const response = await api.post('/api/auth/login', {
        email,
        password,
      });

      console.log('Login response:', response.data);

      if (response.data.success && response.data.token) {
        const token = response.data.token;
        
        console.log('Token received, storing in localStorage');
        // Store token in localStorage
        localStorage.setItem('token', token);

        // Decode token and set user state
        const decodedUser = decodeToken(token);
        if (!decodedUser) {
          console.error('Failed to decode token');
          throw new Error('Failed to decode token');
        }

        console.log('Decoded user:', decodedUser);

        // Set user state and loading state
        setUser(decodedUser);
        setLoading(false);

        console.log('User state set, navigating...');
        // Navigate after state is set (ProtectedRoute will check localStorage if state not ready)
        if (decodedUser.role === 'SUPER_ADMIN') {
          navigate('/platform', { replace: true });
        } else {
          navigate('/dashboard', { replace: true });
        }
      } else {
        console.error('Login failed - no token in response:', response.data);
        throw new Error(response.data.message || 'Login failed');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      console.error('Error response:', err.response?.data);
      
      let errorMessage = 'Failed to sign in. Please check your credentials.';
      
      if (err.code === 'ERR_NETWORK' || err.message?.includes('ERR_CONNECTION_REFUSED')) {
        errorMessage = 'Cannot connect to server. Please make sure the backend server is running on port 5000.';
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setLoading(false);
      throw err;
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      // Clear token from localStorage
      localStorage.removeItem('token');
      
      // Clear user state
      setUser(null);
      
      // Redirect to signin
      navigate('/signin');
    } catch (error: any) {
      console.error('Sign out error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
