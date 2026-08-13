import { useEffect, useRef } from 'react';

/**
 * Acessibilidade de modal (WCAG 2.1.2 / 2.4.3): Escape fecha, o foco entra no
 * diálogo ao abrir, fica preso dentro dele (Tab não escapa) e volta ao elemento
 * anterior quando fecha. Use com role="dialog" aria-modal="true" no painel:
 *
 *   const ref = useDialog(() => setOpen(false));
 *   <div ref={ref} role="dialog" aria-modal="true" aria-label="..." tabIndex={-1}>
 */
export function useDialog<T extends HTMLElement = HTMLDivElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const selector =
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const first = (el?.querySelector(selector) as HTMLElement | null) || null;
    (first || el)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab' && el) {
        const focusables = (Array.from(el.querySelectorAll(selector)) as HTMLElement[]).filter(
          (x) => x.offsetParent !== null,
        );
        if (focusables.length === 0) return;
        const f = focusables[0];
        const l = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === f) {
          e.preventDefault();
          l.focus();
        } else if (!e.shiftKey && document.activeElement === l) {
          e.preventDefault();
          f.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      prevFocus?.focus?.();
    };
  }, [onClose]);

  return ref;
}
