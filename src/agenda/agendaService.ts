// Leitura e gravação da AGENDA (tabelas agenda_item / agenda_alerta — migração 012).
// Quem vê o quê é a RLS do banco: cada um SÓ a sua; só o Edson vê a dos outros (a dele,
// ninguém mais) — o admin de OKR NÃO, e o convidado não vê o item (recebe só os e-mails).
// Decisão do Edson, 29/09. Gravar: só o dono.
// Mesmo padrão do cadastro de Executores do OKR: grava só se a linha ainda estiver na
// versão lida (updated_at) e, se não pegou, relê para dizer POR QUÊ.
import { supabase } from '../services/storageService';
import { authHeaders } from '../services/authToken';
import {
  AgendaItem, AgendaItemInput, AgendaAlerta, AgendaOcupado,
  AGENDA_ITEM_COLS, AGENDA_ALERTA_COLS, OCUPADO_LOTE, mapAgendaItem, mapAgendaAlerta, mapAgendaOcupado, toAgendaRow, validarAgenda,
} from './agenda';

// A mudança não se aplica mais (sumiu, mudou por outra pessoa). A mensagem é para a pessoa.
export class AgendaStaleError extends Error {}
// O crachá venceu (a rota /api respondeu 401). A mensagem já é a final — não é o
// "Nada foi salvo." da gravação, e o painel NÃO fecha (diferente do AgendaStaleError).
export class AgendaSessaoError extends Error {}
const SESSAO_VENCEU = 'Sua sessão venceu — saia e entre de novo.';

// A tela recebe o serviço por parâmetro (o padrão é este) — assim dá para abrir a tela
// com dados de ensaio, sem tocar no banco.
export interface AgendaService {
  list(): Promise<AgendaItem[]>;
  listAlertas(): Promise<AgendaAlerta[]>;
  create(input: AgendaItemInput): Promise<AgendaItem>;
  update(id: string, input: AgendaItemInput, version: string): Promise<AgendaItem>;
  patchDates(id: string, dates: Pick<AgendaItemInput, 'inicioDia' | 'fimDia'>, version: string): Promise<AgendaItem>;
  setStatus(id: string, status: AgendaItem['status'], version: string): Promise<AgendaItem>;
  remove(id: string): Promise<void>;
  sendTest(itemId: string): Promise<string>;
  // Livre/ocupado (migração 016): os intervalos em que as pessoas estão ocupadas na janela
  // [de, ate) — só o horário, nunca o conteúdo. `ignorar` = o compromisso que está sendo
  // editado. null = a função ainda não existe no banco (016 não rodada): a tela não mostra nada.
  ocupado(pessoas: string[], de: Date, ate: Date, ignorar?: string): Promise<AgendaOcupado[] | null>;
}

// Lança no erro: "não consegui ler" nunca vira "agenda vazia".
const list = async (): Promise<AgendaItem[]> => {
  const { data, error } = await supabase.from('agenda_item').select(AGENDA_ITEM_COLS)
    .order('inicio_dia', { ascending: true }).order('inicio_hora', { ascending: true, nullsFirst: true });
  if (error) throw new Error(error.message);
  return (data || []).map(mapAgendaItem);
};

// A fila de alertas dos compromissos que a pessoa enxerga (a RLS filtra). Os 2000 MAIS
// NOVOS (com histórico grande, cortar pelos mais velhos deixava de fora os que importam),
// devolvidos em ordem crescente, que é a que a tela usa.
const listAlertas = async (): Promise<AgendaAlerta[]> => {
  const { data, error } = await supabase.from('agenda_alerta').select(AGENDA_ALERTA_COLS)
    .order('dispara_em', { ascending: false }).order('id', { ascending: false }).limit(2000);
  if (error) throw new Error(error.message);
  return (data || []).map(mapAgendaAlerta).reverse();
};

const whyUntouched = async (id: string, version?: string): Promise<Error> => {
  const { data, error } = await supabase.from('agenda_item').select('id, titulo, updated_at').eq('id', id).limit(1);
  if (error) return new Error(error.message);
  if (!data || !data.length) return new AgendaStaleError('Este compromisso foi excluído (ou você não tem mais acesso a ele) — atualizei a agenda.');
  if (version && (data[0] as any).updated_at !== version) {
    return new AgendaStaleError(`"${(data[0] as any).titulo}" foi alterado em outra tela enquanto esta estava aberta — atualizei; confira e faça de novo.`);
  }
  return new Error('Sem permissão para alterar este compromisso (só o dono altera).');
};

const create = async (input: AgendaItemInput): Promise<AgendaItem> => {
  const erro = validarAgenda(input); if (erro) throw new AgendaStaleError(erro);
  const { data, error } = await supabase.from('agenda_item').insert(toAgendaRow(input)).select(AGENDA_ITEM_COLS);
  if (error) throw new Error(error.message);
  if (!data || !data.length) throw new Error('Sem permissão para criar compromisso na agenda.');
  return mapAgendaItem(data[0]);
};

const updateRow = async (id: string, row: Record<string, unknown>, version: string): Promise<AgendaItem> => {
  let q = supabase.from('agenda_item').update(row).eq('id', id);
  if (version) q = q.eq('updated_at', version);
  const { data, error } = await q.select(AGENDA_ITEM_COLS);
  if (error) throw new Error(error.message);
  if (!data || !data.length) throw await whyUntouched(id, version);
  return mapAgendaItem(data[0]);
};

const update = async (id: string, input: AgendaItemInput, version: string): Promise<AgendaItem> => {
  const erro = validarAgenda(input); if (erro) throw new AgendaStaleError(erro);
  return updateRow(id, toAgendaRow(input), version);
};

// Arrastar na linha do tempo muda SÓ as datas (as horas ficam).
const patchDates = (id: string, d: Pick<AgendaItemInput, 'inicioDia' | 'fimDia'>, version: string) =>
  updateRow(id, { inicio_dia: d.inicioDia, fim_dia: d.fimDia }, version);

const setStatus = (id: string, status: AgendaItem['status'], version: string) =>
  updateRow(id, { status }, version);

const remove = async (id: string): Promise<void> => {
  const { data, error } = await supabase.from('agenda_item').delete().eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data || !data.length) {
    const why = await whyUntouched(id);
    if (why instanceof AgendaStaleError) return; // já não existia: o resultado é o mesmo
    throw why;
  }
};

// Manda AGORA um alerta de teste deste compromisso para o e-mail cadastrado de quem pediu
// (só para ele). Devolve o endereço (mascarado) para a tela dizer para onde foi.
const sendTest = async (itemId: string): Promise<string> => {
  const res = await fetch('/api/agenda/testar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ itemId }),
  });
  const out = await res.json().catch(() => ({} as any));
  // 401 = crachá vencido ou ausente (a rota só dá 401 aí). O texto do servidor ("Não
  // autorizado.") não diz o que fazer; a regex de sessão só pega os erros do PostgREST.
  if (res.status === 401) throw new AgendaSessaoError(SESSAO_VENCEU);
  if (!res.ok || !out.success) throw new Error(out.error || out.message || 'Não consegui enviar o teste.');
  return String(out.para || 'o seu e-mail');
};

// A função da 016 ainda não existe: o PostgREST responde PGRST202 ("Could not find the
// function … in the schema cache"); chamada direta ao Postgres dá 42883. Também cai aqui se
// faltar uma função da 012 que ela usa (agenda desinstalada) — nos dois casos, "sem informação".
const funcaoAusente = (e: any): boolean =>
  e?.code === 'PGRST202' || e?.code === '42883'
  || /could not find the function|function .*agenda_\w+.* does not exist/i.test(String(e?.message || ''));

// Livre/ocupado — em lotes de até 60 pessoas (o limite do banco), em paralelo. Pessoa que
// não aparece na resposta está LIVRE na janela. Erro que não seja "função ausente" LANÇA
// (a tela diz "não consegui conferir" — nunca vira "todo mundo livre").
const ocupado = async (pessoas: string[], de: Date, ate: Date, ignorar?: string): Promise<AgendaOcupado[] | null> => {
  const ids = Array.from(new Set((pessoas || []).map(String).filter(Boolean)));
  if (!ids.length) return [];
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += OCUPADO_LOTE) lotes.push(ids.slice(i, i + OCUPADO_LOTE));
  const partes = await Promise.all(lotes.map(async (lote) => {
    const args: Record<string, unknown> = { p_pessoas: lote, p_de: de.toISOString(), p_ate: ate.toISOString() };
    if (ignorar) args.p_ignorar = ignorar;
    const { data, error } = await supabase.rpc('agenda_ocupado', args);
    if (error) {
      if (funcaoAusente(error)) return null;
      throw new Error(error.message || 'Não consegui conferir quem está livre.');
    }
    return (Array.isArray(data) ? data : []).map(mapAgendaOcupado).filter((o): o is AgendaOcupado => !!o);
  }));
  if (partes.some(p => p === null)) return null;
  return (partes as AgendaOcupado[][]).flat();
};

export const agendaService: AgendaService = { list, listAlertas, create, update, patchDates, setStatus, remove, sendTest, ocupado };

const NET_RE = /failed to fetch|fetch failed|networkerror|load failed|network request failed|timed? ?out|aborted/i;

// Mensagem que diz O QUE aconteceu (rede, sessão, permissão, banco sem a agenda).
export const agendaErrorMessage = (e: any, fallback: string): string => {
  const m = String(e?.message || '');
  if (e instanceof AgendaStaleError || e instanceof AgendaSessaoError) return m;
  if (NET_RE.test(m)) return 'Sem conexão com o servidor — nada foi salvo. Confira a rede e tente de novo.';
  if (/jwt expired|invalid jwt|jwserror|pgrst30[0-3]/i.test(m)) return 'Sua sessão venceu — saia e entre de novo. Nada foi salvo.';
  if (/agenda_item|agenda_alerta/i.test(m) && /does not exist|not find|schema cache|PGRST20[05]/i.test(m))
    return 'A agenda ainda não foi instalada no banco (migração 012). Avise o Edson.';
  if (/^sem permiss/i.test(m) || /row-level security|permission denied|42501/i.test(m))
    return 'Sem permissão para esta alteração. Se a permissão foi dada agora, saia e entre de novo.';
  if (/check constraint|23514/i.test(m)) return 'O banco recusou os dados (data, hora ou tamanho do texto fora do permitido). Nada foi salvo.';
  return m ? `${fallback} (${m})` : fallback;
};
