import React from 'react';

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive';
}

export function Alert({ variant = 'default', className = '', ...props }: AlertProps) {
  const variantStyles = {
    default: 'bg-blue-50 border border-blue-200 text-blue-900',
    destructive: 'bg-red-50 border border-red-200 text-red-900'
  };

  return (
    <div
      className={`rounded-md p-4 ${variantStyles[variant]} ${className}`}
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
