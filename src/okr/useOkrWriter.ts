import { useCallback, useEffect, useRef } from 'react';
import { OkrStore } from './okr';
import { fetchOkrVersioned, mutateOkr, okrErrorMessage, isTransientOkrError } from '../services/storageService';

// Uma mudança no OKR, descrita como função: recebe o OKR ATUAL e devolve o novo.
// null = não se aplica mais (o item sumiu); o mesmo objeto = nada a mudar. Pode
// também LANÇAR OkrStaleError com o motivo, para desistir explicando. Toda mudança
// de "acrescentar" tem de ser IDEMPOTENTE (se o item já está lá, devolve o mesmo
// objeto): quando a resposta se perde, a nova tentativa roda sobre um banco que já
// gravou.
export type OkrMutator = (s: OkrStore) => OkrStore | null;
export type OkrWriteStatus = 'saving' | 'saved' | 'error' | 'offline';

const applyAll = (s: OkrStore, ms: OkrMutator[]) => ms.reduce((acc, m) => { try { return m(acc) ?? acc; } catch { return acc; } }, s);
// Rede caída: continua tentando por até 4 MINUTOS desde a primeira falha (conta o
// tempo, não as tentativas — voltar para a aba acorda a espera e gastava as tentativas
// em segundos).
const RETRY_WINDOW_MS = 4 * 60 * 1000;
const backoff = (n: number) => Math.min(30000, 1500 * 2 ** n);
const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;

// ---- A fila é UMA POR OKR (ownerKey), do módulo, e não da tela ----------------
// Antes cada tela tinha a sua: trocar de aba desmontava a tela, a fila dela ficava
// órfã (sem aviso ao fechar, sem ouvir a rede voltar) e, quando finalmente gravava,
// passava por cima de uma edição MAIS NOVA feita na tela que abriu depois. Com uma
// fila por OKR, a tela nova entra na mesma fila, na ordem, e já mostra o que está
// pendente.
type Inst = {
  setStore: (fn: (s: OkrStore | null) => OkrStore | null) => void;
  onError: (msg: string) => void;
  onStatus?: (s: OkrWriteStatus) => void;
};
type Item = { mut: OkrMutator; done: (ok: boolean) => void; origin: Inst };
type Queue = { chain: Promise<void>; pending: Item[]; insts: Set<Inst>; lastServer: OkrStore | null; seq: number; wake: (() => void) | null; failed: boolean; status: OkrWriteStatus | null };
const queues = new Map<string, Queue>();
const getQ = (key: string): Queue => {
  let q = queues.get(key);
  if (!q) { q = { chain: Promise.resolve(), pending: [], insts: new Set(), lastServer: null, seq: 0, wake: null, failed: false, status: null }; queues.set(key, q); }
  return q;
};
let pendingTotal = 0;   // mudanças ainda não gravadas, em todos os OKRs

const broadcastServer = (q: Queue, s: OkrStore) => {
  q.lastServer = s; q.seq++;
  const muts = q.pending.map(p => p.mut);
  q.insts.forEach(i => i.setStore(() => applyAll(s, muts)));
};
const broadcastStatus = (q: Queue, st: OkrWriteStatus) => { q.status = st; q.insts.forEach(i => i.onStatus?.(st)); };
// O aviso vai para a tela que fez a mudança; se ela já saiu, para outra tela aberta
// deste OKR; se nenhuma está aberta, ainda assim para a que fez (o aviso é do app
// inteiro, não da tela) — nunca só para o console.
const tell = (q: Queue, origin: Inst, msg: string) => {
  const to = q.insts.has(origin) ? origin : (q.insts.values().next().value ?? origin);
  to.onError(msg);
};

const reloadQ = async (key: string) => {
  const q = getQ(key); const seq = q.seq;
  try {
    const r = await fetchOkrVersioned(key);
    // Uma gravação terminou enquanto esta leitura viajava: ela é mais nova, fica.
    if (r.store && q.seq === seq) broadcastServer(q, r.store);
  } catch { /* sem rede: fica o que está na tela */ }
};

// Falha definitiva: descarta esta e as que vieram depois (feitas em cima dela),
// mostra o que o banco confirmou e diz o que se perdeu.
const failHard = (key: string, q: Queue, item: Item, msg: string) => {
  q.failed = true;
  const dropped = q.pending.splice(0);
  item.done(false); dropped.forEach(d => d.done(false));
  tell(q, item.origin, dropped.length ? `${msg} ${dropped.length} alteração(ões) feita(s) depois dela também não foram salvas.` : msg);
  if (q.lastServer) broadcastServer(q, q.lastServer);
  reloadQ(key);
};

const sleepQ = (q: Queue, ms: number) => new Promise<void>(res => {
  const t = setTimeout(() => { q.wake = null; res(); }, ms);
  q.wake = () => { clearTimeout(t); q.wake = null; res(); };
});

const enqueue = (key: string, origin: Inst, mut: OkrMutator): Promise<boolean> => {
  const q = getQ(key);
  let done!: (ok: boolean) => void;
  const result = new Promise<boolean>(res => { done = res; });
  q.insts.forEach(i => i.setStore(s => { if (!s) return s; try { return mut(s) ?? s; } catch { return s; } }));
  if (!q.insts.has(origin)) origin.setStore(s => { if (!s) return s; try { return mut(s) ?? s; } catch { return s; } });
  pendingTotal++;
  let counted = true;
  const settle = (ok: boolean) => { if (counted) { counted = false; pendingTotal--; } done(ok); };
  const item: Item = { mut, done: settle, origin };
  q.pending.push(item);
  broadcastStatus(q, 'saving');
  q.chain = q.chain.then(async () => {
    if (q.pending[0] !== item) return;              // já descartada por uma falha anterior
    let firstFail = 0;
    for (let tries = 0; ; tries++) {
      try {
        const r = await mutateOkr(key, mut);
        q.pending.shift();
        if (r) { broadcastServer(q, r.store); item.done(true); }
        else failHard(key, q, item, 'Essa mudança não se aplica mais: o item foi alterado ou excluído por outra pessoa. A tela foi atualizada.');
        break;
      } catch (e) {
        if (!firstFail) firstFail = Date.now();
        if (isTransientOkrError(e) && Date.now() - firstFail < RETRY_WINDOW_MS) {
          broadcastStatus(q, 'offline');
          await sleepQ(q, backoff(Math.min(tries, 6)));
          continue;
        }
        q.pending.shift();
        failHard(key, q, item, okrErrorMessage(e, 'Não consegui salvar o OKR.'));
        break;
      }
    }
    if (!q.pending.length) { broadcastStatus(q, q.failed ? 'error' : 'saved'); q.failed = false; }
  });
  return result;
};

// Ouvintes do módulo (uma vez só): a rede voltou / a janela voltou → acorda quem
// espera para tentar de novo; fechar a janela com algo pendente → o navegador pergunta.
if (typeof window !== 'undefined') {
  const wakeAll = () => { if (!online()) return; queues.forEach(q => { if (q.wake) q.wake(); }); };
  window.addEventListener('online', wakeAll);
  window.addEventListener('focus', wakeAll);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wakeAll(); });
  window.addEventListener('beforeunload', (e: BeforeUnloadEvent) => { if (pendingTotal > 0) { e.preventDefault(); e.returnValue = ''; } });
}

// Gravação do OKR que não atropela ninguém:
//  - a mudança aparece na hora (otimista) e é reaplicada sobre o OKR relido do banco,
//    gravada com trava de versão (mutateOkr);
//  - as mudanças vão em fila, na ordem (uma fila por OKR, compartilhada pelas telas);
//    o que ainda está na fila é reaplicado sobre cada resposta do banco;
//  - rede caída ou disputa longa: a mudança FICA na fila e é tentada de novo sozinha
//    por até 4 min (acorda quando a rede ou a janela volta); fechar a janela pergunta;
//  - falha definitiva: a tela volta ao que o banco confirmou, e as mudanças que
//    estavam atrás saem também (foram feitas em cima dela), com aviso;
//  - releitura que chega depois de uma gravação mais nova é descartada.
export function useOkrWriter(opts: {
  ownerKey: string;
  enabled: boolean;                 // pode gravar
  live: boolean;                    // relê ao voltar para a aba (não no link público)
  setStore: (fn: (s: OkrStore | null) => OkrStore | null) => void;
  onError: (msg: string) => void;
  onStatus?: (s: OkrWriteStatus) => void;
}) {
  const inst = useRef<Inst>({ setStore: opts.setStore, onError: opts.onError, onStatus: opts.onStatus });
  inst.current.setStore = opts.setStore; inst.current.onError = opts.onError; inst.current.onStatus = opts.onStatus;
  const o = useRef(opts); o.current = opts;
  const lastReload = useRef(0);

  // Esta tela passa a receber o que o banco confirmar para este OKR.
  useEffect(() => {
    if (!opts.live) return;
    const q = getQ(opts.ownerKey);
    const me = inst.current;
    q.insts.add(me);
    // Tela que (re)abre com mudança ainda na fila já mostra o estado dela
    // ("sem conexão — tentando…"), sem esperar a próxima tentativa.
    if (q.pending.length && q.status) me.onStatus?.(q.status);
    return () => { q.insts.delete(me); };
  }, [opts.ownerKey, opts.live]);

  // Quem carrega o OKR por fora (a tela, na abertura) marca o começo da leitura
  // (readMark) e depois entrega o que o banco tinha (adopt). Recebe de volta o que
  // mostrar: o banco + o que ainda está na fila. Se uma gravação terminou enquanto a
  // leitura viajava, a leitura é mais velha: fica o que a gravação confirmou.
  const readMark = useCallback((): number => getQ(o.current.ownerKey).seq, []);
  const adopt = useCallback((s: OkrStore | null, mark?: number): OkrStore | null => {
    const q = getQ(o.current.ownerKey);
    const muts = q.pending.map(p => p.mut);
    if (mark !== undefined && q.seq !== mark && q.lastServer) return applyAll(q.lastServer, muts);
    if (!s) return null;
    q.lastServer = s; q.seq++;
    return applyAll(s, muts);
  }, []);

  const reload = useCallback(() => { lastReload.current = Date.now(); return reloadQ(o.current.ownerKey); }, []);

  const persist = useCallback((mut: OkrMutator): Promise<boolean> => {
    if (!o.current.enabled) return Promise.resolve(false);
    return enqueue(o.current.ownerKey, inst.current, mut);
  }, []);

  // Voltou para a aba/janela: relê (pega o que outra pessoa ou a linha do tempo gravou).
  useEffect(() => {
    if (!opts.live) return;
    const onBack = () => {
      if (document.visibilityState !== 'visible') return;
      const q = getQ(o.current.ownerKey);
      if (q.pending.length || Date.now() - lastReload.current < 3000) return;
      reload();
    };
    window.addEventListener('focus', onBack);
    document.addEventListener('visibilitychange', onBack);
    return () => { window.removeEventListener('focus', onBack); document.removeEventListener('visibilitychange', onBack); };
  }, [opts.live, opts.ownerKey, reload]);

  return { persist, reload, adopt, readMark, busy: () => getQ(o.current.ownerKey).pending.length > 0 };
}
