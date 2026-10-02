// Leitura inteira de uma tabela, em páginas (01/10/2026).
//
// O PostgREST deste projeto devolve no máximo 1.000 linhas por pedido — mesmo pedindo mais. Medido em
// 01/10: operational_activities tinha 1.455 linhas e a carga recebia 1.000; ficavam de fora, calados,
// todos os lançamentos de 07/01 a 21/05/2026 (3.029 h), e o Dashboard, o Desempenho Operacional e o P&D
// Gerencial contavam só o resto.
//
//  · A 1ª página é o pedido de sempre: tabela que cabe nela volta IGUAL a antes, na mesma ordem —
//    inclusive a dos empates, que é a ordem física do banco e que o Gantt mostra.
//  · Passou de uma página: o resto vem com desempate por id (sem ele, linhas de mesma chave na divisa das
//    páginas podem vir duas vezes ou nenhuma — em 01/10 havia 4 atividades às 10:30 de 21/05 nas posições
//    998 a 1001). As posições das chaves são as mesmas com e sem desempate (só a ordem DENTRO de cada empate
//    muda), então o que vem antes do último empate da 1ª página fica como veio, e dali em diante tudo é
//    lido de novo com desempate. Não se filtra pela chave: a do Gantt se chama `order`, o mesmo nome do
//    parâmetro de ordenação do PostgREST.
//  · Uma página seguinte que falha é pedida de novo, uma vez. Se falhar de novo, a tabela volta como erro,
//    como quando o pedido único falhava; nunca pela metade. Passar do teto também é erro dito, não corte.
//  · Depende de o teto do PostgREST (Max rows, no painel do Supabase) ser pelo menos PAGINA_POSTGREST: com
//    um teto menor a 1ª página viria incompleta e pareceria a última.
//  · Limite conhecido: uma linha APAGADA, ou com a chave da ordem ALTERADA (o início de uma atividade, o
//    reordenar do Gantt), entre um pedido e outro faz as posições andarem, e uma linha pode ficar de fora
//    até a próxima carga (linha nova não: a repetida é tirada).

export type LeituraTabela = { data: any[] | null; error: any };

export const PAGINA_POSTGREST = 1000;
const TETO_LINHAS = 100000;

// `monta` devolve um pedido NOVO a cada chamada (o do supabase só serve uma vez), com o filtro e a
// ordem de sempre — sem .range e sem .limit. `chave` é a coluna da 1ª ordem.
export const lerTudo = async (rotulo: string, chave: string, monta: () => any): Promise<LeituraTabela> => {
  const primeira: LeituraTabela = await monta().range(0, PAGINA_POSTGREST - 1);
  const p0 = primeira.data || [];
  if (primeira.error || p0.length < PAGINA_POSTGREST) return primeira;

  // Onde começa, na 1ª página, o último grupo de chave igual.
  const divisa = p0[p0.length - 1][chave] ?? null;
  const inicio = p0.findIndex((r) => (r[chave] ?? null) === divisa);

  try {
    const resto: any[] = [];
    for (let de = inicio; ; de += PAGINA_POSTGREST) {
      const pagina = (): PromiseLike<LeituraTabela> => monta().order('id', { ascending: true }).range(de, de + PAGINA_POSTGREST - 1);
      let r = await pagina();
      if (r.error) r = await pagina();
      if (r.error) throw r.error;
      const d = r.data || [];
      resto.push(...d);
      if (inicio + resto.length > TETO_LINHAS) {
        throw new Error(`${rotulo}: há mais de ${TETO_LINHAS.toLocaleString('pt-BR')} linhas para ler de uma vez — avise o Edson.`);
      }
      if (d.length < PAGINA_POSTGREST) break;
    }
    // Uma linha gravada no meio da leitura empurra as outras: a mesma pode vir em dois pedidos.
    const vistos = new Set<string>();
    const data = [...p0.slice(0, inicio), ...resto].filter((r) => {
      const id = String(r.id);
      if (vistos.has(id)) return false;
      vistos.add(id);
      return true;
    });
    return { data, error: null };
  } catch (error) {
    console.error(`[lerTudo] ${rotulo}: a leitura em páginas falhou — a tabela não vai pela metade.`, error);
    return { data: null, error };
  }
};
