import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Leaf, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

function loadSiteSettings() {
  try { return JSON.parse(localStorage.getItem('gb_site_settings') ?? '{}') } catch { return {} }
}

export default function Login() {
  const { session, signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [site, setSite] = useState(loadSiteSettings)

  // Stay in sync when settings change (e.g. saved from another tab)
  useEffect(() => {
    const handler = () => setSite(loadSiteSettings())
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  // Fetch from Supabase if localStorage is empty (new device / cleared cache)
  useEffect(() => {
    const local = loadSiteSettings()
    if (local.name || local.logo) return
    supabase.from('site_settings').select('data').eq('id', 'default').maybeSingle()
      .then(({ data }) => {
        if (data?.data) {
          localStorage.setItem('gb_site_settings', JSON.stringify(data.data))
          setSite(data.data)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (session) navigate('/', { replace: true })
  }, [session, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) {
      toast.error('بيانات الدخول غير صحيحة')
    } else {
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg overflow-hidden ${site.logo ? 'bg-transparent' : 'bg-primary'}`}>
            {site.logo
              ? <img src={site.logo} alt="logo" className="w-full h-full object-contain" />
              : <Leaf className="w-8 h-8 text-primary-foreground" />}
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">{site.name || 'Greenbasket'}</h1>
            <p className="text-sm text-muted-foreground">{site.tagline || 'نظام إدارة متجر الخضار والفاكهة'}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center text-lg">تسجيل الدخول</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  required
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    dir="ltr"
                    className="pl-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'جاري الدخول...' : 'دخول'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
