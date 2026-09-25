// OKR pessoal do Edson (executivo). Tipos, semente (vinda do xlsx
// OKR_Q4_2026_Edson_Farias) e helpers de progresso/cor. Guardado no banco
// (tabela okr_state, RLS só-Edson) — ver storageService.fetchOkr/saveOkr.

export type OkrFormat = 'bin' | 'pct' | 'num';
export type OkrStatus = 'Não iniciado' | 'Em andamento' | 'Concluído' | 'Em risco';

export interface OkrTask {
  id: string;
  text: string;
  done: boolean;
}

export interface OkrKeyResult {
  id: string;            // ex.: "KR1.1" (rótulo)
  uid?: string;          // identidade única (KRs criados a partir de 25/09); o arraste confere
  title: string;
  metric: string;        // rótulo da métrica
  baseline: number;
  target: number;
  current: number;
  format: OkrFormat;     // bin (0/1) | pct (0..1 exibido em %) | num (contagem 0..target)
  due: string;           // ISO yyyy-mm-dd — FIM do período do KR (prazo)
  initiatives: string;   // texto livre (mantido); as atividades detalhadas vão em tasks
  tasks?: OkrTask[];     // atividades/entregas do KR (checklist editável)
  status: OkrStatus | string;
  notes?: string;
  // ---- Fase 2 (todos opcionais, retrocompatíveis) ----
  owner?: string;        // LEGADO: "responsável" em texto livre (ex.: "PCP + TI"). Não é mais
                         // editado — virou `executores`. Fica guardado; só é lido quando
                         // `executores` não existe (ver krExecutores).
  start?: string;        // ISO yyyy-mm-dd — INÍCIO do período do KR
  archived?: boolean;    // KR arquivado (some da lista, sem apagar)
  history?: OkrProgressPoint[]; // histórico de progresso (cada mudança do "atual")
  // ---- Executores (25/09) ----
  // Quem executa o KR (pessoas e/ou equipes do cadastro okr_executor). Guarda o
  // id E o nome da época (o nome mostra mesmo sem acesso ao cadastro, ex.: link
  // público). `[]` = "sem executor" de propósito; ausente = nunca definido.
  executores?: OkrPersonRef[];
}

// Referência a alguém do cadastro de executores: id (para acompanhar renomeação)
// + o nome de quando foi escolhido. `id` falta só em nome legado que não casou.
export interface OkrPersonRef {
  id?: string;
  name: string;
  kind?: OkrExecutorKind; // guardado ao escolher: sem o cadastro (link público) ainda diz se é equipe
}

// Cadastro compartilhado de executores (tabela okr_executor).
export type OkrExecutorKind = 'pessoa' | 'equipe';
export interface OkrExecutor {
  id: string;
  name: string;
  kind: OkrExecutorKind;
  team?: string;         // equipe a que a pessoa pertence (numa equipe, o próprio nome)
  active: boolean;
  updatedAt?: string;    // versão da linha (trava contra gravar por cima de outro admin)
}

export interface OkrProgressPoint {
  date: string;          // ISO datetime
  value: number;         // valor "current" registrado
  by?: string;           // quem registrou (nome)
}

export interface OkrObjective {
  id: string;            // ex.: "O1"
  title: string;
  keyResults: OkrKeyResult[];
  responsavel?: OkrPersonRef | null; // responsável pelo objetivo (1, do cadastro de executores)
  krSeq?: number;        // maior número de KR já emitido neste objetivo (nunca reusa)
  uid?: string;          // identidade única (objetivos criados a partir de 25/09)
}

export interface OkrCheckin {
  id: string;
  date: string;          // yyyy-mm-dd
  kr: string;            // id do KR
  current: number;
  comment: string;
  next: string;
}

// Portfólio de inovação (KR1.2): os projetos/apps ativos, com status e próximo
// marco. Semeado com o inventário REAL do que foi construído.
export type PortfolioStatus = 'Produção' | 'Desenvolvimento' | 'Protótipo' | 'Ferramenta' | 'Pausado';
export interface PortfolioItem {
  id: string;
  name: string;
  what: string;            // o que é (1 linha)
  category: string;        // Engenharia | Sistemas | Dados | Outros
  status: PortfolioStatus | string;
  url?: string;
  nextMilestone: string;
}

export interface OkrData {
  period: string;
  owner: string;
  objectives: OkrObjective[];
  portfolio: PortfolioItem[];
  checkins: OkrCheckin[];
  updatedAt?: string;
}

// ---- Estrutura por PERÍODO (Q4 2026, Q1 2027, …) ----
export interface OkrPeriod {
  id: string;
  label: string;          // "Q4 2026"
  range: string;          // "01/10/2026 a 31/12/2026"
  objectives: OkrObjective[];
  checkins: OkrCheckin[];
  objSeq?: number;        // maior número de objetivo já emitido neste período (nunca reusa)
}

// O que fica guardado: o portfólio (compartilhado entre períodos) + os períodos.
export interface OkrGovReview {
  id: string;
  date: string;                                  // yyyy-mm-dd
  cadence: 'Semanal' | 'Mensal' | 'Trimestral';
  notes: string;                                 // pauta / decisões
  next: string;                                  // próximos passos
}
export interface OkrGovAction {
  id: string;
  text: string;
  owner: string;                                 // responsável
  due: string;                                   // yyyy-mm-dd
  done: boolean;
}
export interface OkrGovState {
  reviews: OkrGovReview[];
  actions: OkrGovAction[];
}

export interface OkrStore {
  owner: string;
  portfolio: PortfolioItem[];
  periods: OkrPeriod[];
  activePeriodId: string;
  governance?: OkrGovState;   // governança do ciclo (revisões + ações) — do dono
  updatedAt?: string;
  v?: number;                 // marca de formato gravada pelo código novo (ver OKR_FORMAT_VERSION)
}

// Aceita tanto o formato ANTIGO (OkrData: objectives no topo) quanto o novo
// (OkrStore com periods) e sempre devolve um OkrStore.
// Saneia a árvore vinda do banco: quem lê percorre periods → objectives → keyResults
// sem conferir tipo, e um nó nulo derrubava a tela inteira (Linha do tempo, Executores).
// Cada folha no tipo que a tela espera: texto onde se escreve texto (um título
// objeto derrubava o render), número onde se faz conta, lista onde se percorre. O
// que não se reconhece (campos novos) passa intacto. Data gravada errada continua
// visível como texto — a tela a marca como "data inválida" em vez de sumir com ela.
const isObj = (x: any) => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (v: any, def = ''): string => typeof v === 'string' ? v : v == null ? def : typeof v === 'object' ? JSON.stringify(v) : String(v);
const optStr = (v: any): string | undefined => v == null ? undefined : str(v);
const num = (v: any, def = 0): number => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN; return Number.isFinite(n) ? n : def; };
const objs = (v: any): any[] => (Array.isArray(v) ? v : []).filter(isObj);
const FORMATS = new Set(['bin', 'pct', 'num']);
const saneRef = (r: any) => isObj(r) ? { ...r, name: str(r.name), ...(r.id != null ? { id: str(r.id) } : {}) } : r;
const saneKr = (k: any): OkrKeyResult => ({
  ...k,
  id: str(k.id), title: str(k.title), metric: str(k.metric), initiatives: str(k.initiatives), status: str(k.status, 'Não iniciado'),
  notes: optStr(k.notes), uid: optStr(k.uid),
  format: FORMATS.has(k.format) ? k.format : 'num',
  baseline: num(k.baseline), target: num(k.target, 1), current: num(k.current),
  due: str(k.due), ...(k.start != null ? { start: str(k.start) } : {}),
  tasks: objs(k.tasks).map(t => ({ ...t, id: str(t.id), text: str(t.text), done: !!t.done })),
  history: objs(k.history),
  ...(k.executores !== undefined ? { executores: objs(k.executores).map(saneRef) } : {}),
  ...(k.owner != null ? { owner: str(k.owner) } : {}),
});
const sanePeriods = (ps: any[]): OkrPeriod[] => ps.filter(isObj).map((p: any) => ({
  ...p,
  id: str(p.id), label: str(p.label), range: str(p.range),
  objectives: objs(p.objectives).map((o: any) => ({
    ...o,
    id: str(o.id), title: str(o.title),
    responsavel: isObj(o.responsavel) ? saneRef(o.responsavel) : null,
    keyResults: objs(o.keyResults).map(saneKr),
  })),
  checkins: objs(p.checkins).map((c: any) => ({ ...c, id: str(c.id), date: str(c.date), kr: str(c.kr), comment: str(c.comment), next: str(c.next), current: num(c.current) })),
}));
const sanePortfolio = (v: any): PortfolioItem[] => objs(v).map(i => ({ ...i, id: str(i.id), name: str(i.name), what: str(i.what), category: str(i.category), status: str(i.status), nextMilestone: str(i.nextMilestone), url: optStr(i.url) }));
const CADENCES = new Set(['Semanal', 'Mensal', 'Trimestral']);
const saneGov = (g: any): OkrGovState | undefined => isObj(g) ? {
  ...g,
  reviews: objs(g.reviews).map((r: any) => ({ ...r, id: str(r.id), date: str(r.date), cadence: CADENCES.has(r.cadence) ? r.cadence : 'Mensal', notes: str(r.notes), next: str(r.next) })),
  actions: objs(g.actions).map((a: any) => ({ ...a, id: str(a.id), text: str(a.text), owner: str(a.owner), due: str(a.due), done: !!a.done })),
} : undefined;

export const migrateToStore = (raw: any): OkrStore => {
  const periods = raw && Array.isArray(raw.periods) ? sanePeriods(raw.periods) : [];
  if (periods.length) {
    const active = str(raw.activePeriodId);
    return {
      owner: str(raw.owner) || 'Edson Farias',
      // Só cai no portfólio padrão quando o campo NÃO existe. Um array vazio
      // (dono que ainda não preencheu, ex.: Matheus) fica vazio — nunca herda
      // o portfólio de outra pessoa.
      portfolio: Array.isArray(raw.portfolio) ? sanePortfolio(raw.portfolio) : DEFAULT_PORTFOLIO,
      periods,
      activePeriodId: periods.some(p => p.id === active) ? active : periods[0].id,
      governance: saneGov(raw.governance),
      updatedAt: raw.updatedAt,
    };
  }
  if (raw && Array.isArray(raw.objectives)) {
    return {
      owner: str(raw.owner) || 'Edson Farias',
      portfolio: Array.isArray(raw.portfolio) ? sanePortfolio(raw.portfolio) : DEFAULT_PORTFOLIO,
      periods: sanePeriods([{ id: 'q4-2026', label: 'Q4 2026', range: raw.period || '01/10/2026 a 31/12/2026', objectives: raw.objectives, checkins: raw.checkins || [] }]),
      activePeriodId: 'q4-2026',
      updatedAt: raw.updatedAt,
    };
  }
  return DEFAULT_STORE();
};

export const DEFAULT_STORE = (): OkrStore => ({
  owner: DEFAULT_OKR.owner,
  portfolio: DEFAULT_PORTFOLIO,
  periods: [{ id: 'q4-2026', label: 'Q4 2026', range: DEFAULT_OKR.period, objectives: DEFAULT_OKR.objectives, checkins: [] }],
  activePeriodId: 'q4-2026',
});

// Store VAZIO, para um dono que vai preencher o seu próprio OKR do zero
// (ex.: Matheus). Sem portfólio, um objetivo em branco para ele começar.
export const EMPTY_STORE = (owner: string): OkrStore => ({
  owner,
  portfolio: [],
  periods: [{ id: 'q4-2026', label: 'Q4 2026', range: '01/10/2026 a 31/12/2026', objectives: [{ id: 'O1', title: 'Novo objetivo', keyResults: [emptyKr('KR1.1')] }], checkins: [] }],
  activePeriodId: 'q4-2026',
});

// Cria um período novo copiando a ESTRUTURA do atual (KRs), zerando o progresso.
export const clonePeriodStructure = (src: OkrPeriod, label: string, range: string): OkrPeriod => ({
  id: `p${Date.now().toString(36)}`,
  label,
  range,
  checkins: [],
  objectives: src.objectives.map(o => ({
    ...o,
    keyResults: o.keyResults.map(k => ({ ...k, uid: newUid(), current: k.baseline, status: 'Não iniciado', tasks: (k.tasks || []).map(t => ({ ...t, done: false })) })),
  })),
});

// Identidade interna e única do KR (o "KR1.3" é só o rótulo que a pessoa lê).
export const newUid = (): string => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const emptyKr = (id: string): OkrKeyResult => ({ id, uid: newUid(), title: 'Novo resultado-chave', metric: '', baseline: 0, target: 1, current: 0, format: 'bin', due: '', initiatives: '', tasks: [], status: 'Não iniciado' });

// IDs novos NUNCA repetem um já usado: o maior existente, ou o maior JÁ EMITIDO
// (krSeq/objSeq, guardado), + 1. Contar a posição repetia id depois de uma exclusão
// (O1,O3,O4 → "novo" virava O4 de novo), e apagar o último e criar outro devolvia o
// mesmo rótulo — uma tela aberta editava o KR novo achando que era o antigo.
const maxNum = (ids: string[], re: RegExp) => ids.reduce((m, id) => { const x = re.exec(id || ''); return x ? Math.max(m, +x[1]) : m; }, 0);
export const nextObjectiveNum = (p: { objectives: OkrObjective[]; objSeq?: number }): number =>
  Math.max(maxNum(p.objectives.map(o => o.id), /^O(\d+)$/i), Number(p.objSeq) || 0) + 1;
export const nextObjectiveId = (objs: OkrObjective[], objSeq?: number): string => `O${nextObjectiveNum({ objectives: objs, objSeq })}`;
export const nextKrNum = (o: OkrObjective): number => {
  const n = (o.id || '').replace(/\D/g, '') || '0';
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Math.max(maxNum(o.keyResults.map(k => k.id), new RegExp(`^KR${esc}\\.(\\d+)$`, 'i')), Number(o.krSeq) || 0) + 1;
};
export const nextKrId = (o: OkrObjective): string => `KR${(o.id || '').replace(/\D/g, '') || '0'}.${nextKrNum(o)}`;

// ---- Executores ----------------------------------------------------------

// Chave de comparação: sem acento, minúsculo, espaços simples. É a MESMA regra de
// public.okr_norm no banco (NFD + tira toda marca), que o índice único do cadastro
// usa — "Rogério" casa com "Rogerio".
export const normName = (s?: string | null): string =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();

// Quebra o "responsável" legado em nomes: "PCP + TI", "Claudia e RH", "A, B / C".
// O hífen NÃO separa ("Comercial - Geisse" é um nome só). Mesma regra da migração.
export const splitLegacyOwners = (owner?: string): string[] => {
  const out: string[] = []; const seen = new Set<string>();
  (owner || '').split(/\s*[+,;/]\s*|\s+e\s+/i).map(t => t.trim()).filter(Boolean).forEach(t => {
    const k = normName(t); if (!seen.has(k)) { seen.add(k); out.push(t); }
  });
  return out;
};

// Executores de um KR: os gravados; se o KR nunca teve (legado), deriva do texto
// antigo casando com o cadastro. `[]` gravado = nenhum, de propósito (não cai no legado).
export const krExecutores = (kr: OkrKeyResult, registry: OkrExecutor[] = []): OkrPersonRef[] => {
  if (Array.isArray(kr.executores)) return kr.executores.filter(r => r && typeof r.name === 'string');
  const byName = new Map(registry.map(e => [normName(e.name), e] as const));
  const out: OkrPersonRef[] = []; const seen = new Set<string>();
  // Deduplica DEPOIS do alias, pelo id casado — igual à migração SQL
  // ("Geisse / Comercial - Geisse" é uma pessoa só).
  splitLegacyOwners(typeof kr.owner === 'string' ? kr.owner : '').forEach(t => {
    const alias = normName(t) === 'comercial - geisse' ? 'geisse' : normName(t);
    const e = byName.get(alias);
    const key = e ? `id:${e.id}` : `n:${alias}`;
    if (seen.has(key)) return; seen.add(key);
    out.push(e ? { id: e.id, name: e.name, kind: e.kind } : { name: t });
  });
  return out;
};

// Nome a mostrar: o ATUAL do cadastro (acompanha renomeação); sem cadastro ou sem
// id (link público, legado), o nome guardado.
export const refName = (ref: OkrPersonRef, byId?: Map<string, OkrExecutor>): string =>
  (ref.id && byId?.get(ref.id)?.name) || ref.name;

// Data local → "yyyy-mm-dd" (NUNCA toISOString: em UTC-3 perto da meia-noite vira o dia errado).
export const toIsoDate = (d: Date): string =>
  `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// "aaaa-mm-dd" (ou com hora) → Date LOCAL, só se for um dia de verdade entre 2000
// e 2100. Há KR gravado com ano "0026" (digitado errado): `new Date` lia 1926/0026 e
// o arraste gravava lixo. Fora da faixa = sem data (o gráfico usa o período).
// Aceita QUALQUER coisa (o dado vem do banco e pode ter número/objeto no lugar do
// texto): o que não for texto de data válido vira null, nunca exceção.
export const parseIsoDay = (iso?: unknown): Date | null => {
  if (typeof iso !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(iso.trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 2000 || y > 2100) return null;
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? dt : null;
};

// Carimbo de data-hora (ISO com fuso, ex.: histórico gravado em UTC) → o DIA LOCAL.
// Cortar o texto em 10 caracteres dava o dia UTC: depois das 21h em Brasília, o dia seguinte.
export const localDayOf = (ts?: unknown): Date | null => {
  if (typeof ts !== 'string' && typeof ts !== 'number') return null;
  const t = new Date(ts);
  if (isNaN(t.getTime()) || t.getFullYear() < 2000 || t.getFullYear() > 2100) return null;
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
};

// O que está gravado num campo, como texto comparável (o dado do banco pode vir com
// tipo errado: número, objeto). Serve às travas "o banco ainda tem o que a tela mostrava".
export const rawText = (v: unknown): string => typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v);

// "Tem data gravada, mas ela não é uma data de verdade" (ex.: ano "0026").
export const isBadDate = (v?: unknown): boolean => typeof v === 'string' ? (v.trim() !== '' && !parseIsoDay(v)) : (v !== undefined && v !== null && v !== '');

// Portfólio real (inventariado do repositório app/, exceto Michela).
export const DEFAULT_PORTFOLIO: PortfolioItem[] = [
  { id: 'kpi', name: 'KPI Engenharia', what: 'Gestão de projetos, KPIs, paradas e OKR da engenharia', category: 'Sistemas', status: 'Produção', url: 'kpieng.jimpnexus.com', nextMilestone: 'Consolidar OKR + notificações de paradas' },
  { id: 'pedidos', name: 'Pedidos Eletrônicos (Configurador)', what: 'Pedido de venda + ordem de produção do furgão/baú, quantidades por fórmula', category: 'Sistemas', status: 'Produção', url: 'pedidos.jimpnexus.com', nextMilestone: 'Unificar de-para com o ERP e as regras das 43 perguntas' },
  { id: 'appcustos', name: 'APPCUSTOS', what: 'Custeio de produtos com motor próprio, distribuído como .exe', category: 'Sistemas', status: 'Produção', nextMilestone: 'Mapear a análise de custo dos modelos restantes' },
  { id: 'calculista', name: 'JimpNexus Calculista (cálculo estrutural / VPC)', what: 'Verificação estrutural de semirreboques (NBR 9500 / Res. 882), memorial PDF assinado, licenciado', category: 'Engenharia', status: 'Produção', nextMilestone: 'Validar famílias Beta (bobineiro, florestal…) contra as planilhas de referência' },
  { id: 'quality', name: 'QualityTracker', what: 'Liberações, tempo de projeto e ocorrências dos projetistas', category: 'Sistemas', status: 'Produção', url: 'qualitytracker-pied.vercel.app', nextMilestone: 'Migrar para domínio próprio qualidade.jimpnexus.com' },
  { id: 'cmms', name: 'CMMS JIMP (Manutenção)', what: 'Gestão de manutenção industrial: equipamentos, OS, preventivas, QR Code', category: 'Sistemas', status: 'Produção', nextMilestone: 'Deduplicar patrimônios e ajustar prazos de preventiva' },
  { id: 'portal', name: 'Portal Nexus', what: 'Portal interno da engenharia, porta de entrada dos sistemas', category: 'Sistemas', status: 'Produção', url: 'jimpnexus.com', nextMilestone: 'Deploy automático (Vercel) + analytics' },
  { id: 'vendas', name: 'Vendas-NS', what: 'Base de inteligência de vendas: 2.482 fichas históricas para cruzar preço/cliente/config', category: 'Dados', status: 'Ferramenta', nextMilestone: 'Consolidar padrões para alimentar preços e de-para do Configurador' },
  { id: 'plaquetas', name: 'Plaquetas', what: 'Geração de plaquetas de identificação (patrimônio/chassi) + entregas', category: 'Sistemas', status: 'Desenvolvimento', nextMilestone: 'Deploy formal e consolidação da autenticação' },
  { id: 'n8n', name: 'Notificações de paradas (n8n)', what: 'WhatsApp em tempo real de paradas + relatório semanal', category: 'Sistemas', status: 'Desenvolvimento', nextMilestone: 'Trocar o trigger simples pelo robusto (outbox) e subir no n8n' },
];

// Progresso = (atual - baseline) / (meta - baseline), limitado a [0,1].
export const krProgress = (kr: OkrKeyResult): number => {
  const denom = kr.target - kr.baseline;
  if (denom === 0) return kr.current >= kr.target ? 1 : 0;
  const p = (kr.current - kr.baseline) / denom;
  return Math.max(0, Math.min(1, p));
};

export const objProgress = (o: OkrObjective): number => {
  const krs = o.keyResults.filter(k => !k.archived); // arquivados não contam
  if (!krs.length) return 0;
  return krs.reduce((a, k) => a + krProgress(k), 0) / krs.length;
};

export const overallProgress = (d: OkrData): number => {
  const krs = d.objectives.flatMap(o => o.keyResults);
  if (!krs.length) return 0;
  return krs.reduce((a, k) => a + krProgress(k), 0) / krs.length;
};

// Cor por faixa (regra do xlsx): verde >=70%, amarelo 30-69%, vermelho <30%.
export const progressColor = (p: number): 'green' | 'amber' | 'red' => {
  if (p >= 0.7) return 'green';
  if (p >= 0.3) return 'amber';
  return 'red';
};

// Exibe o valor conforme o formato.
export const fmtValue = (v: number, format: OkrFormat): string => {
  if (format === 'pct') return `${Math.round(v * 100)}%`;
  if (format === 'bin') return v >= 1 ? 'Sim' : 'Não';
  return `${v}`;
};

const kr = (
  id: string, title: string, metric: string, target: number, format: OkrFormat,
  due: string, initiatives: string, status: string = 'Não iniciado', notes?: string
): OkrKeyResult => ({ id, title, metric, baseline: 0, target, current: 0, format, due, initiatives, status, notes });

// Semente (Q4 2026) — extraída fielmente do xlsx do Edson.
export const DEFAULT_OKR: OkrData = {
  period: '01/10/2026 a 31/12/2026',
  owner: 'Edson Farias',
  checkins: [],
  portfolio: DEFAULT_PORTFOLIO,
  objectives: [
    {
      id: 'O1',
      title: 'Consolidar a área de Pesquisa e Inovação como função formal da empresa',
      keyResults: [
        kr('KR1.1', 'Aprovar com a direção o documento de escopo da área (missão, portfólio, critérios de priorização e rotina de reporte)', 'Documento aprovado (0/1)', 1, 'bin', '2026-10-31', 'Redigir proposta de escopo; revisar com o diretor; definir cadência de reporte mensal', 'Não iniciado', 'Base para os demais objetivos'),
        { ...kr('KR1.2', 'Cadastrar 100% dos projetos ativos de inovação no portfólio, com dono, status e próximo marco', '% dos projetos cadastrados', 1, 'pct', '2026-11-15', 'Levantar lista completa de projetos (Claude Code, engenharia, sistemas); montar quadro de portfólio', 'Concluído', 'Portfólio cadastrado na própria aba (12 projetos).'), current: 1 },
        kr('KR1.3', 'Concluir e enviar o questionário PINTEC 2025 (IBGE) com evidências de P&D interno documentadas', 'Questionário enviado (0/1)', 1, 'bin', '2026-10-31', 'Finalizar respostas pendentes (15_D e valores de receita/pessoal com contabilidade e RH); enviar', 'Em andamento'),
        kr('KR1.4', 'Avaliar elegibilidade da empresa em 3 mecanismos de fomento à inovação (Lei do Bem, Finep, Embrapii/SENAI)', 'Pareceres concluídos (0 a 3)', 3, 'num', '2026-12-15', 'Levantar requisitos de cada mecanismo; cruzar com o VPC e os sistemas internos; parecer de 1 página por mecanismo'),
      ],
    },
    {
      id: 'O2',
      title: 'Digitalizar a gestão de engenharia e operação com a plataforma JimpNexus',
      keyResults: [
        kr('KR2.1', 'Colocar o app de Custos em produção com 100% dos produtos ativos cadastrados', '% de produtos ativos cadastrados', 1, 'pct', '2026-11-30', 'Fechar regra de separação custo x preço; carga inicial do catálogo; treinamento dos usuários', 'Não iniciado'),
        kr('KR2.2', 'Emitir 80% dos novos pedidos pelo app de Pedidos Eletrônicos', '% de pedidos emitidos no app', 0.8, 'pct', '2026-12-15', 'Concluir versionamento de pedidos; catálogo compartilhado com Custos; piloto com vendas', 'Não iniciado'),
        kr('KR2.3', 'Registrar 100% das não conformidades no QualityTracker, sem planilha paralela', '% de NCs no sistema', 1, 'pct', '2026-11-30', 'Migrar registros remanescentes; definir regra: NC só existe se estiver no sistema', 'Não iniciado'),
        kr('KR2.4', 'Garantir zero perda de dados nos sistemas, com teste de restauração de backup executado mensalmente', 'Testes de restauração executados (0 a 3)', 3, 'num', '2026-12-31', 'Rotina de backup PostgreSQL on-premises e R2; teste de restauração em outubro, novembro e dezembro', 'Não iniciado', '1 teste por mês'),
      ],
    },
    {
      id: 'O3',
      title: 'Acelerar o desenvolvimento de produto com engenharia baseada em simulação',
      keyResults: [
        kr('KR3.1', 'Fechar o ciclo de validação do VPC com relatório consolidado (FEA e vibração) e ações de projeto implementadas', 'Relatório consolidado (0/1)', 1, 'bin', '2026-11-30', 'Consolidar laudos externos; listar alterações de projeto; registrar as implementadas', 'Em andamento', 'VPC fechado (jul/2026): reta + VPC porta-container validados no motor (vpc_jimp.py / vpc_bracos_jimp.py) contra o memorial Samuel 1998 e a PC ESTUDO. Método analítico (viga/seção variável mm a mm), não FEA. Pendência aberta: reforço em diagonal do braço reprova no LNE-38.'),
        kr('KR3.2', 'Reduzir a massa estrutural em 5% em ao menos um modelo, mantidos os requisitos de resistência e durabilidade', '% de redução de massa', 0.05, 'pct', '2026-12-31', 'Selecionar modelo alvo; comparar configurações estruturais; validar por cálculo e simulação', 'Não iniciado', 'Meta de 5% é proposta inicial, ajustar'),
        kr('KR3.3', 'Homologar 2 fornecedores alternativos de componentes críticos com protocolo de teste (lote de 100 unidades)', 'Fornecedores homologados (0 a 2)', 2, 'num', '2026-11-30', 'Iniciar pelo parafuso autoperfurante (Ø4,2 x 25, DIN 7504 P); solicitar amostras; teste de torque e instalação', 'Não iniciado'),
        kr('KR3.4', 'Padronizar o protocolo de homologação de componentes e travar descrições críticas no ERP', 'Protocolo publicado (0/1)', 1, 'bin', '2026-12-15', 'Documento de 2 páginas com etapas, critérios e responsáveis; ajuste das descrições no ERP', 'Não iniciado'),
      ],
    },
    {
      id: 'O4',
      title: 'Estabelecer inteligência tecnológica e parcerias externas',
      keyResults: [
        kr('KR4.1', 'Realizar a visita técnica à China (Liangshan, CIIF, Canton Fair) e entregar relatório de benchmarking com ao menos 10 oportunidades identificadas', 'Oportunidades documentadas (0 a 10)', 10, 'num', '2026-11-15', 'Roteiro de perguntas por fábrica; registro diário durante a viagem (8 a 22/10); relatório em até 3 semanas após o retorno', 'Não iniciado'),
        kr('KR4.2', 'Priorizar 3 oportunidades da viagem com estudo preliminar de viabilidade (custo, prazo, risco)', 'Estudos concluídos (0 a 3)', 3, 'num', '2026-12-15', 'Apresentar as 3 ao diretor com recomendação de seguir ou não', 'Não iniciado'),
        kr('KR4.3', 'Manter relacionamento ativo com 5 fabricantes ou fornecedores chineses, com dossiê por empresa', 'Dossiês criados (0 a 5)', 5, 'num', '2026-12-31', 'Dossiê padrão: contato, produtos, capacidade, preços indicativos, próximo passo', 'Não iniciado'),
        kr('KR4.4', 'Formalizar 1 iniciativa de cooperação com a UFSC Joinville (projeto, TCC orientado ou estágio)', 'Iniciativa formalizada (0/1)', 1, 'bin', '2026-12-31', 'Identificar tema ligado ao VPC ou à redução de massa; alinhar com professor do ECM', 'Não iniciado'),
      ],
    },
  ],
};
