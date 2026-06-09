import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, TrendingUp, Package, BarChart3,
  Calculator, Trash2, RefreshCw, FileText, Settings, Leaf, LineChart, BookOpen,
  CalendarClock, ChevronDown,
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
  { to: '/analytics', label: 'الإحصائيات', icon: LineChart },
  { to: '/purchases', label: 'المشتريات', icon: ShoppingCart },
  { to: '/sales', label: 'المبيعات', icon: TrendingUp },
  { to: '/inventory', label: 'المخزون', icon: Package },
  { to: '/period-management', label: 'الفترات المحاسبية', icon: CalendarClock },
  { to: '/waste', label: 'الهدر', icon: Trash2 },
  { to: '/sync', label: 'المزامنة', icon: RefreshCw },
  { to: '/account-statement', label: 'كشف الحساب', icon: BookOpen },
  { to: '/settings', label: 'الإعدادات', icon: Settings },
]

const reportsGroup = {
  label: 'التقارير والتحليلات',
  icon: BarChart3,
  items: [
    { to: '/profits',         label: 'تحليل الأرباح',    icon: BarChart3 },
    { to: '/cost-accounting', label: 'محاسبة التكاليف',  icon: Calculator },
    { to: '/reports',         label: 'التقارير',          icon: FileText },
  ],
}

export function Sidebar() {
  const site = useSiteSettings()
  const { pathname } = useLocation()

  const groupActive = reportsGroup.items.some(i => pathname.startsWith(i.to))
  const [groupOpen, setGroupOpen] = useState(groupActive)

  // افتح المجموعة تلقائياً إذا كان المسار الحالي فيها
  useEffect(() => {
    if (groupActive) setGroupOpen(true)
  }, [groupActive])

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

        {/* مجموعة التقارير والتحليلات */}
        <div>
          <button
            onClick={() => setGroupOpen(v => !v)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              groupActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <reportsGroup.icon className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-right">{reportsGroup.label}</span>
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', groupOpen && 'rotate-180')} />
          </button>

          {groupOpen && (
            <div className="mt-0.5 mr-3 border-r border-border pr-2 space-y-0.5">
              {reportsGroup.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Bottom */}
      <div className="p-4 border-t border-border">
        <p className="text-xs text-muted-foreground text-center">v1.0.0</p>
      </div>
    </aside>
  )
}
