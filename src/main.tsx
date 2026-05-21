import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './i18n/LanguageContext';
import { ToastProvider } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StateProvider } from './contexts/StateContext';
import { SavingProvider } from './contexts/SavingContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <ToastProvider>
        <ErrorBoundary>
          <StateProvider>
            <SavingProvider>
              <App />
            </SavingProvider>
          </StateProvider>
        </ErrorBoundary>
      </ToastProvider>
    </LanguageProvider>
  </StrictMode>,
);
