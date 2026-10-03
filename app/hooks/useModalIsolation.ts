"use client";
import { useEffect, useRef, type RefObject } from "react";

export function useModalIsolation(open: boolean, panel: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open || !panel.current) return;
    const element = panel.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const root = element.closest('[data-history-modal]');
    const siblings = Array.from(document.body.children).filter(child => child !== root) as HTMLElement[];
    const inert = siblings.map(child => child.inert);
    siblings.forEach(child => { child.inert = true; });
    document.body.style.overflow = 'hidden';
    const isTop = () => { const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]'); return dialogs[dialogs.length - 1] === element; };
    const focusables = () => Array.from(element.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(child => child.getClientRects().length > 0);
    const initial = () => (element.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0] ?? element).focus({ preventScroll: true });
    initial();
    const keydown = (event: KeyboardEvent) => {
      if (!isTop()) return;
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key === 'Tab') {
        const items = focusables(), first = items[0], last = items[items.length - 1];
        if (!first) { event.preventDefault(); element.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element)) { event.preventDefault(); first.focus(); }
      }
    };
    const focusin = (event: FocusEvent) => { if (isTop() && !element.contains(event.target as Node)) initial(); };
    document.addEventListener('keydown', keydown);
    document.addEventListener('focusin', focusin);
    return () => {
      document.removeEventListener('keydown', keydown); document.removeEventListener('focusin', focusin);
      siblings.forEach((child, index) => { child.inert = inert[index]; });
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, panel]);
}
