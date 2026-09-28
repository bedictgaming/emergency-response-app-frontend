import React from 'react';
import { LoaderCircle } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'dark';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  loading?: boolean;
  loadingText?: string;
}

export function Button({ 
  variant = 'default', 
  size = 'default',
  loading = false,
  loadingText,
  disabled,
  children,
  className = '', 
  ...props 
}: ButtonProps) {
  const baseStyles = 'motion-press inline-flex items-center justify-center gap-2 rounded-lg border border-transparent font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-50';
  
  const variantStyles = {
    default: 'border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md',
    secondary: 'border-secondary bg-secondary text-secondary-foreground hover:bg-secondary/90',
    outline: 'border-border bg-card text-card-foreground hover:border-muted-foreground/40 hover:bg-muted',
    ghost: 'bg-transparent text-foreground hover:bg-muted',
    destructive: 'border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90',
    dark: 'border-secondary bg-secondary text-secondary-foreground hover:bg-secondary/90'
  };

  const sizeStyles = {
    default: 'min-h-11 px-4 py-2.5 text-sm',
    sm: 'min-h-9 px-3 py-2 text-xs',
    lg: 'min-h-12 px-6 py-3 text-base',
    icon: 'h-11 w-11 p-0'
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}
