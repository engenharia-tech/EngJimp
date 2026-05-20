import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public state: State;
  public props: Props;

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in application:", error, errorInfo);
  }

  private handleReset = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6 font-sans">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-lg w-full p-8 shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 bg-red-950/50 border border-red-800 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white tracking-tight">Ocorreu um erro no sistema</h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Um erro inesperado impediu o carregamento completo da página. Limpar as configurações locais ou recarregar pode resolver o problema.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-900 border border-slate-800 text-left p-4 rounded-xl font-mono text-xs text-red-400 overflow-x-auto max-h-40 no-scrollbar">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2.5 px-4 rounded-xl transition-all shadow cursor-pointer"
              >
                Recarregar Página
              </button>
              <button
                onClick={this.handleReset}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-semibold py-2.5 px-4 rounded-xl transition-all shadow hover:shadow-red-500/20 cursor-pointer"
              >
                Limpar Dados & Resetar
              </button>
            </div>
            <p className="text-[10px] text-slate-500 font-mono">JIMPNexus Fallback Suite</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
