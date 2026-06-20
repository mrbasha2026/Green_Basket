import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Layout } from '@/components/layout/Layout'
import { useAuthInit } from '@/hooks/useAuth'
import Dashboard from '@/pages/Dashboard'
import Analytics from '@/pages/Analytics'
import AccountStatement from '@/pages/AccountStatement'
import Purchases from '@/pages/Purchases'
import Sales from '@/pages/Sales'
import Inventory from '@/pages/Inventory'
import Profits from '@/pages/Profits'
import CostAccounting from '@/pages/CostAccounting'
import PeriodManagement from '@/pages/PeriodManagement'
import Customers from '@/pages/Customers'
import Waste from '@/pages/Waste'
import Sync from '@/pages/Sync'
import Reports from '@/pages/Reports'
import Settings from '@/pages/Settings'
import Profile from '@/pages/Profile'
import Login from '@/pages/Login'
import { usePermissionWithLoading } from '@/hooks/usePermissions'
import type { ReactNode } from 'react'

// حارس المسار — يعيد للرئيسية إذا لم يكن للمستخدم صلاحية العرض
function Guard({ screen, children }: { screen: string; children: ReactNode }) {
  const { allowed, isLoading } = usePermissionWithLoading(screen, 'view')
  if (isLoading) return <div className="min-h-[60vh] animate-pulse bg-muted/30 rounded-lg m-6" />
  if (!allowed) return <Navigate to="/" replace />
  return <>{children}</>
}

function PWAUpdater() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW()
  useEffect(() => {
    if (!needRefresh) return
    toast('يوجد تحديث جديد للتطبيق', {
      duration: Infinity,
      action: { label: 'تحديث', onClick: () => updateServiceWorker(true) },
    })
  }, [needRefresh, updateServiceWorker])
  return null
}

export default function App() {
  useAuthInit()

  return (
    <ErrorBoundary>
      <PWAUpdater />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/analytics" element={<Guard screen="analytics"><Analytics /></Guard>} />
            <Route path="/account-statement" element={<Guard screen="account_statement"><AccountStatement /></Guard>} />
            <Route path="/purchases" element={<Guard screen="purchases"><Purchases /></Guard>} />
            <Route path="/sales" element={<Guard screen="sales"><Sales /></Guard>} />
            <Route path="/inventory" element={<Guard screen="inventory"><Inventory /></Guard>} />
            <Route path="/profits" element={<Guard screen="profits"><Profits /></Guard>} />
            <Route path="/cost-accounting" element={<Guard screen="cost_accounting"><CostAccounting /></Guard>} />
            <Route path="/period-management" element={<Guard screen="period_management"><PeriodManagement /></Guard>} />
            <Route path="/customers" element={<Guard screen="customers"><Customers /></Guard>} />
            <Route path="/waste" element={<Guard screen="waste"><Waste /></Guard>} />
            <Route path="/sync" element={<Guard screen="sync"><Sync /></Guard>} />
            <Route path="/reports" element={<Guard screen="reports"><Reports /></Guard>} />
            <Route path="/settings" element={<Guard screen="settings"><Settings /></Guard>} />
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Routes>
        <Toaster position="top-center" richColors />
      </BrowserRouter>
    </ErrorBoundary>
  )
}
