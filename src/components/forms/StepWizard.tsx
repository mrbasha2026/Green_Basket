import { type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

interface Step {
  label: string
  component: ReactNode
}

interface StepWizardProps {
  steps: Step[]
  currentStep: number
  onNext: () => void
  onBack: () => void
  onSubmit: () => void
  isSubmitting?: boolean
  canNext?: boolean
}

export function StepWizard({
  steps, currentStep, onNext, onBack, onSubmit, isSubmitting, canNext = true,
}: StepWizardProps) {
  const isLast = currentStep === steps.length - 1

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex items-center gap-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2 flex-1">
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0',
              i < currentStep ? 'bg-primary text-primary-foreground' :
                i === currentStep ? 'bg-primary text-primary-foreground ring-2 ring-primary/30' :
                  'bg-muted text-muted-foreground'
            )}>
              {i < currentStep ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            <span className={cn(
              'text-sm font-medium',
              i === currentStep ? 'text-foreground' : 'text-muted-foreground'
            )}>
              {step.label}
            </span>
            {i < steps.length - 1 && (
              <div className={cn(
                'flex-1 h-px',
                i < currentStep ? 'bg-primary' : 'bg-border'
              )} />
            )}
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="min-h-[200px]">
        {steps[currentStep].component}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={currentStep === 0}
        >
          السابق
        </Button>
        {isLast ? (
          <Button onClick={onSubmit} disabled={isSubmitting || !canNext}>
            {isSubmitting ? 'جاري الحفظ...' : 'حفظ'}
          </Button>
        ) : (
          <Button onClick={onNext} disabled={!canNext}>
            التالي
          </Button>
        )}
      </div>
    </div>
  )
}
