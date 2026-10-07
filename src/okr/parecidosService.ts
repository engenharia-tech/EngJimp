// INICIATIVAS PARECIDAS NO OKR (07/10/2026). Pedido do Edson: "o Edson tá criando um OKR e esse OKR tem a palavra
// aplicativo de inovação … e o Nascimento está fazendo alguma coisa que tem aplicativo de inovação … gostaria que
// tivesse uma inteligência que avisasse que tem um projeto paralelo com um nome similar rodando pelo usuário A, B ou C."
//
// Quem compara é o SERVIDOR (POST /api/okr/parecidos e GET /api/okr/parecidos/painel): ele lê os OKRs de todos com a
// service_role, acha os candidatos pelo texto e a IA confirma. A tela só pede e mostra. Decisões dele (07/10):
//  · pessoa comum recebe SÓ O NOME de quem toca algo parecido (nível 'nomes'); o Edson, os admins de OKR e a visão do
//    CEO recebem o texto (nível 'completo'). Quem decide o nível é o servidor, pelo cadastro — nunca a tela;
//  · aviso amarelo, NÃO impede salvar; erro vira "sem aviso", calado (não atrapalha quem está escrevendo);
//  · só depois de GRAVAR um título (nunca ao abrir a tela: cada pedido pode custar uma chamada à IA).
// Por defesa, a tela também descarta do nível 'nomes' tudo o que não for o nome (se um servidor mandar a mais, não
// aparece) e corta o motivo da IA no tamanho combinado.
import { authHeaders } from '../services/authToken';

export type ParecidoTipo = 'objetivo' | 'kr' | 'portfolio';
export type ParecidoFonte = 'ia' | 'texto';
export type ParecidoIa = 'ok' | 'indisponivel';

/** Um item parecido, como o nível 'completo' recebe (Edson, admins de OKR, visão do CEO). */
export interface ParecidoCompleto {
  nome: string;          // nome de quem toca (users.name + surname)
  dono: string;          // login do dono do OKR (owner_key)
  tipo: ParecidoTipo;
  ref: string;           // rótulo/id do item no OKR dele (ex.: KR2.1)
  titulo: string;
  motivo?: string;       // o porquê, em poucas palavras (só quando a IA confirmou)
  fonte: ParecidoFonte;
}
/** O nível 'nomes' (pessoa comum): só o nome — nem o texto, nem o item, nem o motivo. */
export interface ParecidoNome { nome: string }

export type ParecidosResposta =
  | { nivel: 'completo'; ia: ParecidoIa; itens: ParecidoCompleto[] }
  | { nivel: 'nomes'; ia: ParecidoIa; itens: ParecidoNome[] };

export interface ParecidosPedido {
  ownerKey: string;      // o dono do OKR que está sendo editado (o servidor tira os itens dele da comparação)
  texto: string;
  tipo: ParecidoTipo;
  ref?: string;          // uid/id do item editado
}

export interface ParecidoLado { nome: string; dono: string; tipo: ParecidoTipo; ref: string; titulo: string }
export interface ParecidoPar { a: ParecidoLado; b: ParecidoLado; motivo?: string; fonte: ParecidoFonte }
export interface ParecidosPainel { ia: ParecidoIa; geradoEm: string; pares: ParecidoPar[] }

// ---------------------------------------------------------------------------------------------------------------------
// Texto: o que vale a pena mandar ao servidor. A regra de verdade é dele; esta só evita pedido que ele recusaria.

/** minúsculas, sem acento, sem pontuação, espaços simples */
export const normalizarTexto = (t: unknown): string =>
  String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** letras e algarismos (sem espaço nem pontuação) */
export const caracteresUteis = (t: unknown): number => normalizarTexto(t).replace(/ /g, '').length;

// Os textos que a própria tela põe ao criar (e os "placeholders" dos campos): "Novo resultado-chave", "Novo objetivo",
// "Novo projeto", "Resultado-chave…", "Objetivo…", "Nome", "o que é".
const PLACEHOLDER = /^(nov[oa] )?(resultado chave|resultado|objetivo|projeto|kr|item|iniciativa|nome|o que e)( \d+)?$/;
export const ehPlaceholder = (t: unknown): boolean => { const n = normalizarTexto(t); return !n || PLACEHOLDER.test(n); };

export const MINIMO_UTEIS = 12;
/** true = vale a pena perguntar (texto de verdade, com pelo menos 12 letras/algarismos) */
export const valeProcurar = (t: unknown): boolean => !ehPlaceholder(t) && caracteresUteis(t) >= MINIMO_UTEIS;

/** O texto de um item do portfólio para a comparação: o nome e o "o que é", sem os textos padrão. */
export const textoDoPortfolio = (name: unknown, what: unknown): string =>
  [String(name ?? '').trim(), String(what ?? '').trim()].filter(t => t && !ehPlaceholder(t)).join(' — ');

// ---------------------------------------------------------------------------------------------------------------------
// Saneamento do que volta (defesa: a tela nunca mostra mais do que o contrato diz).

const TIPOS: readonly ParecidoTipo[] = ['objetivo', 'kr', 'portfolio'];
const MOTIVO_MAX = 140;
const umaLinha = (x: unknown, max = 300): string => String(x ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
const ehTipo = (x: unknown): x is ParecidoTipo => typeof x === 'string' && (TIPOS as readonly string[]).includes(x);
const iaDe = (x: unknown): ParecidoIa => (x === 'ok' ? 'ok' : 'indisponivel');
const fonteDe = (x: unknown): ParecidoFonte => (x === 'ia' ? 'ia' : 'texto');
const motivoDe = (x: unknown): string | undefined => { const m = umaLinha(x, MOTIVO_MAX); return m || undefined; };

const ladoDe = (x: any): ParecidoLado | null => {
  if (!x || typeof x !== 'object' || !ehTipo(x.tipo)) return null;
  const nome = umaLinha(x.nome, 120), titulo = umaLinha(x.titulo, 400);
  if (!nome || !titulo) return null;
  return { nome, dono: umaLinha(x.dono, 120), tipo: x.tipo, ref: umaLinha(x.ref, 80), titulo };
};

/** Lê a resposta de /api/okr/parecidos. null = sem nada a mostrar (inclui "texto curto" e formato desconhecido). */
export const lerResposta = (out: any): ParecidosResposta | null => {
  if (!out || out.success !== true || !Array.isArray(out.itens) || out.itens.length === 0) return null;
  const ia = iaDe(out.ia);
  if (out.nivel === 'nomes') {
    const vistos = new Set<string>(); const itens: ParecidoNome[] = [];
    for (const x of out.itens) {
      const nome = umaLinha(x?.nome, 120);
      const k = normalizarTexto(nome);
      if (!nome || !k || vistos.has(k)) continue;
      vistos.add(k); itens.push({ nome });                     // SÓ o nome — qualquer outro campo fica para trás
      if (itens.length >= 20) break;
    }
    return itens.length ? { nivel: 'nomes', ia, itens } : null;
  }
  if (out.nivel === 'completo') {
    const itens: ParecidoCompleto[] = [];
    for (const x of out.itens) {
      const l = ladoDe(x); if (!l) continue;
      itens.push({ ...l, motivo: motivoDe(x?.motivo), fonte: fonteDe(x?.fonte) });
      if (itens.length >= 20) break;
    }
    return itens.length ? { nivel: 'completo', ia, itens } : null;
  }
  return null;
};

/** Lê a resposta do painel. null = formato que a tela não conhece. */
export const lerPainel = (out: any): ParecidosPainel | null => {
  if (!out || out.success !== true || !Array.isArray(out.pares)) return null;
  const pares: ParecidoPar[] = [];
  for (const p of out.pares) {
    const a = ladoDe(p?.a), b = ladoDe(p?.b);
    if (!a || !b) continue;
    pares.push({ a, b, motivo: motivoDe(p?.motivo), fonte: fonteDe(p?.fonte) });
  }
  const g = typeof out.geradoEm === 'string' && !Number.isNaN(Date.parse(out.geradoEm)) ? out.geradoEm : new Date().toISOString();
  return { ia: iaDe(out.ia), geradoEm: g, pares };
};

// ---------------------------------------------------------------------------------------------------------------------
// Chamadas (com o crachá, como /api/okr/share e /api/agenda/testar).

const comPrazo = (ms: number, externo?: AbortSignal): { signal: AbortSignal; fim: () => void } => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  const repassa = () => c.abort();
  if (externo) { if (externo.aborted) c.abort(); else externo.addEventListener('abort', repassa, { once: true }); }
  return { signal: c.signal, fim: () => { clearTimeout(t); externo?.removeEventListener('abort', repassa); } };
};

/**
 * Pergunta ao servidor se há algo parecido com o texto que acabou de ser gravado. NUNCA lança: qualquer falha (sem
 * crachá, 403, 429, rede, servidor sem a rota, resposta estranha, demora) vira null = "sem aviso". O aviso é um
 * conselho; não pode atrapalhar quem está escrevendo.
 */
export const buscarParecidos = async (p: ParecidosPedido, externo?: AbortSignal): Promise<ParecidosResposta | null> => {
  const ownerKey = String(p.ownerKey || '').trim().toLowerCase();
  const texto = String(p.texto || '').trim();
  if (!ownerKey || !ehTipo(p.tipo) || !valeProcurar(texto)) return null;
  const prazo = comPrazo(15000, externo);   // a IA tem ~8 s no servidor; o resto é folga de rede
  try {
    const corpo: Record<string, string> = { ownerKey, texto: texto.slice(0, 1000), tipo: p.tipo };
    if (p.ref) corpo.ref = String(p.ref).slice(0, 120);
    const res = await fetch('/api/okr/parecidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(corpo),
      signal: prazo.signal,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return lerResposta(await res.json().catch(() => null));
  } catch { return null; } finally { prazo.fim(); }
};

/** Erro do painel com a frase para a tela (o painel, ao contrário do aviso, diz o que houve). */
export class ParecidosErro extends Error {}

/** Procura os pares parecidos entre todos os OKRs (só Edson, admins de OKR e visão do CEO; o servidor confere). */
export const buscarPainelParecidos = async (externo?: AbortSignal): Promise<ParecidosPainel> => {
  const prazo = comPrazo(60000, externo);
  let res: Response;
  try {
    res = await fetch('/api/okr/parecidos/painel', { headers: { ...authHeaders() }, signal: prazo.signal, cache: 'no-store' });
  } catch (e: any) {
    prazo.fim();
    if (externo?.aborted) throw e;
    throw new ParecidosErro(e?.name === 'AbortError' ? 'O servidor demorou demais para responder — tente de novo em instantes.' : 'Sem conexão com o servidor — confira a internet e tente de novo.');
  }
  try {
    const out = await res.json().catch(() => null);
    if (res.status === 401) throw new ParecidosErro('Sua sessão venceu — saia e entre de novo.');
    if (res.status === 403) throw new ParecidosErro('Só o Edson, os admins de OKR e a diretoria (CEO / Diretor Industrial) veem as iniciativas parecidas.');
    if (res.status === 429) throw new ParecidosErro('Muitas buscas em pouco tempo — espere alguns minutos e tente de novo.');
    if (res.status === 404) throw new ParecidosErro('O servidor ainda não tem esta função (falta publicar).');
    if (!res.ok) throw new ParecidosErro(umaLinha(out?.error || out?.message, 200) || 'Não consegui procurar agora — tente de novo.');
    const lido = lerPainel(out);
    if (!lido) throw new ParecidosErro('O servidor respondeu num formato que a tela não conhece — recarregue a página (Ctrl+Shift+R).');
    return lido;
  } finally { prazo.fim(); }
};

// ---------------------------------------------------------------------------------------------------------------------
// Dispensar (só nesta sessão do navegador): o mesmo aviso, para o mesmo item com o mesmo texto, não volta.

const CHAVE_SESSAO = 'okr_parecidos_dispensados';
const dispensados: Set<string> = (() => {
  try { const a = JSON.parse(sessionStorage.getItem(CHAVE_SESSAO) || '[]'); return new Set(Array.isArray(a) ? a.map(String) : []); }
  catch { return new Set<string>(); }
})();
const chaveDispensa = (ownerKey: string, item: string, texto: string) => `${ownerKey.trim().toLowerCase()}|${item}|${normalizarTexto(texto)}`;
export const foiDispensado = (ownerKey: string, item: string, texto: string): boolean => dispensados.has(chaveDispensa(ownerKey, item, texto));
export const dispensar = (ownerKey: string, item: string, texto: string): void => {
  dispensados.add(chaveDispensa(ownerKey, item, texto));
  try { sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(Array.from(dispensados).slice(-200))); } catch { /* só em memória */ }
};

// ---------------------------------------------------------------------------------------------------------------------
// Frases

/** "A" · "A e B" · "A, B e C" (e, com muitos, "A, B, C, D, E e mais 2") */
export const juntarNomes = (nomes: string[], max = 5): string => {
  const n = nomes.filter(Boolean);
  if (n.length <= 1) return n[0] || '';
  if (n.length > max) return `${n.slice(0, max).join(', ')} e mais ${n.length - max}`;
  return `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}`;
};

/** A frase do nível 'nomes': "Parecido com o que Nascimento está tocando no OKR — vale conversar antes de seguir." */
export const fraseDosNomes = (nomes: string[]): string =>
  `Parecido com o que ${juntarNomes(nomes)} ${nomes.filter(Boolean).length > 1 ? 'estão' : 'está'} tocando no OKR — vale conversar antes de seguir.`;

const ROTULO_TIPO: Record<ParecidoTipo, string> = { objetivo: 'Objetivo', kr: 'KR', portfolio: 'Portfólio' };
/** Como o item aparece: "KR2.1", "O3" ou, sem rótulo legível, "KR" / "Objetivo"; portfólio é sempre "Portfólio". */
export const rotuloItem = (tipo: ParecidoTipo, ref: string): string => {
  if (tipo === 'portfolio') return ROTULO_TIPO.portfolio;
  const r = String(ref || '').trim();
  if (tipo === 'kr' && /^KR\d+(\.\d+)?$/i.test(r)) return r.toUpperCase();
  if (tipo === 'objetivo' && /^O\d+$/i.test(r)) return r.toUpperCase();
  return ROTULO_TIPO[tipo];
};
export const rotuloTipo = (tipo: ParecidoTipo): string => ROTULO_TIPO[tipo];
