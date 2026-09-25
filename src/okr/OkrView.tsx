import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { withOkrSafe } from './OkrSafe';
import { Target, Flag, CheckCircle2, AlertTriangle, Clock, Plus, Lock, RefreshCw, Layers, Trash2, Share2, Printer, Activity as ActivityIcon, Copy, CalendarDays, ChevronDown, Link2, ExternalLink, UserRound, Archive, ArchiveRestore, History } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, CartesianGrid, Legend } from 'recharts';
import { User, ProjectSession, OperationalActivity, ActivityType } from '../types';
import { addAuditLog, enableOkrShare, fetchPublicOkr, fetchOkrExecutors, fetchOkrVersioned, mutateOkr, okrErrorMessage, OkrStaleError } from '../services/storageService';
import {
  OkrStore, OkrPeriod, OkrKeyResult, OkrObjective, OkrCheckin, PortfolioItem, OkrTask,
  DEFAULT_STORE, EMPTY_STORE, clonePeriodStructure, emptyKr, nextObjectiveNum, nextKrId, nextKrNum,
  krProgress, objProgress, progressColor, fmtValue, OkrFormat, OkrExecutor, OkrPersonRef, krExecutores,
  normName, parseIsoDay, isBadDate, rawText, newUid,
} from './okr';
import { ExecutorMultiPicker, ExecutorSinglePicker } from './ExecutorPicker';
import { useOkrWriter, OkrWriteStatus } from './useOkrWriter';
import { useToast } from '../components/Toast';

const STATUS_OPTIONS = ['Não iniciado', 'Em andamento', 'Em risco', 'Concluído'];
const FORMAT_OPTIONS: { v: OkrFormat; l: string }[] = [{ v: 'bin', l: 'Sim/Não' }, { v: 'pct', l: 'Percentual' }, { v: 'num', l: 'Contagem' }];
const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'];

const barColor = (p: number) => { const c = progressColor(p); return c === 'green' ? 'bg-emerald-500' : c === 'amber' ? 'bg-amber-500' : 'bg-rose-500'; };
const textColor = (p: number) => { const c = progressColor(p); return c === 'green' ? 'text-emerald-600 dark:text-emerald-400' : c === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'; };
const fmtDue = (iso: string) => { try { const [y, m, d] = iso.split('-'); return d ? `${d}/${m}/${y}` : iso; } catch { return iso; } };
const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const periodProgress = (p?: OkrPeriod) => { const krs = (p?.objectives || []).flatMap(o => o.keyResults).filter(k => !k.archived); return krs.length ? krs.reduce((a, k) => a + krProgress(k), 0) / krs.length : 0; };

// Campo editável inline (vira texto no modo leitura). A `key` pelo valor remonta o
// campo quando o valor muda por fora (outra pessoa, releitura) — sem ela o campo
// não controlado continuava mostrando o texto velho.
const EditField: React.FC<{ value: string; onCommit: (v: string) => void; readOnly?: boolean; multiline?: boolean; placeholder?: string; className?: string }> = ({ value, onCommit, readOnly, multiline, placeholder, className }) => {
  if (readOnly) return <span className={className}>{value || placeholder || ''}</span>;
  const common = `bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800/60 focus:bg-white dark:focus:bg-slate-900 rounded px-1 -mx-1 outline-none focus:ring-1 focus:ring-blue-400 w-full ${className || ''}`;
  return multiline
    ? <textarea key={value} defaultValue={value} placeholder={placeholder} rows={2} onBlur={e => { if (e.target.value !== value) onCommit(e.target.value); }} className={`${common} resize-none`} />
    : <input key={value} defaultValue={value} placeholder={placeholder} onBlur={e => { if (e.target.value !== value) onCommit(e.target.value); }} className={common} />;
};

const StatTile: React.FC<{ label: string; value: string; color: string; icon: React.ReactNode }> = ({ label, value, color, icon }) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-slate-700">
    <div className="flex items-center gap-1.5 text-slate-400 mb-1">{icon}<span className="text-[10px] font-bold uppercase tracking-wide">{label}</span></div>
    <div className={`text-2xl font-black tabular-nums ${color}`}>{value}</div>
  </div>
);
const ChartCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-slate-700">
    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">{title}</h4>
    {children}
  </div>
);

interface OkrViewProps {
  currentUser: User;
  projects?: ProjectSession[];
  activities?: OperationalActivity[];
  activityTypes?: ActivityType[];
  readOnly?: boolean;
  external?: OkrStore;
  ownerKey?: string;          // qual OKR (owner_key) carregar/salvar. Padrão: 'edson'.
  heading?: string;           // título no cabeçalho. Padrão: 'Meu OKR'.
  canShare?: boolean;         // mostra o botão de link público. Padrão: !readOnly.
  privacyNote?: string;       // selo de privacidade. Padrão: 'Só você vê'.
  seedEmpty?: boolean;        // ao não existir, cria VAZIO (dono preenche) em vez do padrão do Edson.
  ownerName?: string;         // nome do dono ao criar um store vazio. Padrão: o usuário atual.
  showActivity?: boolean;     // mostra métricas de atividade (liberações/horas). Só o Edson.
}

const OkrViewInner: React.FC<OkrViewProps> = ({ currentUser, projects = [], activities = [], activityTypes = [], readOnly = false, external, ownerKey = 'edson', heading = 'Meu OKR', canShare, privacyNote = 'Só você vê', seedEmpty = false, ownerName, showActivity = false }) => {
  const { addToast } = useToast();
  const [store, setStore] = useState<OkrStore | null>(external || null);
  const [loading, setLoading] = useState(!external);
  const [saving, setSaving] = useState<'idle' | OkrWriteStatus>('idle');
  const [shareLink, setShareLink] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [openObjs, setOpenObjs] = useState<Record<string, boolean>>({}); // KRs recolhidos por padrão
  const toggleObj = (id: string) => setOpenObjs(m => ({ ...m, [id]: !m[id] }));
  const [sharing, setSharing] = useState(false);
  // Cadastro de executores (responsável do objetivo / executores do KR). No link
  // público (external) não há sessão: fica vazio e os nomes gravados aparecem assim mesmo.
  // `registryOk` = o cadastro foi LIDO. Enquanto não, os seletores ficam só leitura:
  // editar sem o cadastro gravaria nomes soltos, sem id, desligados dele para sempre.
  const [registry, setRegistry] = useState<OkrExecutor[]>([]);
  const [registryOk, setRegistryOk] = useState(false);
  const registryWarned = useRef(false);
  const loadRegistry = useCallback(() => {
    if (external) return;
    fetchOkrExecutors().then(r => { setRegistry(r); setRegistryOk(true); registryWarned.current = false; }).catch(() => {
      setRegistryOk(false);
      // Avisa UMA vez (e tenta de novo ao voltar para a aba): sem isto os seletores
      // ficavam só leitura, calados, parecendo "você não pode editar".
      if (!registryWarned.current) { registryWarned.current = true; addToast('Não consegui ler o cadastro de executores — a escolha de responsável/executores fica bloqueada até conseguir (tento de novo quando você voltar para esta aba).', 'warning'); }
    });
  }, [external, addToast]);
  useEffect(() => { loadRegistry(); }, [loadRegistry]);
  useEffect(() => {
    if (external || registryOk) return;
    const retry = () => { if (document.visibilityState === 'visible') loadRegistry(); };
    window.addEventListener('focus', retry); window.addEventListener('online', retry);
    return () => { window.removeEventListener('focus', retry); window.removeEventListener('online', retry); };
  }, [external, registryOk, loadRegistry]);

  const { persist: write, adopt, readMark } = useOkrWriter({
    ownerKey, enabled: !readOnly && !external, live: !external,
    setStore, onError: msg => addToast(msg, 'error'),
    onStatus: st => { setSaving(st); if (st === 'saved') setTimeout(() => setSaving(s => s === 'saved' ? 'idle' : s), 1500); },
  });

  useEffect(() => {
    if (external) { setStore(external); setLoading(false); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const mark = readMark();
        const { store: s } = await fetchOkrVersioned(ownerKey);
        if (!alive) return;
        if (s && s.periods?.length) setStore(adopt(s, mark));
        else if (readOnly) setStore(null); // quem só olha não cria; mostra "ainda não criou"
        else {
          // Cria SÓ se não existir (se alguém criou no meio, fica o dele). Erro de leitura
          // cai no catch e não cria nada — antes, uma falha de rede semeava o padrão por
          // cima de um OKR existente.
          const d = seedEmpty ? EMPTY_STORE(ownerName || currentUser.name || currentUser.username) : DEFAULT_STORE();
          const r = await mutateOkr(ownerKey, x => (x === d ? { ...d } : x), { createIfMissing: () => d });
          if (alive) setStore(adopt(r?.store ?? null) ?? d);
        }
      } catch (e) {
        if (alive) { setStore(null); addToast(okrErrorMessage(e, 'Não consegui carregar o OKR.'), 'error'); }
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [ownerKey, readOnly, seedEmpty, external]);

  // Devolve se ficou GRAVADO (true) — formulário só esquece o texto quando gravou.
  const persist = useCallback((mut: (s: OkrStore) => OkrStore | null): Promise<boolean> => readOnly ? Promise.resolve(false) : write(mut), [readOnly, write]);

  const active = useMemo(() => store?.periods.find(p => p.id === store.activePeriodId) || store?.periods[0], [store]);

  // Muda um período. As mudanças são reaplicadas sobre o OKR RELIDO do banco, então
  // acham o período pelo id (não "o ativo de lá") e desistem (null) se ele sumiu.
  const patchPeriod = (pid: string, fn: (p: OkrPeriod) => OkrPeriod | null) => persist(s => {
    const i = s.periods.findIndex(p => p.id === pid); if (i < 0) return null;
    const np = fn(s.periods[i]); if (!np) return null; if (np === s.periods[i]) return s;
    const periods = s.periods.slice(); periods[i] = np; return { ...s, periods };
  });
  const patchActive = (fn: (p: OkrPeriod) => OkrPeriod | null): Promise<boolean> => active ? patchPeriod(active.id, fn) : Promise.resolve(false);
  const updateObjWith = (objId: string, fn: (o: OkrObjective) => OkrObjective) =>
    patchActive(p => p.objectives.some(o => o.id === objId) ? { ...p, objectives: p.objectives.map(o => o.id === objId ? fn(o) : o) } : null);
  // O KR é achado pelo rótulo E pela identidade (uid) que a tela mostrava: se o KR1.3
  // foi apagado e outro KR1.3 nasceu no lugar, a edição feita na tela velha não cai
  // calada no KR novo — desiste e avisa.
  type KrRef = { id: string; uid?: string };
  const sameKr = (k: OkrKeyResult, r: KrRef) => k.id === r.id && rawText(k.uid) === rawText(r.uid);
  const updateKrWith = (objId: string, kr: KrRef, fn: (k: OkrKeyResult) => OkrKeyResult) =>
    patchActive(p => {
      let hit = false, changed = false;
      const objectives = p.objectives.map(o => o.id !== objId ? o : { ...o, keyResults: o.keyResults.map(k => { if (!sameKr(k, kr)) return k; hit = true; const nk = fn(k); if (nk !== k) changed = true; return nk; }) });
      if (!hit) return null;
      return changed ? { ...p, objectives } : p;
    });
  const updateKr = (objId: string, kr: KrRef, patch: Partial<OkrKeyResult>) => updateKrWith(objId, kr, k => ({ ...k, ...patch }));
  // Muda o progresso E registra um ponto no histórico do KR (o histórico do KR
  // ATUAL do banco — não o da foto desta tela, que perderia pontos de outra pessoa).
  const setProgress = (objId: string, kr: OkrKeyResult, current: number, patch: Partial<OkrKeyResult> = {}) => {
    if (current === kr.current && Object.keys(patch).length === 0) return;
    const point = { date: new Date().toISOString(), value: current, by: currentUser.name };
    updateKrWith(objId, kr, k => {
      const hist = Array.isArray(k.history) ? k.history : [];
      if (hist.some(pt => pt.date === point.date && pt.value === point.value)) return k;   // já gravado (nova tentativa)
      if (current === k.current && Object.keys(patch).length === 0) return k;
      return { ...k, current, history: [...hist, point], ...patch };
    });
  };
  // Log de auditoria de EXCLUSÕES dentro do OKR (quem apagou o quê e de quem).
  const logDelete = (entity: string, name: string) => {
    try {
      addAuditLog({
        userId: currentUser.id,
        userName: `${currentUser.name}${currentUser.surname ? ' ' + currentUser.surname : ''}`.trim(),
        action: 'DELETE' as any, entityType: 'OKR', entityId: ownerKey, entityName: name || entity,
        details: `${currentUser.name} excluiu ${entity}${name ? ` "${name}"` : ''} no OKR de ${store?.owner || ownerKey}`,
      });
    } catch { /* auditoria nunca trava a ação */ }
  };
  const updateObj = (objId: string, patch: Partial<OkrObjective>) => updateObjWith(objId, o => ({ ...o, ...patch }));
  // O id do KR/objetivo novo é escolhido UMA vez, aqui (o que a tela mostra é o que
  // vai para o banco). Se outra pessoa criou o mesmo id no meio, NÃO renumera por
  // conta: desiste e avisa — renumerar mandaria a próxima edição (feita no id que a
  // tela mostrava) para o KR da outra pessoa.
  const addKr = (objId: string) => {
    const o0 = active?.objectives.find(o => o.id === objId); if (!o0) return;
    const num = nextKrNum(o0); const kr = emptyKr(nextKrId(o0));
    updateObjWith(objId, o => {
      if (o.keyResults.some(k => k.uid === kr.uid)) return o;  // já gravado (a resposta se perdeu e esta é a nova tentativa)
      if (o.keyResults.some(k => k.id === kr.id) || nextKrNum(o) > num) throw new OkrStaleError(`Outra pessoa acabou de criar um KR neste objetivo — a tela foi atualizada. Clique em "Adicionar resultado-chave" de novo.`);
      return { ...o, krSeq: num, keyResults: [...o.keyResults, kr] };
    });
  };
  const removeKr = (objId: string, kr: KrRef) => updateObjWith(objId, o => {
    if (!o.keyResults.some(k => sameKr(k, kr))) return o;
    // guarda o maior número já usado: o próximo KR não reaproveita o rótulo apagado
    return { ...o, krSeq: Math.max(Number(o.krSeq) || 0, nextKrNum(o) - 1), keyResults: o.keyResults.filter(k => !sameKr(k, kr)) };
  });
  const addObjective = () => {
    if (!active) return;
    const num = nextObjectiveNum(active); const id = `O${num}`; const uid = newUid();
    patchActive(p => {
      if (p.objectives.some(o => o.uid === uid)) return p;   // já gravado (nova tentativa)
      if (p.objectives.some(o => o.id === id) || nextObjectiveNum(p) > num) throw new OkrStaleError('Outra pessoa acabou de criar um objetivo neste período — a tela foi atualizada. Clique em "Adicionar objetivo" de novo.');
      return { ...p, objSeq: num, objectives: [...p.objectives, { id, uid, title: 'Novo objetivo', keyResults: [] }] };
    });
  };
  const removeObjective = (objId: string) => patchActive(p => {
    if (!p.objectives.some(o => o.id === objId)) return p;
    return { ...p, objSeq: Math.max(Number(p.objSeq) || 0, nextObjectiveNum(p) - 1), objectives: p.objectives.filter(o => o.id !== objId) };
  });
  // Executores: acrescentar/tirar UM, sobre a lista atual do banco (gravar a lista
  // inteira da tela apagava o executor que outra pessoa acabou de pôr).
  const sameRef = (a: OkrPersonRef, b: OkrPersonRef) => (a.id && b.id) ? a.id === b.id : normName(a.name) === normName(b.name);
  const addExecutor = (objId: string, kr: KrRef, ref: OkrPersonRef) => updateKrWith(objId, kr, k => {
    const cur = krExecutores(k, registry);
    if (cur.some(r => sameRef(r, ref))) return k;
    // um legado/órfão com o mesmo nome é trocado pelo do cadastro
    return { ...k, executores: [...cur.filter(r => !(normName(r.name) === normName(ref.name) && r.id !== ref.id && (!r.id || !registry.some(e => e.id === r.id)))), ref] };
  });
  const removeExecutor = (objId: string, kr: KrRef, ref: OkrPersonRef) => updateKrWith(objId, kr, k => {
    const cur = krExecutores(k, registry); const next = cur.filter(r => !sameRef(r, ref));
    return next.length === cur.length && Array.isArray(k.executores) ? k : { ...k, executores: next };
  });
  // Datas do KR pelo campo: só grava se a data do banco ainda for a que a tela
  // mostrava (senão desfaria calado um prazo arrastado na linha do tempo), e só
  // data de verdade (2000–2100) — já há KR com ano "0026" digitado.
  const setKrDate = (objId: string, k: OkrKeyResult, field: 'start' | 'due', value: string, input: HTMLInputElement) => {
    const shown = rawText(k[field]);                                           // o que está gravado (texto cru)
    const displayed = parseIsoDay(k[field]) ? shown : '';                      // o que o campo mostra
    if (value === displayed) return;                                           // só passou pelo campo
    if (value && !parseIsoDay(value)) { addToast('Data inválida — use um dia entre 2000 e 2100.', 'warning'); input.value = displayed; return; }
    updateKrWith(objId, k, kk => {
      if (rawText(kk[field]) === value) return kk;               // já gravado (nova tentativa)
      if (rawText(kk[field]) !== shown) throw new OkrStaleError(`A data do ${k.id} foi mudada por outra pessoa (ou na linha do tempo) enquanto a tela estava aberta — nada foi gravado. A tela foi atualizada; confira e ajuste de novo.`);
      return { ...kk, [field]: value };
    });
  };

  // Períodos
  const switchPeriod = (id: string) => persist(s => s.periods.some(p => p.id === id) ? (s.activePeriodId === id ? s : { ...s, activePeriodId: id }) : null);
  const addPeriod = () => {
    if (!store || !active) return;
    const label = window.prompt('Nome do novo período (ex.: Q1 2027):', 'Q1 2027');
    if (!label) return;
    const range = window.prompt('Intervalo (ex.: 01/01/2027 a 31/03/2027):', '') || '';
    const srcId = active.id;
    // O período novo é montado UMA vez, aqui: a tela e o banco recebem o mesmo (ids e
    // identidades dos KRs iguais). Montar dentro da mudança sorteava identidades novas
    // no banco, e editar um KR do período recém-criado era recusado.
    const np = clonePeriodStructure(active, label.trim(), range.trim());
    persist(s => {
      if (s.periods.some(p => p.id === np.id)) return s;        // já gravado (nova tentativa)
      if (!s.periods.some(p => p.id === srcId)) return null;
      return { ...s, periods: [...s.periods, np], activePeriodId: np.id };
    });
    addToast(`Período "${label}" criado (estrutura copiada, progresso zerado).`, 'success');
  };
  const removePeriod = () => {
    if (!store || !active || store.periods.length <= 1) return;
    if (!window.confirm(`Excluir o período "${active.label}"?`)) return;
    logDelete('período', active.label);
    const pid = active.id;
    persist(s => {
      const rest = s.periods.filter(p => p.id !== pid);
      if (rest.length === s.periods.length || rest.length === 0) return null;
      return { ...s, periods: rest, activePeriodId: s.activePeriodId === pid ? rest[0].id : s.activePeriodId };
    });
  };
  const updatePeriodMeta = (patch: Partial<OkrPeriod>) => patchActive(p => ({ ...p, ...patch }));
  const mutatePortfolio = (fn: (pf: PortfolioItem[]) => PortfolioItem[]) => persist(s => { const pf = Array.isArray(s.portfolio) ? s.portfolio : []; const n = fn(pf); return n === pf ? s : { ...s, portfolio: n }; });

  const handleShare = async () => {
    if (sharing) return; setSharing(true);
    try {
      const token = await enableOkrShare(ownerKey);
      const link = `${window.location.origin}/?okr=${token}`;
      setShareLink(link);
      try { await navigator.clipboard.writeText(link); addToast('Link copiado! Quem abrir só visualiza.', 'success'); } catch { addToast('Link gerado.', 'success'); }
    } catch { addToast('Não consegui gerar o link.', 'error'); } finally { setSharing(false); }
  };
  const handleExport = () => window.print();

  // ---- métricas de atividade (minhas) ----
  const activity = useMemo(() => {
    const uid = currentUser.id;
    const myProjects = (projects || []).filter(p => p.userId === uid && p.status === 'COMPLETED');
    const typeName: Record<string, string> = {}; (activityTypes || []).forEach(t => { typeName[t.id] = t.name; });
    // Ausência/intervalo (folga, falta, atestado, férias, feriado, almoço) NÃO é
    // hora de trabalho: fica fora do gráfico "minhas horas" e do total de horas.
    const isAbsence = (name?: string) => !!name && /folga|falta|atestado|f[ée]rias|feriado|almo[çc]o/i.test(name);
    const myActs = (activities || []).filter(a => a.userId === uid);
    const workActs = myActs.filter(a => !isAbsence(typeName[a.activityTypeId]));
    const byType: Record<string, number> = {}; workActs.forEach(a => { const k = typeName[a.activityTypeId] || 'Outros'; byType[k] = (byType[k] || 0) + (a.durationSeconds || 0); });
    const hoursByType = Object.entries(byType).map(([name, s]) => ({ name, horas: +(s / 3600).toFixed(1) })).sort((a, b) => b.horas - a.horas).slice(0, 8);
    const months: { key: string; label: string; n: number }[] = []; const now = new Date();
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('pt-BR', { month: 'short' }), n: 0 }); }
    myProjects.forEach(p => { const d = p.endTime ? new Date(p.endTime) : new Date(p.startTime); const m = months.find(x => x.key === `${d.getFullYear()}-${d.getMonth()}`); if (m) m.n++; });
    const totalHoras = workActs.reduce((a, x) => a + (x.durationSeconds || 0), 0) / 3600 + myProjects.reduce((a, x) => a + (x.totalActiveSeconds || 0), 0) / 3600;
    const horasExtra = (workActs.filter(a => a.isOvertime).reduce((a, x) => a + (x.durationSeconds || 0), 0) + myProjects.filter(p => p.isOvertime).reduce((a, x) => a + (x.totalActiveSeconds || 0), 0)) / 3600;
    return { liberacoes: myProjects.length, totalHoras: Math.round(totalHoras), horasExtra: +horasExtra.toFixed(1), hoursByType, libByMonth: months.map(m => ({ name: m.label, liberações: m.n })) };
  }, [projects, activities, activityTypes, currentUser.id]);

  const overall = useMemo(() => periodProgress(active), [active]);
  const objChart = useMemo(() => (active?.objectives || []).map(o => ({ name: o.id, progresso: Math.round(objProgress(o) * 100) })), [active]);
  const krStatusChart = useMemo(() => {
    const krs = (active?.objectives || []).flatMap(o => o.keyResults);
    const b = { 'Concluído': 0, 'Em andamento': 0, 'Em risco': 0, 'Não iniciado': 0 } as Record<string, number>;
    krs.forEach(k => { const p = krProgress(k); if (p >= 1 || k.status === 'Concluído') b['Concluído']++; else if (k.status === 'Em risco') b['Em risco']++; else if (k.status === 'Em andamento' || p > 0) b['Em andamento']++; else b['Não iniciado']++; });
    return Object.entries(b).map(([name, value]) => ({ name, value }));
  }, [active]);
  const pfChart = useMemo(() => { const b: Record<string, number> = {}; (store?.portfolio || []).forEach(i => { b[i.status] = (b[i.status] || 0) + 1; }); return Object.entries(b).map(([name, value]) => ({ name, value })); }, [store]);
  const totals = useMemo(() => { const krs = (active?.objectives || []).flatMap(o => o.keyResults); return { krs: krs.length, done: krs.filter(k => krProgress(k) >= 1 || k.status === 'Concluído').length, risk: krs.filter(k => k.status === 'Em risco').length }; }, [active]);

  if (loading) return <div className="p-10 text-center text-slate-400"><RefreshCw className="animate-spin inline mr-2" size={18} /> Carregando o OKR…</div>;
  if (!store || !active) return (
    <div className="p-10 text-center text-slate-400">
      {readOnly ? <>Este colaborador ainda não criou o OKR dele.</> : <>Não consegui carregar o OKR.</>}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700 border-l-4 border-l-blue-500">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-md"><Target size={22} /></div>
            <div className="min-w-0">
              <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-slate-400 dark:text-slate-500">OKR · <span className="text-orange-500 dark:text-orange-400">Gestão</span></p>
              <h2 className="text-xl font-black text-slate-800 dark:text-white leading-tight">{heading}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{store.owner}</p>
            </div>
            {readOnly
              ? <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-1"><Lock size={11} /> Só leitura</span>
              : privacyNote && <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-full px-2 py-1"><Lock size={11} /> {privacyNote}</span>}
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <div className={`text-3xl font-black tabular-nums ${textColor(overall)}`}>{Math.round(overall * 100)}%</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Progresso · {active.label}</div>
            </div>
            <div className="w-14 h-14 rounded-full grid place-items-center" style={{ background: `conic-gradient(currentColor ${overall * 360}deg, rgba(148,163,184,.2) 0deg)` }}>
              <div className={`w-11 h-11 rounded-full bg-white dark:bg-slate-900 grid place-items-center ${textColor(overall)}`}><Flag size={16} /></div>
            </div>
          </div>
        </div>

        {/* Seletor de período + ações */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <CalendarDays size={16} className="text-slate-400" />
          <select value={active.id} onChange={e => switchPeriod(e.target.value)} className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark]">
            {store.periods.map(p => <option key={p.id} value={p.id}>{p.label} · {Math.round(periodProgress(p) * 100)}%</option>)}
          </select>
          {!readOnly && <button onClick={addPeriod} className="flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline no-print"><Plus size={14} /> Novo período</button>}
          {!readOnly && store.periods.length > 1 && <button onClick={removePeriod} className="text-xs text-slate-400 hover:text-rose-500 no-print" title="Excluir período"><Trash2 size={13} /></button>}
          <span className="text-[11px] text-slate-400 ml-1">
            {!readOnly && <><EditField value={active.range} onCommit={v => updatePeriodMeta({ range: v })} placeholder="intervalo…" className="text-[11px] text-slate-400 inline-block max-w-[220px]" /></>}
            {readOnly && active.range}
          </span>

          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ml-auto">{active.objectives.length} obj · {totals.krs} KRs</span>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">{totals.done} feitos</span>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400">{totals.risk} em risco</span>
          <span className={`text-[11px] font-medium ${saving === 'offline' || saving === 'error' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`} role="status">{saving === 'saving' ? 'salvando…' : saving === 'saved' ? 'salvo ✓' : saving === 'offline' ? 'sem conexão — tentando salvar de novo…' : saving === 'error' ? 'não salvo' : ''}</span>
          {!readOnly && (
            <div className="flex items-center gap-2 no-print">
              <button onClick={handleExport} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"><Printer size={14} /> Exportar</button>
              {canShare && <button onClick={handleShare} disabled={sharing} className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"><Share2 size={14} /> {sharing ? 'Gerando…' : 'Compartilhar'}</button>}
            </div>
          )}
        </div>
        {shareLink && (
          <div className="mt-3 flex items-center gap-2 p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 no-print">
            <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 shrink-0">Link (só leitura):</span>
            <input readOnly value={shareLink} onFocus={e => e.target.select()} className="flex-1 min-w-0 bg-transparent text-xs text-slate-600 dark:text-slate-300 outline-none" />
            <button onClick={() => { navigator.clipboard?.writeText(shareLink); addToast('Copiado!', 'success'); }} className="shrink-0 text-blue-600 dark:text-blue-400"><Copy size={14} /></button>
          </div>
        )}
      </div>

      {/* Painel visual */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Progresso" value={`${Math.round(overall * 100)}%`} color={textColor(overall)} icon={<Flag size={16} />} />
        {showActivity && <StatTile label="Liberações (minhas)" value={`${activity.liberacoes}`} color="text-blue-600 dark:text-blue-400" icon={<CheckCircle2 size={16} />} />}
        {showActivity && <StatTile label="Horas no período" value={`${activity.totalHoras}h`} color="text-slate-700 dark:text-slate-200" icon={<Clock size={16} />} />}
        {showActivity && <StatTile label="Horas extra" value={`${activity.horasExtra}h`} color="text-amber-600 dark:text-amber-400" icon={<ActivityIcon size={16} />} />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Progresso por objetivo">
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={objChart} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => `${v}%`} />
              <Bar dataKey="progresso" radius={[6, 6, 0, 0]}>{objChart.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Status dos KRs">
          <ResponsiveContainer width="100%" height={190}>
            <PieChart>
              <Pie data={krStatusChart} dataKey="value" nameKey="name" innerRadius={42} outerRadius={72} paddingAngle={2}>
                {krStatusChart.map((e, i) => <Cell key={i} fill={e.name === 'Concluído' ? '#10b981' : e.name === 'Em andamento' ? '#f59e0b' : e.name === 'Em risco' ? '#ef4444' : '#94a3b8'} />)}
              </Pie><Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Portfólio por status">
          <ResponsiveContainer width="100%" height={190}>
            <PieChart>
              <Pie data={pfChart} dataKey="value" nameKey="name" innerRadius={42} outerRadius={72} paddingAngle={2}>{pfChart.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        {showActivity && (<>
          <ChartCard title="Minhas horas por atividade">
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={activity.hoursByType} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={40} /><YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => `${v} h`} /><Bar dataKey="horas" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Minhas liberações por mês">
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={activity.libByMonth} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="liberações" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </>)}
      </div>

      {/* Objetivos (editáveis) */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Objetivos & resultados-chave</h3>
        <div className="flex gap-3">
          <button onClick={() => setOpenObjs(Object.fromEntries(active.objectives.map(o => [o.id, true])))} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">Expandir tudo</button>
          <button onClick={() => setOpenObjs({})} className="text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">Recolher tudo</button>
        </div>
      </div>
      {active.objectives.map(o => {
        const op = objProgress(o);
        return (
          <div key={o.id} className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-slate-700">
            <div className="flex items-start gap-3 mb-4">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 grid place-items-center font-black">{o.id}</div>
              <div className="flex-1 min-w-0">
                <EditField value={o.title} onCommit={v => updateObj(o.id, { title: v })} readOnly={readOnly} className="text-base font-bold text-slate-800 dark:text-white leading-snug" placeholder="Objetivo…" />
                <div className="mt-1 flex flex-wrap items-center gap-1.5 min-w-0 text-[11px] text-slate-400" title="Responsável pelo objetivo">
                  <UserRound size={11} /> <span className="font-bold uppercase tracking-wide text-[10px]">Responsável</span>
                  <ExecutorSinglePicker value={o.responsavel} registry={registry} readOnly={readOnly || !registryOk} onChange={v => updateObj(o.id, { responsavel: v })} />
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className={`h-full rounded-full ${barColor(op)} transition-all duration-500`} style={{ width: `${op * 100}%` }} /></div>
                  <span className={`text-sm font-black tabular-nums ${textColor(op)}`}>{Math.round(op * 100)}%</span>
                </div>
              </div>
              <button onClick={() => toggleObj(o.id)} className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 px-2 py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800" title={openObjs[o.id] ? 'Recolher KRs' : 'Mostrar KRs'}>
                <span className="tabular-nums">{o.keyResults.filter(k => !k.archived).length} KRs</span>
                <ChevronDown size={16} className={`transition-transform ${openObjs[o.id] ? 'rotate-180' : ''}`} />
              </button>
              {!readOnly && <button onClick={() => { if (window.confirm(`Excluir o objetivo ${o.id}?`)) { logDelete(`objetivo ${o.id}`, o.title); removeObjective(o.id); } }} className="text-slate-300 hover:text-rose-500 shrink-0" title="Excluir objetivo"><Trash2 size={15} /></button>}
            </div>

            {openObjs[o.id] && <div className="space-y-3">
              {o.keyResults.map(k => {
                if (k.archived && !showArchived) return null;
                const p = krProgress(k);
                return (
                  <div key={k.id} className={`rounded-xl border border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-800/30 p-4 ${k.archived ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
                          <span className="text-[11px] font-black text-blue-600 dark:text-blue-400">{k.id}{k.archived && <span className="ml-1 text-[9px] uppercase text-amber-500 font-bold">arquivado</span>}</span>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1" title="Período (início → fim)"><Clock size={11} />
                            {readOnly
                              ? <>{k.start ? fmtDue(k.start) : '—'} → {k.due ? fmtDue(k.due) : '—'}</>
                              : <><input key={`s:${k.start || ''}`} type="date" min="2000-01-01" max="2100-12-31" defaultValue={parseIsoDay(k.start) ? k.start : ''} onBlur={e => setKrDate(o.id, k, 'start', e.target.value, e.target)} className={`bg-transparent text-[11px] outline-none [color-scheme:light] dark:[color-scheme:dark] ${isBadDate(k.start) ? 'text-rose-500' : 'text-slate-400'}`} title={isBadDate(k.start) ? `Início gravado inválido ("${k.start}") — escolha a data certa` : 'Início'} /><span className="text-slate-300">→</span><input key={`d:${k.due || ''}`} type="date" min="2000-01-01" max="2100-12-31" defaultValue={parseIsoDay(k.due) ? k.due : ''} onBlur={e => setKrDate(o.id, k, 'due', e.target.value, e.target)} className={`bg-transparent text-[11px] outline-none [color-scheme:light] dark:[color-scheme:dark] ${isBadDate(k.due) ? 'text-rose-500' : 'text-slate-400'}`} title={isBadDate(k.due) ? `Prazo gravado inválido ("${k.due}") — escolha a data certa` : 'Fim'} /></>}
                            {(isBadDate(k.start) || isBadDate(k.due)) && <span className="text-[10px] font-bold text-rose-500" title={`Data gravada inválida: ${[isBadDate(k.start) && `início "${k.start}"`, isBadDate(k.due) && `prazo "${k.due}"`].filter(Boolean).join(', ')}`}>data inválida</span>}
                          </span>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1 flex-wrap min-w-0" title="Executores do KR (pessoas e equipes)"><span className="font-bold uppercase tracking-wide text-[10px]">Executores</span>
                            <ExecutorMultiPicker value={krExecutores(k, registry)} registry={registry} readOnly={readOnly || !registryOk} onAdd={ref => addExecutor(o.id, k, ref)} onRemove={ref => removeExecutor(o.id, k, ref)} />
                          </span>
                        </div>
                        <EditField value={k.title} onCommit={v => updateKr(o.id, k, { title: v })} readOnly={readOnly} multiline className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-0.5 block" placeholder="Resultado-chave…" />
                        <EditField value={k.metric} onCommit={v => updateKr(o.id, k, { metric: v })} readOnly={readOnly} className="text-[11px] text-slate-400 mt-0.5 block" placeholder="métrica (ex.: % concluído)" />
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-sm font-black tabular-nums ${textColor(p)}`}>{Math.round(p * 100)}%</span>
                        {!readOnly && <button onClick={() => { if (window.confirm(`Excluir o ${k.id}?`)) { logDelete(`resultado-chave ${k.id}`, k.title); removeKr(o.id, k); } }} className="text-slate-300 hover:text-rose-500" title="Excluir KR"><Trash2 size={13} /></button>}
                      </div>
                    </div>

                    <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className={`h-full rounded-full ${barColor(p)} transition-all duration-500`} style={{ width: `${p * 100}%` }} /></div>

                    {/* Edição de progresso */}
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Atual</span>
                        {k.format === 'bin' ? (
                          <button disabled={readOnly} onClick={() => setProgress(o.id, k, k.current >= 1 ? 0 : 1, { status: k.current >= 1 ? 'Em andamento' : 'Concluído' })} className={`px-3 py-1 rounded-lg text-xs font-bold ${k.current >= 1 ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'} ${readOnly ? 'cursor-default' : ''}`}>{k.current >= 1 ? 'Feito' : 'Marcar feito'}</button>
                        ) : k.format === 'pct' ? (
                          <div className="flex items-center gap-1">
                            <input key={`c:${k.current}`} type="number" min={0} max={100} disabled={readOnly} defaultValue={Math.round(k.current * 100)} onBlur={e => setProgress(o.id, k, Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) / 100)} className="w-20 px-2 py-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" /><span className="text-slate-400 text-sm">%</span>
                          </div>
                        ) : (
                          <input key={`c:${k.current}`} type="number" min={0} disabled={readOnly} defaultValue={k.current} onBlur={e => setProgress(o.id, k, Math.max(0, parseFloat(e.target.value) || 0))} className="w-20 px-2 py-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
                        )}
                        {!readOnly ? (
                          <span className="flex items-center gap-1 text-[11px] text-slate-400">meta <input key={`t:${k.target}`} type="number" disabled={readOnly} defaultValue={k.target} onBlur={e => updateKr(o.id, k, { target: parseFloat(e.target.value) || 1 })} className="w-14 px-1.5 py-0.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded text-[11px] outline-none" /></span>
                        ) : <span className="text-[11px] text-slate-400">meta {fmtValue(k.target, k.format)}</span>}
                      </div>
                      {!readOnly && (
                        <select value={k.format} onChange={e => updateKr(o.id, k, { format: e.target.value as OkrFormat })} className="px-2 py-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-[11px] text-slate-500 outline-none [color-scheme:light] dark:[color-scheme:dark]" title="Tipo da métrica">
                          {FORMAT_OPTIONS.map(f => <option key={f.v} value={f.v}>{f.l}</option>)}
                        </select>
                      )}
                      <select value={k.status} disabled={readOnly} onChange={e => updateKr(o.id, k, { status: e.target.value })} className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark]">
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        {!STATUS_OPTIONS.includes(k.status) && <option value={k.status}>{k.status}</option>}
                      </select>
                      {!readOnly && (k.archived
                        ? <button onClick={() => updateKr(o.id, k, { archived: false })} className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"><ArchiveRestore size={13} /> Desarquivar</button>
                        : <button onClick={() => { if (window.confirm(`Arquivar o ${k.id}? Ele some da lista e para de contar no progresso — dá para desarquivar depois.`)) updateKr(o.id, k, { archived: true }); }} className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40"><Archive size={13} /> Arquivar</button>)}
                    </div>

                    {/* Iniciativas e Observações (editáveis) */}
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Iniciativas</span>
                        <EditField value={k.initiatives} onCommit={v => updateKr(o.id, k, { initiatives: v })} readOnly={readOnly} multiline placeholder="—" className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 block" />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Observações</span>
                        <EditField value={k.notes || ''} onCommit={v => updateKr(o.id, k, { notes: v })} readOnly={readOnly} multiline placeholder="—" className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 block" />
                      </div>
                    </div>

                    <KrTasks kr={k} readOnly={readOnly} onMutate={fn => updateKrWith(o.id, k, kk => { const ts = Array.isArray(kk.tasks) ? kk.tasks : []; const n = fn(ts); return n === ts ? kk : { ...kk, tasks: n }; })} onDeleteLog={t => logDelete(`atividade do ${k.id}`, t)} />
                    <KrHistory kr={k} />
                  </div>
                );
              })}
              <div className="flex items-center gap-4 mt-1">
                {!readOnly && <button onClick={() => addKr(o.id)} className="flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"><Plus size={14} /> Adicionar resultado-chave</button>}
                {o.keyResults.some(k => k.archived) && <button onClick={() => setShowArchived(s => !s)} className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><Archive size={12} /> {showArchived ? 'Ocultar arquivados' : `Mostrar ${o.keyResults.filter(k => k.archived).length} arquivado(s)`}</button>}
              </div>
            </div>}
          </div>
        );
      })}

      {!readOnly && <button onClick={addObjective} className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"><Plus size={16} /> Adicionar objetivo</button>}

      <PortfolioPanel portfolio={store.portfolio} onMutate={mutatePortfolio} readOnly={readOnly} onDeleteLog={name => logDelete('projeto do portfólio', name)} />

      {!readOnly && <CheckinsPanel period={active} allKrs={active.objectives.flatMap(o => o.keyResults)} onAdd={c => patchActive(p => (p.checkins || []).some(x => x.id === c.id) ? p : ({ ...p, checkins: [c, ...(p.checkins || [])] }))} currentUser={currentUser} />}
    </div>
  );
};

// Checklist de atividades por KR
// As mudanças são funções (onMutate) aplicadas à lista ATUAL do banco — marcar uma
// atividade não desfaz a que outra pessoa acabou de acrescentar.
const KrTasks: React.FC<{ kr: OkrKeyResult; readOnly?: boolean; onMutate: (fn: (tasks: OkrTask[]) => OkrTask[]) => Promise<boolean>; onDeleteLog?: (text: string) => void }> = ({ kr, readOnly, onMutate, onDeleteLog }) => {
  const [text, setText] = useState('');
  const tasks = Array.isArray(kr.tasks) ? kr.tasks : [];
  // O campo limpa na hora (a atividade já aparece na lista); se a gravação falhar de
  // vez, o texto volta para o campo — ninguém perde o que digitou.
  const add = () => { const t = text.trim(); if (!t) return; const task = { id: newId(), text: t, done: false }; setText(''); onMutate(ts => ts.some(x => x.id === task.id) ? ts : [...ts, task]).then(ok => { if (!ok) setText(cur => cur || t); }); };
  const setDone = (id: string, done: boolean) => onMutate(ts => ts.map(x => x.id === id ? { ...x, done } : x));
  return (
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-800">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Atividades {tasks.length > 0 && `· ${tasks.filter(t => t.done).length}/${tasks.length}`}</span>
      <div className="space-y-1 mt-1.5">
        {tasks.map(t => (
          <div key={t.id} className="flex items-center gap-2 group/task">
            <input type="checkbox" checked={t.done} disabled={readOnly} onChange={() => setDone(t.id, !t.done)} className="w-3.5 h-3.5 accent-blue-600 shrink-0" />
            <span className={`text-xs flex-1 min-w-0 ${t.done ? 'line-through text-slate-400' : 'text-slate-600 dark:text-slate-300'}`}>{t.text}</span>
            {!readOnly && <button onClick={() => { onDeleteLog?.(t.text); onMutate(ts => ts.filter(x => x.id !== t.id)); }} className="opacity-0 group-hover/task:opacity-100 text-slate-300 hover:text-rose-500 shrink-0 transition-all"><Trash2 size={12} /></button>}
          </div>
        ))}
        {tasks.length === 0 && <p className="text-[11px] text-slate-400 italic">Nenhuma atividade cadastrada.</p>}
      </div>
      {!readOnly && (
        <div className="flex items-center gap-2 mt-2">
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="+ nova atividade / entrega" className="flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={add} className="flex items-center gap-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1.5 rounded-lg"><Plus size={14} /></button>
        </div>
      )}
    </div>
  );
};

// Histórico de progresso do KR (cada mudança do "atual").
const KrHistory: React.FC<{ kr: OkrKeyResult }> = ({ kr }) => {
  const h = kr.history || [];
  if (h.length === 0) return null;
  const fmt = (v: number) => kr.format === 'pct' ? `${Math.round(v * 100)}%` : kr.format === 'bin' ? (v >= 1 ? 'Feito' : '—') : String(v);
  const d = (iso: string) => { try { const dt = new Date(iso); return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };
  return (
    <details className="mt-2">
      <summary className="text-[11px] font-bold text-slate-400 cursor-pointer select-none inline-flex items-center gap-1 hover:text-slate-600 dark:hover:text-slate-200"><History size={11} /> Histórico ({h.length})</summary>
      <ul className="mt-1.5 space-y-1 pl-3 border-l border-slate-200 dark:border-slate-700">
        {[...h].reverse().map((pt, i) => (
          <li key={i} className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
            <span className="font-mono tabular-nums text-slate-400">{d(pt.date)}</span>
            <span className="font-bold text-slate-600 dark:text-slate-300">{fmt(pt.value)}</span>
            {pt.by && <span className="text-slate-400">· {pt.by}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
};

const PF_STATUS = ['Concluído', 'Produção', 'Desenvolvimento', 'Protótipo', 'Ferramenta', 'Pausado'];
const statusStyle = (s: string) => s === 'Produção' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : s === 'Concluído' ? 'bg-teal-50 text-teal-600 dark:bg-teal-900/20 dark:text-teal-400' : s === 'Desenvolvimento' ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' : s === 'Ferramenta' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : s === 'Pausado' ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
const statusDot = (s: string) => s === 'Produção' ? 'bg-emerald-500' : s === 'Concluído' ? 'bg-teal-500' : s === 'Desenvolvimento' ? 'bg-amber-500' : s === 'Ferramenta' ? 'bg-blue-500' : s === 'Pausado' ? 'bg-rose-500' : 'bg-slate-400';

// Seletor de status legível (pílula colorida fechada; menu com texto escuro).
const StatusDropdown: React.FC<{ value: string; onChange: (v: string) => void; readOnly?: boolean }> = ({ value, onChange, readOnly }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  if (readOnly) return <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${statusStyle(value)}`}><span className={`w-1.5 h-1.5 rounded-full ${statusDot(value)}`} />{value}</span>;
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${statusStyle(value)}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${statusDot(value)}`} />{value}<ChevronDown size={12} className="opacity-70" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 left-0 w-44 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 py-1">
          {PF_STATUS.map(s => (
            <button key={s} onClick={() => { onChange(s); setOpen(false); }} className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${s === value ? 'bg-slate-50 dark:bg-slate-700/60' : ''}`}>
              <span className={`w-2 h-2 rounded-full ${statusDot(s)}`} />{s}{s === value && <CheckCircle2 size={13} className="ml-auto text-blue-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const PortfolioPanel: React.FC<{ portfolio: PortfolioItem[]; onMutate: (fn: (pf: PortfolioItem[]) => PortfolioItem[]) => void; readOnly?: boolean; onDeleteLog?: (name: string) => void }> = ({ portfolio, onMutate, readOnly, onDeleteLog }) => {
  const items = Array.isArray(portfolio) ? portfolio : [];
  const update = (id: string, patch: Partial<PortfolioItem>) => onMutate(pf => pf.map(i => i.id === id ? { ...i, ...patch } : i));
  const remove = (id: string, name?: string) => { onDeleteLog?.(name || ''); onMutate(pf => pf.filter(i => i.id !== id)); };
  const add = () => { const item = { id: `p${Date.now().toString(36)}`, name: 'Novo projeto', what: '', category: 'Sistemas', status: 'Desenvolvimento', nextMilestone: '' }; onMutate(pf => pf.some(x => x.id === item.id) ? pf : [...pf, item]); };
  const prod = items.filter(i => i.status === 'Produção').length;
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-slate-700">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2"><Layers size={18} className="text-blue-600" /> Portfólio de Inovação</h3>
        {!readOnly && <button onClick={add} className="flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"><Plus size={14} /> Adicionar</button>}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Os projetos/apps que você construiu (é o KR1.2). {items.length} projetos · {prod} em produção.</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {items.map(i => (
          <div key={i.id} className="rounded-xl border border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-800/30 p-4 group">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <EditField value={i.name} onCommit={v => update(i.id, { name: v })} readOnly={readOnly} className="text-sm font-bold text-slate-800 dark:text-white block" placeholder="Nome" />
                <EditField value={i.what} onCommit={v => update(i.id, { what: v })} readOnly={readOnly} className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block" placeholder="o que é" />
              </div>
              {!readOnly && <button onClick={() => { if (window.confirm(`Remover "${i.name}" do portfólio?`)) remove(i.id, i.name); }} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 shrink-0 transition-all"><Trash2 size={14} /></button>}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <StatusDropdown value={i.status} readOnly={readOnly} onChange={v => update(i.id, { status: v })} />
              <span className="text-[10px] text-slate-400">{i.category}</span>
            </div>
            <div className="mt-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Próximo marco</span>
              <EditField value={i.nextMilestone} onCommit={v => update(i.id, { nextMilestone: v })} readOnly={readOnly} placeholder="—" className="text-xs text-slate-700 dark:text-white mt-0.5 block" />
            </div>
            <div className="mt-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><Link2 size={11} /> Link</span>
              {readOnly ? (
                i.url
                  ? <a href={/^https?:\/\//.test(i.url) ? i.url : `https://${i.url}`} target="_blank" rel="noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-0.5 inline-flex items-center gap-1 break-all">{i.url.replace(/^https?:\/\//, '')} <ExternalLink size={11} /></a>
                  : <span className="text-xs text-slate-400 mt-0.5 block">—</span>
              ) : (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <EditField value={i.url || ''} onCommit={v => update(i.id, { url: v.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '') || undefined })} readOnly={false} placeholder="cole o endereço (ex.: cmms.jimpnexus.com)" className="text-xs text-blue-600 dark:text-blue-400 block flex-1 min-w-0" />
                  {i.url && <a href={/^https?:\/\//.test(i.url) ? i.url : `https://${i.url}`} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-blue-600 shrink-0" title="Abrir"><ExternalLink size={13} /></a>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const CheckinsPanel: React.FC<{ period: OkrPeriod; allKrs: OkrKeyResult[]; onAdd: (c: OkrCheckin) => Promise<boolean>; currentUser: User }> = ({ period, allKrs, onAdd, currentUser }) => {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [kr, setKr] = useState(allKrs[0]?.id || '');
  const [comment, setComment] = useState('');
  const [next, setNext] = useState('');
  const add = () => {
    if (!comment.trim()) return;
    const krObj = allKrs.find(k => k.id === kr);
    const entry: OkrCheckin = { id: newId(), date, kr, current: krObj?.current ?? 0, comment: comment.trim(), next: next.trim() };
    setComment(''); setNext('');
    onAdd(entry).then(ok => {
      // Gravou: registra na auditoria. Não gravou: o texto volta para o formulário.
      if (ok) { try { addAuditLog({ userId: currentUser.id, userName: currentUser.name, action: 'CREATE', entityType: 'OKR_CHECKIN', entityId: entry.id, entityName: kr, details: `Check-in OKR ${kr} (${date}) por ${currentUser.name}` }); } catch {} }
      else { setComment(c => c || entry.comment); setNext(n => n || entry.next); }
    });
  };
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-slate-700 no-print">
      <h3 className="text-base font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><CheckCircle2 size={18} className="text-blue-600" /> Check-ins · {period.label}</h3>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
        <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={e => setDate(e.target.value)} className="px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark]" />
        <select value={kr} onChange={e => setKr(e.target.value)} className="px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark]">{allKrs.map(k => <option key={k.id} value={k.id}>{k.id}</option>)}</select>
        <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Comentário / decisão" className="md:col-span-2 px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
        <input value={next} onChange={e => setNext(e.target.value)} placeholder="Próximo passo (opcional)" className="md:col-span-3 px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
        <button onClick={add} className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold"><Plus size={16} /> Registrar</button>
      </div>
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {(period.checkins || []).length === 0 && <p className="text-sm text-slate-400 text-center py-4">Sem check-ins ainda.</p>}
        {(period.checkins || []).map(c => (
          <div key={c.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-slate-800/40 border border-gray-100 dark:border-slate-800">
            <span className="text-[11px] font-black text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">{c.kr}</span>
            <div className="min-w-0 flex-1"><p className="text-sm text-slate-700 dark:text-slate-200">{c.comment}</p>{c.next && <p className="text-[11px] text-slate-400 mt-0.5"><AlertTriangle size={10} className="inline mr-1" />Próximo: {c.next}</p>}</div>
            <span className="text-[11px] text-slate-400 shrink-0">{fmtDue(c.date)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Página pública (sem login): abre o OKR pelo token do link, somente leitura.
export const OkrPublicPage: React.FC<{ token: string }> = ({ token }) => {
  const [data, setData] = useState<OkrStore | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  useEffect(() => { (async () => { const d = await fetchPublicOkr(token); if (d && d.periods?.length) { setData(d); setState('ok'); } else setState('error'); })(); }, [token]);
  if (state === 'loading') return <div className="min-h-screen grid place-items-center bg-slate-50 dark:bg-slate-950 text-slate-400"><RefreshCw className="animate-spin" size={20} /></div>;
  if (state === 'error' || !data) return <div className="min-h-screen grid place-items-center bg-slate-50 dark:bg-slate-950 text-slate-500 p-6 text-center">Link inválido ou indisponível.</div>;
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <OkrView external={data} readOnly currentUser={{ id: '', name: data.owner } as User} />
        <p className="text-center text-[11px] text-slate-400 mt-6">Visualização somente leitura · JimpNexus</p>
      </div>
    </div>
  );
};

export const OkrView = withOkrSafe<OkrViewProps>(OkrViewInner, 'este OKR');
