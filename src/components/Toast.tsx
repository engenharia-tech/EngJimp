import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, XCircle, X, AlertCircle, Info, Terminal, Copy, Check } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  addToast: (message: string, type: ToastType) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [rlsBlockMsg, setRlsBlockMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const addToast = useCallback((message: string, type: ToastType) => {
    if (type === 'error' && message.includes("RLS_BLOCK:")) {
      setRlsBlockMsg(message.replace("RLS_BLOCK:", "").trim());
      return;
    }
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message: message.toUpperCase(), type }]);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
      removeToast(id);
    }, 3000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const handleCopySql = () => {
    const sql = `ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.interruptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_activities DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.innovations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.gantt_tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.interruption_types DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_types DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues DISABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload config';`;

    navigator.clipboard.writeText(sql).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      
      {/* Global Toast Container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              layout
              className={`
                flex items-center w-full max-w-sm p-4 rounded-lg shadow-lg border-l-4
                ${toast.type === 'success' ? 'bg-white dark:bg-black border-green-500 text-gray-800 dark:text-slate-100' : ''}
                ${toast.type === 'error' ? 'bg-white dark:bg-black border-red-500 text-gray-800 dark:text-slate-100' : ''}
                ${toast.type === 'info' ? 'bg-white dark:bg-black border-blue-500 text-gray-800 dark:text-slate-100' : ''}
                ${toast.type === 'warning' ? 'bg-white dark:bg-black border-yellow-500 text-gray-800 dark:text-slate-100' : ''}
              `}
            >
              <div className="flex-shrink-0 mr-3">
                {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-green-500" />}
                {toast.type === 'error' && <XCircle className="w-5 h-5 text-red-500" />}
                {toast.type === 'info' && <Info className="w-5 h-5 text-blue-500" />}
                {toast.type === 'warning' && <AlertCircle className="w-5 h-5 text-yellow-500" />}
              </div>
              <div className="flex-1 text-sm font-medium">{toast.message}</div>
              <button
                onClick={() => removeToast(toast.id)}
                className="ml-4 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* RLS Block Explantory Overlay Modal */}
      <AnimatePresence>
        {rlsBlockMsg && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 text-white rounded-2xl w-full max-w-xl shadow-2xl p-6 relative overflow-hidden"
            >
              <button
                onClick={() => setRlsBlockMsg(null)}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-full hover:bg-zinc-800 transition"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-start gap-4 mb-5">
                <div className="bg-red-950 p-2.5 rounded-xl border border-red-800">
                  <Terminal className="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white uppercase tracking-wider">
                    Segurança do Supabase Ativa (RLS)
                  </h3>
                  <p className="text-xs text-red-400 font-bold mt-1">
                    Não foi possível excluir o registro no banco de dados.
                  </p>
                </div>
              </div>

              <div className="space-y-4 text-sm text-zinc-300">
                <p>
                  As <strong>Políticas de Linha de Segurança (Row Level Security - RLS)</strong> do seu Supabase estão ativas, impedindo a exclusão de dados pelo usuário atual.
                </p>
                <p className="text-zinc-400 text-xs">
                  Para habilitar permanentemente as exclusões e edições, execute o comando SQL abaixo no console do Supabase para desativar o bloqueio de segurança:
                </p>

                {/* SQL Code Block */}
                <div className="bg-black/60 rounded-xl p-4 border border-zinc-800 font-mono text-xs text-green-400 relative group max-h-56 overflow-y-auto">
                  <button
                    onClick={handleCopySql}
                    className="absolute top-3 right-3 bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition uppercase font-bold"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-green-400" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copiar Script
                      </>
                    )}
                  </button>
                  <pre className="whitespace-pre-wrap select-all">
{`ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.interruptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_activities DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.innovations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.gantt_tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.interruption_types DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_types DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues DISABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload config';`}
                  </pre>
                </div>

                <div className="bg-zinc-800/40 border border-zinc-700/50 rounded-xl p-3 text-xs text-zinc-400 space-y-1">
                  <div className="font-bold text-zinc-300 mb-1">Como resolver no Supabase:</div>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>Acesse o <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Sua Conta Supabase</a>.</li>
                    <li>Abra o projeto do seu aplicativo.</li>
                    <li>No menu lateral esquerdo, clique em <strong>SQL Editor</strong>.</li>
                    <li>Clique em <strong>New Query</strong>, cole os comandos acima e clique em <strong>Run</strong>.</li>
                  </ol>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 border-t border-zinc-805 pt-4">
                <button
                  onClick={() => setRlsBlockMsg(null)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-sm font-semibold transition"
                >
                  Entendi, vou executar o comando
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ToastContext.Provider>
  );
};
