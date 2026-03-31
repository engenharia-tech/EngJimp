import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSaving } from '../contexts/SavingContext';
import { Loader2 } from 'lucide-react';

export const SavingOverlay: React.FC = () => {
  const { isSaving } = useSaving();

  return (
    <AnimatePresence>
      {isSaving && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-6 left-6 z-[9999] pointer-events-none"
        >
          <div className="bg-slate-900 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-3 border border-slate-700">
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            <span className="text-sm font-medium">Gravando...</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
