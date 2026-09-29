// AGENDA dos usuários do OKR (29/09/2026) — a tela principal.
//
// Pedido do Edson: "um item chamado agenda … similar à linha do tempo … só que eu não
// quero que misture … viagem para a China, visitar um cliente, reunião no dia tal … que
// gerem alertas disparados para os e-mails cadastrados". Decisões dele (29/09): cada um vê
// SÓ a sua agenda; SÓ o Edson (isMaster = isEdsonOwner, pelo id) vê a dos outros, só
// leitura — o admin de OKR NÃO ("As agendas eu não gostaria que ele visse. Somente eu"), e
// a do Edson ninguém mais vê; o convidado não vê o item no app (só recebe os e-mails);
// alertas padrão 1 dia antes / no dia às 7h / 1 hora antes; e-mail só para cadastrados.
//
// Quem vê/grava o quê é a RLS do banco (migração 012); aqui a tela só evita oferecer o
// que o banco vai recusar (arrastar/editar compromisso de outra pessoa).
// Gravar NUNCA recarrega o app inteiro: o estado local é atualizado e a fila de alertas
// relida (o gatilho do banco mexeu nela).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Plus, RefreshCw, ChartGantt, List, MailWarning, Plane, Bell, CalendarDays, Sparkles, Lock, X, Globe } from 'lucide-react';
import { User } from '../types';
import { withOkrSafe } from '../okr/OkrSafe';
import { useToast } from '../components/Toast';
import {
  AgendaItem, AgendaAlerta, AgendaItemInput, AgendaTipo,
  AGENDA_TIPOS, todayBR, addDaysStr, brInstant, fmtQuando, fmtFalta, novoAgendaInput, emailRecebeAlerta,
} from './agenda';
import { temEmail, dominiosEmpresaTexto } from './ParticipantPicker';
import { AgendaService, AgendaStaleError, agendaService, agendaErrorMessage } from './agendaService';
import { AgendaItemModal } from './AgendaItemModal';
import { AgendaTimeline, AgendaJanela, JANELAS } from './AgendaTimeline';
import { AgendaList, TipoIcon, nomePorId, porInicio, ddmm, instante, alertaAtrasado, foraDeBrasilia, fusoDoNavegador } from './AgendaList';

export interface AgendaViewProps {
  currentUser: User;
  users: User[];
  isMaster: boolean;          // SÓ o Edson (isEdsonOwner): vê a agenda de todos, só leitura. NUNCA isOkrMaster.
  service?: AgendaService;    // padrão: o banco (agendaService); dá para abrir com dados de ensaio
}

type Visao = 'timeline' | 'lista';
type ModalMode = 'new' | 'edit' | 'view';
interface ModalState { open: boolean; seq: number; mode: ModalMode; item?: AgendaItem; initial?: AgendaItemInput }

const ESC_MINHA = 'mine';
const ESC_TODAS = 'all';
const LS_VISAO = 'agenda_visao';
const LS_JANELA = 'agenda_janela';
const NENHUM_ALERTA: AgendaAlerta[] = [];

// O navegador pode negar o armazenamento (janela anônima, política): aí só não lembra.
const lsGet = (k: string): string | null => { try { return window.localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string): void => { try { window.localStorage.setItem(k, v); } catch { /* sem armazenamento: só não lembra */ } };

// As duas leituras correm juntas e uma falha não derruba a outra.
interface Lido<T> { ok: boolean; v?: T; e?: unknown }
const settle = <T,>(p: Promise<T>): Promise<Lido<T>> => p.then(v => ({ ok: true, v }), (e: unknown) => ({ ok: false, e }));

// Mensagem de LEITURA (a de agendaErrorMessage fala de gravação: "nada foi salvo").
const leituraMsg = (e: unknown, fallback: string) =>
  agendaErrorMessage(e, fallback).replace(/ — nada foi salvo/i, '').replace(/ Nada foi salvo\./, '');

const AgendaViewInner: React.FC<AgendaViewProps> = ({ currentUser, users, isMaster, service = agendaService }) => {
  const { addToast } = useToast();
  const me = currentUser.id;

  const [items, setItemsState] = useState<AgendaItem[] | null>(null);   // null = ainda não li
  const itemsRef = useRef<AgendaItem[] | null>(null);
  useEffect(() => { itemsRef.current = items; }, [items]);
  // Atualização local (nunca cria a lista do nada: sem leitura, não se finge "agenda com 1 item").
  const setItems = useCallback((fn: (l: AgendaItem[]) => AgendaItem[]) => setItemsState(l => (l ? fn(l) : l)), []);
  const [alertas, setAlertas] = useState<AgendaAlerta[]>([]);
  const [alertasOk, setAlertasOk] = useState(false);          // a fila foi lida ao menos uma vez
  const alertasOkRef = useRef(false);
  useEffect(() => { alertasOkRef.current = alertasOk; }, [alertasOk]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');             // a leitura falhou e não há nada na tela
  const [savingId, setSavingId] = useState<string | null>(null);

  const [visao, setVisao] = useState<Visao>(() => (lsGet(LS_VISAO) === 'lista' ? 'lista' : 'timeline'));
  const [janela, setJanela] = useState<AgendaJanela>(() => { const v = lsGet(LS_JANELA); return JANELAS.some(j => j.id === v) ? (v as AgendaJanela) : 'quad'; });
  useEffect(() => { lsSet(LS_VISAO, visao); }, [visao]);
  useEffect(() => { lsSet(LS_JANELA, janela); }, [janela]);
  const [tipos, setTipos] = useState<AgendaTipo[]>([]);        // vazio = todos
  const [showDone, setShowDone] = useState(false);
  const [escopo, setEscopo] = useState<string>(ESC_MINHA);    // 'mine' | 'all' | id de uma pessoa (só master)
  const [modal, setModal] = useState<ModalState>({ open: false, seq: 0, mode: 'new' });

  // ---- Leitura ---------------------------------------------------------------
  // Leitura que falha NÃO apaga o que está na tela (fica, com o aviso). Uma leitura que
  // começou ANTES de uma gravação bem-sucedida terminar chega velha: lê de novo.
  // O serviço num ref: um 'service' passado como objeto novo a cada render não pode virar
  // um laço de releituras (o load só roda ao abrir e quando alguém pede).
  const svc = useRef(service);
  useEffect(() => { svc.current = service; }, [service]);
  const saveSeq = useRef(0);
  const loadSeq = useRef(0);
  const alSeq = useRef(0);
  const load = useCallback(async () => {
    const my = ++loadSeq.current;
    const seqAtStart = saveSeq.current;
    setLoading(true);
    try {
      const [li, al] = await Promise.all([settle(svc.current.list()), settle(svc.current.listAlertas())]);
      if (my !== loadSeq.current) return;                                    // outra leitura começou depois: vale a dela
      if (saveSeq.current !== seqAtStart) { setTimeout(() => { load(); }, 0); return; } // gravou no meio: esta leitura está velha
      const had = !!itemsRef.current;
      if (li.ok) { setItemsState(li.v || []); setLoadError(''); }
      else {
        const msg = leituraMsg(li.e, 'Não consegui ler a agenda.');
        // Sem nada na tela, o aviso fica no corpo (com "Tentar de novo"); com dados, um toast.
        if (!had) setLoadError(msg);
        else addToast(`Não consegui atualizar a agenda — mostrando o que já estava na tela. (${msg})`, 'error');
      }
      if (al.ok) { alSeq.current++; setAlertas(al.v || []); setAlertasOk(true); }
      else if (li.ok) {
        addToast(alertasOkRef.current
          ? 'Não consegui reler os alertas por e-mail — os de agora podem estar desatualizados.'
          : `Não consegui ler os alertas por e-mail — os compromissos aparecem, os alertas não. (${leituraMsg(al.e, 'erro na leitura')})`, 'warning');
      }
    } finally {
      if (my === loadSeq.current) setLoading(false);
    }
  }, [addToast]);
  useEffect(() => { load(); }, [load]);

  // O serviço que o MODAL usa. Num AgendaStaleError (sumiu / mudou em outra tela) o modal
  // avisa "atualizei a agenda" e fecha sozinho — quem relê é a tela, aqui. Sem isto a
  // barra ficava na versão velha e reabrir dava o mesmo erro até clicar em "Atualizar".
  // Estável (lê o serviço do ref): o modal não recebe um objeto novo a cada render.
  const modalService = useMemo<AgendaService>(() => {
    const releSeVelho =<T,>(p: Promise<T>): Promise<T> =>
      p.catch((e: unknown) => { if (e instanceof AgendaStaleError) load(); throw e; });
    return {
      list: () => svc.current.list(),
      listAlertas: () => svc.current.listAlertas(),
      create: (input) => releSeVelho(svc.current.create(input)),
      update: (id, input, version) => releSeVelho(svc.current.update(id, input, version)),
      patchDates: (id, dates, version) => releSeVelho(svc.current.patchDates(id, dates, version)),
      setStatus: (id, status, version) => releSeVelho(svc.current.setStatus(id, status, version)),
      remove: (id) => releSeVelho(svc.current.remove(id)),
      sendTest: (itemId) => svc.current.sendTest(itemId),
      ocupado: (pessoas, de, ate, ignorar) => svc.current.ocupado(pessoas, de, ate, ignorar),
    };
  }, [load]);

  // Depois de gravar: o gatilho do banco refez a fila deste compromisso — relê só ela.
  const refreshAlertas = useCallback(async () => {
    const my = ++alSeq.current;
    try {
      const v = await svc.current.listAlertas();
      if (my === alSeq.current) { setAlertas(v); setAlertasOk(true); }
    } catch {
      if (my === alSeq.current) addToast('Salvo — mas não consegui reler os alertas agora. Clique em "Atualizar" para ver a fila de e-mails.', 'warning');
    }
  }, [addToast]);

  // ---- Quem é quem ---------------------------------------------------------------
  const usersById = useMemo(() => new Map((users || []).map(u => [u.id, u] as const)), [users]);
  const meuCadastro = usersById.get(me);
  const meuEmail = String((meuCadastro ? meuCadastro.email : currentUser.email) || '').trim();
  // Por que os MEUS alertas não saem: sem e-mail, e-mail inválido ou de FORA da empresa
  // (decisão do Edson, 29/09 à tarde — só domínios da empresa; o do Edson, pelo id, sempre vale).
  // O servidor também aceita endereços de Configurações, que esta tela não conhece: por isso
  // o aviso "de fora" diz "provavelmente".
  const meuEmailProblema: 'sem' | 'invalido' | 'fora' | null = !meuEmail ? 'sem'
    : !temEmail({ email: meuEmail }) ? 'invalido'
    : !emailRecebeAlerta(meuEmail, me) ? 'fora' : null;
  const hoje = todayBR();

  const all = items || [];
  const escopoEf = isMaster ? escopo : ESC_MINHA;
  // Agenda de alguém = os compromissos de que ele é DONO (achado T1, 29/09). O convidado não
  // vê o item no app (regra do Edson): "Agenda de X" com os convites de X fazia o Edson achar
  // que X enxerga a visita de outra pessoa, e "Minha agenda" dele contava convites alheios.
  const scoped = useMemo(() => all.filter(i =>
    escopoEf === ESC_TODAS ? true
      : escopoEf === ESC_MINHA ? i.ownerId === me
      : i.ownerId === escopoEf), [all, escopoEf, me]);
  const scopedDone = useMemo(() => scoped.filter(i => showDone || i.status === 'ativo'), [scoped, showDone]);
  const shown = useMemo(() => scopedDone.filter(i => !tipos.length || tipos.includes(i.tipo)), [scopedDone, tipos]);
  const hiddenDone = scoped.length - scopedDone.length;

  // Pessoas que têm compromisso (para o seletor do master). A escolhida fica na lista
  // mesmo se deixou de ter item — senão o seletor mostrava outra coisa com a tela filtrada.
  const pessoas = useMemo(() => {
    const ids = new Set<string>();
    all.forEach(i => { if (i.ownerId !== me) ids.add(i.ownerId); });
    if (escopo !== ESC_MINHA && escopo !== ESC_TODAS) ids.add(escopo);
    return Array.from(ids).map(id => ({ id, nome: nomePorId(usersById, id), setor: (usersById.get(id)?.sector || '').trim() }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [all, me, escopo, usersById]);

  const titulo = escopoEf === ESC_MINHA ? 'Minha agenda' : escopoEf === ESC_TODAS ? 'Agenda de todos' : `Agenda de ${nomePorId(usersById, escopoEf)}`;
  // A agenda de OUTRA pessoa é só leitura (em "todas", os seus continuam editáveis).
  const soLeitura = escopoEf !== ESC_MINHA && escopoEf !== ESC_TODAS && escopoEf !== me;

  const alertasPorItem = useMemo(() => {
    const m = new Map<string, AgendaAlerta[]>();
    alertas.forEach(a => { const l = m.get(a.itemId); if (l) l.push(a); else m.set(a.itemId, [a]); });
    m.forEach(l => l.sort((a, b) => a.disparaEm.localeCompare(b.disparaEm) || a.id - b.id));
    return m;
  }, [alertas]);

  // ---- Resumo (dos compromissos visíveis) ----------------------------------------
  const resumo = useMemo(() => {
    const agora = Date.now();
    const ativos = shown.filter(i => i.status === 'ativo');
    const proximo = ativos.filter(i => {
      if (!i.inicioHora) return i.inicioDia >= hoje;
      const t = brInstant(i.inicioDia, i.inicioHora); return !!t && t.getTime() > agora;
    }).sort(porInicio)[0];
    const lim7 = addDaysStr(hoje, 6);
    const prox7 = ativos.filter(i => i.inicioDia <= lim7 && i.fimDia >= hoje).length;
    const viagens = ativos.filter(i => i.tipo === 'viagem' && i.fimDia >= hoje).sort(porInicio);
    const ids = new Set(shown.map(i => i.id));
    const vis = alertas.filter(a => ids.has(a.itemId));
    const pend = vis.filter(a => a.estado === 'pendente' || a.estado === 'enviando').sort((a, b) => a.disparaEm.localeCompare(b.disparaEm));
    const falhas = vis.filter(a => a.estado === 'falhou').length;
    // Fila parada (achado D4): pendente que devia ter saído há mais de 10 min.
    const atrasados = pend.filter(a => alertaAtrasado(a, agora)).length;
    return { proximo, lim7, prox7, viagens, pend, falhas, atrasados };
  }, [shown, alertas, hoje]);

  // ---- Modal (o formulário é do AgendaItemModal) ----------------------------------
  // Montado só enquanto aberto e com chave nova a cada abertura: o formulário sempre
  // nasce do compromisso clicado (nunca do anterior).
  const openNew = (initial?: AgendaItemInput) => setModal(m => ({ open: true, seq: m.seq + 1, mode: 'new', item: undefined, initial: initial || novoAgendaInput(todayBR()) }));
  const openItem = useCallback((it: AgendaItem) => setModal(m => ({ open: true, seq: m.seq + 1, mode: it.ownerId === me ? 'edit' : 'view', item: it, initial: undefined })), [me]);
  // Estáveis: o useDialog refaz o foco quando o onClose muda de identidade.
  const closeModal = useCallback(() => setModal(m => ({ ...m, open: false })), []);
  const onSaved = useCallback((saved: AgendaItem) => {
    saveSeq.current++;
    setItems(l => { const i = l.findIndex(x => x.id === saved.id); if (i < 0) return [...l, saved]; const n = l.slice(); n[i] = saved; return n; });
    setModal(m => ({ ...m, open: false, item: m.item ? saved : m.item }));
    refreshAlertas();
  }, [setItems, refreshAlertas]);
  const onDeleted = useCallback((id: string) => {
    saveSeq.current++;
    setItems(l => l.filter(x => x.id !== id));
    alSeq.current++;                                          // leitura de alertas em voo não ressuscita os apagados
    setAlertas(a => a.filter(x => x.itemId !== id));          // a fila do item foi junto (on delete cascade)
    setModal(m => ({ ...m, open: false }));
  }, [setItems]);
  // O compromisso aberto, na versão mais nova que a tela tem (se outra gravação mudou).
  const modalItem = useMemo(() => {
    if (!modal.item) return undefined;
    const fresh = (items || []).find(x => x.id === modal.item!.id);
    return fresh && fresh.updatedAt !== modal.item.updatedAt ? fresh : modal.item;
  }, [modal.item, items]);
  const modalItemId = modalItem?.id;
  const modalAlertas = useMemo(() => (modalItemId ? alertas.filter(a => a.itemId === modalItemId) : NENHUM_ALERTA), [alertas, modalItemId]);

  // ---- Arrastar na linha do tempo: grava SÓ as datas, com trava de versão -----------
  const commitDates = async (it: AgendaItem, datas: { inicioDia: string; fimDia: string }) => {
    setSavingId(it.id);
    setItems(l => l.map(x => (x.id === it.id ? { ...x, ...datas } : x)));          // otimista
    try {
      const saved = await svc.current.patchDates(it.id, datas, it.updatedAt);
      saveSeq.current++;
      setItems(l => l.map(x => (x.id === saved.id ? saved : x)));
      addToast(`"${saved.titulo}": ${fmtQuando(saved)}`, 'success');
      refreshAlertas();
    } catch (err) {
      // Não gravou: a barra volta para o que estava (se a releitura também falhar, a tela
      // não pode ficar na data que não foi salva). Mudou em outra tela → a mensagem diz.
      setItems(l => l.map(x => (x.id === it.id ? it : x)));
      addToast(agendaErrorMessage(err, 'Não consegui salvar as novas datas.'), 'error');
      await load();
    } finally {
      setSavingId(null);
    }
  };

  const toggleTipo = (t: AgendaTipo) => setTipos(l => (l.includes(t) ? l.filter(x => x !== t) : [...l, t]));

  // Exemplos do vazio: abrem o formulário já preenchido (datas a partir de hoje).
  const exemplos: { rot: string; init: () => AgendaItemInput }[] = [
    { rot: `Viagem à China (${ddmm(addDaysStr(hoje, 11))} → ${ddmm(addDaysStr(hoje, 21))})`, init: () => ({ ...novoAgendaInput(addDaysStr(hoje, 11)), titulo: 'Viagem à China', tipo: 'viagem', fimDia: addDaysStr(hoje, 21) }) },
    { rot: 'Visita ao cliente …', init: () => ({ ...novoAgendaInput(addDaysStr(hoje, 3)), titulo: 'Visita ao cliente ', tipo: 'visita', inicioHora: '09:00', fimHora: '11:00' }) },
    { rot: 'Reunião de resultados', init: () => ({ ...novoAgendaInput(addDaysStr(hoje, 1)), titulo: 'Reunião de resultados', tipo: 'reuniao', inicioHora: '14:00', fimHora: '15:00' }) },
  ];

  // ---- Render ----------------------------------------------------------------------
  if (loading && !items && !loadError) {
    return <div className="p-10 text-center text-slate-400"><RefreshCw className="animate-spin inline mr-2" size={18} aria-hidden="true" /> Carregando a agenda…</div>;
  }

  const segBtn = (on: boolean) => `text-xs font-bold px-3 py-1.5 transition-colors inline-flex items-center gap-1.5 ${on ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`;
  const selectCls = 'text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark] max-w-full';
  const kicker = 'font-mono text-[10px] tracking-[0.18em] uppercase text-slate-400 dark:text-slate-500';
  const card = 'bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700';

  // Cartão do resumo: borda de acento à esquerda + colchetes laranja (identidade console).
  // Rótulo e linha de baixo NÃO cortam no celular (achado T6: em 375 px saía "PRÓXIMO COMP…"):
  // rótulo curto abaixo de sm (ver `rot`) e o longo pode quebrar em 2 linhas (desktop com
  // o menu lateral e 4 colunas também é estreito); a linha de baixo quebra no celular e, do
  // sm para cima, corta com o texto inteiro no title.
  const stat = (k: string, label: React.ReactNode, icon: React.ReactNode, accent: string, value: React.ReactNode, sub?: React.ReactNode, onClick?: () => void, aria?: string) => {
    const inner = (
      <>
        <span aria-hidden="true" className="absolute right-1.5 top-1.5 w-2.5 h-2.5 border-r-2 border-t-2 border-orange-500/50" />
        <span aria-hidden="true" className="absolute right-1.5 bottom-1.5 w-2.5 h-2.5 border-r-2 border-b-2 border-orange-500/50" />
        <span className={`${kicker} flex items-center gap-1.5 pr-3`}>{icon}<span className="min-w-0 break-words leading-snug">{label}</span></span>
        <span className="block mt-1 min-w-0">{value}</span>
        {sub && <span className="block text-[11px] text-slate-500 dark:text-slate-400 break-words sm:truncate mt-0.5" title={typeof sub === 'string' ? sub : undefined}>{sub}</span>}
      </>
    );
    const cls = `relative block w-full text-left bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 border-l-4 ${accent} p-3.5 pr-5 shadow-sm min-w-0`;
    return onClick
      ? <button key={k} type="button" onClick={onClick} aria-label={aria} className={`${cls} hover:bg-slate-50 dark:hover:bg-slate-800/60 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors`}>{inner}</button>
      : <div key={k} className={cls}>{inner}</div>;
  };
  const bigNum = (n: number | string) => <span className="text-2xl font-black text-slate-800 dark:text-white tabular-nums leading-none">{n}</span>;
  // Rótulo curto no celular, longo do sm para cima.
  const rot = (curto: string, longo: string) => <><span className="sm:hidden">{curto}</span><span className="hidden sm:inline">{longo}</span></>;

  const { proximo, lim7, prox7, viagens, pend, falhas, atrasados } = resumo;
  const filtrando = tipos.length > 0;
  // Navegador fora do UTC−3 agora (achado D2): toda hora da agenda é de Brasília.
  const fusoFora = foraDeBrasilia(new Date());
  const fusoNome = fusoFora ? fusoDoNavegador() : '';
  // Linha de baixo do cartão "Alertas": fila parada vem primeiro (nada sai), depois falhas.
  // Os dois avisos quebram linha em qualquer largura (não podem sair cortados).
  const subAlertas: React.ReactNode = !alertasOk ? 'não consegui ler a fila'
    : atrasados > 0 ? (() => {
        const t = `${atrasados} e-mail(s) atrasado(s) — o disparador não está rodando${falhas > 0 ? ` · ${falhas} falharam` : ''}`;
        return <span className="text-amber-700 dark:text-amber-400 font-semibold whitespace-normal" title={t}>{t}</span>;
      })()
    : falhas > 0 ? <span className="text-rose-600 dark:text-rose-400 font-semibold whitespace-normal">{falhas} e-mail(s) falharam — veja na lista</span>
    : pend.length ? `próximo e-mail: ${instante(pend[0].disparaEm)}` : 'nenhum e-mail na fila';

  return (
    <div className="space-y-5">
      {/* Cabeçalho — padrão da linha do tempo do OKR */}
      <div className={`${card} p-6 border-l-4 border-l-blue-500 flex items-center justify-between gap-4 flex-wrap`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-md shrink-0"><CalendarClock size={22} aria-hidden="true" /></div>
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-slate-400 dark:text-slate-500">Agenda · <span className="text-orange-500 dark:text-orange-400">Compromissos</span></p>
            <h2 className="text-xl font-black text-slate-800 dark:text-white leading-tight break-words sm:truncate" title={titulo}>{titulo}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Viagens, visitas, reuniões e tarefas — com alerta por e-mail · hora de Brasília{items ? <> · {shown.length}{filtrando ? ` de ${scopedDone.length}` : ''} compromisso{shown.length === 1 ? '' : 's'}</> : ''}
            </p>
            {/* No celular o selo vai aqui embaixo (ao lado, espremia o nome da pessoa). */}
            {soLeitura && <span className="sm:hidden mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-1"><Lock size={11} aria-hidden="true" /> Só leitura</span>}
          </div>
          {soLeitura && <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-1 shrink-0"><Lock size={11} aria-hidden="true" /> Só leitura</span>}
        </div>
        <button type="button" onClick={() => { load(); }} disabled={loading} aria-label="Atualizar a agenda"
          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 disabled:opacity-50">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Atualizar
        </button>
      </div>

      {/* Os MEUS alertas não saem: sem e-mail, e-mail inválido ou de fora da empresa */}
      {meuEmailProblema && (
        <div role="status" className="flex items-start gap-2.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <MailWarning size={18} className="shrink-0 mt-0.5 text-amber-500" aria-hidden="true" />
          <span className="min-w-0 break-words">
            {meuEmailProblema === 'sem'
              ? 'Você não tem e-mail cadastrado — os alertas não têm para onde ir. Cadastre o seu e-mail em “Meu Perfil”.'
              : meuEmailProblema === 'invalido'
                ? <>Seu e-mail cadastrado (<b>{meuEmail}</b>) não é um endereço válido — os alertas não têm para onde ir. Corrija em “Meu Perfil”.</>
                : <>Seu e-mail cadastrado (<b>{meuEmail}</b>) é de fora da empresa — os alertas da agenda provavelmente não saem para ele: a agenda só manda para {dominiosEmpresaTexto()} (fora esses, só para um endereço liberado em Configurações). Cadastre o e-mail da empresa em “Meu Perfil”.</>}
          </span>
        </div>
      )}

      {/* Navegador em outro fuso (viagem): a hora digitada e mostrada é a de Brasília */}
      {fusoFora && (
        <div role="note" className="flex items-start gap-2.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <Globe size={18} className="shrink-0 mt-0.5 text-amber-500" aria-hidden="true" />
          <span>Todos os horários da agenda são <b>hora de Brasília</b> (Joinville). O seu navegador está em outro fuso{fusoNome ? ` (${fusoNome})` : ''}: ao marcar um compromisso, o formulário mostra a hora equivalente no seu relógio.</span>
        </div>
      )}

      {/* Barra de ferramentas */}
      <div className={`${card} p-4 space-y-3`}>
        <div className="flex flex-wrap items-center gap-2">
          {/* Na agenda de OUTRA pessoa não se cria (achado T2): o novo iria para a agenda do
              Edson e sumiria desta vista. */}
          {!soLeitura && (
            <button type="button" onClick={() => openNew()} disabled={!items}
              title={items ? 'Marcar um compromisso na sua agenda' : 'A agenda ainda não foi lida — tente "Atualizar"'}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3.5 py-2 rounded-lg shadow-sm">
              <Plus size={14} aria-hidden="true" /> Novo compromisso
            </button>
          )}
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden" role="group" aria-label="Como ver a agenda">
            <button type="button" onClick={() => setVisao('timeline')} aria-pressed={visao === 'timeline'} className={segBtn(visao === 'timeline')}><ChartGantt size={13} aria-hidden="true" /> Linha do tempo</button>
            <button type="button" onClick={() => setVisao('lista')} aria-pressed={visao === 'lista'} className={segBtn(visao === 'lista')}><List size={13} aria-hidden="true" /> Lista</button>
          </div>
          {visao === 'timeline' && (
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden" role="group" aria-label="Quantos meses cabem na tela">
              {JANELAS.map(j => (
                <button key={j.id} type="button" onClick={() => setJanela(j.id)} aria-pressed={janela === j.id} aria-label={j.label} className={segBtn(janela === j.id)}>
                  <span className="sm:hidden">{j.id === 'quad' ? 'Quad.' : j.id === 'sem' ? 'Sem.' : j.label}</span>
                  <span className="hidden sm:inline">{j.label}</span>
                </button>
              ))}
            </div>
          )}
          {isMaster && (
            <select value={escopo} onChange={e => setEscopo(e.target.value)} className={`${selectCls} sm:ml-auto`} aria-label="De quem é a agenda">
              <option value={ESC_MINHA}>Minha agenda</option>
              <option value={ESC_TODAS}>Todas as pessoas</option>
              {pessoas.length > 0 && (
                <optgroup label="Pessoas">
                  {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}{p.setor ? ` · ${p.setor}` : ''}</option>)}
                </optgroup>
              )}
            </select>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-gray-100 dark:border-slate-800">
          <span className={`${kicker} mr-1`}>Tipo</span>
          {AGENDA_TIPOS.map(t => {
            const on = tipos.includes(t.id);
            const n = scopedDone.filter(i => i.tipo === t.id).length;
            return (
              <button key={t.id} type="button" onClick={() => toggleTipo(t.id)} aria-pressed={on}
                aria-label={`${on ? 'Tirar' : 'Mostrar só'} ${t.plural.toLowerCase()} (${n})`}
                className={`inline-flex items-center gap-1.5 text-[11px] font-bold rounded-full border px-2.5 py-1 transition-colors ${on ? 'text-white shadow-sm' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                style={on ? { backgroundColor: t.color, borderColor: t.color } : { borderColor: `${t.color}66` }}>
                <TipoIcon tipo={t.id} size={12} style={on ? undefined : { color: t.color }} />
                {t.plural}
                <span className={`tabular-nums ${on ? 'text-white/80' : 'text-slate-400'}`}>{n}</span>
              </button>
            );
          })}
          {filtrando && (
            <button type="button" onClick={() => setTipos([])} aria-label="Mostrar todos os tipos"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 px-1.5 py-1">
              <X size={12} aria-hidden="true" /> todos
            </button>
          )}
          <label className="sm:ml-auto text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 cursor-pointer select-none py-1">
            <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} className="accent-blue-600" />
            Mostrar concluídos e cancelados{!showDone && hiddenDone > 0 ? ` (${hiddenDone})` : ''}
          </label>
        </div>
      </div>

      {/* Resumo */}
      {items && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stat('prox', rot('Próximo', 'Próximo compromisso'), <CalendarClock size={12} className="text-blue-500" aria-hidden="true" />, 'border-l-blue-500',
            proximo
              ? <span className="block text-sm font-black text-slate-800 dark:text-white truncate" title={proximo.titulo}>{proximo.titulo}</span>
              : <span className="block text-sm font-semibold text-slate-400">Nada marcado</span>,
            proximo ? <><span className="font-bold text-orange-600 dark:text-orange-400">{fmtFalta(proximo.inicioDia, hoje)}</span> · {fmtQuando(proximo)}</> : 'de hoje em diante',
            proximo ? () => openItem(proximo) : undefined,
            proximo ? `Abrir o próximo compromisso: ${proximo.titulo}, ${fmtFalta(proximo.inicioDia, hoje)}` : undefined)}
          {stat('7d', rot('7 dias', 'Próximos 7 dias'), <CalendarDays size={12} className="text-emerald-500" aria-hidden="true" />, 'border-l-emerald-500',
            bigNum(prox7), `de hoje a ${ddmm(lim7)}`)}
          {stat('viagem', rot('Viagens', 'Viagens programadas'), <Plane size={12} className="text-violet-500" aria-hidden="true" />, 'border-l-violet-500',
            bigNum(viagens.length), viagens.length ? `próxima: ${viagens[0].titulo} · ${fmtFalta(viagens[0].inicioDia, hoje)}` : 'nenhuma por vir')}
          {stat('alertas', rot('Alertas', 'Alertas agendados'), <Bell size={12} className="text-orange-500" aria-hidden="true" />, atrasados > 0 ? 'border-l-amber-500' : 'border-l-orange-500',
            bigNum(alertasOk ? pend.length : '—'), subAlertas)}
        </div>
      )}

      {/* Corpo */}
      {loadError && !items ? (
        <div className={`${card} p-10 text-center text-slate-500 dark:text-slate-400 space-y-2`}>
          <p>{loadError}</p>
          <button type="button" onClick={() => { load(); }} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">Tentar de novo</button>
        </div>
      ) : scoped.length === 0 ? (
        <div className={`${card} relative p-8 sm:p-10 text-center space-y-4`}>
          <span aria-hidden="true" className="absolute left-3 top-3 w-3 h-3 border-l-2 border-t-2 border-orange-500/50" />
          <span aria-hidden="true" className="absolute right-3 bottom-3 w-3 h-3 border-r-2 border-b-2 border-orange-500/50" />
          <Sparkles size={28} className="mx-auto text-orange-400" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-base font-black text-slate-700 dark:text-slate-200">
              {escopoEf === ESC_MINHA ? 'Sua agenda está vazia.' : escopoEf === ESC_TODAS ? 'Ninguém marcou compromisso ainda.' : `${nomePorId(usersById, escopoEf)} não tem compromisso na agenda.`}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {soLeitura
                ? 'Só leitura: aqui aparecem os compromissos que esta pessoa marcou na agenda dela. Para marcar um seu, volte para “Minha agenda”.'
                : 'Marque o que vem pela frente — viagens, visitas a clientes, reuniões, tarefas — e o sistema manda o lembrete para o seu e-mail cadastrado (e para quem você chamar).'}
            </p>
          </div>
          {!soLeitura && (
            <>
              <div className="flex flex-wrap justify-center gap-2" aria-label="Exemplos (abrem o formulário preenchido)">
                {exemplos.map(ex => (
                  <button key={ex.rot} type="button" onClick={() => openNew(ex.init())}
                    className="text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300 rounded-full px-3 py-1.5 transition-colors">
                    {ex.rot}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => openNew()} className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg shadow-sm">
                <Plus size={15} aria-hidden="true" /> Novo compromisso
              </button>
            </>
          )}
          {soLeitura && (
            <button type="button" onClick={() => setEscopo(ESC_MINHA)} className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">
              Ver a minha agenda
            </button>
          )}
        </div>
      ) : shown.length === 0 ? (
        <div className={`${card} p-10 text-center text-slate-500 dark:text-slate-400 space-y-3`}>
          <CalendarClock size={26} className="mx-auto opacity-50" aria-hidden="true" />
          <p>Nenhum compromisso com esses filtros.</p>
          <div className="flex flex-wrap justify-center gap-3 text-sm font-semibold">
            {filtrando && <button type="button" onClick={() => setTipos([])} className="text-blue-600 dark:text-blue-400 hover:underline">Mostrar todos os tipos</button>}
            {!showDone && hiddenDone > 0 && <button type="button" onClick={() => setShowDone(true)} className="text-blue-600 dark:text-blue-400 hover:underline">Mostrar concluídos e cancelados ({hiddenDone})</button>}
          </div>
        </div>
      ) : visao === 'timeline' ? (
        <AgendaTimeline
          items={shown}
          axisItems={scopedDone}
          groupBy={escopoEf === ESC_TODAS ? 'pessoa' : 'tipo'}
          janela={janela}
          usersById={usersById}
          currentUserId={me}
          hoje={hoje}
          savingId={savingId}
          onOpen={openItem}
          onCommitDates={commitDates}
        />
      ) : (
        <AgendaList
          items={shown}
          alertasPorItem={alertasPorItem}
          alertasOk={alertasOk}
          usersById={usersById}
          currentUserId={me}
          hoje={hoje}
          onOpen={openItem}
        />
      )}

      {modal.open && (
        <AgendaItemModal
          key={modal.seq}
          open={modal.open}
          mode={modal.mode}
          item={modal.mode === 'new' ? undefined : modalItem}
          initial={modal.mode === 'new' ? modal.initial : undefined}
          users={users}
          currentUser={currentUser}
          alertas={modalAlertas}
          service={modalService}
          onClose={closeModal}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
};

export const AgendaView = withOkrSafe<AgendaViewProps>(AgendaViewInner, 'a agenda', 'Algum dado da agenda veio num formato inesperado.');
export default AgendaView;
