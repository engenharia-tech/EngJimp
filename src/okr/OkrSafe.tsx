import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { ErrorBoundary } from '../components/ErrorBoundary';

// Cada tela do OKR tem a sua proteção: um dado ruim no OKR de UMA pessoa (um nó que
// não é o que a tela espera) mostra o aviso aqui dentro, e o resto do app continua
// de pé — antes caía a página inteira para o Edson, o admin e o CEO.
const Fallback: React.FC<{ what: string }> = ({ what }) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 shadow-sm border border-rose-200 dark:border-rose-900/50 text-center space-y-3">
    <AlertTriangle className="mx-auto text-rose-500" size={26} />
    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Não consegui mostrar {what}.</p>
    <p className="text-xs text-slate-500 dark:text-slate-400">Algum dado deste OKR veio num formato inesperado. O resto do sistema continua funcionando.</p>
    <button onClick={() => window.location.reload()} className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">Recarregar a página</button>
  </div>
);

export function withOkrSafe<P extends object>(Inner: React.ComponentType<P>, what: string): React.FC<P> {
  const Safe: React.FC<P> = (props) => (
    <ErrorBoundary fallback={<Fallback what={what} />}>
      <Inner {...props} />
    </ErrorBoundary>
  );
  Safe.displayName = `OkrSafe(${Inner.displayName || Inner.name || 'OKR'})`;
  return Safe;
}
