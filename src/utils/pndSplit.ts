// ─────────────────────────────────────────────────────────────────────────────
// CORTE GERENCIAL DE P&D (Edson) — 01/09/2026
//
// Decisão do Edson (23/09/2026): a partir de 01/09/2026 a participação dele
// (setor P&D) SAI das "horas gerais da engenharia" e passa a viver só no painel
// "P&D (Gerencial)". O que é ANTES de 01/09 continua registrado no agregado
// geral — nada é apagado, só deixa de ser somado no time a partir do corte.
//
// A detecção do Edson e a soma de horas estavam duplicadas em ~6 arquivos; este
// helper centraliza a regra para não divergirem.
// ─────────────────────────────────────────────────────────────────────────────
import { isEdsonUser } from './identity';

export const PND_CUTOFF_ISO = '2026-09-01T00:00:00';
const PND_CUTOFF_MS = new Date(PND_CUTOFF_ISO).getTime();

type MiniUser =
  | { id?: string; sector?: string | null; email?: string | null; username?: string | null }
  | undefined
  | null;

/** Usuário "de P&D" que sai do agregado geral: setor P&D, ou o próprio Edson. */
export function isPndCarveoutUser(user: MiniUser): boolean {
  if (!user) return false;
  const sector = (user.sector || '').trim().toUpperCase();
  if (sector === 'P&D') return true;
  return isEdsonUser(user);
}

type UserLookup = Map<string, MiniUser> | Record<string, MiniUser>;

function lookup(users: UserLookup, id: string): MiniUser {
  return users instanceof Map ? users.get(id) : users[id];
}

/**
 * Um registro (projeto/atividade/interrupção) deve SAIR do agregado geral da
 * engenharia? Sai quando o dono é P&D (carve-out) E a data é >= 01/09/2026.
 */
export function isExcludedFromEngineering(
  userId: string | undefined | null,
  startTime: string | Date | undefined | null,
  usersById: UserLookup
): boolean {
  if (!userId || !startTime) return false;
  const user = lookup(usersById, userId);
  if (!isPndCarveoutUser(user)) return false;
  const t = (typeof startTime === 'string' ? new Date(startTime) : startTime).getTime();
  if (isNaN(t)) return false;
  return t >= PND_CUTOFF_MS;
}

/** Constrói um índice id→usuário a partir de uma lista de usuários. */
export function usersIndex(users: MiniUser[] | undefined | null): Map<string, MiniUser> {
  const m = new Map<string, MiniUser>();
  (users || []).forEach(u => {
    if (u && u.id) m.set(u.id, u);
  });
  return m;
}
