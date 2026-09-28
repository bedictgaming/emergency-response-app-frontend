import React from 'react';

export function Card({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border border-border bg-card text-card-foreground ${className}`}
      {...props}
    />
  );
}

export function CardHeader({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`border-b border-border px-6 py-4 ${className}`}
      {...props}
    />
  );
}

export function CardTitle({ className = '', ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={`text-lg font-semibold text-card-foreground ${className}`}
      {...props}
    />
  );
}

export function CardDescription({ className = '', ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={`mt-1 text-sm text-muted-foreground ${className}`}
      {...props}
    />
  );
}

export function CardContent({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`px-6 py-4 ${className}`}
      {...props}
    />
  );
}
