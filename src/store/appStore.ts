import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Session } from '@supabase/supabase-js'

interface AppState {
  selectedMonth: number
  selectedYear: number
  theme: 'light' | 'dark'
  session: Session | null
  authLoading: boolean
  setMonth: (m: number) => void
  setYear: (y: number) => void
  toggleTheme: () => void
  setSession: (session: Session | null) => void
  setAuthLoading: (loading: boolean) => void
}

const now = new Date()

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      selectedMonth: now.getMonth() + 1,
      selectedYear: now.getFullYear(),
      theme: 'light',
      session: null,
      authLoading: true,
      setMonth: (m) => set({ selectedMonth: m }),
      setYear: (y) => set({ selectedYear: y }),
      toggleTheme: () => {
        const next = get().theme === 'light' ? 'dark' : 'light'
        document.documentElement.classList.toggle('dark', next === 'dark')
        set({ theme: next })
      },
      setSession: (session) => set({ session }),
      setAuthLoading: (authLoading) => set({ authLoading }),
    }),
    {
      name: 'greenbasket-app-store',
      // لا نحفظ session في localStorage — حساسة وتُجدَّد من Supabase
      partialize: (state) => ({
        selectedMonth: state.selectedMonth,
        selectedYear: state.selectedYear,
        theme: state.theme,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.theme === 'dark') {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
      },
    }
  )
)
