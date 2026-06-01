import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, TrendingUp, Package, BarChart3,
  Calculator, Users, Trash2, RefreshCw, FileText, Settings, Leaf,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'

function useSiteSettings() {
  const [s, setS] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gb_site_settings') ?? '{}') } catch { return {} }
  })
  useEffect(() => {
    const handler = () => {
      try { setS(JSON.parse(localStorage.getItem('gb_site_settings') ?? '{}')) } catch {}
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])
  return s as { name?: string; tagline?: string; logo?: string }
}

const navItems = [
  { to: '/', label: 'لوحة التحكم', icon: LayoutDashboard, end: true },
  { to: '/purchases', label: 'المشتريات', icon: ShoppingCart },
  { to: '/sales', label: 'المبيعات', icon: TrendingUp },
  { to: '/inventory', label: 'المخزون', icon: Package },
  { to: '/profits', label: 'تحليل الأرباح', icon: BarChart3 },
  { to: '/cost-accounting', label: 'محاسبة التكاليف', icon: Calculator },
  { to: '/customers', label: 'العملاء', icon: Users },
  { to: '/waste', label: 'الهدر', icon: Trash2 },
  { to: '/sync', label: 'المزامنة', icon: RefreshCw },
  { to: '/reports', label: 'التقارير', icon: FileText },
  { to: '/settings', label: 'الإعدادات', icon: Settings },
]

export function Sidebar() {
  const site = useSiteSettings()
  return (
    <aside className="w-64 min-h-screen bg-card border-l border-border flex flex-col">
      {/* Logo */}
      <div className="p-6 flex items-center gap-3 border-b border-border">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden shrink-0 ${site.logo ? 'bg-transparent' : 'bg-primary'}`}>
          {site.logo
            ? <img src={site.logo} alt="logo" className="w-full h-full object-cover rounded-lg" />
            : <Leaf className="w-5 h-5 text-primary-foreground" />
          }
        </div>
        <div>
          <p className="font-bold text-foreground text-sm">{site.name || 'Greenbasket'}</p>
          <p className="text-xs text-muted-foreground">{site.tagline || 'نظام إدارة المتجر'}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div className="p-4 border-t border-border">
        <p className="text-xs text-muted-foreground text-center">v1.0.0</p>
      </div>
    </aside>
  )
}
