import { supabase } from '../config/supabase';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Script to set password_hash for existing users
 * Usage: ts-node src/utils/setPassword.ts <email> <password>
 */
async function setPassword(email: string, password: string) {
  try {
    console.log(`Setting password for user: ${email}`);

    // Find user by email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .single();

    if (userError || !user) {
      console.error('User not found:', email);
      process.exit(1);
    }

    console.log('User found:', user.id);

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    console.log('Password hashed');

    // Update user with password_hash
    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: passwordHash })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating password:', updateError);
      process.exit(1);
    }

    console.log('✅ Password set successfully for:', email);
    console.log('You can now login with this password');
  } catch (error: any) {
    console.error('Error setting password:', error);
    process.exit(1);
  }
}

// Get email and password from command line arguments
const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('Usage: ts-node src/utils/setPassword.ts <email> <password>');
  console.error('Example: ts-node src/utils/setPassword.ts supermukul@timesheet.com attend#321');
  process.exit(1);
}

setPassword(email, password)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });

