import React, { createContext, useContext, useState, useCallback } from 'react';

interface SavingContextType {
  isSaving: boolean;
  startSaving: () => void;
  stopSaving: () => void;
}

const SavingContext = createContext<SavingContextType | undefined>(undefined);

export const SavingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSaving, setIsSaving] = useState(false);

  const startSaving = useCallback(() => setIsSaving(true), []);
  const stopSaving = useCallback(() => setIsSaving(false), []);

  return (
    <SavingContext.Provider value={{ isSaving, startSaving, stopSaving }}>
      {children}
    </SavingContext.Provider>
  );
};

export const useSaving = () => {
  const context = useContext(SavingContext);
  if (context === undefined) {
    throw new Error('useSaving must be used within a SavingProvider');
  }
  return context;
};
