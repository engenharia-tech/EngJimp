
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language, translations } from './translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof translations['pt-BR'], params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Idioma FIXO em português — seletor de idioma removido (decisão do Edson, 24/09).
  // Ignora qualquer 'app_language' salvo, para valer para todo mundo.
  const [language] = useState<Language>('pt-BR');
  const setLanguage = (_lang: Language) => { /* no-op: o app é só pt-BR */ };

  const t = (key: keyof typeof translations['pt-BR'], params?: Record<string, string | number>): string => {
    let text = translations[language][key] || translations['pt-BR'][key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        const value = String(v);
        text = text.split(`{${k}}`).join(value);
        text = text.split(`{{${k}}}`).join(value);
      });
    }
    return text.toUpperCase();
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
