// Guarda o token de sessao (JWT assinado pelo servidor no login). O cliente
// Supabase usa este token em TODA requisicao, via a opcao `accessToken`, para
// que a RLS reconheca o usuario autenticado. Sem token (deslogado), as
// requisicoes vao como anonimas (so a chave publicavel).
const TOKEN_KEY = 'nexus_token';

let current: string | null = (() => {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
})();

export const getAuthToken = (): string | null => current;

// Cabecalho de autorizacao para chamadas aos endpoints /api protegidos
// (send-email, gemini). Vazio se deslogado.
export const authHeaders = (): Record<string, string> => {
  const t = current;
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// Le o `exp` (epoch em segundos) do JWT guardado, SEM validar assinatura (a
// validacao real e do servidor/RLS). Serve so para o cliente saber quando a
// sessao expira e evitar a gravacao que falha em SILENCIO (JWT vencido -> RLS
// nega -> updateXxx engole o erro -> usuario acha que salvou).
export const getTokenExp = (): number | null => {
  const t = current;
  if (!t) return null;
  try {
    const payload = t.split('.')[1];
    if (!payload) return null;
    // base64url -> base64 COM padding (sem o padding, atob falha em alguns
    // comprimentos e faria o token parecer 'sem exp' -> nunca expirado).
    let b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    b64 += '='.repeat((4 - (b64.length % 4)) % 4);
    const json = JSON.parse(atob(b64));
    return typeof json.exp === 'number' ? json.exp : null;
  } catch { return null; }
};

// true se HA token e ele ja expirou (com folga de `skewSeconds`). Retorna false
// se nao ha token (esse caso e tratado a parte, no gate de sessao).
export const isTokenExpired = (skewSeconds = 30): boolean => {
  const exp = getTokenExp();
  if (exp == null) return false;
  return Math.floor(Date.now() / 1000) >= (exp - skewSeconds);
};

export const setAuthToken = (token: string | null): void => {
  current = token && token.trim() ? token : null;
  try {
    if (current) sessionStorage.setItem(TOKEN_KEY, current);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* sessionStorage indisponivel — mantemos so em memoria */
  }
};
