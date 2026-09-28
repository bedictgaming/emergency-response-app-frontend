import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DialogContextType {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export function Dialog({
  open,
  onOpenChange,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode
}) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <DialogContext.Provider value={{ open, onOpenChange, titleId, descriptionId }}>
      {children}
    </DialogContext.Provider>
  );
}

export function DialogContent({
  children,
  className = '',
  style
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const context = useContext(DialogContext);
  const [mounted, setMounted] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  if (!context) throw new Error('DialogContent must be used within Dialog');
  const { open, onOpenChange, titleId, descriptionId } = context;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = 0;
    }
    const timer = setTimeout(() => {
      if (scrollAreaRef.current) {
        scrollAreaRef.current.scrollTop = 0;
      }
    }, 50);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
      }

      if (event.key === 'Tab' && contentRef.current) {
        const focusable = Array.from(
          contentRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => element.getAttribute('aria-hidden') !== 'true');

        if (focusable.length === 0) {
          event.preventDefault();
          contentRef.current.focus();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', closeOnEscape);

    requestAnimationFrame(() => {
      const initialFocus = contentRef.current?.querySelector<HTMLElement>('[data-autofocus], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href]');
      (initialFocus ?? contentRef.current)?.focus();
    });

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
      previouslyFocusedRef.current?.focus();
    };
  }, [open, onOpenChange]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="motion-dialog-backdrop fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/55 p-3 backdrop-blur-[2px] sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        style={style}
        className={`motion-dialog-panel relative flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-dialog outline-none sm:max-h-[calc(100dvh-2rem)] ${className}`}
      >
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute right-3 top-3 z-20 flex h-11 w-11 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-[background-color,border-color,color] duration-200 hover:border-border hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:right-4 sm:top-4"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <div ref={scrollAreaRef} className="dialog-scroll-area min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function DialogHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mb-4 pr-8 ${className}`}>{children}</div>;
}

export function DialogTitle({ children }: { children: React.ReactNode }) {
  const context = useContext(DialogContext);
  return <h2 id={context?.titleId} className="text-xl font-semibold tracking-tight text-card-foreground">{children}</h2>;
}

export function DialogDescription({ children }: { children: React.ReactNode }) {
  const context = useContext(DialogContext);
  return <p id={context?.descriptionId} className="mt-1 text-sm text-muted-foreground">{children}</p>;
}
