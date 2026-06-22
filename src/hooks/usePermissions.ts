import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Action, Role, UserProfile } from '@/types/permissions'

// ملف المستخدم الحالي مع دوره
export function useCurrentUser() {
  const { session } = useAuth()
  const userId = session?.user?.id

  return useQuery<UserProfile | null>({
    queryKey: ['current_user_profile', userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!userId) return null
      const { data } = await supabase
        .from('user_profiles')
        .select('*, role:roles(*)')
        .eq('id', userId)
        .maybeSingle()
      return data as UserProfile | null
    },
  })
}

// صلاحيات دور المستخدم الحالي (screen → Set<action>)
export function useCurrentUserPermissions() {
  const { session } = useAuth()
  const userId = session?.user?.id

  return useQuery<Map<string, Set<Action>>>({
    queryKey: ['current_user_permissions', userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!userId) return new Map()

      const profile = await supabase
        .from('user_profiles')
        .select('role_id, is_active')
        .eq('id', userId)
        .maybeSingle()

      // مستخدم موقوف — لا صلاحيات بغض النظر عن الجلسة الحالية
      if (profile.data?.is_active === false) return new Map()

      // إذا لم يكن للمستخدم دور، يُعامَل كمدير نظام للمستخدم الأول فقط
      if (!profile.data?.role_id) {
        // نتحقق إذا كان هناك أي مستخدم آخر مُعيَّن له دور (النظام مُعَدّ بالفعل)
        const { count } = await supabase
          .from('user_profiles')
          .select('id', { count: 'exact', head: true })
          .not('role_id', 'is', null)
        if ((count ?? 0) > 0) return new Map()

        const { data: adminRoles } = await supabase
          .from('roles')
          .select('id')
          .eq('is_system', true)
          .limit(1)

        const adminRole = adminRoles?.[0]
        if (!adminRole) return new Map()

        const { data: perms } = await supabase
          .from('role_permissions')
          .select('screen, action')
          .eq('role_id', adminRole.id)

        const map = new Map<string, Set<Action>>()
        for (const p of perms ?? []) {
          if (!map.has(p.screen)) map.set(p.screen, new Set())
          map.get(p.screen)!.add(p.action as Action)
        }
        return map
      }

      const { data: perms } = await supabase
        .from('role_permissions')
        .select('screen, action')
        .eq('role_id', profile.data.role_id)

      const map = new Map<string, Set<Action>>()
      for (const p of perms ?? []) {
        if (!map.has(p.screen)) map.set(p.screen, new Set())
        map.get(p.screen)!.add(p.action as Action)
      }
      return map
    },
  })
}

// hook رئيسي: هل للمستخدم هذه الصلاحية؟
export function usePermission(screen: string, action: Action): boolean {
  const { data: perms, isLoading } = useCurrentUserPermissions()
  if (isLoading || !perms) return false
  return perms.get(screen)?.has(action) ?? false
}

// نفس الـ hook مع إظهار حالة التحميل
export function usePermissionWithLoading(screen: string, action: Action): { allowed: boolean; isLoading: boolean } {
  const { data: perms, isLoading, isError } = useCurrentUserPermissions()
  // خطأ في الجلب = لا نعيد التوجيه، نبقى في حالة تحميل حتى ينجح الـ retry
  if (isLoading || isError) return { allowed: false, isLoading: true }
  if (!perms) return { allowed: false, isLoading: false }
  return { allowed: perms.get(screen)?.has(action) ?? false, isLoading: false }
}

// للتوافق مع الكود القديم: usePermission('purchases.view') → usePermission('purchases', 'view')
export function useLegacyPermission(permission: string): boolean {
  const parts = permission.split('.')
  const action = parts.pop() as Action
  const screen = parts.join('.')
  return usePermission(screen, action)
}

// الدور الحالي للمستخدم
export function useCurrentRole(): Role | null {
  const { data: user } = useCurrentUser()
  return user?.role ?? null
}

// للتوافق مع الكود القديم — يُرجع اسم الدور
export function useUserRole() {
  const { data: user, isLoading } = useCurrentUser()
  return {
    data: user?.role?.name ?? null,
    isLoading,
  }
}
