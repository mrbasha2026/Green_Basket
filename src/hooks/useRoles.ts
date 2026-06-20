import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Role, RolePermission, Action, UserProfile } from '@/types/permissions'
import { ACTION_REQUIRES, ACTION_DEPENDENTS } from '@/types/permissions'

// ============================================================
// جلب البيانات
// ============================================================

export function useAllRoles() {
  return useQuery<Role[]>({
    queryKey: ['roles'],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .order('created_at')
      if (error) throw error
      return data as Role[]
    },
  })
}

export function useRolePermissions(roleId: string | undefined) {
  return useQuery<RolePermission[]>({
    queryKey: ['role_permissions', roleId],
    enabled: !!roleId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      if (!roleId) return []
      const { data, error } = await supabase
        .from('role_permissions')
        .select('*')
        .eq('role_id', roleId)
      if (error) throw error
      return data as RolePermission[]
    },
  })
}

export function useAllUsers() {
  return useQuery<UserProfile[]>({
    queryKey: ['all_users'],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*, role:roles(*)')
        .order('created_at')
      if (error) throw error
      return data as UserProfile[]
    },
  })
}

// ============================================================
// إنشاء / تعديل / حذف الأدوار
// ============================================================

export function useCreateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, description }: { name: string; description?: string }) => {
      const { data, error } = await supabase
        .from('roles')
        .insert({ name, description, is_system: false })
        .select()
        .single()
      if (error) throw error
      return data as Role
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  })
}

export function useUpdateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name, description }: { id: string; name: string; description?: string }) => {
      const { error } = await supabase
        .from('roles')
        .update({ name, description })
        .eq('id', id)
        .eq('is_system', false)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  })
}

export function useDeleteRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('roles')
        .delete()
        .eq('id', id)
        .eq('is_system', false)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] })
      qc.invalidateQueries({ queryKey: ['all_users'] })
    },
  })
}

// ============================================================
// تعديل صلاحيات دور
// ============================================================

// تحسب قائمة الـ actions التي يجب تفعيلها (التبعيات)
export function resolveRequires(action: Action, current: Set<Action>): Set<Action> {
  const result = new Set(current)
  result.add(action)
  const required = ACTION_REQUIRES[action] ?? []
  for (const dep of required) result.add(dep)
  return result
}

// تحسب قائمة الـ actions التي يجب إيقافها (التبعيات العكسية)
export function resolveDependents(action: Action, current: Set<Action>): Set<Action> {
  const result = new Set(current)
  result.delete(action)
  const deps = ACTION_DEPENDENTS[action] ?? []
  for (const dep of deps) result.delete(dep)
  return result
}

export function useSetRolePermissions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ roleId, screen, actions }: { roleId: string; screen: string; actions: Action[] }) => {
      // نسخة احتياطية قبل الحذف
      const { data: backup } = await supabase
        .from('role_permissions')
        .select('role_id, screen, action')
        .eq('role_id', roleId)
        .eq('screen', screen)

      await supabase
        .from('role_permissions')
        .delete()
        .eq('role_id', roleId)
        .eq('screen', screen)

      if (actions.length === 0) return

      const rows = actions.map(action => ({ role_id: roleId, screen, action }))
      const { error } = await supabase.from('role_permissions').insert(rows)
      if (error) {
        // استعادة من النسخة الاحتياطية عند فشل الإدراج
        if (backup?.length) await supabase.from('role_permissions').insert(backup)
        throw error
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['role_permissions', vars.roleId] })
      qc.invalidateQueries({ queryKey: ['current_user_permissions'] })
    },
  })
}

// حفظ كامل صلاحيات دور (كل الشاشات مرة واحدة)
export function useSaveAllRolePermissions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ roleId, permMap }: { roleId: string; permMap: Map<string, Set<Action>> }) => {
      // احذف الكل أولاً
      await supabase.from('role_permissions').delete().eq('role_id', roleId)

      const rows: { role_id: string; screen: string; action: string }[] = []
      for (const [screen, actions] of permMap.entries()) {
        for (const action of actions) {
          rows.push({ role_id: roleId, screen, action })
        }
      }
      if (rows.length > 0) {
        const { error } = await supabase.from('role_permissions').insert(rows)
        if (error) throw error
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['role_permissions', vars.roleId] })
      qc.invalidateQueries({ queryKey: ['current_user_permissions'] })
    },
  })
}

// ============================================================
// إدارة المستخدمين
// ============================================================

export function useUpsertUserProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, email, name, role_id }: { id: string; email?: string; name?: string; role_id?: string }) => {
      const { error } = await supabase
        .from('user_profiles')
        .upsert({ id, email, name, role_id }, { onConflict: 'id' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all_users'] })
      qc.invalidateQueries({ queryKey: ['current_user_profile'] })
      qc.invalidateQueries({ queryKey: ['current_user_permissions'] })
    },
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async ({ email, name, password, role_id }: { email: string; name: string; password: string; role_id: string }) => {
      const res = await fetch('/api/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ email, name, password, role_id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'خطأ غير متوقع' }))
        throw new Error(err.error ?? 'فشل إنشاء المستخدم')
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all_users'] }),
  })
}
