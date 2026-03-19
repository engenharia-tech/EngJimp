import React, { useState, useEffect } from 'react';
import { Lock, User as UserIcon, LogIn, Loader2 } from 'lucide-react';
import { authenticateUser, fetchSettings } from '../services/storageService';
import { User, AppSettings } from '../types';
import { Logo } from './Logo';
// Logo em public/logo.svg — sem import de módulo
const logoImg = '/logo.svg';

interface LoginProps {
  onLogin: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      const s = await fetchSettings();
      setSettings(s);
    };
    loadSettings();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const user = await authenticateUser(username, password);
      if (user) {
        onLogin(user);
      } else {
        setError('Usuário ou senha inválidos');
      }
    } catch (err) {
      setError('Erro ao conectar ao servidor');
    } finally {
      setLoading(false);
    }
  };

  const COMPANY_LOGO = settings?.logoUrl || logoImg;
  const COMPANY_NAME = settings?.companyName || 'JIMP NEXUS';

  console.log("Rendering Login component, settings:", settings);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-950 p-8 rounded-2xl shadow-2xl max-w-md w-full border border-slate-800">
        <div className="text-center mb-8">
          {/* Logo Container */}
          <div className="flex justify-center mb-6">
             <Logo 
               theme="dark"
               logoUrl={COMPANY_LOGO} 
               companyName={COMPANY_NAME}
               className="h-[90px]"
               textSizeClassName="text-5xl whitespace-nowrap"
             />
          </div>
          <p className="text-slate-400 text-sm">Entre com suas credenciais para continuar</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-800 text-red-200 text-sm rounded-lg flex items-center justify-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300 ml-1">Usuário</label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 p-3 bg-black border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="Seu nome de usuário"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300 ml-1">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 p-3 bg-black border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="Sua senha"
                required
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl flex items-center justify-center transition-all shadow-lg hover:shadow-blue-500/20 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <LogIn className="w-5 h-5 mr-2" />}
            {loading ? 'Entrando...' : 'Acessar Sistema'}
          </button>
        </form>

        <div className="mt-8 text-center text-xs">
          <p className="font-medium text-slate-500">
            Desenvolvido por <span className="font-bold tracking-tight"><span className="text-orange-500">JIMP</span><span className="text-blue-600">NEXUS</span></span>
          </p>
        </div>
      </div>
    </div>
  );
};
