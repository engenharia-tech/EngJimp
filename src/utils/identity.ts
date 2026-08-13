// Fonte UNICA da identidade do dono (Edson) no cliente. O salario só é visível
// para ele; os gates de salário usam SÓ esta função para nunca divergirem.
//
// A barreira REAL de segurança é o servidor (claimsAreEdson em api/index.ts,
// que guarda /api/users/salaries, /api/settings/save e /api/users/save). No
// cliente de quem não é Edson o salário nem chega (vem 0). Este helper é para
// consistência da UI, não para segurança por si só.
//
// NÃO casa por nome: alguém chamado "Edson" NÃO é o dono. Só e-mail/usuário.
export const isEdsonUser = (
  user?: { email?: string | null; username?: string | null } | null
): boolean => {
  if (!user) return false;
  const email = (user.email || '').trim().toLowerCase();
  const username = (user.username || '').trim().toLowerCase();
  return email === 'efariaseng0@gmail.com' || username === 'edson';
};
