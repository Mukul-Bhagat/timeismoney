import { supabase } from '../config/supabase';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Script to list all users without password_hash
 * Usage: npx ts-node src/utils/listUsersWithoutPassword.ts
 */
async function listUsersWithoutPassword() {
  try {
    console.log('Fetching users without password_hash...\n');

    // Get all users without password_hash
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, role, organization_id, created_at')
      .is('password_hash', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching users:', error);
      process.exit(1);
    }

    if (!users || users.length === 0) {
      console.log('✅ All users have passwords set!');
      process.exit(0);
    }

    console.log(`Found ${users.length} user(s) without password_hash:\n`);
    console.log('─'.repeat(80));
    console.log('Email'.padEnd(40) + 'Role'.padEnd(20) + 'Organization ID');
    console.log('─'.repeat(80));

    for (const user of users) {
      const role = user.role || 'N/A';
      const orgId = user.organization_id ? user.organization_id.substring(0, 8) + '...' : 'N/A';
      console.log(
        user.email.padEnd(40) + 
        role.padEnd(20) + 
        orgId
      );
    }

    console.log('─'.repeat(80));
    console.log(`\nTo set passwords, run:`);
    console.log(`npx ts-node src/utils/setPassword.ts <email> "<password>"`);
    console.log(`\nExample:`);
    console.log(`npx ts-node src/utils/setPassword.ts ${users[0]?.email} "password123"`);
  } catch (error: any) {
    console.error('Error:', error);
    process.exit(1);
  }
}

listUsersWithoutPassword()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });

