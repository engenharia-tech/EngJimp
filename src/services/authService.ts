import { User } from '../types';

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
