import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Layout } from '@/components/layout/Layout'
import Dashboard from '@/pages/Dashboard'
import Purchases from '@/pages/Purchases'
import Sales from '@/pages/Sales'
import Inventory from '@/pages/Inventory'
import Profits from '@/pages/Profits'
import CostAccounting from '@/pages/CostAccounting'
import Customers from '@/pages/Customers'
import Waste from '@/pages/Waste'
import Sync from '@/pages/Sync'
import Reports from '@/pages/Reports'
import Settings from '@/pages/Settings'
import Login from '@/pages/Login'

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/purchases" element={<Purchases />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/profits" element={<Profits />} />
            <Route path="/cost-accounting" element={<CostAccounting />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/waste" element={<Waste />} />
            <Route path="/sync" element={<Sync />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
        <Toaster position="top-center" richColors />
      </BrowserRouter>
    </ErrorBoundary>
  )
}
