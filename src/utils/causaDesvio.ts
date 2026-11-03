// CAUSA DO DESVIO (03/11/2026). Edson: "quando os objetivos não são atingidos por causa de processos, por causa de pessoas
// ou por um item … pontual. Preciso que seja criada essas integrações e essas problemáticas."
// As TRÊS causas valem igual no KPI (kpis_causa, migração 036) e no OKR (o KR guarda a sua em okr_state.data).

export type CausaTipo = 'processo' | 'pessoas' | 'pontual';
export const CAUSA_TIPOS: CausaTipo[] = ['processo', 'pessoas', 'pontual'];

export const CAUSA_ROTULO: Record<CausaTipo, string> = { processo: 'Processo', pessoas: 'Pessoas', pontual: 'Pontual' };

// A frase que ajuda a escolher (aparece embaixo de cada opção).
export const CAUSA_AJUDA: Record<CausaTipo, string> = {
  processo: 'o jeito de fazer falhou: método, fluxo, máquina, material, sistema',
  pessoas: 'falta de gente, de treino, de execução ou de comunicação',
  pontual: 'um fato isolado, que não deve se repetir: quebra, clima, falta de energia',
};

export const CAUSA_CLASSE: Record<CausaTipo, string> = {
  processo: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  pessoas: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  pontual: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
};

export const ehCausaTipo = (v: unknown): v is CausaTipo => v === 'processo' || v === 'pessoas' || v === 'pontual';

// A contagem que os painéis mostram ("Processo 3 · Pessoas 1 · Pontual 2").
export type CausaContagem = Record<CausaTipo, number>;
export const contarCausas = (xs: { causa: CausaTipo }[]): CausaContagem => {
  const c: CausaContagem = { processo: 0, pessoas: 0, pontual: 0 };
  xs.forEach(x => { if (ehCausaTipo(x.causa)) c[x.causa]++; });
  return c;
};
