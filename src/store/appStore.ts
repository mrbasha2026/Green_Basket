import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AppState {
  selectedMonth: number
  selectedYear: number
  theme: 'light' | 'dark'
  setMonth: (m: number) => void
  setYear: (y: number) => void
  toggleTheme: () => void
}

const now = new Date()

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      selectedMonth: now.getMonth() + 1,
      selectedYear: now.getFullYear(),
      theme: 'light',
      setMonth: (m) => set({ selectedMonth: m }),
      setYear: (y) => set({ selectedYear: y }),
      toggleTheme: () => {
        const next = get().theme === 'light' ? 'dark' : 'light'
        document.documentElement.classList.toggle('dark', next === 'dark')
        set({ theme: next })
      },
    }),
    { name: 'greenbasket-app-store' }
  )
)
