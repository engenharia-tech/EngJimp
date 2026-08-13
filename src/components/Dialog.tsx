import React from 'react';
import { motion } from 'motion/react';
import { useDialog } from '../hooks/useDialog';

/**
 * Modal acessível: role="dialog" + aria-modal, foco preso, Escape fecha, foco
 * volta ao fechar (WCAG 2.1.2/2.4.3/4.1.2). Renderize condicionalmente — o hook
 * de foco/Escape só roda enquanto o diálogo está montado.
 *
 *   {open && (
 *     <Dialog onClose={() => setOpen(false)} label="Excluir usuário" panelClassName="...">
 *       ...conteúdo do painel...
 *     </Dialog>
 *   )}
 */
export const Dialog: React.FC<{
  onClose: () => void;
  label: string;
  children: React.ReactNode;
  panelClassName?: string;
  zClassName?: string;
}> = ({ onClose, label, children, panelClassName, zClassName = 'z-[100]' }) => {
  const ref = useDialog<HTMLDivElement>(onClose);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`fixed inset-0 ${zClassName} bg-black/60 backdrop-blur-sm flex items-center justify-center p-4`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={panelClassName || 'w-full max-w-md outline-none'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </motion.div>
  );
};
