import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

// AVISO "SAIU UMA VERSÃO NOVA DO SISTEMA" (29/09/2026) — decisão do Edson.
//
// Nasceu do caso do Rogério (29/09, CLAUDE.md §13): a aba dele estava aberta desde ANTES do
// deploy de 25/09, seguia com o pacote velho, e o banco (trigger okr_state_exige_versao)
// recusava as gravações. Sair e entrar NÃO recarrega o pacote. Pedido: o app confere de
// tempos em tempos se o pacote no ar mudou e mostra a faixa "Atualizar"; NUNCA recarrega
// sozinho (a pessoa pode estar no meio de um formulário).
//
// Como funciona: o index.html publicado aponta para UM pacote com hash no nome
// (<script type="module" src="/assets/index-XXXX.js">) e cada deploy troca o hash. Guardo o
// nome do pacote que ESTA aba carregou e, a cada 5 min — e quando a aba volta a ficar
// visível, no máximo 1 vez por minuto —, peço o index.html do ar (fetch('/', no-store)) e
// comparo. Mudou → faixa fixa com "Atualizar agora" (location.reload()) e "Depois" (esconde
// até aparecer OUTRA versão diferente).
// - Em dev (Vite servindo /src/main.tsx, sem pacote com hash) não faz nada: nem timer, nem rede.
// - Rede fora, resposta que não é a página, página sem pacote: silêncio (nunca alarme falso).
// - Links públicos (?okr= / ?okr_painel=, sem login): não aparece — ficam como eram.
// - Montado no App.tsx FORA do AppContent: aparece na tela de login e logado, e não é
//   desmontado quando a pessoa entra/sai. Fica abaixo da tela de bloqueio (z-[10000]).
// - Blindado: qualquer erro aqui some com o aviso, nunca derruba o app.

const PACOTE_RE = /^\/assets\/index-[A-Za-z0-9_-]+\.js$/;
const INTERVALO_MS = 5 * 60 * 1000;
const MIN_ENTRE_CONFERENCIAS_MS = 60 * 1000;

// O pacote principal ('/assets/index-XXXX.js') entre os <script type="module" src> de um
// documento, ou null. Só vale da MESMA origem da página.
const pacoteEntre = (scripts: ArrayLike<Element>, base: string): string | null => {
  let origem = '';
  try { origem = new URL(base).origin; } catch { return null; }
  for (const s of Array.from(scripts)) {
    if ((s.getAttribute('type') || '').trim().toLowerCase() !== 'module') continue;
    const src = s.getAttribute('src');
    if (!src) continue;
    try {
      const u = new URL(src, base);
      if (u.origin === origem && PACOTE_RE.test(u.pathname)) return u.pathname;
    } catch { /* src estranho: ignora */ }
  }
  return null;
};

// O pacote que ESTA aba carregou (null em dev).
export const pacoteCarregado = (doc: Document = document): string | null =>
  pacoteEntre(doc.querySelectorAll('script[src]'), doc.baseURI || window.location.href);

// O pacote que um index.html aponta (o DOMParser não executa script nenhum).
export const pacoteNoHtml = (html: string, base: string): string | null => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return pacoteEntre(doc.querySelectorAll('script[src]'), base);
};

const linkPublico = (): boolean => {
  try {
    const q = new URLSearchParams(window.location.search);
    return !!(q.get('okr') || q.get('okr_painel'));   // o mesmo teste do AppContent
  } catch { return false; }
};

const Aviso: React.FC = () => {
  const [nova, setNova] = useState<string | null>(null);   // pacote novo no ar, ainda não dispensado
  const dispensada = useRef<string | null>(null);          // "Depois": só volta se vier OUTRA

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined' || typeof fetch !== 'function' || linkPublico()) return;
    const atual = pacoteCarregado();
    if (!atual) return;                                     // dev: sem pacote com hash
    let vivo = true;
    let emVoo = false;
    let ultima = Date.now();                                // acabou de carregar = a versão do ar

    const conferir = async () => {
      if (!vivo || emVoo || document.visibilityState === 'hidden') return;
      if (Date.now() - ultima < MIN_ENTRE_CONFERENCIAS_MS) return;
      emVoo = true;
      ultima = Date.now();
      try {
        const r = await fetch('/', { cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'text/html' } });
        if (!r.ok) return;
        const tipo = r.headers.get('content-type') || '';
        if (tipo && !/text\/html/i.test(tipo)) return;
        const noAr = pacoteNoHtml(await r.text(), window.location.href);
        if (!vivo || !noAr) return;
        if (noAr === atual) { setNova(null); return; }      // voltou a ser a desta aba (ex.: deploy desfeito)
        if (noAr !== dispensada.current) setNova(noAr);
      } catch {
        /* rede fora, resposta estranha: silêncio */
      } finally {
        emVoo = false;
      }
    };

    const id = window.setInterval(() => { void conferir(); }, INTERVALO_MS);
    const aoMudarVisibilidade = () => { if (document.visibilityState === 'visible') void conferir(); };
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    return () => {
      vivo = false;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    };
  }, []);

  const depois = () => { dispensada.current = nova; setNova(null); };
  const atualizar = () => { window.location.reload(); };

  // A região "status" fica sempre montada (leitor de tela anuncia quando o texto entra).
  return (
    <div role="status" aria-live="polite" aria-atomic="true"
      className="fixed z-[9980] inset-x-0 bottom-0 pointer-events-none flex justify-center px-3 pb-3 sm:px-4 sm:pb-4">
      {nova && (
        <div className="pointer-events-auto relative w-full sm:w-auto sm:max-w-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 border-l-4 border-l-orange-500 rounded-xl shadow-2xl pl-4 pr-6 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <span aria-hidden="true" className="absolute right-1.5 top-1.5 w-2.5 h-2.5 border-r-2 border-t-2 border-orange-500/60" />
          <span aria-hidden="true" className="absolute right-1.5 bottom-1.5 w-2.5 h-2.5 border-r-2 border-b-2 border-orange-500/60" />
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-blue-600 text-white shadow-sm shrink-0"><RefreshCw size={16} aria-hidden="true" /></div>
            <div className="min-w-0">
              <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-slate-400 dark:text-slate-500">Sistema · <span className="text-orange-500 dark:text-orange-400">Nova versão</span></p>
              <p className="text-sm font-bold text-slate-800 dark:text-white">Saiu uma versão nova do sistema.</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Esta aba ainda está com a versão antiga. Salve o que estiver fazendo e clique em “Atualizar agora”.</p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 shrink-0">
            <button type="button" onClick={depois}
              className="text-xs font-semibold px-3 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              Depois
            </button>
            <button type="button" onClick={atualizar}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900">
              <RefreshCw size={13} aria-hidden="true" /> Atualizar agora
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Erro de desenho aqui dentro some com o aviso — nunca vira a tela de erro do app.
// (Os tipos de React.Component daqui não trazem props/state: declarados com `declare`, que
// nunca vira código — vale com ou sem useDefineForClassFields.)
interface BlindagemProps { children?: React.ReactNode }
interface BlindagemState { erro: boolean }
class Blindagem extends React.Component<BlindagemProps, BlindagemState> {
  declare state: BlindagemState;
  declare props: BlindagemProps;
  constructor(props: BlindagemProps) {
    super(props);
    this.state = { erro: false };
  }
  public static getDerivedStateFromError(): BlindagemState { return { erro: true }; }
  public componentDidCatch() { /* o aviso é acessório: sem ele o app segue */ }
  public render() { return this.state.erro ? null : (this.props.children ?? null); }
}

export const NovaVersaoAviso: React.FC = () => <Blindagem><Aviso /></Blindagem>;
export default NovaVersaoAviso;
