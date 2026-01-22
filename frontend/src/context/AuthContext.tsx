import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../config/supabase';
import type { User, Session } from '@supabase/supabase-js';
import type { UserRole } from '../types';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole | null; // Only for SUPER_ADMIN, null for org users
  roles: string[]; // Organization roles from user_roles table
  organization_id: string | null;
}

// Re-export UserRole for convenience
export type { UserRole };

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  
  // Helper to check if profile actually changed
  const setProfileIfChanged = (newProfile: UserProfile | null) => {
    setProfile((prev) => {
      if (!prev && !newProfile) return prev;
      if (!prev || !newProfile) return newProfile;
      if (
        prev.id !== newProfile.id ||
        prev.email !== newProfile.email ||
        prev.role !== newProfile.role ||
        prev.organization_id !== newProfile.organization_id ||
        JSON.stringify(prev.roles) !== JSON.stringify(newProfile.roles)
      ) {
        return newProfile;
      }
      return prev; // No change, return previous to prevent re-render
    });
  };


  // Fetch user profile from users table and roles from user_roles table
  const fetchUserProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
      console.log('Fetching user profile for:', userId);
      
      // Query users table directly (no timeout - let it complete naturally)
      // The safety timeout in initAuth will handle infinite hangs
      const { data, error } = await supabase
        .from('users')
        .select('id, email, role, organization_id')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching user profile from users table:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error details:', JSON.stringify(error, null, 2));
        
        // Common error codes:
        // PGRST116 = not found (user doesn't exist in users table)
        // PGRST301 = permission denied (RLS policy blocking)
        if (error.code === 'PGRST116') {
          console.warn('User not found in users table - user may need to be created by admin');
          // Return null to indicate user doesn't exist in users table
          return null;
        }
        
        // If it's a permission error, try to continue with minimal profile
        if (error.code === 'PGRST301' || error.message?.includes('permission') || error.message?.includes('policy')) {
          console.warn('Permission error - RLS policy may be blocking access');
          // Return null - will be handled by fallback in initAuth
          return null;
        }
        
        // For other errors, return null
        return null;
      }

      if (!data) {
        console.error('No user data returned');
        return null;
      }

      console.log('User data fetched:', data);

      // For SUPER_ADMIN, use role from users table
      // For org users, fetch roles from user_roles table
      let roles: string[] = [];
      if (data.role === 'SUPER_ADMIN') {
        roles = ['SUPER_ADMIN'];
        console.log('User is SUPER_ADMIN');
      } else if (data.organization_id) {
        console.log('Fetching roles for organization:', data.organization_id);
        try {
          // Fetch organization roles from user_roles table
          const { data: userRoles, error: userRolesError } = await supabase
            .from('user_roles')
            .select(`
              roles:role_id (
                name
              )
            `)
            .eq('user_id', userId)
            .eq('organization_id', data.organization_id);

          if (userRolesError) {
            console.error('Error fetching user roles:', userRolesError);
            // Continue with empty roles array
          } else if (userRoles) {
            roles = (userRoles as any[])
              .map((ur: any) => ur.roles?.name)
              .filter((name): name is string => !!name);
            console.log('User roles:', roles);
          }
        } catch (rolesError) {
          console.error('Exception fetching user roles:', rolesError);
          // Continue with empty roles array
        }
      }

      const profile: UserProfile = {
        id: data.id,
        email: data.email,
        role: data.role as UserRole | null,
        roles: roles || [], // Ensure roles is always an array
        organization_id: data.organization_id,
      };
      
      console.log('Final profile:', profile);
      return profile;
    } catch (error: any) {
      console.error('Exception in fetchUserProfile:', error);
      return null;
    }
  };

  // Initialize auth state
  useEffect(() => {
    let isMounted = true;
    let safetyTimeoutId: NodeJS.Timeout;
    
    // Safety timeout to prevent infinite loading (15 seconds - should never fire)
    safetyTimeoutId = setTimeout(() => {
      if (isMounted) {
        console.warn('Auth initialization taking longer than expected - forcing loading to false');
        setLoading(false);
      }
    }, 15000);
    
    // Get initial session
    const initAuth = async () => {
      try {
        console.log('Initializing auth...');
        
        // Get session (usually instant, no timeout needed)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (!isMounted) {
          clearTimeout(safetyTimeoutId);
          return;
        }
        
        if (sessionError) {
          console.error('Session error:', sessionError);
          clearTimeout(safetyTimeoutId);
          setSession(null);
          setUser(null);
          setProfileIfChanged(null);
          setLoading(false);
          return;
        }
        
        console.log('Session retrieved:', session ? 'Yes' : 'No');
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          try {
            // Fetch profile with timeout protection
            const userProfile = await fetchUserProfile(session.user.id);
            if (isMounted) {
              clearTimeout(safetyTimeoutId);
              // If profile fetch failed but we have session, create minimal profile
              if (!userProfile && session.user.email) {
                console.warn('Profile fetch failed, creating minimal profile from session');
                setProfileIfChanged({
                  id: session.user.id,
                  email: session.user.email,
                  role: null,
                  roles: [],
                  organization_id: null,
                });
              } else {
                setProfileIfChanged(userProfile);
              }
              setLoading(false);
            }
          } catch (profileError: any) {
            console.error('Error fetching user profile:', profileError);
            clearTimeout(safetyTimeoutId);
            if (isMounted) {
              // Create minimal profile from session to allow app to continue
              if (session.user.email) {
                console.warn('Creating minimal profile from session due to error');
                setProfileIfChanged({
                  id: session.user.id,
                  email: session.user.email,
                  role: null,
                  roles: [],
                  organization_id: null,
                });
              } else {
                setProfileIfChanged(null);
              }
              setLoading(false);
            }
          }
        } else {
          clearTimeout(safetyTimeoutId);
          setProfileIfChanged(null);
          if (isMounted) {
            setLoading(false);
          }
        }
      } catch (error: any) {
        console.error('Auth initialization error:', error);
        clearTimeout(safetyTimeoutId);
        if (isMounted) {
          setSession(null);
          setUser(null);
          setProfileIfChanged(null);
          setLoading(false);
        }
      }
    };

    initAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return;
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        try {
          const userProfile = await fetchUserProfile(session.user.id);
          if (isMounted) {
            setProfileIfChanged(userProfile);
          }
        } catch (error) {
          console.error('Error fetching user profile on auth change:', error);
          if (isMounted) {
            setProfileIfChanged(null);
          }
        }
      } else {
        setProfileIfChanged(null);
      }
      
      if (isMounted) {
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(safetyTimeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        const userProfile = await fetchUserProfile(data.user.id);
        setProfileIfChanged(userProfile);
        
        // Redirect based on role
        if (userProfile?.role === 'SUPER_ADMIN' || (userProfile?.roles && userProfile.roles.includes('SUPER_ADMIN'))) {
          navigate('/platform');
        } else {
          navigate('/dashboard');
        }
      }
    } catch (error: any) {
      setLoading(false);
      throw error;
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      setUser(null);
      setProfileIfChanged(null);
      setSession(null);
      navigate('/signin');
    } catch (error: any) {
      setLoading(false);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
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

