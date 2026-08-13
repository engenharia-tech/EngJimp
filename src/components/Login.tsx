import React, { useState, useEffect } from 'react';
import { Lock, User as UserIcon, LogIn, Loader2, KeyRound, ArrowLeft, MailCheck } from 'lucide-react';
import { fetchSettings } from '../services/storageService';
import { loginViaServer, requestResetCode, setPasswordWithCode } from '../services/authService';
import { User, AppSettings } from '../types';
import { Logo } from './Logo';
// Logo em public/logo.svg — sem import de módulo
const logoImg = '/logo.svg';

interface LoginProps {
  onLogin: (user: User) => void;
}

type Mode = 'login' | 'setPassword';

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  // Estado da tela "criar senha"
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sendingCode, setSendingCode] = useState(false);

  useEffect(() => {
    fetchSettings().then(setSettings).catch(() => {});
  }, []);

  const goToSetPassword = () => {
    setMode('setPassword');
    setError('');
    setInfo('');
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const backToLogin = () => {
    setMode('login');
    setError('');
    setInfo('');
    setPassword('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await loginViaServer(username, password);
      if (result.user && result.mustSetPassword) {
        // O usuario precisa criar uma senha antes de entrar.
        goToSetPassword();
      } else if (result.user) {
        onLogin(result.user);
      } else {
        setError(result.error || 'Usuário ou senha inválidos');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = async () => {
    if (!username.trim()) {
      setError('Informe o usuário primeiro.');
      return;
    }
    setSendingCode(true);
    setError('');
    setInfo('');
    try {
      const r = await requestResetCode(username);
      if (r.error) {
        setError(r.error);
      } else if (r.delivered === 'email') {
        setInfo('Enviamos um código para o seu e-mail. Ele vale 24 horas.');
      } else {
        // Sem e-mail cadastrado: o administrador gera o código.
        setInfo('Você não tem e-mail cadastrado. Peça o código de ativação ao administrador (Edson).');
      }
    } finally {
      setSendingCode(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError('A senha deve ter ao menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não conferem.');
      return;
    }
    setLoading(true);
    try {
      const r = await setPasswordWithCode(username, code.trim(), newPassword);
      if (!r.ok) {
        setError(r.error || 'Código inválido ou expirado.');
        return;
      }
      // Senha criada — entra automaticamente com ela.
      const result = await loginViaServer(username, newPassword);
      if (result.user) {
        onLogin(result.user);
      } else {
        setInfo('Senha criada com sucesso! Faça login com a sua nova senha.');
        backToLogin();
      }
    } finally {
      setLoading(false);
    }
  };

  const COMPANY_LOGO = settings?.logoUrl || logoImg;
  const COMPANY_NAME = settings?.companyName || 'JIMP NEXUS';

  const inputClass =
    'w-full pl-10 p-3 bg-black border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all';

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
          <p className="text-slate-400 text-sm">
            {mode === 'login'
              ? 'Entre com suas credenciais para continuar'
              : 'Crie a sua senha para acessar o sistema'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-800 text-red-200 text-sm rounded-lg flex items-center justify-center text-center">
            {error}
          </div>
        )}
        {info && (
          <div className="mb-4 p-3 bg-blue-900/30 border border-blue-800 text-blue-200 text-sm rounded-lg flex items-center justify-center text-center gap-2">
            <MailCheck className="w-4 h-4 shrink-0" /> {info}
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="login-username" className="text-sm font-medium text-slate-300 ml-1">Usuário</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={inputClass}
                  placeholder="Seu nome de usuário"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="login-password" className="text-sm font-medium text-slate-300 ml-1">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  placeholder="Sua senha"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl flex items-center justify-center transition-all shadow-lg hover:shadow-blue-500/20 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <LogIn className="w-5 h-5 mr-2" />}
              {loading ? 'Entrando...' : 'Acessar Sistema'}
            </button>

            <button
              type="button"
              onClick={goToSetPassword}
              className="w-full text-slate-400 hover:text-blue-400 text-sm transition-colors flex items-center justify-center gap-1.5"
            >
              <KeyRound className="w-4 h-4" /> Criar / redefinir senha
            </button>
          </form>
        )}

        {mode === 'setPassword' && (
          <form onSubmit={handleSetPassword} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 ml-1">Usuário</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={inputClass}
                  placeholder="Seu nome de usuário"
                  required
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleSendCode}
              disabled={sendingCode}
              className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-70"
            >
              {sendingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <MailCheck className="w-4 h-4" />}
              {sendingCode ? 'Enviando...' : 'Enviar código de ativação'}
            </button>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 ml-1">Código de ativação</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={inputClass}
                  placeholder="6 dígitos"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 ml-1">Nova senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputClass}
                  placeholder="Ao menos 6 caracteres"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 ml-1">Confirmar senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass}
                  placeholder="Repita a nova senha"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl flex items-center justify-center transition-all shadow-lg hover:shadow-blue-500/20 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <KeyRound className="w-5 h-5 mr-2" />}
              {loading ? 'Salvando...' : 'Criar senha e entrar'}
            </button>

            <button
              type="button"
              onClick={backToLogin}
              className="w-full text-slate-400 hover:text-blue-400 text-sm transition-colors flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar ao login
            </button>
          </form>
        )}

        <div className="mt-8 text-center text-xs">
          <p className="font-medium text-slate-500">
            Desenvolvido por{' '}
            <span className="font-bold tracking-tight">
              <span className="text-orange-500">JIMP</span>
              <span className="text-blue-600">NEXUS</span>
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};
