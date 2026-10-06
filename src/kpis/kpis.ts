// KPI DOS SETORES (30/09/2026, migração 023). Tipos, leitura das linhas do banco e as
// regras que a tela mostra: períodos, prazo de lançar, meta vigente, farol, tendência e
// números em pt-BR.
//
// Quem vê, lança e cadastra quem decide é o BANCO (RLS da 023); aqui só se desenha.
// As regras de período espelham as funções kpis_inicio_periodo/kpis_fim_periodo do SQL —
// o banco alinha de novo tudo o que recebe, então uma diferença aqui aparece como "o
// período gravado não é o que a tela mostrou", nunca como dado torto no banco.

import { PREFIXO_SETOR_REPRESENTANTE } from '../utils/cargos';

export type KpisFrequencia = 'semanal' | 'mensal' | 'trimestral';
export type KpisSentido = 'maior' | 'menor';
export type KpisConsolidacao = 'ultimo' | 'soma';
export type KpisTipo = 'manual' | 'calculado';
export type KpisMedida = 'horas' | 'quantidade' | 'media' | 'pct_estimado';  // media e pct_estimado: só projetos (026)
export type KpisEscopo = 'setor' | 'todos' | 'engenharia';                   // engenharia: a régua do Dashboard (026)
export type KpisFonte = 'atividades' | 'projetos' | 'paradas' | 'inovacoes' | 'cronograma'; // de onde sai o calculado (026; cronograma: 027)

export interface KpisIndicador {
  id: string;
  setor: string;
  nome: string;
  descricao: string;
  unidade: string;
  casas: number;
  sentido: KpisSentido;
  frequencia: KpisFrequencia;
  consolidacao: KpisConsolidacao;
  prazoDias: number | null;       // null = o padrão da frequência (ver PRAZO_PADRAO)
  inicio: string;                 // yyyy-mm-dd, sempre o começo de um período
  ativo: boolean;
  tipo: KpisTipo;
  calcTipos: string[];            // tipos de atividade do Desempenho Operacional (calculado)
  calcMedida: KpisMedida | null;
  calcEscopo: KpisEscopo | null;
  calcFonte: KpisFonte | null;    // 026: null = manual (banco sem a 026: atividades)
  calcFiltro: string[];           // 026: tipos de projeto (LIBERACAO…) ou situações de inovação (vazio = todas)
  criadoPor: string | null;
  criadoEm: string;
  atualizadoPor: string | null;
  atualizadoEm: string;           // versão da linha (trava contra gravar por cima)
  podeLancar: boolean;            // kpis_pode_lancar — o banco diz
  doSetor: boolean;               // 025: criado pelo próprio setor (só registro: desde a 028 o setor cuida de todos os seus)
  podeGerir: boolean | null;      // kpis_pode_gerir — editar/meta/arquivar/excluir (028: o setor em todos os seus); null = banco sem a 025
}

export interface KpisMeta {
  indicadorId: string;
  valeDesde: string;              // começo do período a partir do qual vale
  meta: number;
  limiteAlerta: number | null;    // "fica amarelo até"; null = 10% de |meta|
  por: string | null;
  em: string;
}

export interface KpisLancamento {
  id: string;
  indicadorId: string;
  periodo: string;
  valor: number;
  comentario: string;
  lancadoPor: string | null;
  lancadoEm: string;
  alteradoPor: string | null;
  alteradoEm: string | null;
  atualizadoEm: string;           // versão da linha
}

export interface KpisHist {
  id: number;
  lancamentoId: string;
  indicadorId: string;
  periodo: string;
  acao: 'corrigiu' | 'apagou';
  valorAntes: number | null;
  valorDepois: number | null;
  comentarioAntes: string;
  motivo: string;
  por: string | null;
  em: string;
}

// Um período de indicador CALCULADO (kpis_serie_calculada): o valor e quantos registros entraram.
// valor null = sem base (média ou % num período sem projeto concluído) — nunca vira 0.
export interface KpisPontoCalculado { periodo: string; valor: number | null; atividades: number; }

export interface KpisAcesso {
  cadastrado: boolean;
  visualizador: boolean;
  veTodos: boolean;
  administra: boolean;
  setorChave: string | null;
  setorNome: string | null;
  indicadores: number;            // quantos ativos ela enxerga
  possoLancar: number;            // em quantos ela lança
  cria: boolean;                  // 025: cria indicador do próprio setor (quem tem setor; o Edson e os admins em qualquer um)
}

export interface KpisSetor { chave: string; nome: string; pessoas: number; grafias: string[]; }
export interface KpisTipoAtividade { id: string; nome: string; ativo: boolean; }

// ---- 026: de onde o calculado sai, o que conta e de quem ---------------------
export const MEDIDAS_DA_FONTE: Record<KpisFonte, KpisMedida[]> = {
  atividades: ['horas', 'quantidade'], projetos: ['quantidade', 'horas', 'media', 'pct_estimado'],
  paradas: ['horas', 'quantidade'], inovacoes: ['quantidade'], cronograma: ['quantidade'],
};
export const FONTE_ROTULO: Record<KpisFonte, string> = {
  atividades: 'atividades do Desempenho Operacional', projetos: 'sessões de projeto (Liberação, Variação, Desenvolvimento)',
  paradas: 'paradas registradas (interrupções)', inovacoes: 'inovações cadastradas',
  cronograma: 'projetos do cronograma (Nexus Flow)',
};
export const MEDIDA_ROTULO: Record<KpisFonte, Partial<Record<KpisMedida, string>>> = {
  atividades: { horas: 'as horas das atividades', quantidade: 'quantas atividades' },
  projetos: { quantidade: 'quantas sessões de projeto', horas: 'as horas de projeto (tempo ativo)', media: 'as horas médias por projeto concluído', pct_estimado: '% dos concluídos dentro do estimado' },
  paradas: { horas: 'as horas paradas', quantidade: 'quantas paradas' },
  inovacoes: { quantidade: 'quantas inovações' },
  cronograma: { quantidade: 'quantos projetos concluídos' },
};
export const AJUDA_FONTE: Record<KpisFonte, string> = {
  atividades: 'Atividades concluídas, no dia em que começaram. Na soma de horas, sessão de mais de 16 h (esquecida aberta) fica fora — a régua do P&D Gerencial.',
  projetos: 'Sessões de projeto de qualquer situação, no dia em que começaram — o mesmo "Total Ano" do Dashboard. Média e % olham os projetos concluídos, no mês em que terminaram (o mês fechado não muda mais); mês sem projeto concluído fica sem valor.',
  paradas: 'Paradas registradas, no dia em que começaram; as horas são as horas úteis paradas (a régua do Dashboard).',
  inovacoes: 'Inovações cadastradas, no dia do cadastro. Só a contagem — nunca valores em R$.',
  cronograma: 'Projetos do cronograma (Nexus Flow) concluídos, no mês em que foram marcados como Feito (os concluídos até 02/10/2026, no mês da data final do cronograma). Só a tarefa principal (subtarefa não conta); encerrado sem concluir e excluído ficam fora. "Do setor" = projetos com alguém do setor entre os responsáveis.',
};
export const PROJETO_TIPOS = [{ v: 'LIBERACAO', rotulo: 'Liberação' }, { v: 'VARIACAO', rotulo: 'Variação' }, { v: 'DESENVOLVIMENTO', rotulo: 'Desenvolvimento' }];
export const INOVACAO_STATUS = [{ v: 'PENDING', rotulo: 'Pendente' }, { v: 'APPROVED', rotulo: 'Aprovada' }, { v: 'IMPLEMENTED', rotulo: 'Implementada' }, { v: 'REJECTED', rotulo: 'Rejeitada' }];
export const ESCOPO_ROTULO: Record<KpisEscopo, string> = {
  setor: 'das pessoas do setor do indicador',
  engenharia: 'da engenharia, como no Dashboard (sem PROCESSOS nem representantes; o P&D sai desde 01/09/2026)',   // representante fora da régua (06/10/2026)
  todos: 'de todo mundo',
};
const ESCOPO_CURTO: Record<KpisEscopo, string> = { setor: 'do setor', engenharia: 'da engenharia (régua do Dashboard)', todos: 'de todos' };
// O cabeçalho do indicador calculado ("calculado: as horas das atividades · da engenharia…").
export const rotuloCalculo = (i: Pick<KpisIndicador, 'calcFonte' | 'calcMedida' | 'calcEscopo'>): string => {
  const f = i.calcFonte || 'atividades';
  const m = (i.calcMedida && MEDIDA_ROTULO[f][i.calcMedida]) || FONTE_ROTULO[f];
  return `calculado: ${m}${i.calcEscopo ? ` · ${ESCOPO_CURTO[i.calcEscopo]}` : ''}`;
};
// A base de cada período ("12 sessões", "3 concluídos com estimativa").
export const rotuloBase = (i: Pick<KpisIndicador, 'calcFonte' | 'calcMedida'>, k: number): string => {
  const pl = (um: string, varios: string) => `${k} ${k === 1 ? um : varios}`;
  const f = i.calcFonte || 'atividades';
  if (f === 'projetos') return i.calcMedida === 'media' ? pl('concluído', 'concluídos')
    : i.calcMedida === 'pct_estimado' ? pl('concluído com estimativa', 'concluídos com estimativa') : pl('sessão', 'sessões');
  if (f === 'paradas') return pl('parada', 'paradas');
  if (f === 'inovacoes') return pl('inovação', 'inovações');
  if (f === 'cronograma') return pl('projeto concluído', 'projetos concluídos');
  return pl('atividade', 'atividades');
};

// O que se escreve ao criar/editar um indicador (as colunas que o GRANT da 023 deixa).
export interface KpisIndicadorInput {
  setor: string;
  nome: string;
  descricao: string;
  unidade: string;
  casas: number;
  sentido: KpisSentido;
  frequencia: KpisFrequencia;
  consolidacao: KpisConsolidacao;
  prazoDias: number | null;
  inicio: string;
  tipo: KpisTipo;
  calcTipos: string[];
  calcMedida: KpisMedida | null;
  calcEscopo: KpisEscopo | null;
  calcFonte: KpisFonte;           // 026 (sem a 026 no banco, só 'atividades')
  calcFiltro: string[];
}

// ---- Colunas (nunca select('*')) ------------------------------------------
export const KPIS_IND_COLS_023 = 'id, setor, nome, descricao, unidade, casas, sentido, frequencia, consolidacao, prazo_dias, inicio, ativo, tipo, calc_tipos, calc_medida, calc_escopo, criado_por, criado_em, atualizado_por, atualizado_em, kpis_pode_lancar';
export const KPIS_IND_COLS_025 = KPIS_IND_COLS_023 + ', do_setor, kpis_pode_gerir';   // 025
export const KPIS_IND_COLS = KPIS_IND_COLS_025 + ', calc_fonte, calc_filtro';          // 026
export const KPIS_META_COLS = 'indicador_id, vale_desde, meta, limite_alerta, por, em';
export const KPIS_LANC_COLS = 'id, indicador_id, periodo, valor, comentario, lancado_por, lancado_em, alterado_por, alterado_em, atualizado_em';
export const KPIS_HIST_COLS = 'id, lancamento_id, indicador_id, periodo, acao, valor_antes, valor_depois, comentario_antes, motivo, por, em';

const s = (v: unknown): string => typeof v === 'string' ? v : v == null ? '' : String(v);
const n = (v: unknown, def = 0): number => { const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN; return Number.isFinite(x) ? x : def; };
const nn = (v: unknown): number | null => { if (v === null || v === undefined || v === '') return null; const x = Number(v); return Number.isFinite(x) ? x : null; };
const dia = (v: unknown): string => s(v).slice(0, 10);

export const mapIndicador = (r: any): KpisIndicador => ({
  id: s(r.id), setor: s(r.setor), nome: s(r.nome), descricao: s(r.descricao), unidade: s(r.unidade),
  casas: Math.max(0, Math.min(4, n(r.casas, 1))),
  sentido: r.sentido === 'menor' ? 'menor' : 'maior',
  frequencia: r.frequencia === 'semanal' || r.frequencia === 'trimestral' ? r.frequencia : 'mensal',
  consolidacao: r.consolidacao === 'soma' ? 'soma' : 'ultimo',
  prazoDias: nn(r.prazo_dias), inicio: dia(r.inicio), ativo: r.ativo !== false,
  tipo: r.tipo === 'calculado' ? 'calculado' : 'manual',
  calcTipos: Array.isArray(r.calc_tipos) ? r.calc_tipos.map(s) : [],
  calcMedida: (['horas', 'quantidade', 'media', 'pct_estimado'] as const).find(x => x === r.calc_medida) ?? null,
  calcEscopo: (['setor', 'todos', 'engenharia'] as const).find(x => x === r.calc_escopo) ?? null,
  calcFonte: r.tipo !== 'calculado' ? null : (['projetos', 'paradas', 'inovacoes', 'cronograma'] as const).find(x => x === r.calc_fonte) ?? 'atividades',
  calcFiltro: Array.isArray(r.calc_filtro) ? r.calc_filtro.map(s) : [],
  criadoPor: r.criado_por ? s(r.criado_por) : null, criadoEm: s(r.criado_em),
  atualizadoPor: r.atualizado_por ? s(r.atualizado_por) : null, atualizadoEm: s(r.atualizado_em),
  podeLancar: r.kpis_pode_lancar === true,
  doSetor: r.do_setor === true,
  podeGerir: typeof r.kpis_pode_gerir === 'boolean' ? r.kpis_pode_gerir : null,
});
// Editar, pôr meta, arquivar e excluir: o banco diz (025); sem a 025, só quem administra.
export const gerencia = (i: Pick<KpisIndicador, 'podeGerir'>, acesso: Pick<KpisAcesso, 'administra'> | null | undefined): boolean =>
  i.podeGerir ?? !!acesso?.administra;
export const mapMeta = (r: any): KpisMeta => ({
  indicadorId: s(r.indicador_id), valeDesde: dia(r.vale_desde), meta: n(r.meta), limiteAlerta: nn(r.limite_alerta),
  por: r.por ? s(r.por) : null, em: s(r.em),
});
export const mapLancamento = (r: any): KpisLancamento => ({
  id: s(r.id), indicadorId: s(r.indicador_id), periodo: dia(r.periodo), valor: n(r.valor), comentario: s(r.comentario),
  lancadoPor: r.lancado_por ? s(r.lancado_por) : null, lancadoEm: s(r.lancado_em),
  alteradoPor: r.alterado_por ? s(r.alterado_por) : null, alteradoEm: r.alterado_em ? s(r.alterado_em) : null,
  atualizadoEm: s(r.atualizado_em),
});
export const mapHist = (r: any): KpisHist => ({
  id: n(r.id), lancamentoId: s(r.lancamento_id), indicadorId: s(r.indicador_id), periodo: dia(r.periodo),
  acao: r.acao === 'apagou' ? 'apagou' : 'corrigiu', valorAntes: nn(r.valor_antes), valorDepois: nn(r.valor_depois),
  comentarioAntes: s(r.comentario_antes), motivo: s(r.motivo), por: r.por ? s(r.por) : null, em: s(r.em),
});
export const mapAcesso = (r: any): KpisAcesso => ({
  cadastrado: r?.cadastrado === true, visualizador: r?.visualizador !== false, veTodos: r?.ve_todos === true,
  administra: r?.administra === true, setorChave: r?.setor_chave ? s(r.setor_chave) : null,
  setorNome: r?.setor_nome ? s(r.setor_nome) : null, indicadores: n(r?.indicadores), possoLancar: n(r?.posso_lancar),
  cria: r?.cria === true || (r?.cria === undefined && r?.administra === true),   // sem a 025: só quem administra
});

// com026 = o banco tem calc_fonte/calc_filtro (sem a 026, mandar essas colunas daria erro — e só 'atividades' existe).
export const toIndicadorRow = (i: KpisIndicadorInput, com026 = true): Record<string, unknown> => {
  const fonte: KpisFonte | null = i.tipo === 'calculado' ? (i.calcFonte || 'atividades') : null;
  return {
    setor: i.setor.trim(), nome: i.nome.trim(), descricao: i.descricao.trim() || null, unidade: i.unidade.trim(),
    casas: i.casas, sentido: i.sentido, frequencia: i.frequencia, consolidacao: i.consolidacao,
    prazo_dias: i.prazoDias, inicio: i.inicio, tipo: i.tipo,
    calc_tipos: fonte === 'atividades' ? i.calcTipos : null,
    calc_medida: fonte ? i.calcMedida : null,
    calc_escopo: fonte ? i.calcEscopo : null,
    ...(com026 ? { calc_fonte: fonte, calc_filtro: fonte && fonte !== 'atividades' && i.calcFiltro.length ? i.calcFiltro : null } : {}),
  };
};
// O cálculo pede a 026 (fonte nova, escopo engenharia, média ou %)?
export const precisa026 = (i: KpisIndicadorInput): boolean =>
  i.tipo === 'calculado' && ((i.calcFonte || 'atividades') !== 'atividades' || i.calcEscopo === 'engenharia'
    || i.calcMedida === 'media' || i.calcMedida === 'pct_estimado');
// O cálculo pede a 027 (o cronograma)?
export const precisa027 = (i: KpisIndicadorInput): boolean => i.tipo === 'calculado' && i.calcFonte === 'cronograma';

// O que o formulário confere antes de mandar (o banco confere de novo).
export const validarIndicador = (i: KpisIndicadorInput): string => {
  if (!setorChave(i.setor)) return 'Escolha o setor.';
  if (i.setor.trim().length > 60) return 'O nome do setor é longo demais.';
  if (i.nome.trim().length < 2) return 'Dê um nome ao indicador.';
  if (i.nome.trim().length > 120) return 'O nome do indicador é longo demais (até 120 letras).';
  if (i.descricao.length > 1000) return '"Como medir" é longo demais (até 1000 letras).';
  if (i.unidade.trim().length > 12) return 'A unidade é longa demais (até 12 letras).';
  if (!parseDia(i.inicio)) return 'Escolha a data de início.';
  if (i.prazoDias !== null && (i.prazoDias < 0 || i.prazoDias > 60)) return 'O prazo para lançar vai de 0 a 60 dias.';
  if (i.tipo === 'calculado') {
    const fonte = i.calcFonte || 'atividades';
    if (fonte === 'atividades') {
      if (!i.calcTipos.length) return 'Escolha pelo menos um tipo de atividade para o cálculo.';
      if (i.calcTipos.length > 40) return 'No máximo 40 tipos de atividade.';
    }
    if (fonte === 'projetos' && !i.calcFiltro.length) return 'Escolha pelo menos um tipo de projeto (Liberação, Variação, Desenvolvimento).';
    if (!i.calcMedida || !MEDIDAS_DA_FONTE[fonte].includes(i.calcMedida)) return 'Escolha o que o cálculo conta.';
    if ((i.calcMedida === 'media' || i.calcMedida === 'pct_estimado') && i.consolidacao === 'soma') return 'Média e "% no estimado" não se somam ao longo do tempo — desmarque "os valores se somam".';
    if (!i.calcEscopo) return 'Escolha de quem são os registros (o setor, a engenharia ou todo mundo).';
    if (fonte === 'cronograma' && i.calcEscopo === 'engenharia') return 'O cronograma conta os projetos de todos ou os do setor.';
  }
  return '';
};

// ---- Setor ----------------------------------------------------------------
// Espelho de kpis_setor_chave (SQL): sem maiúscula, sem acento, pontuação vira espaço.
// Serve para AGRUPAR na tela; quem casa pessoa com setor é o banco.
export const setorChave = (v?: string | null): string =>
  (v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// O setor de um REPRESENTANTE (06/10/2026, decisão do Edson: "cada um só os seus") é 'Representante — Nome Sobrenome',
// posto pelo banco (030). Comparado pela CHAVE, como o banco casa pessoa com setor: com hífen, sem acento ou em
// maiúsculas é o mesmo setor. Ninguém de outro cargo recebe um setor assim — senão vê, edita e exclui os indicadores
// do representante (028). A mesma regra do servidor (setorDeRepresentante em api/index.ts).
const CHAVE_SETOR_REPRESENTANTE = setorChave(PREFIXO_SETOR_REPRESENTANTE);   // 'representante'
export const ehSetorDeRepresentante = (v?: string | null): boolean => {
  const k = setorChave(v);
  return !!k && (k === CHAVE_SETOR_REPRESENTANTE || k.startsWith(CHAVE_SETOR_REPRESENTANTE + ' '));
};
export const SETOR_DE_REPRESENTANTE_MSG = 'Os setores "Representante — …" são só dos representantes (o banco põe sozinho): escolha outro setor.';

// ---- Datas (dia LOCAL, "yyyy-mm-dd"; nunca toISOString) ----------------------
const pad = (x: number) => String(x).padStart(2, '0');
export const isoDia = (d: Date): string => `${String(d.getFullYear()).padStart(4, '0')}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDia = (v?: unknown): Date | null => {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 2000 || y > 2100) return null;
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? dt : null;
};
// Data que não é um dia de verdade (ano "0026" digitado no campo) volta como veio — quem chama
// confere com parseDia; a tela nunca cai por uma data torta.
const somaDias = (iso: string, k: number): string => { const d = parseDia(iso); return d ? isoDia(new Date(d.getFullYear(), d.getMonth(), d.getDate() + k)) : iso; };
const somaMeses = (iso: string, k: number): string => { const d = parseDia(iso); return d ? isoDia(new Date(d.getFullYear(), d.getMonth() + k, 1)) : iso; };

// "Hoje" é o dia de Joinville (o do banco, kpis_hoje), não o do relógio de quem abre.
export const hojeSP = (): string => {
  try {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const g = (t: string) => p.find(x => x.type === t)?.value || '';
    const out = `${g('year')}-${g('month')}-${g('day')}`;
    if (parseDia(out)) return out;
  } catch { /* navegador sem fuso: cai no local */ }
  return isoDia(new Date());
};

// ---- Períodos (espelho do SQL) --------------------------------------------
export const inicioPeriodo = (f: KpisFrequencia, diaIso: string): string => {
  const d = parseDia(diaIso); if (!d) return diaIso;
  if (f === 'semanal') { const dow = (d.getDay() + 6) % 7; return isoDia(new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow)); }
  if (f === 'mensal') return isoDia(new Date(d.getFullYear(), d.getMonth(), 1));
  return isoDia(new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1));
};
export const proximoPeriodo = (f: KpisFrequencia, inicio: string): string =>
  f === 'semanal' ? somaDias(inicio, 7) : somaMeses(inicio, f === 'mensal' ? 1 : 3);
export const periodoAnterior = (f: KpisFrequencia, inicio: string): string =>
  f === 'semanal' ? somaDias(inicio, -7) : somaMeses(inicio, f === 'mensal' ? -1 : -3);
export const fimPeriodo = (f: KpisFrequencia, inicio: string): string => somaDias(proximoPeriodo(f, inicio), -1);

// Os períodos de `de` até `ate` (inclusive), já alinhados. Limite de segurança.
export const periodosEntre = (f: KpisFrequencia, de: string, ate: string, max = 800): string[] => {
  const out: string[] = [];
  if (!parseDia(de) || !parseDia(ate)) return out;
  let p = inicioPeriodo(f, de); const fim = inicioPeriodo(f, ate);
  while (p <= fim && out.length < max && parseDia(p)) { out.push(p); p = proximoPeriodo(f, p); }
  return out;
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
// Semana ISO (a que contém a quinta-feira).
export const semanaIso = (inicio: string): { ano: number; sem: number } => {
  const d = parseDia(inicio) || new Date();
  const qui = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const jan4 = new Date(qui.getFullYear(), 0, 4);
  const sem = 1 + Math.round(((qui.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return { ano: qui.getFullYear(), sem };
};
const ddmm = (iso: string) => { const d = parseDia(iso); return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}` : iso; };
export const fmtDia = (iso?: string | null): string => { const d = parseDia(iso || ''); return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '—'; };
// Carimbo do banco (UTC) → o DIA de Joinville "dd/mm/aaaa" — cortar o texto dava o dia seguinte à noite.
export const fmtCarimbo = (ts?: string | null, comHora = false): string => {
  if (!ts) return '—';
  const t = new Date(ts);
  if (isNaN(t.getTime())) return '—';
  try {
    return t.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: comHora ? '2-digit' : 'numeric', ...(comHora ? { hour: '2-digit', minute: '2-digit' } : {}) });
  } catch { return t.toLocaleString('pt-BR'); }
};

// "set/2026", "Sem 40/2026", "T3/2026".
export const rotuloPeriodo = (f: KpisFrequencia, inicio: string): string => {
  const d = parseDia(inicio); if (!d) return inicio || '—';
  if (f === 'mensal') return `${MESES[d.getMonth()]}/${d.getFullYear()}`;
  if (f === 'trimestral') return `T${Math.floor(d.getMonth() / 3) + 1}/${d.getFullYear()}`;
  const { ano, sem } = semanaIso(inicio);
  return `Sem ${sem}/${ano}`;
};
// Com as datas da semana: "Sem 40/2026 (28/09–04/10)".
export const rotuloPeriodoLongo = (f: KpisFrequencia, inicio: string): string =>
  f === 'semanal' ? `${rotuloPeriodo(f, inicio)} (${ddmm(inicio)}–${ddmm(fimPeriodo(f, inicio))})` : rotuloPeriodo(f, inicio);

export const FREQ_ROTULO: Record<KpisFrequencia, string> = { semanal: 'Toda semana', mensal: 'Todo mês', trimestral: 'A cada trimestre' };
export const SENTIDO_ROTULO: Record<KpisSentido, string> = { maior: 'quanto maior, melhor', menor: 'quanto menor, melhor' };

// ---- Prazo de lançar e atraso -------------------------------------------------
// O valor de um período se lança até N dias depois que ele acaba.
export const PRAZO_PADRAO: Record<KpisFrequencia, number> = { semanal: 2, mensal: 5, trimestral: 10 };
export const prazoDias = (i: Pick<KpisIndicador, 'frequencia' | 'prazoDias'>): number => i.prazoDias ?? PRAZO_PADRAO[i.frequencia];
export const prazoDoPeriodo = (i: Pick<KpisIndicador, 'frequencia' | 'prazoDias'>, periodo: string): string =>
  somaDias(fimPeriodo(i.frequencia, periodo), prazoDias(i));

export type KpisSituacao = 'em_dia' | 'no_prazo' | 'atrasado';
export interface KpisPendencias {
  situacao: KpisSituacao;
  atrasados: string[];     // períodos fechados, sem valor, com o prazo vencido
  noPrazo: string[];       // períodos fechados, sem valor, ainda no prazo
  atual: string;           // o período em curso (pode lançar, ainda não é cobrado)
  proximoPrazo: string | null; // até quando lançar o mais antigo que falta (no prazo)
}
// Calculado nunca atrasa (quem calcula é o banco); arquivado não cobra nada.
export const pendencias = (i: KpisIndicador, comValor: Set<string>, hoje: string = hojeSP()): KpisPendencias => {
  const atual = inicioPeriodo(i.frequencia, hoje);
  const vazio: KpisPendencias = { situacao: 'em_dia', atrasados: [], noPrazo: [], atual, proximoPrazo: null };
  if (i.tipo === 'calculado' || !i.ativo || i.inicio > atual) return vazio;
  const atrasados: string[] = [], noPrazo: string[] = [];
  for (const p of periodosEntre(i.frequencia, i.inicio, hoje)) {
    if (p >= atual || comValor.has(p)) continue;
    (prazoDoPeriodo(i, p) < hoje ? atrasados : noPrazo).push(p);
  }
  return {
    situacao: atrasados.length ? 'atrasado' : noPrazo.length ? 'no_prazo' : 'em_dia',
    atrasados, noPrazo, atual,
    proximoPrazo: noPrazo.length ? prazoDoPeriodo(i, noPrazo[0]) : null,
  };
};

// ---- Meta e farol ---------------------------------------------------------------
// A meta que valia NAQUELE período: a de maior "vale desde" que não passa dele.
export const metaVigente = (metas: KpisMeta[], periodo: string): KpisMeta | null => {
  let best: KpisMeta | null = null;
  for (const m of metas) if (m.valeDesde <= periodo && (!best || m.valeDesde > best.valeDesde)) best = m;
  return best;
};

export type KpisFarol = 'verde' | 'amarelo' | 'vermelho' | 'sem_meta' | 'sem_valor';
// Sem "fica amarelo até": a faixa amarela é 10% de |meta| do lado de fora. Limite
// gravado do lado errado (o banco recusa, mas dado antigo pode ter) = o padrão.
export const limiteEfetivo = (sentido: KpisSentido, m: KpisMeta): number => {
  const tol = Math.abs(m.meta) * 0.1;
  const padrao = sentido === 'maior' ? m.meta - tol : m.meta + tol;
  const l = m.limiteAlerta;
  if (l === null) return padrao;
  if (sentido === 'maior' ? l > m.meta : l < m.meta) return padrao;
  return l;
};
export const farol = (sentido: KpisSentido, valor: number | null | undefined, m: KpisMeta | null): KpisFarol => {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return 'sem_valor';
  if (!m) return 'sem_meta';
  const lim = limiteEfetivo(sentido, m);
  if (sentido === 'maior') return valor >= m.meta ? 'verde' : valor >= lim ? 'amarelo' : 'vermelho';
  return valor <= m.meta ? 'verde' : valor <= lim ? 'amarelo' : 'vermelho';
};
export const FAROL_ROTULO: Record<KpisFarol, string> = { verde: 'No verde', amarelo: 'Atenção', vermelho: 'Fora da meta', sem_meta: 'Sem meta', sem_valor: 'Sem valor' };
// Cor SEMPRE com o texto ao lado (quem não distingue cor lê a palavra).
export const FAROL_CLASSE: Record<KpisFarol, { chip: string; dot: string; text: string; hex: string }> = {
  verde: { chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300', dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', hex: '#10b981' },
  amarelo: { chip: 'bg-amber-50 text-amber-700 dark:bg-amber-900/25 dark:text-amber-300', dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', hex: '#f59e0b' },
  vermelho: { chip: 'bg-rose-50 text-rose-700 dark:bg-rose-900/25 dark:text-rose-300', dot: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400', hex: '#f43f5e' },
  sem_meta: { chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', dot: 'bg-slate-400', text: 'text-slate-500 dark:text-slate-400', hex: '#94a3b8' },
  sem_valor: { chip: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400', dot: 'bg-slate-300 dark:bg-slate-600', text: 'text-slate-400 dark:text-slate-500', hex: '#cbd5e1' },
};

// Tendência contra o período anterior, "boa" conforme o sentido.
export type KpisTendencia = { dir: 'sobe' | 'desce' | 'igual'; boa: boolean | null } | null;
export const tendencia = (sentido: KpisSentido, atual: number | null, anterior: number | null): KpisTendencia => {
  if (atual === null || anterior === null) return null;
  if (atual === anterior) return { dir: 'igual', boa: null };
  const sobe = atual > anterior;
  return { dir: sobe ? 'sobe' : 'desce', boa: sentido === 'maior' ? sobe : !sobe };
};

// ---- Números em pt-BR --------------------------------------------------------------
// Aceita "1.234,5", "92,3", "92.3", "R$ 1.200", "95%". Ponto sozinho seguido de
// exatamente 3 dígitos é milhar ("1.234" = mil duzentos e trinta e quatro; "0.125" não);
// com vírgula, a vírgula é o decimal. Vazio ou lixo = null.
export const parseNumero = (txt: string): number | null => {
  let t = (txt || '').replace(/R\$|%|\s/gi, '').trim();
  if (!t) return null;
  const neg = /^[-−]/.test(t); t = t.replace(/^[-−+]/, '');
  if (!/^[\d.,]+$/.test(t)) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if ((t.match(/\./g) || []).length > 1 || /^[1-9]\d{0,2}\.\d{3}$/.test(t)) t = t.replace(/\./g, '');
  if (t.includes(',') || !/^\d*\.?\d*$/.test(t) || !/\d/.test(t)) return null;
  const x = Number(t);
  return Number.isFinite(x) ? (neg ? -x : x) : null;
};
export const fmtNumero = (v: number, casas: number): string =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
// "R$ 1.234,50" · "92,5%" · "12 dias" · "4,5 h".
export const fmtValor = (v: number | null | undefined, unidade: string, casas: number): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const u = (unidade || '').trim(); const num = fmtNumero(v, casas);
  if (/^r\$$/i.test(u)) return `R$ ${num}`;
  if (u === '%') return `${num}%`;
  return u ? `${num} ${u}` : num;
};
// Para o campo de digitar: número sem milhar, com vírgula.
export const numeroParaCampo = (v: number | null | undefined, casas: number): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '' : v.toFixed(Math.max(0, casas)).replace('.', ',');
// O número gravado, inteiro, para o campo de corrigir (o arredondado viraria uma correção que ninguém pediu).
export const numeroExatoParaCampo = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '' : String(v).replace('.', ',');

export const UNIDADES = ['%', 'R$', 'dias', 'h', 'un'];
