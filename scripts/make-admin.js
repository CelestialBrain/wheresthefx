import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://azdcshjzkcidqmkpxuqz.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function makeUserAdmin() {
  const email = 'marangelonrevelo@gmail.com';

  console.log(`🔍 Looking up user: ${email}`);

  // Get user by email
  const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();

  if (userError) {
    console.error('❌ Error fetching users:', userError);
    return;
  }

  const user = users.find(u => u.email === email);

  if (!user) {
    console.error(`❌ User not found: ${email}`);
    return;
  }

  console.log(`✅ Found user: ${user.email} (ID: ${user.id})`);

  // Check existing roles
  const { data: existingRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', user.id);

  if (rolesError) {
    console.error('❌ Error fetching existing roles:', rolesError);
    return;
  }

  console.log('📋 Current roles:', existingRoles);

  // Add admin role
  const { data: newRole, error: insertError } = await supabase
    .from('user_roles')
    .insert({
      user_id: user.id,
      role: 'admin'
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      console.log('ℹ️  User already has admin role');
    } else {
      console.error('❌ Error adding admin role:', insertError);
      return;
    }
  } else {
    console.log('✅ Admin role added successfully:', newRole);
  }

  // Verify final roles
  const { data: finalRoles, error: finalError } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', user.id);

  if (finalError) {
    console.error('❌ Error fetching final roles:', finalError);
    return;
  }

  console.log('\n🎉 Final roles for', email + ':', finalRoles.map(r => r.role).join(', '));
}

makeUserAdmin().catch(console.error);
