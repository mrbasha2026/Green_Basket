import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return new Response('Unauthorized', { status: 401 })

  // تحقق من هوية المستدعي
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return new Response('Unauthorized', { status: 401 })

  // تحقق من صلاحية إضافة مستخدمين
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('role_id')
    .eq('id', user.id)
    .maybeSingle()

  // مستخدم بدون role_id = أول مدير (bootstrap)، يُسمح له بالإنشاء
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

  if (!allowed) return new Response('Forbidden', { status: 403 })

  let body: { email?: string; name?: string; password?: string; role_id?: string }
  try { body = await req.json() } catch { return new Response('Invalid JSON', { status: 400 }) }

  const { email, name, password, role_id } = body
  if (!email || !password) return new Response('email and password required', { status: 400 })

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  })
  if (error) return Response.json({ error: error.message }, { status: 400 })

  if (data.user) {
    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .upsert({ id: data.user.id, email, name, role_id }, { onConflict: 'id' })
    if (profileError) return Response.json({ error: profileError.message }, { status: 500 })
  }

  return Response.json({ success: true, userId: data.user?.id })
}
