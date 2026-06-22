import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { lazy, Suspense, useEffect } from 'react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Layout } from '@/components/layout/Layout'
import { useAuthInit } from '@/hooks/useAuth'
import { usePermissionWithLoading } from '@/hooks/usePermissions'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import type { ReactNode } from 'react'

const Dashboard       = lazy(() => import('@/pages/Dashboard'))
const Analytics       = lazy(() => import('@/pages/Analytics'))
const AccountStatement= lazy(() => import('@/pages/AccountStatement'))
const Purchases       = lazy(() => import('@/pages/Purchases'))
const Sales           = lazy(() => import('@/pages/Sales'))
const Inventory       = lazy(() => import('@/pages/Inventory'))
const Profits         = lazy(() => import('@/pages/Profits'))
const CostAccounting  = lazy(() => import('@/pages/CostAccounting'))
const PeriodManagement= lazy(() => import('@/pages/PeriodManagement'))
const Customers       = lazy(() => import('@/pages/Customers'))
const Waste           = lazy(() => import('@/pages/Waste'))
const Sync            = lazy(() => import('@/pages/Sync'))
const Reports         = lazy(() => import('@/pages/Reports'))
const Settings        = lazy(() => import('@/pages/Settings'))
const Profile         = lazy(() => import('@/pages/Profile'))
const Login           = lazy(() => import('@/pages/Login'))

const PageFallback = () => <div className="min-h-[60vh] animate-pulse bg-muted/30 rounded-lg m-6" />

// حارس المسار — يعيد للرئيسية إذا لم يكن للمستخدم صلاحية العرض
function Guard({ screen, children }: { screen: string; children: ReactNode }) {
  const { allowed, isLoading } = usePermissionWithLoading(screen, 'view')
  if (isLoading) return <PageFallback />
  if (!allowed) return <Navigate to="/" replace />
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>
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

function InstallPromptNotifier() {
  const { canInstall, install } = useInstallPrompt()
  useEffect(() => {
    if (!canInstall) return
    toast('أضف التطبيق إلى شاشتك الرئيسية', {
      duration: 15000,
      action: { label: 'تثبيت', onClick: install },
    })
  }, [canInstall])
  return null
}

export default function App() {
  useAuthInit()

  return (
    <ErrorBoundary>
      <PWAUpdater />
      <InstallPromptNotifier />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Suspense fallback={<PageFallback />}><Login /></Suspense>} />
          <Route element={<Layout />}>
            <Route path="/" element={<Suspense fallback={<PageFallback />}><Dashboard /></Suspense>} />
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
            <Route path="/profile" element={<Suspense fallback={<PageFallback />}><Profile /></Suspense>} />
          </Route>
        </Routes>
        <Toaster position="top-center" richColors />
      </BrowserRouter>
    </ErrorBoundary>
  )
}
