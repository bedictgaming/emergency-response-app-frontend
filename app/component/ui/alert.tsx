import React from 'react';

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'warning' | 'success' | 'destructive';
}

export function Alert({ variant = 'default', className = '', ...props }: AlertProps) {
  const variantStyles = {
    default: 'border-border bg-muted text-foreground',
    warning: 'border-warning/60 bg-warning/15 text-warning-foreground',
    success: 'border-success/45 bg-success/10 text-success',
    destructive: 'border-destructive/50 bg-destructive/10 text-destructive'
  };

  return (
    <div
      className={`rounded-lg border p-4 ${variantStyles[variant]} ${className}`}
      {...props}
    />
  );
}

export function AlertDescription(props: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className="text-sm"
      {...props}
    />
  );
}
