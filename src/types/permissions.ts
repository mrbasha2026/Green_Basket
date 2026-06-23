// ============================================================
// نظام الصلاحيات — الثوابت والأنواع
// ============================================================

export const ACTIONS = ['view', 'add', 'edit', 'delete', 'approve', 'post', 'print', 'export', 'import'] as const
export type Action = typeof ACTIONS[number]

export const ACTION_LABELS: Record<Action, string> = {
  view:    'عرض',
  add:     'إضافة',
  edit:    'تعديل',
  delete:  'حذف',
  approve: 'اعتماد',
  post:    'ترحيل',
  print:   'طباعة',
  export:  'تصدير',
  import:  'استيراد',
}

// الإجراءات المتاحة لكل شاشة
export const SCREEN_ACTIONS: Record<string, Action[]> = {
  dashboard:          ['view'],
  purchases:          ['view', 'add', 'edit', 'delete', 'approve', 'post', 'print', 'export', 'import'],
  sales:              ['view', 'add', 'edit', 'delete', 'approve', 'post', 'print', 'export', 'import'],
  inventory:          ['view', 'add', 'edit', 'delete', 'approve', 'post', 'print', 'export', 'import'],
  waste:              ['view', 'add', 'edit', 'delete', 'print', 'export'],
  customers:          ['view', 'add', 'edit', 'delete', 'print', 'export'],
  'customers.prices': ['view', 'edit'],
  cost_accounting:    ['view', 'add', 'edit', 'delete', 'approve'],
  profits:            ['view', 'print', 'export'],
  analytics:          ['view', 'print', 'export'],
  reports:            ['view', 'print', 'export'],
  account_statement:  ['view', 'print', 'export'],
  period_management:  ['view', 'add', 'edit', 'delete', 'approve', 'post'],
  settings:           ['view', 'edit'],
  'settings.users':   ['view', 'add', 'edit', 'delete'],
  'settings.roles':   ['view', 'edit'],
  sync:               ['view', 'import'],
  directory:          ['view', 'add', 'edit', 'delete'],
}

export const SCREEN_LABELS: Record<string, string> = {
  dashboard:          'لوحة التحكم',
  purchases:          'المشتريات',
  sales:              'المبيعات',
  inventory:          'المخزون',
  waste:              'الهدر',
  customers:          'العملاء',
  'customers.prices': 'أسعار العملاء',
  cost_accounting:    'محاسبة التكاليف',
  profits:            'الأرباح',
  analytics:          'التحليلات',
  reports:            'التقارير',
  account_statement:  'كشف الحساب',
  period_management:  'إدارة الفترات',
  settings:           'الإعدادات',
  'settings.users':   'إدارة المستخدمين',
  'settings.roles':   'إدارة الأدوار',
  sync:               'المزامنة',
  directory:          'الفهرس',
}

// قواعد التبعية: تفعيل action يجب أن يفعّل هذه الـ actions تلقائياً
export const ACTION_REQUIRES: Partial<Record<Action, Action[]>> = {
  add:    ['view'],
  edit:   ['view'],
  delete: ['view', 'add', 'edit'],
  print:  ['view'],
  export: ['view'],
  import: ['view'],
  approve:['view'],
  post:   ['view'],
}

// عند إيقاف action، أوقف هذه الـ actions تلقائياً
export const ACTION_DEPENDENTS: Partial<Record<Action, Action[]>> = {
  view: ['add', 'edit', 'delete', 'print', 'export', 'import', 'approve', 'post'],
  add:  ['delete'],
  edit: ['delete'],
}

export interface Role {
  id: string
  name: string
  description?: string
  is_system: boolean
  created_at: string
}

export interface RolePermission {
  id: string
  role_id: string
  screen: string
  action: Action
}

export interface UserProfile {
  id: string
  email: string
  name?: string
  role_id?: string
  role?: Role
  is_active: boolean
  created_at?: string
}
