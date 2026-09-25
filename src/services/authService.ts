import { User } from '../types';
import { setAuthToken, authHeaders } from './authToken';

/**
 * Autenticacao pelo SERVIDOR (Etapa 3). O navegador nunca mais le a tabela
 * users nem compara senha: fala apenas com /api/auth/*, que valida com a
 * chave de servico. A senha do usuario nunca trafega para o Supabase pelo
 * cliente, e o texto puro deixa de existir conforme cada um cria a senha.
 */

interface LoginResult {
  user?: User;
  mustSetPassword?: boolean;
  error?: string;
}

// O servidor devolve o usuario SEM senha/hash. Preenchemos password:'' so
// para satisfazer o tipo — o cliente nao usa mais esse campo.
const mapUser = (u: any): User => ({
  id: u.id,
  username: u.username,
  password: '',
  name: u.name,
  surname: u.surname || undefined,
  email: u.email || undefined,
  phone: u.phone || undefined,
  role: u.role,
  salary: Number(u.salary) || 0,
  okrEnabled: !!u.okr_enabled,
  okrOnly: !!u.okr_only,
  okrAdmin: !!u.okr_admin,
  sector: u.sector || '',
});

export const loginViaServer = async (username: string, password: string): Promise<LoginResult> => {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success && data.user) {
      // Guarda o cracha de sessao (JWT) para o cliente Supabase usar na RLS.
      setAuthToken(data.token || null);
      return { user: mapUser(data.user), mustSetPassword: !!data.user.must_set_password };
    }
    if (res.status === 401) return { error: 'Usuário ou senha inválidos' };
    return { error: data.error || 'Erro ao autenticar' };
  } catch {
    return { error: 'Erro ao conectar ao servidor' };
  }
};

export const requestResetCode = async (
  username: string
): Promise<{ delivered?: 'email' | 'no_email'; error?: string }> => {
  try {
    const res = await fetch('/api/auth/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) return { delivered: data.delivered };
    return { error: data.error || 'Erro ao solicitar o código' };
  } catch {
    return { error: 'Erro ao conectar ao servidor' };
  }
};

// A senha de quem JÁ está logado: conferida pelo servidor com o crachá. O cliente
// não tem (e não deve ter) a senha para comparar — `user.password` é sempre ''.
// `expired` = o crachá venceu (401): quem chama deve encerrar a sessão.
type SessionPwResult = { ok: boolean; error?: string; expired?: boolean };

const postWithSession = async (url: string, body: unknown, fallback: string): Promise<SessionPwResult> => {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) return { ok: true };
    if (res.status === 401) return { ok: false, expired: true, error: 'Sua sessão expirou. Entre de novo.' };
    return { ok: false, error: data.error || fallback };
  } catch {
    return { ok: false, error: 'Erro ao conectar ao servidor' };
  }
};

// Perfil: troca a PRÓPRIA senha (a atual é conferida no servidor; a nova vai com hash).
export const changeOwnPassword = (currentPassword: string, newPassword: string) =>
  postWithSession('/api/auth/change-password', { currentPassword, newPassword }, 'Erro ao trocar a senha.');

// Tela de bloqueio por inatividade: confere a senha de quem está logado.
export const confirmOwnPassword = (password: string) =>
  postWithSession('/api/auth/confirm-password', { password }, 'Erro ao conferir a senha.');

export const setPasswordWithCode = async (
  username: string,
  code: string,
  newPassword: string
): Promise<{ ok: boolean; error?: string }> => {
  try {
    const res = await fetch('/api/auth/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, code, newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) return { ok: true };
    return { ok: false, error: data.error || 'Erro ao salvar a senha' };
  } catch {
    return { ok: false, error: 'Erro ao conectar ao servidor' };
  }
};
