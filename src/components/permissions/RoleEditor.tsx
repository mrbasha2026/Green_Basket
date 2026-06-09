import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Loader2, Save, Lock } from 'lucide-react'
import { toast } from 'sonner'
import {
  SCREEN_ACTIONS, SCREEN_LABELS, ACTION_LABELS, ACTIONS,
  ACTION_REQUIRES, ACTION_DEPENDENTS,
  type Action, type Role, type RolePermission,
} from '@/types/permissions'
import { useSaveAllRolePermissions } from '@/hooks/useRoles'

interface RoleEditorProps {
  role: Role
  permissions: RolePermission[]
}

export function RoleEditor({ role, permissions }: RoleEditorProps) {
  const saveAll = useSaveAllRolePermissions()

  // permMap: screen → Set<action>
  const [permMap, setPermMap] = useState<Map<string, Set<Action>>>(() => buildMap(permissions))
  const [dirty, setDirty] = useState(false)

  // إعادة تهيئة عند تغيير الدور
  useEffect(() => {
    setPermMap(buildMap(permissions))
    setDirty(false)
  }, [role.id, permissions])

  function toggle(screen: string, action: Action, checked: boolean) {
    setPermMap(prev => {
      const next = new Map(prev)
      const current = new Set(next.get(screen) ?? [])

      if (checked) {
        current.add(action)
        // فعّل التبعيات المطلوبة
        for (const dep of ACTION_REQUIRES[action] ?? []) current.add(dep)
      } else {
        current.delete(action)
        // أوقف ما يعتمد على هذا الإجراء
        for (const dep of ACTION_DEPENDENTS[action] ?? []) current.delete(dep)
      }

      next.set(screen, current)
      return next
    })
    setDirty(true)
  }

  function toggleScreen(screen: string, checked: boolean) {
    setPermMap(prev => {
      const next = new Map(prev)
      next.set(screen, checked ? new Set(SCREEN_ACTIONS[screen]) : new Set())
      return next
    })
    setDirty(true)
  }

  async function handleSave() {
    await saveAll.mutateAsync({ roleId: role.id, permMap })
    toast.success('تم حفظ الصلاحيات')
    setDirty(false)
  }

  const screens = Object.keys(SCREEN_ACTIONS)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-base">{role.name}</h3>
          {role.is_system && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Lock className="w-3 h-3" />
              نظامي
            </Badge>
          )}
          {role.description && (
            <span className="text-sm text-muted-foreground">{role.description}</span>
          )}
        </div>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!dirty || saveAll.isPending || role.is_system}
          className="gap-1"
        >
          {saveAll.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          حفظ التغييرات
        </Button>
      </div>

      {role.is_system && (
        <p className="text-sm text-muted-foreground bg-muted rounded-md px-3 py-2">
          الأدوار النظامية لا يمكن تعديل صلاحياتها.
        </p>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-right px-3 py-2 font-medium w-44">الشاشة</th>
              {ACTIONS.map(action => (
                <th key={action} className="text-center px-2 py-2 font-medium min-w-[60px]">
                  {ACTION_LABELS[action]}
                </th>
              ))}
              <th className="text-center px-2 py-2 font-medium w-16">الكل</th>
            </tr>
          </thead>
          <tbody>
            {screens.map((screen, i) => {
              const screenActions = SCREEN_ACTIONS[screen]
              const current = permMap.get(screen) ?? new Set<Action>()
              const allChecked = screenActions.every(a => current.has(a))
              const someChecked = screenActions.some(a => current.has(a))

              return (
                <tr key={screen} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                  <td className="px-3 py-2 font-medium">{SCREEN_LABELS[screen]}</td>
                  {ACTIONS.map(action => {
                    const available = screenActions.includes(action)
                    const checked = current.has(action)
                    return (
                      <td key={action} className="text-center px-2 py-2">
                        {available ? (
                          <Checkbox
                            checked={checked}
                            disabled={role.is_system}
                            onCheckedChange={(v: boolean) => toggle(screen, action, v)}
                            className="mx-auto"
                          />
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </td>
                    )
                  })}
                  <td className="text-center px-2 py-2">
                    <Checkbox
                      checked={allChecked}
                      disabled={role.is_system}
                      data-state={someChecked && !allChecked ? 'indeterminate' : undefined}
                      onCheckedChange={(v: boolean) => toggleScreen(screen, v)}
                      className="mx-auto"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function buildMap(permissions: RolePermission[]): Map<string, Set<Action>> {
  const map = new Map<string, Set<Action>>()
  for (const p of permissions) {
    if (!map.has(p.screen)) map.set(p.screen, new Set())
    map.get(p.screen)!.add(p.action)
  }
  return map
}
