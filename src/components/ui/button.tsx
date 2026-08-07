import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-text-inverse hover:bg-accent-hover hover:shadow-glow-accent active:scale-[0.97] transition-all duration-150',
  secondary:
    'bg-surface-elevated text-text-primary border border-border hover:bg-surface-elevated/80 active:scale-[0.97] transition-all duration-150',
  danger: 'bg-error text-white hover:bg-red-600 active:scale-[0.97] transition-all duration-150',
  ghost:
    'bg-transparent text-text-secondary hover:bg-surface-elevated/50 hover:text-text-primary transition-all duration-150',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-body-sm',
  md: 'px-4 py-2.5 text-body-sm',
  lg: 'px-5 py-3 text-body',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = 'primary', size = 'md', loading = false, disabled, children, ...props },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex min-h-11 items-center justify-center gap-2 rounded-input font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary disabled:pointer-events-none disabled:opacity-50',
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {loading && (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { Button, type ButtonProps };
