import * as React from 'react'
import { cn } from '@/lib/utils'

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onCheckedChange, ...props }, ref) => (
    <input
      type="checkbox"
      ref={ref}
      className={cn(
        'h-4 w-4 rounded border border-border text-primary accent-primary cursor-pointer',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      onChange={e => onCheckedChange?.(e.target.checked)}
      {...props}
    />
  )
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }
