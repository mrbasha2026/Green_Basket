import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/hooks/useAuth'
import { useCurrentUser } from '@/hooks/usePermissions'
import { useUpsertUserProfile } from '@/hooks/useRoles'
import { supabase } from '@/lib/supabase'
import { User, Lock, Mail } from 'lucide-react'

export default function Profile() {
  const { session } = useAuth()
  const { data: profile } = useCurrentUser()
  const { mutateAsync: upsertProfile, isPending: savingName } = useUpsertUserProfile()

  const [name, setName] = useState(profile?.name ?? session?.user?.user_metadata?.name ?? '')
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' })
  const [savingPass, setSavingPass] = useState(false)

  // تحديث الاسم
  async function handleSaveName() {
    if (!session?.user) return
    try {
      await upsertProfile({ id: session.user.id, name })
      toast.success('تم تحديث الاسم')
    } catch {
      toast.error('فشل تحديث الاسم')
    }
  }

  // تغيير كلمة المرور
  async function handleChangePassword() {
    if (!passwords.newPass || passwords.newPass !== passwords.confirm) {
      toast.error('كلمتا المرور غير متطابقتين')
      return
    }
    if (passwords.newPass.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
      return
    }
    setSavingPass(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: passwords.newPass })
      if (error) throw error
      toast.success('تم تغيير كلمة المرور')
      setPasswords({ current: '', newPass: '', confirm: '' })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'فشل تغيير كلمة المرور')
    } finally {
      setSavingPass(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">

      {/* معلومات الحساب */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            معلومات الحساب
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
            <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-lg font-bold shrink-0">
              {(profile?.name ?? session?.user?.email ?? 'U')[0].toUpperCase()}
            </div>
            <div>
              <p className="font-semibold">{profile?.name ?? '—'}</p>
              <p className="text-sm text-muted-foreground" dir="ltr">{session?.user?.email}</p>
              {profile?.role && (
                <Badge variant="outline" className="mt-1 text-xs">{profile.role.name}</Badge>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">الاسم</Label>
            <div className="flex gap-2">
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="اسمك الكامل"
                className="h-9"
              />
              <Button size="sm" className="h-9 shrink-0" onClick={handleSaveName} disabled={savingName}>
                {savingName ? 'جاري...' : 'حفظ'}
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" />البريد الإلكتروني
            </Label>
            <Input value={session?.user?.email ?? ''} disabled className="h-9 bg-muted/40" dir="ltr" />
          </div>
        </CardContent>
      </Card>

      {/* تغيير كلمة المرور */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary" />
            تغيير كلمة المرور
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">كلمة المرور الجديدة</Label>
            <Input
              type="password"
              value={passwords.newPass}
              onChange={e => setPasswords(p => ({ ...p, newPass: e.target.value }))}
              placeholder="••••••••"
              className="h-9"
              dir="ltr"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">تأكيد كلمة المرور</Label>
            <Input
              type="password"
              value={passwords.confirm}
              onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))}
              placeholder="••••••••"
              className="h-9"
              dir="ltr"
            />
          </div>
          <Button
            className="w-full h-9"
            onClick={handleChangePassword}
            disabled={savingPass || !passwords.newPass}
          >
            {savingPass ? 'جاري التغيير...' : 'تغيير كلمة المرور'}
          </Button>
        </CardContent>
      </Card>

    </div>
  )
}
