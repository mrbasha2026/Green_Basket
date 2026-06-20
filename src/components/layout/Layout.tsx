import { Outlet, useLocation, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useAuth } from '@/hooks/useAuth'
import { Skeleton } from '@/components/ui/skeleton'

const pageTitles: Record<string, string> = {
  '/': 'لوحة التحكم',
  '/purchases': 'المشتريات',
  '/sales': 'المبيعات',
  '/inventory': 'المخزون',
  '/profits': 'تحليل الأرباح المباشر',
  '/cost-accounting': 'محاسبة التكاليف',
  '/customers': 'العملاء',
  '/waste': 'الهدر',
  '/sync': 'مزامنة Google Sheets',
  '/reports': 'التقارير',
  '/settings': 'الإعدادات',
}

export function Layout() {
  const { session, loading } = useAuth()
  const { pathname } = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-3 w-64">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  const title = pageTitles[pathname] ?? 'Greenbasket'

  return (
    <div className="flex min-h-screen bg-background">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header title={title} onMenuToggle={() => setSidebarOpen(v => !v)} />
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
