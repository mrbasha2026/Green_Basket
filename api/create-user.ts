import { createClient } from '@supabase/supabase-js'

export async function createUser(params: {
  callerToken: string
  email: string
  name: string
  password: string
  role_id: string
}): Promise<{ success: true; userId: string } | { error: string; status: number }> {
  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // تحقق من هوية المستدعي
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(params.callerToken)
  if (authError || !user) return { error: 'Unauthorized', status: 401 }

  // تحقق من صلاحية إضافة مستخدمين
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('role_id')
    .eq('id', user.id)
    .maybeSingle()

  // مستخدم بدون profile أو بدون role_id = bootstrap أول مدير
  const allowed = !profile?.role_id || await (async () => {
    const { data } = await supabaseAdmin
      .from('role_permissions')
      .select('id')
      .eq('role_id', profile.role_id)
      .eq('screen', 'settings.users')
      .eq('action', 'add')
      .maybeSingle()
    return !!data
  })()

  if (!allowed) return { error: 'Forbidden', status: 403 }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true,
    user_metadata: { name: params.name },
  })
  if (error) return { error: error.message, status: 400 }

  const { error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .upsert({ id: data.user.id, email: params.email, name: params.name, role_id: params.role_id }, { onConflict: 'id' })
  if (profileError) return { error: profileError.message, status: 500 }

  return { success: true, userId: data.user.id }
}
