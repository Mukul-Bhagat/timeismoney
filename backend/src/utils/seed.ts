import { supabase } from '../config/supabase';
import { getCurrentUTC } from './timezone';
import bcrypt from 'bcrypt';

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
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email, password_hash')
      .eq('email', email)
      .single();

    if (existingUser) {
      // User exists - check if password_hash is set
      if (!existingUser.password_hash) {
        console.log('User exists but password_hash is not set. Setting password...');
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        
        const { error: updateError } = await supabase
          .from('users')
          .update({ password_hash: passwordHash })
          .eq('id', existingUser.id);

        if (updateError) {
          throw updateError;
        }
        console.log('✅ Password set for existing user');
      } else {
        console.log('Super admin user already exists with password');
      }
      return { success: true, message: 'Super admin ready' };
    }

    // Hash password for new user
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Generate UUID for user
    const { randomUUID } = require('crypto');
    const userId = randomUUID();

    // Create user in Supabase Auth (for migration compatibility)
    let authUserId = userId;
    try {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (!authError && authData?.user) {
        authUserId = authData.user.id;
      }
    } catch (error) {
      console.warn('Supabase Auth user creation failed, using generated UUID:', error);
    }

    // Create user profile in users table with password_hash
    const { error: userError } = await supabase.from('users').insert({
      id: authUserId,
      email,
      role: 'SUPER_ADMIN',
      organization_id: null, // Super admin doesn't belong to any organization
      password_hash: passwordHash,
      timezone: 'Asia/Kolkata',
      created_at: getCurrentUTC().toISOString(),
      updated_at: getCurrentUTC().toISOString(),
    });

    if (userError) {
      // Rollback: delete auth user if profile creation fails
      if (authUserId !== userId) {
        try {
          await supabase.auth.admin.deleteUser(authUserId);
        } catch (error) {
          console.error('Failed to rollback auth user:', error);
        }
      }
      throw userError;
    }

    console.log('✅ Super admin user created successfully');
    return {
      success: true,
      message: 'Super admin created successfully',
      userId: authUserId,
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

