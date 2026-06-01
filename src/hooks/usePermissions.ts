import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export type AppRole = 'admin' | 'manager' | 'viewer'

export interface UserProfile {
  id: string
  email: string
  role: AppRole
  name?: string
  created_at?: string
}

// Permission map per role
const PERMISSIONS: Record<AppRole, string[]> = {
  admin: [
    'purchases.view', 'purchases.add', 'purchases.edit',
    'sales.view', 'sales.add', 'sales.edit',
    'inventory.view', 'inventory.edit',
    'waste.view', 'waste.add',
    'profits.view', 'reports.view',
    'cost.view', 'cost.edit',
    'customers.view', 'customers.edit',
    'settings.view', 'settings.edit',
    'users.view', 'users.edit',
    'sync.view', 'sync.trigger',
    'dashboard.view',
  ],
  manager: [
    'purchases.view', 'purchases.add', 'purchases.edit',
    'sales.view', 'sales.add', 'sales.edit',
    'inventory.view', 'inventory.edit',
    'waste.view', 'waste.add',
    'profits.view', 'reports.view',
    'cost.view',
    'customers.view', 'customers.edit',
    'settings.view',
    'dashboard.view',
  ],
  viewer: [
    'purchases.view', 'sales.view', 'inventory.view',
    'waste.view', 'profits.view', 'reports.view',
    'cost.view', 'customers.view', 'dashboard.view',
  ],
}

// Fetch current user's role
export function useUserRole() {
  const { session } = useAuth()
  const userId = session?.user?.id

  return useQuery<AppRole>({
    queryKey: ['user_role', userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!userId) return 'admin'
      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', userId)
          .maybeSingle()
        return (data?.role as AppRole) ?? 'admin'
      } catch {
        return 'admin'
      }
    },
  })
}

// Check if current user has a permission
export function usePermission(permission: string): boolean {
  const { data: role } = useUserRole()
  const r = role ?? 'admin'
  return PERMISSIONS[r]?.includes(permission) ?? true
}

// Fetch all users with their roles (admin only)
export function useAllUsers() {
  return useQuery<UserProfile[]>({
    queryKey: ['all_users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, role, name, created_at')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as UserProfile[]
    },
  })
}

// Upsert user profile (set role)
export function useUpsertUserRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, role, email, name }: { id: string; role: AppRole; email?: string; name?: string }) => {
      const { error } = await supabase
        .from('user_profiles')
        .upsert({ id, role, email, name }, { onConflict: 'id' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all_users'] })
      qc.invalidateQueries({ queryKey: ['user_role'] })
    },
  })
}

// Invite a new user via Supabase Auth (admin API)
export function useInviteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ email, role, name }: { email: string; role: AppRole; name: string }) => {
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: { name, role },
      })
      if (error) throw error
      if (data.user) {
        await supabase.from('user_profiles').upsert(
          { id: data.user.id, email, role, name },
          { onConflict: 'id' }
        )
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['all_users'] }) },
  })
}
