import { supabase } from '../config/supabase';
import { getCurrentUTC } from './timezone';

/**
 * Seed script to create the hardcoded super admin user
 * Email: supermukul@timesheet.com
 * Password: attend#321
 * Role: SUPER_ADMIN
 */
export async function seedSuperAdmin() {
  try {
    const email = 'supermukul@timesheet.com';
    const password = 'attend#321';

    // Check if user already exists
    const { data: existingUsers } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email);

    if (existingUsers && existingUsers.length > 0) {
      console.log('Super admin user already exists');
      return { success: true, message: 'Super admin already exists' };
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
    });

    if (authError || !authData.user) {
      throw authError || new Error('Failed to create super admin in auth');
    }

    // Create user profile in users table
    const { error: userError } = await supabase.from('users').insert({
      id: authData.user.id,
      email,
      role: 'SUPER_ADMIN',
      organization_id: null, // Super admin doesn't belong to any organization
      created_at: getCurrentUTC().toISOString(),
      updated_at: getCurrentUTC().toISOString(),
    });

    if (userError) {
      // Rollback: delete auth user if profile creation fails
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw userError;
    }

    console.log('Super admin user created successfully');
    return {
      success: true,
      message: 'Super admin created successfully',
      userId: authData.user.id,
    };
  } catch (error: any) {
    console.error('Error seeding super admin:', error);
    throw error;
  }
}

// Run seed if this file is executed directly
if (require.main === module) {
  seedSuperAdmin()
    .then((result) => {
      console.log('Seed completed:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seed failed:', error);
      process.exit(1);
    });
}

