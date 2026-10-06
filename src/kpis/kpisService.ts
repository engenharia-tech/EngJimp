// Leitura e gravação do KPI DOS SETORES (tabelas kpis_* — migração 023).
// Quem vê, lança e cadastra é a RLS do banco: a pessoa do setor vê e lança o do setor
// dela; o Edson, o CEO e o admin de OKR veem todos; só o Edson e o admin de OKR
// cadastram, põem meta e lançam/corrigem em qualquer setor (decisão do Edson, 30/09).
// Mesmo padrão da Agenda: grava só se a linha ainda estiver na versão lida
// (atualizado_em) e, se não pegou, relê para dizer POR QUÊ.
import { supabase, fetchAllOkr } from '../services/storageService';
import { authHeaders } from '../services/authToken';
import {
  KpisAcesso, KpisFrequencia, KpisHist, KpisIndicador, KpisIndicadorInput, KpisLancamento, KpisMeta, KpisPontoCalculado, KpisSetor, KpisTipoAtividade,
  KPIS_HIST_COLS, KPIS_IND_COLS, KPIS_IND_COLS_023, KPIS_IND_COLS_025, KPIS_LANC_COLS, KPIS_META_COLS,
  mapAcesso, mapHist, mapIndicador, mapLancamento, mapMeta, precisa026, precisa027, toIndicadorRow, validarIndicador,
} from './kpis';

// A mudança não se aplica mais (sumiu, mudou por outra pessoa). A mensagem é para a pessoa.
export class KpisStaleError extends Error {}
// O período já tem valor (outra pessoa lançou no meio): a tela relê e oferece Corrigir.
export class KpisJaLancadoError extends Error { constructor(msg: string, public existente: KpisLancamento | null) { super(msg); } }

// Um KR ligado, como o OKR pede: o dono (owner_key), o indicador e o início/prazo CRUS do KR.
export interface KpisPedido { dono: string; id: string; de: string; ate: string; }
export interface KpisValorLigado {
  dono: string; id: string; de: string; ate: string;
  valor: number | null; periodo: string | null; periodos: number;
  nome: string; unidade: string; casas: number; consolidacao: 'ultimo' | 'soma'; arquivado: boolean; tipo: 'manual' | 'calculado';
  frequencia: KpisFrequencia;
}

export interface KpisService {
  acesso(): Promise<KpisAcesso | null>;                  // null = a 023 não está no banco
  setores(): Promise<KpisSetor[]>;
  tiposAtividade(): Promise<KpisTipoAtividade[]>;
  listIndicadores(): Promise<KpisIndicador[]>;
  listMetas(): Promise<KpisMeta[]>;
  listLancamentos(desde: string): Promise<KpisLancamento[]>;
  listHist(indicadorId: string): Promise<KpisHist[]>;
  serieCalculada(indicadorId: string, de: string | null, ate: string | null): Promise<KpisPontoCalculado[]>;
  fontesNovas(): Promise<boolean | null>;                 // 026 no banco (projetos, paradas, inovações, engenharia); null = não deu para saber
  cronograma(): Promise<boolean | null>;                  // 027 no banco (o cronograma do Nexus Flow); null = não deu para saber
  criarIndicador(input: KpisIndicadorInput): Promise<KpisIndicador>;
  editarIndicador(id: string, input: KpisIndicadorInput, version: string): Promise<KpisIndicador>;
  arquivarIndicador(id: string, ativo: boolean, version: string): Promise<KpisIndicador>;
  apagarIndicador(id: string): Promise<void>;
  excluirIndicador(id: string, lancamentos: number): Promise<void>;   // 028: com os lançamentos (o número confirmado na tela)
  apagarLancamentosDoIndicador(id: string, esperado: number): Promise<number>;   // 028: libera a mudança de frequência/tipo
  contarLancamentos(id: string): Promise<number>;                    // 028: no banco (a tela só lê 36 meses)
  salvarMeta(indicadorId: string, valeDesde: string, meta: number, limite: number | null): Promise<KpisMeta>;
  apagarMeta(indicadorId: string, valeDesde: string): Promise<void>;
  lancar(indicadorId: string, periodo: string, valor: number, comentario: string): Promise<KpisLancamento>;
  corrigir(id: string, valor: number, comentario: string, motivo: string, version: string): Promise<KpisLancamento>;
  apagarLancamento(id: string): Promise<void>;
  valoresLigados(pedidos: KpisPedido[]): Promise<KpisValorLigado[] | null>; // null = 023 ausente
  ultimoAntes(indicadorId: string, antesDe: string): Promise<KpisLancamento | null>; // sugestão da partida do KR
  contarLigados(): Promise<Map<string, number> | null>;  // quantos KRs apontam para cada indicador (quem vê todos)
  mudarSetor(userId: string, setor: string, setorAntes?: string): Promise<{ gravou: boolean }>; // só o Edson e os admins de OKR (o servidor confere); setorAntes = o que a tela via (409 se outro mudou no meio)
}

// A 023 não está no banco (ou faltou o reload do PostgREST): PGRST202 (função) /
// PGRST205 (tabela) / 42883 / 42P01.
// Coluna que ainda não aparece (42703 / PGRST204: a 025/026 acabou de rodar, ou o esquema do PostgREST não
// recarregou) NÃO é "023 ausente" — a frase certa é "recarregue".
export const kpisAusente = (e: any): boolean =>
  !['42703', 'PGRST204'].includes(String(e?.code || '')) && (
    ['PGRST202', 'PGRST205', '42883', '42P01'].includes(String(e?.code || ''))
    || (/kpis_/i.test(String(e?.message || '')) && /could not find|does not exist|schema cache/i.test(String(e?.message || ''))));

// Erro do PostgREST vira Error com o código junto (a mensagem de tela é do kpisErrorMessage).
const erro = (e: any): Error => Object.assign(new Error(String(e?.message || 'erro')), { code: e?.code, details: e?.details });

const acesso = async (): Promise<KpisAcesso | null> => {
  const { data, error } = await supabase.rpc('kpis_meu_acesso');
  if (error) { if (kpisAusente(error)) return null; throw erro(error); }
  const r = Array.isArray(data) ? data[0] : data;
  return r ? mapAcesso(r) : null;
};

const setores = async (): Promise<KpisSetor[]> => {
  const { data, error } = await supabase.rpc('kpis_setores');
  if (error) throw erro(error);
  return (Array.isArray(data) ? data : []).map((r: any) => ({
    chave: String(r.chave || ''), nome: String(r.nome || ''), pessoas: Number(r.pessoas) || 0,
    grafias: Array.isArray(r.grafias) ? r.grafias.map(String) : [],
  }));
};

const tiposAtividade = async (): Promise<KpisTipoAtividade[]> => {
  const { data, error } = await supabase.rpc('kpis_tipos_atividade');
  if (error) throw erro(error);
  return (Array.isArray(data) ? data : []).map((r: any) => ({ id: String(r.id), nome: String(r.nome || ''), ativo: r.ativo !== false }));
};

// O PostgREST devolve no máximo 1000 linhas por pedido: lê em páginas até acabar.
// "Não consegui ler" LANÇA — nunca vira "não tem nada".
const PAGINA = 1000;
const todas = async (monta: (de: number, ate: number) => PromiseLike<{ data: any[] | null; error: any }>, max = 100000): Promise<any[]> => {
  const out: any[] = [];
  for (let de = 0; ; de += PAGINA) {
    // Nunca corta calado: passar do teto é um erro dito (a tela mostraria períodos "sem valor").
    if (de >= max) throw new Error(`Há mais de ${max.toLocaleString('pt-BR')} linhas para ler de uma vez — avise o Edson.`);
    const { data, error } = await monta(de, de + PAGINA - 1);
    if (error) throw erro(error);
    const d = data || [];
    out.push(...d);
    if (d.length < PAGINA) break;
  }
  return out;
};

// O banco já tem a 025 (do_setor, kpis_pode_gerir) e a 026 (calc_fonte, calc_filtro)? Pergunta uma vez; só
// conclui "não" quando o banco diz que a coluna não existe — erro de rede não vira "banco antigo" para o resto
// da sessão (fica null e pergunta de novo na próxima).
let tem025: boolean | null = null;
let tem026: boolean | null = null;
let tem027: boolean | null = null;
// a tela se identifica em toda alteração de indicador (026: o banco recusa a tela antiga; 027: a que não conhece o
// cronograma; 028: a que forçava "do setor" para quem não administra, num indicador que o Edson / admin criou)
const KPIS_VERSAO_TELA = 28;
const sonda = async (col: string): Promise<boolean | null> => {
  const { error } = await supabase.from('kpis_indicador').select(col).limit(1);
  if (!error) return true;
  if ((error as any).code === '42703' || new RegExp(col).test(String((error as any).message || ''))) return false;
  return null;
};
// reprobe: o "não tem" de antes é perguntado de novo (a migração pode ter rodado com a aba aberta) — no Atualizar.
const colsIndicador = async (reprobe = false): Promise<string> => {
  if (reprobe) { if (tem025 === false) tem025 = null; if (tem026 === false) tem026 = null; if (tem027 === false) tem027 = null; }
  if (tem025 === null) tem025 = await sonda('do_setor');
  if (tem025 === false) return KPIS_IND_COLS_023;
  if (tem026 === null) tem026 = await sonda('calc_fonte');
  return tem026 === false ? KPIS_IND_COLS_025 : KPIS_IND_COLS;
};
const fontesNovas = async (): Promise<boolean | null> => {
  await colsIndicador();
  if (tem025 === false || tem026 === false) return false;
  return tem026 === true ? true : null;   // null = a sonda não respondeu (rede): a tela não força nada
};
// 027: o banco diz quais fontes de cálculo conhece (kpis_fontes_calculo); função que não existe = banco sem a 027.
const cronograma = async (): Promise<boolean | null> => {
  if (tem027 !== null) return tem027;
  if ((await fontesNovas()) === false) return (tem027 = false);
  const { data, error } = await supabase.rpc('kpis_fontes_calculo');
  if (!error) return (tem027 = Array.isArray(data) && data.includes('cronograma'));
  // só "a função não existe" quer dizer banco sem a 027; sessão vencida, permissão e rede = não deu para saber
  const code = String((error as any).code || '');
  if (code === 'PGRST202' || code === '42883' || /could not find the function/i.test(String((error as any).message || ''))) return (tem027 = false);
  return null;
};
// O que vai ao banco: sem a 026, as colunas novas não vão — e um cálculo que precisa dela é recusado aqui.
const linhaIndicador = async (input: KpisIndicadorInput): Promise<Record<string, unknown>> => {
  await colsIndicador();
  const com026 = tem026 !== false && tem025 !== false;
  if (!com026 && precisa026(input)) throw new KpisStaleError('Este cálculo (projetos, paradas, inovações, a engenharia, média ou %) precisa da migração 026 no banco — avise o Edson. Nada foi salvo.');
  if (precisa027(input) && (await cronograma()) === false) throw new KpisStaleError('O cálculo pelo cronograma (Nexus Flow) precisa da migração 027 no banco — avise o Edson. Nada foi salvo.');
  return toIndicadorRow(input, com026);
};

const listIndicadores = async (): Promise<KpisIndicador[]> => {
  const cols = await colsIndicador(true);
  return (await todas((a, b) => supabase.from('kpis_indicador').select(cols).order('setor').order('nome').order('id').range(a, b))).map(mapIndicador);
};

const listMetas = async (): Promise<KpisMeta[]> =>
  (await todas((a, b) => supabase.from('kpis_meta').select(KPIS_META_COLS).order('indicador_id').order('vale_desde').range(a, b))).map(mapMeta);

const listLancamentos = async (desde: string): Promise<KpisLancamento[]> =>
  (await todas((a, b) => supabase.from('kpis_lancamento').select(KPIS_LANC_COLS).gte('periodo', desde).order('periodo').order('id').range(a, b))).map(mapLancamento);

const listHist = async (indicadorId: string): Promise<KpisHist[]> => {
  const { data, error } = await supabase.from('kpis_lancamento_hist').select(KPIS_HIST_COLS)
    .eq('indicador_id', indicadorId).order('em', { ascending: false }).order('id', { ascending: false }).limit(300);
  if (error) throw erro(error);
  return (data || []).map(mapHist);
};

const serieCalculada = async (indicadorId: string, de: string | null, ate: string | null): Promise<KpisPontoCalculado[]> => {
  const { data, error } = await supabase.rpc('kpis_serie_calculada', { p_indicador: indicadorId, p_de: de, p_ate: ate });
  if (error) throw erro(error);
  // valor nulo = sem base (média/% num período sem projeto concluído): continua nulo, nunca vira 0.
  return (Array.isArray(data) ? data : []).map((r: any) => ({
    periodo: String(r.periodo || '').slice(0, 10),
    valor: r.valor === null || r.valor === undefined || !Number.isFinite(Number(r.valor)) ? null : Number(r.valor),
    atividades: Number(r.atividades) || 0,
  }));
};

// Por que a gravação não pegou (0 linhas): sumiu, mudou por outra pessoa, ou sem permissão.
const porQueIndicador = async (id: string, version?: string): Promise<Error> => {
  const { data, error } = await supabase.from('kpis_indicador').select('id, nome, atualizado_em').eq('id', id).limit(1);
  if (error) return erro(error);
  if (!data || !data.length) return new KpisStaleError('Este indicador foi excluído (ou você não tem mais acesso a ele) — atualizei a tela.');
  if (version && (data[0] as any).atualizado_em !== version) return new KpisStaleError(`"${(data[0] as any).nome}" foi alterado em outra tela enquanto esta estava aberta — atualizei; confira e faça de novo.`);
  return new Error('Sem permissão: o cadastro deste indicador é das pessoas do setor dele, do Edson e dos admins de OKR — o seu acesso mudou?');
};
const porQueLancamento = async (id: string, version?: string): Promise<Error> => {
  const { data, error } = await supabase.from('kpis_lancamento').select('id, atualizado_em').eq('id', id).limit(1);
  if (error) return erro(error);
  if (!data || !data.length) return new KpisStaleError('Este lançamento foi apagado (ou você não tem mais acesso a este setor) — atualizei a tela.');
  if (version && (data[0] as any).atualizado_em !== version) return new KpisStaleError('Este valor foi corrigido por outra pessoa enquanto a tela estava aberta — atualizei; confira e corrija de novo se precisar.');
  return new Error('Sem permissão para alterar este lançamento (você não é mais deste setor?).');
};

const criarIndicador = async (input: KpisIndicadorInput): Promise<KpisIndicador> => {
  const e = validarIndicador(input); if (e) throw new KpisStaleError(e);
  const row = await linhaIndicador(input);
  const { data, error } = await supabase.from('kpis_indicador').insert(row).select(await colsIndicador());
  if (error) throw erro(error);
  if (!data || !data.length) throw new Error('Sem permissão para criar indicador neste setor (cada um cria só no próprio setor).');
  return mapIndicador(data[0]);
};

const atualizaIndicador = async (id: string, row: Record<string, unknown>, version: string): Promise<KpisIndicador> => {
  await colsIndicador();
  const linha = tem026 === true ? { ...row, versao_tela: KPIS_VERSAO_TELA } : row;
  let q = supabase.from('kpis_indicador').update(linha).eq('id', id);
  if (version) q = q.eq('atualizado_em', version);
  const { data, error } = await q.select(await colsIndicador());
  if (error) throw erro(error);
  if (!data || !data.length) throw await porQueIndicador(id, version);
  return mapIndicador(data[0]);
};

const editarIndicador = async (id: string, input: KpisIndicadorInput, version: string): Promise<KpisIndicador> => {
  const e = validarIndicador(input); if (e) throw new KpisStaleError(e);
  return atualizaIndicador(id, await linhaIndicador(input), version);
};

const arquivarIndicador = (id: string, ativo: boolean, version: string) => atualizaIndicador(id, { ativo }, version);

const apagarIndicador = async (id: string): Promise<void> => {
  const { data, error } = await supabase.from('kpis_indicador').delete().eq('id', id).select('id');
  if (error) throw erro(error);
  if (!data || !data.length) {
    const why = await porQueIndicador(id);
    if (why instanceof KpisStaleError) return; // já não existia: o resultado é o mesmo
    throw why;
  }
};

// 028: excluir de vez, COM os lançamentos — o banco confere que o número confirmado na tela é o de agora, apaga
// junto o histórico e deixa um registro na auditoria. Banco sem a 028: o excluir de antes (só sem lançamento).
const excluirIndicador = async (id: string, lancamentos: number): Promise<void> => {
  const { error } = await supabase.rpc('kpis_excluir_indicador', { p_indicador: id, p_lancamentos: lancamentos });
  if (!error) return;
  if (/KPIS_JA_EXCLUIDO/.test(String((error as any).message || ''))) return;   // outra tela excluiu antes: o resultado é o mesmo
  const code = String((error as any).code || '');
  if (code === 'PGRST202' || code === '42883' || /could not find the function/i.test(String((error as any).message || ''))) return apagarIndicador(id);
  throw erro(error);
};
// 028: o setor apaga os lançamentos de um indicador seu (o histórico guarda cada um) — para mudar frequência ou tipo.
const apagarLancamentosDoIndicador = async (id: string, esperado: number): Promise<number> => {
  const { data, error } = await supabase.from('kpis_lancamento').delete().eq('indicador_id', id).select('id');
  if (error) throw erro(error);
  const n = (data || []).length;
  // nada saiu mas havia o que apagar: a RLS não deixou (o acesso mudou, ou o banco ainda sem a 028)
  if (n === 0 && esperado > 0 && (await contarLancamentos(id)) > 0) throw new Error('Sem permissão: apagar lançamento é de quem cuida do indicador (as pessoas do setor, o Edson ou um admin de OKR).');
  return n;
};
// 028: quantos lançamentos o indicador tem NO BANCO (a tela só lê 36 meses) — o número que o excluir confirma.
const contarLancamentos = async (id: string): Promise<number> => {
  const { count, error } = await supabase.from('kpis_lancamento').select('id', { count: 'exact', head: true }).eq('indicador_id', id);
  if (error) throw erro(error);
  return count || 0;
};

// A meta é de quem GERENCIA o indicador (028): quem é do setor, o Edson e os admins de OKR.
const SEM_GERIR_META = 'Sem permissão: a meta é de quem cuida do indicador (as pessoas do setor, o Edson ou um admin de OKR).';
const possoGerir = async (indicadorId: string): Promise<boolean> => {
  await colsIndicador();
  if (tem025 === false) { const a = await acesso(); return !!a?.administra; }   // sem a 025: só quem administra
  const { data, error } = await supabase.from('kpis_indicador').select('id, kpis_pode_gerir').eq('id', indicadorId).limit(1);
  if (error) throw erro(error);
  return !!(data && data.length && (data[0] as any).kpis_pode_gerir === true);
};

// Meta por vigência: uma linha por (indicador, "vale desde"). Já existe = troca o valor.
const salvarMeta = async (indicadorId: string, valeDesde: string, meta: number, limite: number | null): Promise<KpisMeta> => {
  const { data, error } = await supabase.from('kpis_meta')
    .insert({ indicador_id: indicadorId, vale_desde: valeDesde, meta, limite_alerta: limite }).select(KPIS_META_COLS);
  if (!error && data && data.length) return mapMeta(data[0]);
  if (error && (error as any).code !== '23505') throw erro(error);
  const up = await supabase.from('kpis_meta').update({ meta, limite_alerta: limite })
    .eq('indicador_id', indicadorId).eq('vale_desde', valeDesde).select(KPIS_META_COLS);
  if (up.error) throw erro(up.error);
  if (!up.data || !up.data.length) throw new Error(SEM_GERIR_META);
  return mapMeta(up.data[0]);
};

const apagarMeta = async (indicadorId: string, valeDesde: string): Promise<void> => {
  const { data, error } = await supabase.from('kpis_meta').delete().eq('indicador_id', indicadorId).eq('vale_desde', valeDesde).select('vale_desde');
  if (error) throw erro(error);
  // 0 linhas: ou outro admin já a tirou (o resultado é o mesmo — não é erro), ou a RLS não deixou
  // (a vigência continua lá). Relê para saber qual dos dois; nunca dizer "retirada" à toa.
  if (!data || !data.length) {
    // Quem perdeu o direito com a tela aberta nem enxerga a vigência: o "não está mais lá" dele não prova
    // nada. Primeiro: ainda gerencia este indicador?
    if (!(await possoGerir(indicadorId))) throw new Error(SEM_GERIR_META);
    const { data: ainda, error: e2 } = await supabase.from('kpis_meta').select('vale_desde').eq('indicador_id', indicadorId).eq('vale_desde', valeDesde).limit(1);
    if (e2) throw erro(e2);
    if (ainda && ainda.length) throw new Error(SEM_GERIR_META);
  }
};

const lancar = async (indicadorId: string, periodo: string, valor: number, comentario: string): Promise<KpisLancamento> => {
  const { data, error } = await supabase.from('kpis_lancamento')
    .insert({ indicador_id: indicadorId, periodo, valor, comentario: comentario.trim() || null }).select(KPIS_LANC_COLS);
  if (error) {
    if ((error as any).code === '23505') {
      // Outra pessoa lançou este período no meio: relê o que está lá para a tela oferecer Corrigir.
      const { data: ex } = await supabase.from('kpis_lancamento').select(KPIS_LANC_COLS).eq('indicador_id', indicadorId).eq('periodo', periodo).limit(1);
      throw new KpisJaLancadoError('Este período já tem valor (alguém lançou enquanto a tela estava aberta). Atualizei — se precisar, use Corrigir.', ex && ex.length ? mapLancamento(ex[0]) : null);
    }
    throw erro(error);
  }
  if (!data || !data.length) throw new Error('Sem permissão para lançar neste indicador.');
  return mapLancamento(data[0]);
};

const corrigir = async (id: string, valor: number, comentario: string, motivo: string, version: string): Promise<KpisLancamento> => {
  let q = supabase.from('kpis_lancamento').update({ valor, comentario: comentario.trim() || null, motivo: motivo.trim() || null }).eq('id', id);
  if (version) q = q.eq('atualizado_em', version);
  const { data, error } = await q.select(KPIS_LANC_COLS);
  if (error) throw erro(error);
  if (!data || !data.length) throw await porQueLancamento(id, version);
  return mapLancamento(data[0]);
};

const apagarLancamento = async (id: string): Promise<void> => {
  const { data, error } = await supabase.from('kpis_lancamento').delete().eq('id', id).select('id');
  if (error) throw erro(error);
  if (!data || !data.length) {
    const why = await porQueLancamento(id);
    if (why instanceof KpisStaleError) return;
    throw new Error('Sem permissão: apagar lançamento é de quem cuida do indicador (as pessoas do setor, o Edson ou um admin de OKR).');
  }
};

// O valor dos KRs ligados, lido na hora (a regra "último"/"soma" mora só no SQL).
// Em lotes de 400 (o banco aceita 500). null = a 023 não está no banco.
const valoresLigados = async (pedidos: KpisPedido[]): Promise<KpisValorLigado[] | null> => {
  if (!pedidos.length) return [];
  const lotes: KpisPedido[][] = [];
  for (let i = 0; i < pedidos.length; i += 400) lotes.push(pedidos.slice(i, i + 400));
  const partes = await Promise.all(lotes.map(async lote => {
    const { data, error } = await supabase.rpc('kpis_valores_ligados', { p_pedidos: lote });
    if (error) { if (kpisAusente(error)) return null; throw erro(error); }
    return (Array.isArray(data) ? data : []).map((r: any): KpisValorLigado => ({
      dono: String(r.dono || ''), id: String(r.indicador_id || ''), de: String(r.de ?? ''), ate: String(r.ate ?? ''),
      valor: r.valor === null || r.valor === undefined ? null : Number(r.valor), periodo: r.periodo ? String(r.periodo).slice(0, 10) : null,
      periodos: Number(r.periodos) || 0, nome: String(r.nome || ''), unidade: String(r.unidade || ''), casas: Number(r.casas) || 0,
      consolidacao: r.consolidacao === 'soma' ? 'soma' : 'ultimo', arquivado: r.arquivado === true, tipo: r.tipo === 'calculado' ? 'calculado' : 'manual',
      frequencia: r.frequencia === 'semanal' || r.frequencia === 'trimestral' ? r.frequencia : 'mensal',
    }));
  }));
  if (partes.some(p => p === null)) return null;
  return (partes as KpisValorLigado[][]).flat();
};

// O último valor lançado ANTES de um dia (a partida sugerida ao ligar um KR).
const ultimoAntes = async (indicadorId: string, antesDe: string): Promise<KpisLancamento | null> => {
  const { data, error } = await supabase.from('kpis_lancamento').select(KPIS_LANC_COLS)
    .eq('indicador_id', indicadorId).lt('periodo', antesDe).order('periodo', { ascending: false }).limit(1);
  if (error) throw erro(error);
  return data && data.length ? mapLancamento(data[0]) : null;
};

// Conta os KRs (não arquivados, em qualquer período) que apontam para cada indicador. Lê os
// OKRs que a pessoa enxerga (a RLS do okr_state decide); falhou = null (a tela não mostra o chip).
const contarLigados = async (): Promise<Map<string, number> | null> => {
  try {
    const rows = await fetchAllOkr();
    const m = new Map<string, number>();
    rows.forEach(r => r.store.periods.forEach(p => p.objectives.forEach(o => o.keyResults.forEach(k => {
      if (k.archived || typeof k.kpiId !== 'string' || !k.kpiId) return;
      m.set(k.kpiId, (m.get(k.kpiId) || 0) + 1);
    }))));
    return m;
  } catch { return null; }
};

// O SETOR de uma pessoa (decisão do Edson, 30/09: só ele e os admins de OKR o mudam). Caminho
// próprio no servidor que grava SÓ o setor — o "Salvar" da Equipe regravaria o cadastro inteiro.
const mudarSetor = async (userId: string, setor: string, setorAntes?: string): Promise<{ gravou: boolean }> => {
  const res = await fetch('/api/users/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ mode: 'setor', user: { id: userId, sector: setor, ...(setorAntes !== undefined ? { sectorAntes: setorAntes } : {}) } }),
  });
  const out = await res.json().catch(() => ({} as any));
  if (res.status === 401) throw new KpisStaleError('Sua sessão venceu — saia e entre de novo. Nada foi salvo.');
  if (res.status === 409 && typeof out.setorAtual === 'string') throw Object.assign(new KpisStaleError(out.error || 'O setor mudou enquanto a tela estava aberta.'), { setorAtual: out.setorAtual as string });
  if (!res.ok || !out.success) throw new KpisStaleError(out.error || out.message || 'Não consegui mudar o setor.');
  return { gravou: !out.semMudanca };                                   // semMudanca: a pessoa já estava nesse setor
};

export const kpisService: KpisService = {
  acesso, setores, tiposAtividade, listIndicadores, listMetas, listLancamentos, listHist, serieCalculada, fontesNovas, cronograma,
  criarIndicador, editarIndicador, arquivarIndicador, apagarIndicador, excluirIndicador, apagarLancamentosDoIndicador, contarLancamentos, salvarMeta, apagarMeta,
  lancar, corrigir, apagarLancamento, valoresLigados, ultimoAntes, contarLigados, mudarSetor,
};

const NET_RE = /failed to fetch|fetch failed|networkerror|load failed|network request failed|timed? ?out|aborted/i;
export const KPIS_NAO_INSTALADO = 'O KPI dos setores ainda não foi instalado no banco (migração 023). Avise o Edson.';

// Mensagem que diz O QUE aconteceu, em português de quem lança — nunca o texto cru do banco sozinho.
// `leitura`: o erro foi ao LER (abrir a aba, atualizar) — a frase não fala em "nada foi salvo".
export const kpisErrorMessage = (e: any, fallback: string, leitura = false): string => {
  const m = String(e?.message || ''); const code = String(e?.code || '');
  if (e instanceof KpisStaleError || e instanceof KpisJaLancadoError) return m;
  if (NET_RE.test(m)) return leitura ? 'Sem conexão com o servidor — não consegui ler os indicadores. Confira a rede e tente de novo.' : 'Sem conexão com o servidor — nada foi salvo. Confira a rede e tente de novo.';
  if (/jwt expired|invalid jwt|jwserror|pgrst30[0-3]/i.test(m) || /^PGRST30[0-3]$/.test(code)) return leitura ? 'Sua sessão venceu — saia e entre de novo.' : 'Sua sessão venceu — saia e entre de novo. Nada foi salvo.';
  if (/KPIS_TELA_ANTIGA/.test(m)) return 'Esta tela é de antes dos cálculos novos — recarregue a página (Ctrl+Shift+R) e faça de novo. Nada foi salvo.';
  if (code === '42703' || code === 'PGRST204') return leitura ? 'O banco acabou de ser atualizado e esta tela ainda não o enxerga — recarregue a página em um minuto.' : 'O banco acabou de ser atualizado e esta tela ainda não o enxerga — recarregue a página em um minuto. Nada foi salvo.';
  if (kpisAusente(e)) return KPIS_NAO_INSTALADO;
  if (/KPIS_PERIODO_FUTURO/.test(m)) return 'Este período ainda não começou — escolha um período até o atual.';
  if (/KPIS_ANTES_DO_INICIO/.test(m)) return 'Este período é anterior ao início do indicador.';
  if (/KPIS_MOTIVO_LONGO/.test(m)) return 'O motivo vai até 300 letras. Nada foi salvo.';
  if (/KPIS_MOTIVO/.test(m)) return 'Diga o motivo da correção (pelo menos 3 letras). Nada foi salvo.';
  if (/KPIS_CALCULADO/.test(m)) return 'Este indicador é calculado sozinho pela base — não se lança à mão.';
  if (/KPIS_REPRESENTANTE_SO_MANUAL/.test(m)) return 'No setor de um representante (e pelo próprio representante) só entra indicador lançado à mão — o calculado lê a base da engenharia. Nada foi salvo.';
  if (/KPIS_ESCOPO_SETOR/.test(m)) return 'Contar horas, projetos ou paradas de "todo mundo" é só do Edson e dos admins de OKR (inclui o P&D, que é reservado) — use as pessoas do setor ou a régua da engenharia. Nada foi salvo.';
  if (/KPIS_EXCLUIR_CONFIRMA/.test(m)) return 'O número de lançamentos mudou enquanto a tela estava aberta — atualizei; confira e confirme de novo. Nada foi apagado.';
  if (/KPIS_ARQUIVADO/.test(m)) return 'Este indicador está arquivado — não recebe lançamentos.';
  if (/KPIS_FREQUENCIA_TRAVADA/.test(m)) return 'Este indicador tem lançamentos: para mudar a frequência ou o tipo, apague os lançamentos antes (no Editar) — ou crie outro e arquive este. Nada foi salvo.';
  if (/KPIS_INICIO_DEPOIS_DE_LANCAMENTO/.test(m)) return 'Há lançamento antes do novo início — escolha um início anterior (ou apague o lançamento antes).';
  if (/KPIS_LIGADO_AO_OKR/.test(m)) return 'Há resultado-chave de OKR ligado a este indicador: o dono do OKR desliga antes (ou arquive o indicador). Nada foi apagado.';
  if (/KPIS_LIMITE_DO_LADO_ERRADO/.test(m)) return '"Fica amarelo até" tem de ficar do lado de fora da meta (abaixo dela se quanto maior, melhor; acima se quanto menor, melhor).';
  if (/KPIS_SEM_ACESSO/.test(m) || code === '42501' || /row-level security|permission denied/i.test(m) || /^sem permiss/i.test(m))
    return /^sem permiss/i.test(m) ? m : 'Sem permissão para isto — o seu acesso mudou (de setor, por exemplo). Atualize a tela; se a permissão foi dada agora, saia e entre de novo.';
  if (code === '23503') return 'Este indicador tem lançamentos (ou histórico de lançamentos): o banco ainda não aceita excluir junto — arquive, ou avise o Edson.';
  if (code === '23505') return 'Já existe um indicador ativo com este nome neste setor.';
  if (code === '23514' || /check constraint/i.test(m)) return 'O banco recusou os dados (texto longo demais ou número fora do permitido). Nada foi salvo.';
  return m ? `${fallback} (${m})` : fallback;
};
