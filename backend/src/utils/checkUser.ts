import { supabase } from '../config/supabase';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Script to check if a user exists and has password_hash
 * Usage: npx ts-node src/utils/checkUser.ts <email>
 */
async function checkUser(email: string) {
  try {
    console.log(`Checking user: ${email}\n`);

    // Find user by email
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, role, organization_id, password_hash, created_at')
      .eq('email', email)
      .single();

    if (error || !user) {
      console.log('❌ User not found in database');
      console.log('Error:', error?.message || 'User does not exist');
      process.exit(1);
    }

    console.log('✅ User found!');
    console.log('─'.repeat(60));
    console.log('ID:', user.id);
    console.log('Email:', user.email);
    console.log('Role:', user.role || 'N/A');
    console.log('Organization ID:', user.organization_id || 'N/A');
    console.log('Password Hash:', user.password_hash ? '✅ Set' : '❌ NOT SET');
    console.log('Created At:', user.created_at);
    console.log('─'.repeat(60));

    if (!user.password_hash) {
      console.log('\n⚠️  This user cannot login because password_hash is not set.');
      console.log('\nTo set password, run:');
      console.log(`npx ts-node src/utils/setPassword.ts ${email} "<password>"`);
    } else {
      console.log('\n✅ This user can login (password_hash is set)');
      console.log('If login fails, check:');
      console.log('  1. Password is correct');
      console.log('  2. Backend server is running (port 5000)');
      console.log('  3. JWT_SECRET is set in backend/.env');
    }
  } catch (error: any) {
    console.error('Error:', error);
    process.exit(1);
  }
}

const email = process.argv[2];

if (!email) {
  console.error('Usage: npx ts-node src/utils/checkUser.ts <email>');
  console.error('Example: npx ts-node src/utils/checkUser.ts sample@noreply.com');
  process.exit(1);
}

checkUser(email)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });

