import React from 'react';

export function Label(props: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className="text-sm font-medium text-gray-700"
      {...props}
    />
  );
}
