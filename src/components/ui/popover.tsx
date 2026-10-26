'use client';
import * as React from 'react';
import * as Primitive from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';

export const Popover = Primitive.Root;
export const PopoverTrigger = Primitive.Trigger;
export const PopoverTitle = Primitive.Title;
export const PopoverDescription = Primitive.Description;
export const PopoverContent = React.forwardRef<React.ComponentRef<typeof Primitive.Content>, React.ComponentPropsWithoutRef<typeof Primitive.Content>>(
  ({ className, align = 'end', sideOffset = 8, collisionPadding = 12, ...props }, ref) => <Primitive.Portal forceMount={props.forceMount}>
    <Primitive.Content ref={ref} align={align} sideOffset={sideOffset} collisionPadding={collisionPadding}
      className={cn('z-[110] w-[min(24rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-popover text-popover-foreground shadow-lg outline-none', className)} {...props} />
  </Primitive.Portal>,
);
PopoverContent.displayName = 'PopoverContent';
