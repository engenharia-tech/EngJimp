import React, { useState, useEffect } from 'react';
import { Lock, User as UserIcon, LogIn, Loader2, UserPlus, ArrowLeft } from 'lucide-react';
import { supabase, fetchSettings, getCurrentUser, firstAccess, resetPassword, updatePassword } from '../services/storageService';
import { User, AppSettings, UserRole } from '../types';
import { Logo } from './Logo';
import logoImg from '../assets/logo.svg';

interface LoginProps {
  onLogin: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'update-password'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.PROJETISTA);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('update-password');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const s = await fetchSettings();
        setSettings(s);
      } catch (err) {
        console.error("Failed to load settings", err);
      }
    };
    loadSettings();
  }, []);

  const [systemStatus, setSystemStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const { error } = await supabase.from('settings').select('count', { count: 'exact', head: true });
        if (error && error.code !== 'PGRST116') throw error;
        setSystemStatus('online');
      } catch (err) {
        console.error("System status check failed", err);
        setSystemStatus('offline');
      }
    };
    checkStatus();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      if (data.user) {
        let user = await getCurrentUser();
        
        // If profile doesn't exist, try to create it automatically
        if (!user) {
          console.log("Profile not found, attempting to create one...");
          const res = await firstAccess({ 
            name: email.split('@')[0], // Fallback name
            email: email,
            role: UserRole.PROJETISTA // Default role
          }, password);
          
          if (res.success) {
            user = await getCurrentUser();
          }
        }

        if (user) {
          onLogin(user);
        } else {
          setError('Usuário autenticado, mas perfil não encontrado no banco de dados. Tente usar o "Primeiro Acesso" se for sua primeira vez.');
        }
      }
    } catch (err: any) {
      console.error("Login failed", err);
      setError(err.message || 'Falha na autenticação. Verifique suas credenciais.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await firstAccess({ name, surname, phone, username, email, role }, password);
      if (res.success) {
        setSuccess('Cadastro realizado com sucesso! Agora você pode entrar.');
        setMode('login');
        setPassword('');
      } else {
        setError(res.message || 'Erro ao realizar cadastro.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao realizar cadastro.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Por favor, insira seu e-mail.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await resetPassword(email);
      if (res.success) {
        setSuccess(res.message || 'Link de recuperação enviado!');
      } else {
        setError(res.message || 'Erro ao enviar e-mail de recuperação.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao processar solicitação.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    if (newPassword.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await updatePassword(newPassword);
      if (res.success) {
        setSuccess('Senha atualizada com sucesso! Você já pode fazer login.');
        setMode('login');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setError(res.message || 'Erro ao atualizar senha.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar senha.');
    } finally {
      setLoading(false);
    }
  };

  const COMPANY_LOGO = settings?.logoUrl || logoImg;
  const COMPANY_NAME = settings?.companyName || 'JIMP NEXUS';

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-950 p-8 rounded-2xl shadow-2xl max-w-md w-full border border-slate-800">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
             <Logo 
               theme="dark"
               logoUrl={COMPANY_LOGO} 
               companyName={COMPANY_NAME}
               className="h-[90px]"
               textSizeClassName="text-5xl whitespace-nowrap"
             />
          </div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${systemStatus === 'online' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : systemStatus === 'offline' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-slate-500 animate-pulse'}`}></div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {systemStatus === 'online' ? 'Sistema Online' : systemStatus === 'offline' ? 'Sistema Offline' : 'Verificando...'}
            </span>
          </div>
          <p className="text-slate-400 text-sm">
            {mode === 'login' ? 'Entre com suas credenciais para continuar' : 
             mode === 'register' ? 'Crie seu perfil de acesso ao sistema' :
             'Recupere o acesso à sua conta'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-800 text-red-200 text-sm rounded-lg flex items-center justify-center text-center">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-emerald-900/30 border border-emerald-800 text-emerald-200 text-sm rounded-lg flex items-center justify-center text-center">
            {success}
          </div>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 ml-1">E-mail</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 p-3 bg-black border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  placeholder="Seu e-mail"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label className="text-sm font-medium text-slate-300">Senha</label>
                <button 
                  type="button"
                  onClick={() => setMode('forgot')}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Esqueceu a senha?
                </button>
              </div>
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

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-800"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-slate-950 px-2 text-slate-500">Ou</span>
              </div>
            </div>

            <button 
              type="button"
              onClick={() => setMode('register')}
              className="w-full bg-transparent hover:bg-slate-900 text-slate-300 font-medium py-3 rounded-xl border border-slate-700 flex items-center justify-center transition-all"
            >
              <UserPlus className="w-5 h-5 mr-2" />
              Primeiro Acesso / Cadastro
            </button>
          </form>
        ) : mode === 'register' ? (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400 ml-1">Nome</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-3 bg-black border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Nome"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400 ml-1">Sobrenome</label>
                <input 
                  type="text" 
                  value={surname}
                  onChange={(e) => setSurname(e.target.value)}
                  className="w-full p-3 bg-black border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Sobrenome"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400 ml-1">Usuário</label>
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full p-3 bg-black border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Usuário"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400 ml-1">Telefone</label>
                <input 
                  type="text" 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full p-3 bg-black border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Telefone"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400 ml-1">E-mail</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 bg-black border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="seu@email.com"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400 ml-1">Senha</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 bg-black border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Mínimo 6 caracteres"
                minLength={6}
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400 ml-1">Cargo / Função</label>
              <select 
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full p-3 bg-black border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value={UserRole.PROJETISTA}>Projetista</option>
                <option value={UserRole.COORDENADOR}>Coordenador</option>
                <option value={UserRole.GESTOR}>Gestor</option>
                <option value={UserRole.CEO}>CEO</option>
              </select>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl flex items-center justify-center transition-all shadow-lg hover:shadow-emerald-500/20 disabled:opacity-70"
            >
              {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <UserPlus className="w-5 h-5 mr-2" />}
              {loading ? 'Cadastrando...' : 'Criar minha conta'}
            </button>

            <button 
              type="button"
              onClick={() => setMode('login')}
              className="w-full text-slate-400 hover:text-white text-sm py-2 flex items-center justify-center transition-all"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Voltar para o Login
            </button>
          </form>
        ) : mode === 'update-password' ? (
          <form onSubmit={handleUpdatePassword} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 ml-1">Nova Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
                <input 
                  type="password" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-10 p-3 bg-black border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 ml-1">Confirmar Nova Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
                <input 
                  type="password" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 p-3 bg-black border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Repita a nova senha"
                  minLength={6}
                  required
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl flex items-center justify-center transition-all shadow-lg hover:shadow-blue-500/20 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Lock className="w-5 h-5 mr-2" />}
              {loading ? 'Atualizando...' : 'Atualizar Senha'}
            </button>

            <button 
              type="button"
              onClick={() => setMode('login')}
              className="w-full bg-transparent hover:bg-slate-900 text-slate-300 font-medium py-3 rounded-xl border border-slate-700 flex items-center justify-center transition-all"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Cancelar
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 ml-1">E-mail da Conta</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 p-3 bg-black border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="seu@email.com"
                  required
                />
              </div>
              <p className="text-[10px] text-slate-500 ml-1">
                Enviaremos um link para redefinir sua senha.
              </p>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl flex items-center justify-center transition-all shadow-lg hover:shadow-blue-500/20 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <LogIn className="w-5 h-5 mr-2" />}
              {loading ? 'Enviando...' : 'Enviar Link de Recuperação'}
            </button>

            <button 
              type="button"
              onClick={() => setMode('login')}
              className="w-full bg-transparent hover:bg-slate-900 text-slate-300 font-medium py-3 rounded-xl border border-slate-700 flex items-center justify-center transition-all"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar para Login
            </button>
          </form>
        )}

        <div className="mt-8 text-center text-xs">
          <p className="font-medium text-slate-500">
            Desenvolvido por <span className="font-bold tracking-tight"><span className="text-orange-500">JIMP</span><span className="text-blue-600">NEXUS</span></span>
          </p>
        </div>
      </div>
    </div>
  );
};
