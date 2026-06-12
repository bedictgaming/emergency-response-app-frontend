import React from 'react';

export function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className="bg-white rounded-lg border border-gray-200 shadow-sm"
      {...props}
    />
  );
}

export function CardHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className="px-6 py-4 border-b border-gray-200"
      {...props}
    />
  );
}

export function CardTitle(props: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className="text-lg font-semibold text-gray-900"
      {...props}
    />
  );
}

export function CardDescription(props: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className="text-sm text-gray-600 mt-1"
      {...props}
    />
  );
}

export function CardContent(props: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className="px-6 py-4"
      {...props}
    />
  );
}
