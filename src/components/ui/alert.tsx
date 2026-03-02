import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
}

const variantStyles: Record<AlertVariant, { container: string; icon: string }> = {
  info: { container: 'bg-info-muted border-info/20', icon: 'text-info' },
  success: { container: 'bg-success-muted border-success/20', icon: 'text-success' },
  warning: { container: 'bg-warning-muted border-warning/20', icon: 'text-warning' },
  error: { container: 'bg-error-muted border-error/20', icon: 'text-error' },
};

const icons: Record<AlertVariant, typeof Info> = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle,
};

export function Alert({ variant = 'info', title, className, children, ...props }: AlertProps) {
  const Icon = icons[variant];
  const styles = variantStyles[variant];

  return (
    <div
      role="alert"
      className={cn('flex gap-3 rounded-card border p-4', styles.container, className)}
      {...props}
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', styles.icon)} aria-hidden="true" />
      <div className="flex-1">
        {title && <p className={cn('mb-1 font-semibold', styles.icon)}>{title}</p>}
        <div className="text-body-sm text-text-primary">{children}</div>
      </div>
    </div>
  );
}
