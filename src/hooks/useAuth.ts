import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/appStore'

// اشتراك واحد في الجذر — يُستدعى مرة واحدة فقط في AuthProvider
export function useAuthInit() {
  const setSession = useAppStore(s => s.setSession)
  const setAuthLoading = useAppStore(s => s.setAuthLoading)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [setSession, setAuthLoading])
}

// hook عام للقراءة — يُستخدم في كل مكوّن
export function useAuth() {
  const session = useAppStore(s => s.session)
  const loading = useAppStore(s => s.authLoading)

  async function signIn(email: string, password: string) {
    return supabase.auth.signInWithPassword({ email, password })
  }

  async function signOut() {
    return supabase.auth.signOut()
  }

  return { session, loading, signIn, signOut }
}
