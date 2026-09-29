import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Database, TriangleAlert, RefreshCw, ExternalLink, X } from 'lucide-react';
import { Dialog } from './Dialog';
import { authHeaders } from '../services/authToken';

// INDICADOR DE USO (29/09/2026) — pedido do Edson: "um lugar onde eu possa ver o nível que está o
// banco de dados … no cantinho superior, em todas as minhas telas … 70% do banco de dados. E,
// inclusive, [a Vercel], que eu não sei se não tem limite também. Caso tiver, eu preciso saber a
// quantidade." SÓ para o Edson (o App monta só com isEdsonOwner, pelo id; o servidor confere de
// novo e responde 403 a qualquer outro).
//
// - Chip "BD 7%" em mono (identidade console): verde < 70, âmbar 70–84, vermelho ≥ 85 ou banco em
//   somente leitura; cinza "?" quando não há medição (o clique explica); "—" enquanto mede a
//   primeira vez. A cor nunca é o único sinal: âmbar/vermelho trocam o ícone e o aria-label diz
//   tudo. Desktop: fixo no canto superior direito, abaixo dos diálogos (z-40). Celular: dentro do
//   cabeçalho.
// - Clique → painel (Dialog): BANCO (MB de 500, barra, maiores tabelas, "medido às", "Medir
//   agora"), VERCEL (plano, limites, link do uso do time), O QUE O APP NÃO MEDE (egress e logs do
//   Supabase, CPU da Vercel, com links) e a data da conferência dos limites.
// - UM leitor para os dois chips (useUsoInfra, chamado uma vez no AppContent): lê ao entrar e a
//   cada 15 min, só com a aba visível e a tela desbloqueada. Os números vêm de GET /api/infra/uso
//   (cache de 10 min no servidor; "Medir agora" força).
// - Blindado: erro de desenho aqui some com o chip/painel, nunca derruba o app.

const INTERVALO_MS = 15 * 60 * 1000;
const MB = 1024 * 1024;

export interface UsoInfraResposta {
  success: boolean;
  status: 'ok' | 'nao_instalado' | 'erro';
  motivo?: string;
  banco: {
    usado_bytes: number;
    limite_bytes: number;
    pct: number;
    maiores: { nome: string; total_bytes: number; dados_bytes: number; linhas_aprox: number }[];
    somente_leitura: boolean;
    medido_em: string;
    app_bytes: number;
    limite_origem: 'padrao' | 'variavel';
  } | null;
  vercel: {
    plano: string;
    limites: { cpu_ativa_horas: number; invocacoes: number; cdn_requests: number; transferencia_gb: number } | null;
    link_uso: string;
  };
  supabase: {
    plano: string;
    links: { uso: string };
    limites_so_no_painel: { egress_gb: number; logs_gb: number } | null;
  };
  limites_conferidos_em: string;
  cache: boolean;
}

type Fase = 'carregando' | 'ok' | 'nao_instalado' | 'erro';
export interface UsoInfraEstado {
  ativo: boolean;
  fase: Fase;
  dados: UsoInfraResposta | null;
  erro: string | null;
  medindo: boolean;
  aberto: boolean;
  abrir: () => void;
  fechar: () => void;
  medirAgora: () => void;
}

// dono = é o Edson (pelo id); desbloqueado = a tela não está bloqueada por inatividade.
export function useUsoInfra(dono: boolean, desbloqueado: boolean): UsoInfraEstado {
  const [fase, setFase] = useState<Fase>('carregando');
  const [dados, setDados] = useState<UsoInfraResposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [medindo, setMedindo] = useState(false);
  const [aberto, setAberto] = useState(false);
  const ultima = useRef(0);         // quando foi a última leitura (0 = nunca)
  const emVoo = useRef(false);
  const geracao = useRef(0);        // troca quando o dono muda: resposta velha não entra

  const ler = useCallback(async (forcar: boolean) => {
    if (emVoo.current) return;
    const g = geracao.current;
    emVoo.current = true;
    ultima.current = Date.now();
    setMedindo(true);
    try {
      const r = await fetch(`/api/infra/uso${forcar ? '?forcar=1' : ''}`, { headers: { ...authHeaders() }, cache: 'no-store' });
      let j: any = null;
      try { j = await r.json(); } catch { /* corpo que não é JSON */ }
      if (g !== geracao.current) return;
      if (r.ok && j && j.success && j.vercel && j.supabase) {
        // Falha do BANCO (200 com status "erro": passou de 3 s, erro do Postgres) guarda a medição
        // anterior, como a falha HTTP: o painel diz "A última leitura falhou" e mostra a anterior.
        setDados((ant) => (j.status === 'erro' && !j.banco && ant?.banco ? { ...j, banco: ant.banco } : j) as UsoInfraResposta);
        setErro(null);
        setFase(j.status === 'ok' && j.banco ? 'ok' : j.status === 'nao_instalado' ? 'nao_instalado' : 'erro');
      } else {
        setFase('erro');
        setErro(r.status === 401 ? 'Sua sessão venceu: saia e entre de novo para medir.'
          : r.status === 403 ? 'O servidor não reconheceu você como o Edson.'
          : `O servidor não respondeu a medição (código ${r.status}).`);
      }
    } catch {
      if (g === geracao.current) { setFase('erro'); setErro('Sem conexão com o servidor agora.'); }
    } finally {
      emVoo.current = false;
      if (g === geracao.current) setMedindo(false);
    }
  }, []);

  // Trocou o dono (saiu / entrou outra pessoa): zera tudo — o número do Edson não fica em memória.
  useEffect(() => {
    if (dono) return;
    geracao.current++;
    emVoo.current = false;
    ultima.current = 0;
    setFase('carregando'); setDados(null); setErro(null); setMedindo(false); setAberto(false);
  }, [dono]);

  const ativo = dono && desbloqueado;
  useEffect(() => {
    if (!ativo) return;
    const talvez = () => {
      if (document.visibilityState === 'hidden') return;
      if (ultima.current && Date.now() - ultima.current < INTERVALO_MS - 5000) return;
      void ler(false);
    };
    talvez();                                   // ao entrar (ou ao desbloquear, se já passou do prazo)
    const id = window.setInterval(talvez, INTERVALO_MS);
    const aoMudar = () => { if (document.visibilityState === 'visible') talvez(); };
    document.addEventListener('visibilitychange', aoMudar);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', aoMudar); };
  }, [ativo, ler]);

  const abrir = useCallback(() => setAberto(true), []);
  const fechar = useCallback(() => setAberto(false), []);
  const medirAgora = useCallback(() => { void ler(true); }, [ler]);
  return { ativo: dono, fase, dados, erro, medindo, aberto, abrir, fechar, medirAgora };
}

// ---- Apresentação --------------------------------------------------------------------------
type Nivel = 'carregando' | 'cinza' | 'verde' | 'ambar' | 'vermelho';
const pctInteiro = (p: number) => Math.max(0, Math.floor(p)); // o servidor manda o % "para baixo"
const nivelDe = (u: UsoInfraEstado): Nivel => {
  const b = u.dados?.banco;
  if (u.fase === 'carregando' && !u.dados) return 'carregando';
  if (u.fase !== 'ok' || !b) return 'cinza';
  const p = pctInteiro(b.pct);
  if (b.somente_leitura || p >= 85) return 'vermelho';
  if (p >= 70) return 'ambar';
  return 'verde';
};
const fmtMb = (b: number) => (b / MB).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtLimiteMb = (b: number) => Math.round(b / MB).toLocaleString('pt-BR');
const fmtTam = (b: number) => (b >= MB ? `${fmtMb(b)} MB` : `${Math.max(1, Math.round(b / 1024)).toLocaleString('pt-BR')} kB`);
const fmtHora = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
};
const fmtDia = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
};
const linkSeguro = (u: string | undefined): string | null => (u && /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : null);

const motivoCinza = (u: UsoInfraEstado): string =>
  u.erro || u.dados?.motivo || 'A medição não veio.';

const rotuloChip = (u: UsoInfraEstado, n: Nivel): string => {
  const b = u.dados?.banco;
  if (n === 'carregando') return 'Uso do banco: medindo. Abrir os detalhes do uso';
  if (n === 'cinza' || !b) return `Uso do banco: não medido — ${motivoCinza(u)} Abrir os detalhes do uso`;
  const alerta = b.somente_leitura ? ', o banco está em SOMENTE LEITURA' : n === 'vermelho' ? ', crítico' : n === 'ambar' ? ', atenção' : '';
  return `Uso do banco: ${pctInteiro(b.pct)}% de ${fmtLimiteMb(b.limite_bytes)} MB (${fmtMb(b.usado_bytes)} MB usados)${alerta}. Abrir os detalhes do uso`;
};

const COR_CHIP: Record<Nivel, string> = {
  carregando: 'border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500',
  cinza: 'border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400',
  verde: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  ambar: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300',
  vermelho: 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
};
const COR_BARRA: Record<Nivel, string> = {
  carregando: 'bg-slate-400', cinza: 'bg-slate-400', verde: 'bg-emerald-500', ambar: 'bg-amber-500', vermelho: 'bg-red-500',
};

const Chip: React.FC<{ uso: UsoInfraEstado; variante: 'desktop' | 'mobile' }> = ({ uso, variante }) => {
  if (!uso.ativo) return null;
  const n = nivelDe(uso);
  const b = uso.dados?.banco;
  const texto = n === 'carregando' ? 'BD —' : n === 'cinza' || !b ? 'BD ?' : `BD ${pctInteiro(b.pct)}%`;
  const rotulo = rotuloChip(uso, n);
  const Icone = n === 'ambar' || n === 'vermelho' ? TriangleAlert : Database;
  const botao = (
    <button
      type="button"
      onClick={uso.abrir}
      aria-label={rotulo}
      title={rotulo}
      aria-haspopup="dialog"
      data-uso-infra={variante}
      data-nivel={n}
      className={`inline-flex items-center border font-mono font-bold uppercase whitespace-nowrap shadow-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 hover:brightness-95 ${
        variante === 'desktop' ? 'h-7 gap-1.5 px-2.5 rounded-md text-[11px] tracking-[0.18em]' : 'h-8 gap-1 px-1.5 rounded-lg text-[10px] tracking-[0.1em]'
      } ${COR_CHIP[n]}`}
    >
      <Icone className={variante === 'desktop' ? 'w-3.5 h-3.5 shrink-0' : 'w-3 h-3 shrink-0'} aria-hidden="true" />
      <span>{texto}</span>
    </button>
  );
  // Desktop: flutua no canto superior direito (dentro do respiro de 32 px do conteúdo), por cima
  // da página e ABAIXO dos diálogos (z-50/z-[100]) e da tela de bloqueio.
  return variante === 'desktop' ? <div className="hidden md:flex fixed top-1 right-3 z-40">{botao}</div> : botao;
};

const Secao: React.FC<{ titulo: React.ReactNode; children: React.ReactNode }> = ({ titulo, children }) => (
  <section className="mt-4 first:mt-0">
    <h3 className="font-mono text-[10px] font-bold tracking-[0.18em] uppercase text-slate-500 dark:text-slate-400 border-l-2 border-orange-500 pl-2 mb-2">{titulo}</h3>
    {children}
  </section>
);

const LinkFora: React.FC<{ href: string | null; children: React.ReactNode }> = ({ href, children }) =>
  href ? (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
      {children} <ExternalLink className="w-3 h-3" aria-hidden="true" />
    </a>
  ) : null;

const Painel: React.FC<{ uso: UsoInfraEstado }> = ({ uso }) => {
  if (!uso.ativo || !uso.aberto) return null;
  const d = uso.dados;
  const b = d?.banco || null;
  const n = nivelDe(uso);
  const planoSup = (d?.supabase.plano || '').toUpperCase();
  const planoVer = (d?.vercel.plano || '').toUpperCase();
  const linkSup = linkSeguro(d?.supabase.links.uso);
  const linkVer = linkSeguro(d?.vercel.link_uso);
  const pctTela = b ? Math.floor(b.pct * 10) / 10 : 0;
  const medir = (
    <button type="button" onClick={uso.medirAgora} disabled={uso.medindo}
      className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm disabled:opacity-60 disabled:cursor-wait outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900">
      <RefreshCw className={`w-3.5 h-3.5 ${uso.medindo ? 'animate-spin' : ''}`} aria-hidden="true" />
      {uso.medindo ? 'Medindo…' : 'Medir agora'}
    </button>
  );
  return (
    <Dialog onClose={uso.fechar} label="Uso do banco e da hospedagem"
      panelClassName="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 border-l-4 border-l-orange-500 rounded-xl shadow-2xl p-4 sm:p-5 outline-none text-slate-800 dark:text-slate-200">
      <span aria-hidden="true" className="absolute right-1.5 top-1.5 w-2.5 h-2.5 border-r-2 border-t-2 border-orange-500/60" />
      <span aria-hidden="true" className="absolute right-1.5 bottom-1.5 w-2.5 h-2.5 border-r-2 border-b-2 border-orange-500/60" />
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-slate-400 dark:text-slate-500">Sistema · <span className="text-orange-500 dark:text-orange-400">Uso</span></p>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Uso do banco e da hospedagem</h2>
        </div>
        <button type="button" onClick={uso.fechar} aria-label="Fechar"
          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <Secao titulo={<>Banco · Supabase{planoSup ? ` ${planoSup}` : ''}</>}>
        {b ? (
          <>
            {uso.fase === 'erro' && (
              <p className="mb-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                A última leitura falhou: {motivoCinza(uso)} Abaixo, a medição anterior.
              </p>
            )}
            <p className="text-sm">
              <span className="font-mono text-lg font-bold text-slate-900 dark:text-white">{fmtMb(b.usado_bytes)} MB</span>
              <span className="text-slate-500 dark:text-slate-400"> de {fmtLimiteMb(b.limite_bytes)} MB · </span>
              <span className="font-mono font-bold">{pctTela.toLocaleString('pt-BR')}%</span>
              {b.limite_origem === 'padrao' && <span className="text-xs text-slate-400 dark:text-slate-500"> (limite do plano Free)</span>}
            </p>
            <div role="progressbar" aria-label="Uso do banco" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pctInteiro(b.pct)}
              className="mt-2 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div className={`h-full rounded-full ${COR_BARRA[n]}`} style={{ width: `${Math.min(100, Math.max(0, b.pct))}%` }} />
            </div>
            {b.somente_leitura && (
              <p className="mt-2 text-xs font-bold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                O banco está em SOMENTE LEITURA: ninguém consegue gravar agora.
              </p>
            )}
            {b.maiores.length > 0 && (
              <>
                <p className="mt-3 mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Maiores tabelas</p>
                <ol className="text-xs divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-lg">
                  {b.maiores.map((m) => (
                    <li key={m.nome} className="flex items-center justify-between gap-3 px-2.5 py-1">
                      <span className="font-mono truncate min-w-0">{m.nome}</span>
                      <span className="font-mono shrink-0 text-slate-500 dark:text-slate-400">{fmtTam(m.total_bytes)}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">Medido às {fmtHora(b.medido_em)} · ao vivo (o painel do Supabase atualiza 1 vez por dia)</p>
              {medir}
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {uso.fase === 'carregando' ? 'Medindo…' : motivoCinza(uso)}
            </p>
            {medir}
          </div>
        )}
      </Secao>

      {d && (
        <Secao titulo={<>Vercel{planoVer ? ` · ${planoVer}` : ''}</>}>
          {d.vercel.limites ? (
            <>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">Cota por mês do time inteiro (KPI, pedidos, CMMS, TAESA e portal somados).</p>
              <ul className="text-xs grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                <li>CPU ativa: <span className="font-mono font-bold">{d.vercel.limites.cpu_ativa_horas} h</span> <span className="text-slate-400 dark:text-slate-500">(a mais apertada)</span></li>
                <li>Invocações: <span className="font-mono font-bold">{d.vercel.limites.invocacoes.toLocaleString('pt-BR')}</span></li>
                <li>CDN requests: <span className="font-mono font-bold">{d.vercel.limites.cdn_requests.toLocaleString('pt-BR')}</span></li>
                <li>Transferência: <span className="font-mono font-bold">{d.vercel.limites.transferencia_gb} GB</span></li>
              </ul>
            </>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">Os limites deste plano estão no painel da Vercel.</p>
          )}
          <div className="mt-2"><LinkFora href={linkVer}>Abrir o uso do time na Vercel</LinkFora></div>
        </Secao>
      )}

      {d && (
        <Secao titulo="O que o app não mede">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">Estes só aparecem nos painéis — confira de vez em quando:</p>
          <ul className="text-xs space-y-1.5">
            {d.supabase.limites_so_no_painel && (
              <>
                <li className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span>Egress do Supabase (dados que saem do banco): <span className="font-mono font-bold">{d.supabase.limites_so_no_painel.egress_gb} GB/mês</span></span>
                  <LinkFora href={linkSup}>Usage do Supabase</LinkFora>
                </li>
                <li className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span>Logs do Supabase: <span className="font-mono font-bold">{d.supabase.limites_so_no_painel.logs_gb} GB/mês</span></span>
                  <LinkFora href={linkSup}>Usage do Supabase</LinkFora>
                </li>
              </>
            )}
            {!d.supabase.limites_so_no_painel && (
              <li className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span>Egress e logs do Supabase</span>
                <LinkFora href={linkSup}>Usage do Supabase</LinkFora>
              </li>
            )}
            <li className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span>CPU ativa da Vercel{d.vercel.limites ? <>: <span className="font-mono font-bold">{d.vercel.limites.cpu_ativa_horas} h/mês</span></> : ''}</span>
              <LinkFora href={linkVer}>Usage da Vercel</LinkFora>
            </li>
          </ul>
        </Secao>
      )}

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-3">
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          {d ? `Limites conferidos em ${fmtDia(d.limites_conferidos_em)}.` : ''}
        </p>
        <button type="button" onClick={uso.fechar}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          Fechar
        </button>
      </div>
    </Dialog>
  );
};

// Erro de desenho aqui dentro some com o chip/painel — nunca vira a tela de erro do app.
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
  public componentDidCatch() { /* o indicador é acessório: sem ele o app segue */ }
  public render() { return this.state.erro ? null : (this.props.children ?? null); }
}

export const UsoInfraChip: React.FC<{ uso: UsoInfraEstado; variante: 'desktop' | 'mobile' }> = (p) => <Blindagem><Chip {...p} /></Blindagem>;
export const UsoInfraPainel: React.FC<{ uso: UsoInfraEstado }> = (p) => <Blindagem><Painel {...p} /></Blindagem>;
