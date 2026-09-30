// ─────────────────────────────────────────────────────────────────────────────
// CUSTO/HORA POR PERÍODO + DESLIGADO — 30/09/2026
//
// Decisões do Edson (30/09/2026):
//  - "congelar cada mês": janeiro a agosto valem o que valem hoje; de 01/09 em
//    diante o salário dele sai do custo ("meu salário deve sair no mês de
//    setembro já"); a partir de 03/10 também sem o Rogerio (último dia 02/10).
//  - desligar, NÃO excluir: tudo o que a pessoa fez continua no nome dela.
//  - R$ só para o Edson e para os CEOs. Quem vê é decidido pelo SERVIDOR
//    (GET /api/labor/hourly-cost → settings.custoHora), nunca pela tela.
//
// Antes: UMA média (settings.hourlyCostCalculated) aplicada a TODOS os
//   registros, de qualquer data — tirar alguém da média mudava janeiro.
// Agora: a taxa de cada registro é a da SÉRIE (settings.custoHora.periodos)
//   no dia do registro em Joinville. O dia do registro é o startTime — a mesma
//   data que pndSplit.isExcludedFromEngineering usa.
//
// Correções do cético (30/09), que mandam sobre a especificação:
//  - data inválida, ausente ou torta ('0026-05-10', null, new Date(0)) usa a
//    PRIMEIRA linha da série (a taxa de antes) — nunca a de hoje, nunca R$ 0;
//  - dia anterior à primeira linha usa a primeira linha, nunca 0;
//  - modo manual: dia < 2026-09-01 usa SEMPRE a série (jan–ago não mudam);
//  - taxaInovacoes é SEMPRE custoHora.taxaInovacoes, em qualquer modo;
//  - a fração de quem saiu conta DIAS ÚTEIS, com a mesma regra de feriados da
//    capacidade do Dashboard (getCapacityForMonth), e vem SÓ do desligadoEm: a
//    regra "Edson até 31/08" NÃO entra aqui (o per capita mantém o corte de
//    23/09 como está — commit d96e50f).
//
// Puro: sem React, sem fetch, sem console. Nunca imprimir taxa ou salário.
// ─────────────────────────────────────────────────────────────────────────────
import type { AppSettings, CustoHoraPeriodo, ProjectSession } from '../types';

/** A partir deste dia vale a série sem o Edson; antes, jan–ago congelados (e a exportação usa o custo gravado). */
export const CORTE_SERIE = '2026-09-01';
export const FUSO_JOINVILLE = 'America/Sao_Paulo';

/** O que as telas passam como data de registro. */
export type Quando = string | number | Date | null | undefined;

// ─── Dia em Joinville ────────────────────────────────────────────────────────

const RE_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
// 'AAAA-MM-DDTHH:mm[:ss[.sss]]' SEM fuso = hora de parede (campo datetime-local):
// o dia é o que está escrito, em qualquer fuso do navegador.
const RE_PAREDE = /^(\d{4}-\d{2}-\d{2})[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
const MS_MAX = 8.64e15; // limite do Date do JS

function diaExiste(a: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const bissexto = (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
  const dias = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d <= dias;
}

/** 'AAAA-MM-DD' de calendário que existe, ou null. */
function diaPuro(s: string): string | null {
  const m = RE_DIA.exec(s);
  if (!m) return null;
  return diaExiste(Number(m[1]), Number(m[2]), Number(m[3])) ? s : null;
}

function montaDia(a: number, m: number, d: number): string | null {
  if (!Number.isInteger(a) || a < 0 || a > 9999) return null;
  return `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

let _fmt: Intl.DateTimeFormat | null | undefined;
function formatador(): Intl.DateTimeFormat | null {
  if (_fmt === undefined) {
    try {
      _fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: FUSO_JOINVILLE, year: 'numeric', month: '2-digit', day: '2-digit',
      });
    } catch {
      _fmt = null;
    }
  }
  return _fmt;
}

/** O dia, em Joinville, de um instante (ms desde 1970). null se o instante não serve. */
function diaDoInstante(ms: number): string | null {
  if (!Number.isFinite(ms) || Math.abs(ms) > MS_MAX) return null;
  // UTC−3 fixo: serve de conta de reserva e de filtro de ano (o Intl é estranho antes de 1900).
  const t = new Date(ms - 3 * 3600 * 1000);
  const a = t.getUTCFullYear();
  const f = a >= 1900 && a <= 9999 ? formatador() : null;
  if (f) {
    try {
      let ano = NaN, mes = NaN, dia = NaN;
      for (const p of f.formatToParts(ms)) {
        if (p.type === 'year') ano = Number(p.value);
        else if (p.type === 'month') mes = Number(p.value);
        else if (p.type === 'day') dia = Number(p.value);
      }
      if (diaExiste(ano, mes, dia)) return montaDia(ano, mes, dia);
    } catch {
      /* cai na conta de reserva */
    }
  }
  return montaDia(a, t.getUTCMonth() + 1, t.getUTCDate());
}

const _memo = new Map<string, string | null>();

function diaDeTexto(s: string): string | null {
  const texto = s.trim();
  if (!texto) return null;
  const guardado = _memo.get(texto);
  if (guardado !== undefined) return guardado;
  let dia: string | null;
  if (RE_DIA.test(texto)) {
    dia = diaPuro(texto); // '2026-02-30' é inválido — não deixa o Date "consertar" para 02/03
  } else {
    const parede = RE_PAREDE.exec(texto);
    if (parede) dia = diaPuro(parede[1]);
    else dia = diaDoInstante(Date.parse(texto));
  }
  if (_memo.size > 50000) _memo.clear();
  _memo.set(texto, dia);
  return dia;
}

/**
 * O dia do registro em Joinville ('AAAA-MM-DD'), ou null quando a data não existe ou não serve.
 * 'AAAA-MM-DD' puro volta igual; ISO com fuso ('…Z', '…-03:00') vira o dia de Joinville;
 * ISO sem fuso é hora de parede (o dia escrito). Ano torto ('0026-05-10') é devolvido como está —
 * quem decide o que fazer com ele é quem chama (a taxa usa a primeira linha).
 */
export function diaJoinvilleOuNulo(quando?: Quando): string | null {
  if (quando === null || quando === undefined) return null;
  if (typeof quando === 'string') return diaDeTexto(quando);
  if (typeof quando === 'number') return diaDoInstante(quando);
  if (quando instanceof Date) return diaDoInstante(quando.getTime());
  return null;
}

/** Hoje em Joinville ('AAAA-MM-DD'). */
export function hojeJoinville(): string {
  return diaDoInstante(Date.now()) || '1970-01-01';
}

/**
 * Como diaJoinvilleOuNulo, mas ausente/inválido = HOJE (serve a seletores: "quem está ativo agora").
 * ⚠ Para TAXA de registro não use isto: use taxaNaData/custoEmReais, que tratam data ruim como
 * "a taxa de antes" (cético 30/09).
 */
export function diaJoinville(quando?: Quando): string {
  return diaJoinvilleOuNulo(quando) || hojeJoinville();
}

// ─── Dias úteis — a MESMA regra da capacidade do Dashboard ───────────────────
//
// A regra mora hoje em src/components/Dashboard.tsx, getCapacityForMonth (o Set
// `holidays2026`, ~linhas 1373-1399): segunda a sexta, menos os feriados abaixo
// (só estas datas: em outro ano não há feriado), 8,8 h por dia útil. Esta é a
// cópia fiel, provada igual mês a mês na bancada (custo-periodo-A). Para a regra
// ficar num lugar só, o Dashboard pode trocar a função local por capacidadeDoMes.

export const HORAS_POR_DIA_UTIL = 8.8;

export const FERIADOS_DA_CAPACIDADE: ReadonlySet<string> = new Set([
  '2026-01-01', // Ano Novo
  '2026-02-16', // Carnaval
  '2026-02-17', // Carnaval
  '2026-04-03', // Sexta-feira Santa
  '2026-04-21', // Tiradentes
  '2026-05-01', // Dia do Trabalhador
  '2026-06-04', // Corpus Christi
  '2026-06-24', // São João Batista (Padroeiro Garuva)
]);

/** Número do dia (0 = 1970-01-01), aritmética pura de calendário gregoriano (qualquer ano). */
function numeroDoDia(dia: string): number {
  let a = Number(dia.slice(0, 4));
  const m = Number(dia.slice(5, 7));
  const d = Number(dia.slice(8, 10));
  a -= m <= 2 ? 1 : 0;
  const era = Math.floor(a / 400);
  const ano = a - era * 400;
  const doAno = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const daEra = ano * 365 + Math.floor(ano / 4) - Math.floor(ano / 100) + doAno;
  return era * 146097 + daEra - 719468;
}

/** 0 = domingo … 6 = sábado. */
function diaDaSemana(n: number): number {
  return (((n + 4) % 7) + 7) % 7;
}

const _feriadosUteis: number[] = Array.from(FERIADOS_DA_CAPACIDADE)
  .map(numeroDoDia)
  .filter(n => { const w = diaDaSemana(n); return w !== 0 && w !== 6; });

function uteisEntre(n1: number, n2: number): number {
  if (n2 < n1) return 0;
  const semanas = Math.floor((n2 - n1 + 1) / 7);
  let c = semanas * 5;
  for (let n = n1 + semanas * 7; n <= n2; n++) {
    const w = diaDaSemana(n);
    if (w !== 0 && w !== 6) c++;
  }
  for (const f of _feriadosUteis) if (f >= n1 && f <= n2) c--;
  return c;
}

/** Dia útil da capacidade: segunda a sexta e fora de FERIADOS_DA_CAPACIDADE. */
export function ehDiaUtil(quando?: Quando): boolean {
  const dia = diaJoinville(quando);
  const w = diaDaSemana(numeroDoDia(dia));
  return w !== 0 && w !== 6 && !FERIADOS_DA_CAPACIDADE.has(dia);
}

function intervalo(inicio: Quando, fim: Quando): [string, string] {
  const a = diaJoinville(inicio);
  const b = diaJoinville(fim);
  return a <= b ? [a, b] : [b, a];
}

/** Dias úteis em [inicio, fim], inclusive (datas ausentes/inválidas = hoje). */
export function diasUteis(inicio: Quando, fim: Quando): number {
  const [a, b] = intervalo(inicio, fim);
  return uteisEntre(numeroDoDia(a), numeroDoDia(b));
}

/** Primeiro e último dia de um mês (mesIndex 0 = janeiro, como getCapacityForMonth). */
export function limitesDoMes(mesIndex: number, ano: number): { inicio: string; fim: string } {
  const a = ano + Math.floor(mesIndex / 12);
  const m = (((mesIndex % 12) + 12) % 12) + 1;
  const bissexto = (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
  const ultimo = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  const inicio = montaDia(a, m, 1) || '1970-01-01';
  const fim = montaDia(a, m, ultimo) || inicio;
  return { inicio, fim };
}

/** Horas de capacidade de UMA pessoa no mês — o mesmo número de getCapacityForMonth do Dashboard. */
export function capacidadeDoMes(mesIndex: number, ano: number): number {
  const { inicio, fim } = limitesDoMes(mesIndex, ano);
  return diasUteis(inicio, fim) * HORAS_POR_DIA_UTIL;
}

// ─── Desligado ───────────────────────────────────────────────────────────────

type ComDesligado = { desligadoEm?: string | null } | null | undefined;

/** O último dia trabalhado ('AAAA-MM-DD'), ou null se ativo (ou se a data gravada não serve). */
export function ultimoDiaTrabalhado(u: ComDesligado): string | null {
  const v = u?.desligadoEm;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  // coluna date do banco: 'AAAA-MM-DD'; se vier com hora, o dia é o escrito (nunca converter fuso)
  return diaPuro(s.slice(0, 10)) && (s.length === 10 || /^\d{4}-\d{2}-\d{2}[T ]/.test(s)) ? s.slice(0, 10) : null;
}

/** Estava ativo no dia? O último dia ainda conta. Sem data = hoje. */
export function ativoNaData(u: ComDesligado, quando?: Quando): boolean {
  const ultimo = ultimoDiaTrabalhado(u);
  if (!ultimo) return true;
  return diaJoinville(quando) <= ultimo;
}

/** Dias úteis de [inicio, fim] em que a pessoa ainda estava (até o desligadoEm, inclusive). */
export function diasUteisAtivos(u: ComDesligado, inicio: Quando, fim: Quando): number {
  const [a, b] = intervalo(inicio, fim);
  const ultimo = ultimoDiaTrabalhado(u);
  if (ultimo !== null && ultimo < a) return 0;
  const ate = ultimo !== null && ultimo < b ? ultimo : b;
  return uteisEntre(numeroDoDia(a), numeroDoDia(ate));
}

/**
 * Fração 0..1 do período [inicio, fim] (inclusive) em que a pessoa ainda estava, em DIAS ÚTEIS
 * da capacidade (Rogerio, último dia 02/10, em outubro/2026 = 2/22). Só pelo desligadoEm —
 * a regra do P&D (Edson até 31/08) NÃO entra (cético 30/09). Período sem dia útil nenhum
 * (só fim de semana/feriado): conta dias corridos.
 */
export function fracaoAteDesligar(u: ComDesligado, inicio: Quando, fim: Quando): number {
  const [a, b] = intervalo(inicio, fim);
  const ultimo = ultimoDiaTrabalhado(u);
  if (ultimo === null || ultimo >= b) return 1;
  if (ultimo < a) return 0;
  const na = numeroDoDia(a), nb = numeroDoDia(b), nu = numeroDoDia(ultimo);
  const total = uteisEntre(na, nb);
  if (total > 0) return uteisEntre(na, nu) / total;
  return (nu - na + 1) / (nb - na + 1);
}

/**
 * Nome do contrato original, mantido para quem já o chama. É EXATAMENTE fracaoAteDesligar:
 * a regra "Edson até 31/08" saiu daqui por correção do cético (30/09) — ela continua onde já
 * existe (pndSplit.isPndCarveoutUser / isExcludedFromEngineering), e o divisor do per capita
 * mantém o `!isPndCarveoutUser(u)` de 23/09.
 */
export function fracaoNaEngenharia(
  u: { id?: string; sector?: string | null; email?: string | null; username?: string | null; desligadoEm?: string | null } | null | undefined,
  inicio: Quando,
  fim: Quando,
): number {
  return fracaoAteDesligar(u, inicio, fim);
}

/** Para seletores de atribuição: quem estava ativo no dia + quem já está escolhido (nada some do formulário). */
export function usuariosParaSeletor<T extends { id?: string | null; desligadoEm?: string | null }>(
  users: T[] | null | undefined,
  quando?: Quando,
  manter?: string | string[] | null,
): T[] {
  const lista = Array.isArray(users) ? users : [];
  const ficar = new Set(
    (Array.isArray(manter) ? manter : [manter]).filter((x): x is string => typeof x === 'string' && x !== ''),
  );
  const dia = diaJoinville(quando);
  return lista.filter(u => {
    if (!u) return false;
    if (u.id && ficar.has(u.id)) return true;
    const ultimo = ultimoDiaTrabalhado(u);
    return !ultimo || dia <= ultimo;
  });
}

/** ' (desligado)' depois do último dia; '' para ativo (e no próprio último dia). */
export function rotuloDesligado(u: ComDesligado): string {
  const ultimo = ultimoDiaTrabalhado(u);
  return ultimo !== null && ultimo < hojeJoinville() ? ' (desligado)' : '';
}

// ─── Taxa e custo ────────────────────────────────────────────────────────────

type ComCustoHora = Pick<AppSettings, 'custoHora'> | null | undefined;
type ComModo = Pick<AppSettings, 'custoHora' | 'hourlyCost' | 'useAutomaticCost'> | null | undefined;

// A série higienizada e ordenada, guardada pela identidade do array (o estado do React não muda
// o array no lugar: settings novo = array novo).
const _series = new WeakMap<object, CustoHoraPeriodo[]>();

function serie(settings: ComCustoHora): CustoHoraPeriodo[] {
  const lista = settings?.custoHora?.periodos;
  if (!Array.isArray(lista) || lista.length === 0) return [];
  let s = _series.get(lista);
  if (!s) {
    s = [];
    for (const p of lista) {
      if (!p || typeof p.desde !== 'string') continue;
      const desde = diaPuro(p.desde.trim().slice(0, 10));
      const taxa = Number(p.taxa);
      if (!desde || !Number.isFinite(taxa) || taxa < 0) continue;
      s.push({ desde, taxa });
    }
    s.sort((x, y) => (x.desde < y.desde ? -1 : x.desde > y.desde ? 1 : 0));
    _series.set(lista, s);
  }
  return s;
}

/**
 * A tela MOSTRA R$? Só quando o servidor autorizou (Edson pelo id, CEO pelo cadastro), a rota
 * respondeu (carregado) E há série para calcular — senão seria "R$ 0" mostrado como custo.
 * (O campo cru settings.custoHora.podeVerReais continua sendo a palavra do servidor.)
 */
export function podeVerReais(settings?: ComCustoHora): boolean {
  const ch = settings?.custoHora;
  if (!ch || ch.carregado !== true || ch.podeVerReais !== true) return false;
  return serie(settings).length > 0;
}

/** O servidor diz que a pessoa vê R$, mas não há série (a 022 não rodou): a tela avisa em vez de mostrar R$ 0. */
export function avisoSemSerie(settings?: ComCustoHora): boolean {
  const ch = settings?.custoHora;
  return !!ch && ch.carregado === true && ch.podeVerReais === true && serie(settings).length === 0;
}

/** Modo manual = custo automático desligado e um valor digitado > 0 (a mesma régua do effectiveSettings antigo). */
export function modoManual(settings?: ComModo): boolean {
  if (!settings || settings.useAutomaticCost === true) return false;
  const v = Number(settings.hourlyCost);
  return Number.isFinite(v) && v > 0;
}

/**
 * R$/h que vale para um registro do dia `quando` (o startTime).
 *  - quem não vê R$ → 0 (as telas escondem a coluna; nunca mostrar este 0 como custo);
 *  - data ausente/inválida → a PRIMEIRA linha da série (a taxa de antes);
 *  - dia antes da primeira linha (ano torto, 1969 de epoch) → a primeira linha;
 *  - modo manual → o valor digitado, SÓ de 01/09/2026 em diante (jan–ago são sempre a série);
 *  - senão → a taxa da ÚLTIMA linha com desde <= dia.
 * Para a taxa de hoje, passe hojeJoinville().
 */
export function taxaNaData(settings: AppSettings | null | undefined, quando?: Quando): number {
  if (!podeVerReais(settings)) return 0;
  const s = serie(settings);
  const dia = diaJoinvilleOuNulo(quando);
  if (dia === null) return s[0].taxa;
  if (dia >= CORTE_SERIE && modoManual(settings)) return Number(settings!.hourlyCost);
  let taxa = s[0].taxa;
  for (const p of s) {
    if (p.desde <= dia) taxa = p.taxa;
    else break;
  }
  return taxa;
}

/** (segundos / 3600) × taxaNaData. 0 para quem não vê R$ — nunca mostrar como custo. */
export function custoEmReais(settings: AppSettings | null | undefined, segundos: number | null | undefined, quando?: Quando): number {
  const s = Number(segundos);
  if (!Number.isFinite(s) || s === 0) return 0;
  const taxa = taxaNaData(settings, quando);
  if (!taxa) return 0;
  // Mesma ordem da conta antiga (segundos × custo por segundo): com a taxa de antes, o centavo de
  // janeiro a agosto sai igual ao de hoje (a prova "jan–ago não mudam" mediu a outra ordem mudando 1 centavo).
  return s * (taxa / 3600);
}

/**
 * O mesmo custo na ordem de conta do HISTÓRICO antigo (taxa × (segundos/3600)): cada tela mantém a ordem
 * que tinha, senão o centavo de jan–ago muda (medido: o Histórico mudava 1 centavo com a ordem das paradas).
 */
export function custoEmReaisOrdemHistorico(settings: AppSettings | null | undefined, segundos: number | null | undefined, quando?: Quando): number {
  const s = Number(segundos);
  if (!Number.isFinite(s) || s === 0) return 0;
  const taxa = taxaNaData(settings, quando);
  if (!taxa) return 0;
  return taxa * (s / 3600);
}

/**
 * Soma de custo na ordem antiga: acumula os SEGUNDOS por taxa e, no fim, Σ segundos × (taxa/3600).
 * Com uma taxa só (jan–ago) dá bit a bit o "totalSegundos × custoPorSegundo" de antes — somar o custo
 * registro a registro mudava o centavo com taxa redonda. Mesma ideia do novaSomaPorTaxa dos Relatórios.
 */
export function novaSomaPorTaxa(settings: AppSettings | null | undefined) {
  const porTaxa = new Map<number, number>();
  return {
    somar(segundos: number | null | undefined, quando?: Quando) {
      const s = Number(segundos);
      if (!Number.isFinite(s) || s === 0) return;
      const taxa = taxaNaData(settings, quando);
      if (taxa) porTaxa.set(taxa, (porTaxa.get(taxa) || 0) + s);
    },
    total(): number {
      let t = 0;
      porTaxa.forEach((s, taxa) => { t += s * (taxa / 3600); });
      return t;
    },
  };
}

/**
 * A taxa FIXA das Inovações (a linha que cobre 2026-08-31), em QUALQUER modo e independente de
 * podeVerReais (cético 30/09: o valor manual não mexe no KPI de inovações). 0 se não veio.
 */
export function taxaInovacoes(settings: ComCustoHora): number {
  const v = Number(settings?.custoHora?.taxaInovacoes);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * A taxa das Inovações chegou do servidor? false = a rota falhou ou a pessoa não vê Inovações.
 * Quem GRAVA inovação deve conferir isto antes: calcular com 0 gravaria economia menor, calado.
 */
export function taxaInovacoesDisponivel(settings: ComCustoHora): boolean {
  return settings?.custoHora?.carregado === true && taxaInovacoes(settings) > 0;
}

/**
 * Valor da coluna de custo nas exportações (decisão do Edson, 30/09: "jan–ago com o custo gravado
 * na época (quando > 0); de 01/09 em diante pela série; só para quem vê R$").
 *  - null → quem exporta não vê R$: a coluna SOME;
 *  - dia < 01/09/2026 (ou data ruim, que é "antes") e totalCost > 0 → o gravado;
 *  - senão → custoEmReais(ativo + parada, startTime) (antes do corte a série é a mesma taxa congelada).
 */
export function custoParaExportar(
  settings: AppSettings | null | undefined,
  p: Pick<ProjectSession, 'startTime' | 'totalActiveSeconds' | 'interruptionSeconds' | 'totalCost'>,
): number | null {
  if (!podeVerReais(settings)) return null;
  const dia = diaJoinvilleOuNulo(p?.startTime);
  const gravado = Number(p?.totalCost);
  if ((dia === null || dia < CORTE_SERIE) && Number.isFinite(gravado) && gravado > 0) return gravado;
  const segundos = (Number(p?.totalActiveSeconds) || 0) + (Number(p?.interruptionSeconds) || 0);
  // A exportação é do Histórico: a mesma ordem de conta da tela dele (senão o Excel difere 1 centavo da tela).
  return custoEmReaisOrdemHistorico(settings, segundos, p?.startTime);
}
