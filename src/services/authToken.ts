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

export const setAuthToken = (token: string | null): void => {
  current = token && token.trim() ? token : null;
  try {
    if (current) sessionStorage.setItem(TOKEN_KEY, current);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* sessionStorage indisponivel — mantemos so em memoria */
  }
};
