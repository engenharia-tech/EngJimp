// O TIPO manda; o NOME é só descrição (pedido do Edson, 29/10/2026: "eu preciso que você olhe todas as atividades
// que os bonecos estão preenchendo errado"). Quem preenche uma lacuna escolhe só o TIPO e o nome ficava
// "LACUNA EM BRANCO": toda conta que classificava pelo nome escondia a hora (o Matheus fez 28 h de OFICINA em
// setembro/2026; pelo nome, 2 h). Aqui mora a regra única: somar pelo tipo, filtrar por tipo + nome.
import type { ActivityType, OperationalActivity } from '../types';

// Rótulo que a própria tela põe na LACUNA — não é descrição de nada. O do fim de semana ("FOLGA / FIM DE SEMANA") NÃO
// entra: no nome, ele continua tirando o registro da conta como antes (igual ao SQL de dados e ao gatilho 036).
const MARCADOR = /^\s*(lacuna em branco|blank gap|espacio en blanco)/i;

/** O que sobra de descrição depois do rótulo da tela ('' = nada: "LACUNA EM BRANCO", "LACUNA EM BRANCOf", vazio). */
export const semMarcador = (nome?: string | null): string => {
  const s = String(nome ?? '').trim();
  const m = s.match(MARCADOR);
  if (!m) return s;
  const resto = s.slice(m[0].length).replace(/^[\s\-–:;,.]+/, '').trim();
  return resto.length >= 3 ? resto : '';
};

type TipoLite = Pick<ActivityType, 'id' | 'name'>;
type AtvLite = Pick<OperationalActivity, 'activityTypeId' | 'activityName'> & { notes?: string | null };

const achaTipo = (a: AtvLite | null | undefined, tipos?: TipoLite[] | null): TipoLite | undefined =>
  a && a.activityTypeId ? (tipos || []).find(t => !!t && t.id === a.activityTypeId) : undefined;

/** Categoria para SOMAR horas: o TIPO, na grafia do cadastro. Sem tipo (registro antigo), o nome sem rótulo. */
export const categoriaDaAtividade = (a: AtvLite, tipos?: TipoLite[] | null, semNada = 'OUTROS'): string =>
  String(achaTipo(a, tipos)?.name || semMarcador(a?.activityName) || semNada).trim();

/** Rótulo de tela: o tipo e, havendo, a descrição ("OFICINA · furação lonado"); só o tipo quando o nome é rótulo. */
export const rotuloDaAtividade = (a: AtvLite, tipos?: TipoLite[] | null): string => {
  const tipo = String(achaTipo(a, tipos)?.name || '').trim();
  const desc = semMarcador(a?.activityName);
  if (!tipo) return desc || String(a?.activityName || '').trim() || 'ATIVIDADE';
  return desc && desc.toUpperCase() !== tipo.toUpperCase() ? `${tipo} · ${desc}` : tipo;
};

/** Texto para os filtros por palavra que já existem (FOLGA, AULA, FÁBRICA, DESENVOLVIMENTO…): "TIPO | nome", em
 *  maiúsculas. Acrescenta o tipo sem tirar o que o nome já dizia ("feriado" lançado como OUTROS continua folga). */
export const textoParaFiltro = (a: AtvLite, tipos?: TipoLite[] | null): string =>
  `${String(achaTipo(a, tipos)?.name || '')} | ${semMarcador(a?.activityName)}`.toUpperCase();

const AUSENCIA = /folga|falta|atestado|f[ée]rias|feriado/i;

/** Ausência (folga, férias, atestado, feriado, falta): pelo TIPO e, como sempre, pelo nome — menos o motivo de
 *  pausa herdado ("PAUSAR: Falta de Informações" é trabalho, com tipo, e não falta ao serviço). */
export const ehAusencia = (a: AtvLite, tipos?: TipoLite[] | null): boolean => {
  if (AUSENCIA.test(String(achaTipo(a, tipos)?.name || ''))) return true;
  const nome = semMarcador(a?.activityName);
  if (/^\s*(pausar|pause)\s*:/i.test(nome)) return false;
  return AUSENCIA.test(nome);
};

const HORA_DE_PROJETO = /DESENVOLVIMENTO|VARIA[ÇC][ÃA]O|LIBERA[ÇC][ÃA]O/;

/** Hora de projeto (desenvolvimento, variação, liberação) pelo tipo, pelo nome ou pela nota — a regra do Painel. */
export const ehDevOuProjeto = (a: AtvLite, tipos?: TipoLite[] | null): boolean =>
  HORA_DE_PROJETO.test(`${textoParaFiltro(a, tipos)} | ${String(a?.notes || '').toUpperCase()}`);
