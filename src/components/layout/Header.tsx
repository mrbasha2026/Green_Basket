import { Sun, Moon, LogOut, User, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/appStore'
import { useAuth } from '@/hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePWAInstall } from '@/hooks/usePWAInstall'

interface HeaderProps {
  title: string
}

export function Header({ title }: HeaderProps) {
  const { theme, toggleTheme } = useAppStore()
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  const { canInstall, install } = usePWAInstall()

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6">
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>

      <div className="flex items-center gap-2">
        {canInstall && (
          <Button variant="outline" size="sm" onClick={install} className="gap-1.5 text-xs">
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">تثبيت التطبيق</span>
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={toggleTheme}>
          {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </Button>

        {session && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 text-sm px-3 py-2 rounded-md hover:bg-muted transition-colors">
              <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs font-bold">
                {session.user.email?.[0]?.toUpperCase() ?? 'U'}
              </div>
              <span className="hidden sm:block text-muted-foreground">{session.user.email}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate('/profile')} className="gap-2">
                <User className="w-4 h-4" />
                الملف الشخصي
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()} className="gap-2 text-danger">
                <LogOut className="w-4 h-4" />
                تسجيل الخروج
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  )
}
