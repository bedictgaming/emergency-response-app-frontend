import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive';
}

export function Badge({ variant = 'default', className = '', ...props }: BadgeProps) {
  const baseStyles = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors';
  const variantStyles = {
    default: 'border-transparent bg-gray-900 text-white hover:bg-gray-800',
    secondary: 'border-transparent bg-gray-100 text-gray-900 hover:bg-gray-200',
    destructive: 'border-transparent bg-red-500 text-white hover:bg-red-600',
    outline: 'text-gray-900',
  };
  
  return (
    <div 
      className={`${baseStyles} ${variantStyles[variant]} ${className}`} 
      {...props} 
    />
  );
}
