import { CalculationType, InnovationMachine, InnovationMaterial, InnovationRecord } from '../types';

/**
 * ============================================================================
 *  ECONOMIA ANUAL DE UMA INOVAÇÃO — FONTE ÚNICA DE CÁLCULO
 * ============================================================================
 *
 *  Antes desta revisão (17/08/2026) a conta existia em TRÊS lugares diferentes
 *  dentro de InnovationManager.tsx:
 *    - o total gravado no banco               (useMemo previewAnnualSavings)
 *    - o painel "lucro de capacidade" do form (JSX, fórmula repetida à mão)
 *    - o modal de detalhe da inovação         (JSX, fórmula repetida à mão)
 *  Agora existe UMA conta, aqui, e as três telas leem o mesmo detalhamento.
 *
 *  ---------------------------------------------------------------------------
 *  O QUE CADA MÉTODO DE CÁLCULO SIGNIFICA (como o app realmente usa hoje)
 *  ---------------------------------------------------------------------------
 *  PER_UNIT          : "unitSavings" é R$ economizados POR PEÇA e "quantity" é
 *                      a quantidade de PEÇAS POR ANO.  base = unit x qtde.
 *
 *  RECURRING_MONTHLY : na prática o app usa IGUAL ao PER_UNIT (unit x qtde), e
 *                      é assim que os 6 registros recorrentes do banco foram
 *                      gravados (qtde = 667, 732, 764, 1075, 50 ... são peças,
 *                      não meses).  Só existe UMA exceção histórica: se a
 *                      quantidade for 0, o app assume 12 meses.  Esse desvio
 *                      está preservado aqui para não mudar nenhum número já
 *                      gravado, mas é PERGUNTA ABERTA para o Edson (ver
 *                      PERGUNTAS, item 2, no fim deste arquivo).
 *
 *  ONE_TIME          : valor único no ano.  base = unit (não multiplica).
 *
 *  ADD_EXPENSE       : gasto único que ENTRA negativo.  base = -unit.
 *
 *  ---------------------------------------------------------------------------
 *  OS TERMOS DA CONTA
 *  ---------------------------------------------------------------------------
 *  base            = economia declarada por peça x peças/ano
 *  materiais       = (materiais RETIRADOS - materiais ACRESCENTADOS) x peças/ano
 *                    (positivo quando a mudança tira material do produto)
 *  máquina         = - depreciação anual do dispositivo/máquina comprado
 *  mão de obra     = (1/prod_antes - 1/prod_depois) x custo_hora x peças/ano
 *                    -> custo de mão de obra EVITADO (economia de verdade)
 *  ganho de        = unidades_extras x (preço_de_venda - custo_da_unidade)
 *  capacidade        onde unidades_extras = peças/ano x (depois/antes - 1)
 *                    -> NÃO é custo evitado: é MARGEM DE VENDA de unidades que
 *                       passariam a caber na capacidade liberada, e só vira
 *                       dinheiro se a fábrica vender tudo o que produzir.
 *
 *  investimento    = NÃO entra na economia anual (é payback, não economia).
 *                    Continua gravado e exibido em separado. PERGUNTA item 3.
 *
 *  ---------------------------------------------------------------------------
 *  POLÍTICA — A ÚNICA CHAVE QUE MUDA O NÚMERO DO KPI
 *  ---------------------------------------------------------------------------
 *  'CUSTO_EVITADO_MAIS_CAPACIDADE' (valor de hoje, comportamento histórico):
 *      total = base + materiais + máquina + (capacidade, se houver preço de
 *      venda preenchido; senão, mão de obra).
 *      É o que gerou os R$ 1,46 milhão das portas e os R$ 1,82 milhão do teto.
 *
 *  'SOMENTE_CUSTO_EVITADO':
 *      total = base + materiais + máquina + mão de obra.
 *      O ganho de capacidade continua sendo CALCULADO e MOSTRADO, mas em campo
 *      próprio, fora da "economia anual".
 *
 *  Trocar a constante abaixo troca a regra em TODO o app de uma vez.  Enquanto
 *  o Edson não decidir, ela fica no valor histórico para que nenhum número
 *  gravado mude sozinho.  PERGUNTA item 1.
 * ============================================================================
 */

export type PoliticaEconomiaAnual =
  | 'CUSTO_EVITADO_MAIS_CAPACIDADE'
  | 'SOMENTE_CUSTO_EVITADO';

export const POLITICA_ECONOMIA_ANUAL: PoliticaEconomiaAnual = 'CUSTO_EVITADO_MAIS_CAPACIDADE';

/** Converte texto (inclusive no formato pt-BR "1.234,56") em número. Nunca devolve NaN. */
export const parseNumero = (val: any): number => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;

  let str = val.toString().trim();

  // Se tem vírgula, é formato pt-BR (1.234,56): o ponto é separador de milhar.
  if (str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  }

  const cleaned = str.replace(/[^\d.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

export interface EntradaCalculo {
  calculationType: CalculationType;
  unitSavings: any;
  quantity: any;
  materials?: InnovationMaterial[] | null;
  machine?: InnovationMachine | null;
  productivityBefore?: any;
  productivityAfter?: any;
  unitProductCost?: any;
  unitProductValue?: any;
  /** Custo-hora da engenharia, vindo de settings. Só afeta o termo de mão de obra. */
  hourlyCost?: any;
}

export interface DetalheCalculo {
  /** Quantidade efetivamente usada nas multiplicações (peças/ano). */
  quantidade: number;
  base: number;
  materiais: number;
  maquina: number;
  /** Mão de obra evitada. Calculada sempre; ver `maoDeObraContaNoTotal`. */
  maoDeObra: number;
  maoDeObraContaNoTotal: boolean;
  unidadesExtras: number;
  /** Margem de venda da capacidade liberada. Ver `capacidadeContaNoTotal`. */
  ganhoCapacidade: number;
  capacidadeContaNoTotal: boolean;
  /** base + materiais + máquina + mão de obra (quando ela conta). */
  custoEvitado: number;
  /** O número que vai para a coluna total_annual_savings. */
  total: number;
  politica: PoliticaEconomiaAnual;
}

/**
 * Calcula a economia anual e devolve TODOS os termos abertos, para que a tela
 * possa mostrar de onde veio cada real (nada de desconto invisível).
 */
export const calcularEconomiaAnual = (
  entrada: EntradaCalculo,
  politica: PoliticaEconomiaAnual = POLITICA_ECONOMIA_ANUAL
): DetalheCalculo => {
  const tipo = entrada.calculationType;
  const unit = parseNumero(entrada.unitSavings);

  // ---- quantidade efetiva -------------------------------------------------
  // ONE_TIME e ADD_EXPENSE são eventos ÚNICOS: o formulário nem mostra o campo
  // de quantidade. Antes desta revisão o ADD_EXPENSE ainda multiplicava os
  // materiais por uma quantidade invisível (o que tivesse sobrado digitado, ou
  // zero) — corrigido aqui: evento único multiplica por 1.
  let qtd = parseNumero(entrada.quantity);
  const eventoUnico = tipo === CalculationType.ONE_TIME || tipo === CalculationType.ADD_EXPENSE;
  if (eventoUnico) {
    qtd = 1;
  } else if (tipo === CalculationType.RECURRING_MONTHLY && qtd === 0) {
    // Desvio histórico preservado: recorrente sem quantidade = 12 meses.
    qtd = 12;
  }

  // ---- base ---------------------------------------------------------------
  let base = 0;
  if (tipo === CalculationType.ONE_TIME) {
    base = unit;
  } else if (tipo === CalculationType.ADD_EXPENSE) {
    base = -unit;
  } else {
    base = unit * qtd;
  }

  // ---- materiais ----------------------------------------------------------
  const materiais = (entrada.materials || []).reduce((acc, m) => {
    const custo = parseNumero(m?.cost) * qtd;
    return m?.type === 'REMOVE' ? acc + custo : acc - custo;
  }, 0);

  // ---- máquina / dispositivo ---------------------------------------------
  const maquina = entrada.machine ? -parseNumero(entrada.machine.annualDepreciation) : 0;

  // ---- produtividade ------------------------------------------------------
  const antes = parseNumero(entrada.productivityBefore);
  const depois = parseNumero(entrada.productivityAfter);
  const custoUnidade = parseNumero(entrada.unitProductCost);
  const precoVenda = parseNumero(entrada.unitProductValue);
  const custoHora = parseNumero(entrada.hourlyCost);

  let maoDeObra = 0;
  let unidadesExtras = 0;
  let ganhoCapacidade = 0;

  if (antes > 0 && depois > 0 && qtd > 0) {
    maoDeObra = (1 / antes - 1 / depois) * custoHora * qtd;
    unidadesExtras = qtd * (depois / antes - 1);
    ganhoCapacidade = unidadesExtras * (precoVenda - custoUnidade);
  }

  // ---- política -----------------------------------------------------------
  const temPrecoVenda = precoVenda > 0;
  const capacidadeContaNoTotal =
    politica === 'CUSTO_EVITADO_MAIS_CAPACIDADE' && temPrecoVenda && antes > 0 && depois > 0 && qtd > 0;
  // No modo histórico, preencher o preço de venda DESLIGA a economia de mão de
  // obra (era um ternário). No modo custo evitado, a mão de obra sempre conta.
  const maoDeObraContaNoTotal =
    politica === 'SOMENTE_CUSTO_EVITADO' ? true : !temPrecoVenda;

  const custoEvitado = base + materiais + maquina + (maoDeObraContaNoTotal ? maoDeObra : 0);
  const totalBruto = custoEvitado + (capacidadeContaNoTotal ? ganhoCapacidade : 0);
  const total = isNaN(totalBruto) ? 0 : totalBruto;

  return {
    quantidade: qtd,
    base,
    materiais,
    maquina,
    maoDeObra,
    maoDeObraContaNoTotal,
    unidadesExtras,
    ganhoCapacidade,
    capacidadeContaNoTotal,
    custoEvitado,
    total,
    politica
  };
};

/** Mesma conta, a partir de um registro já gravado (usado nas telas de leitura). */
export const calcularEconomiaAnualDoRegistro = (
  inv: Partial<InnovationRecord>,
  hourlyCost?: any,
  politica: PoliticaEconomiaAnual = POLITICA_ECONOMIA_ANUAL
): DetalheCalculo =>
  calcularEconomiaAnual(
    {
      calculationType: inv.calculationType as CalculationType,
      unitSavings: inv.unitSavings,
      quantity: inv.quantity,
      materials: inv.materials,
      machine: inv.machine,
      productivityBefore: inv.productivityBefore,
      productivityAfter: inv.productivityAfter,
      unitProductCost: inv.unitProductCost,
      unitProductValue: inv.unitProductValue,
      hourlyCost
    },
    politica
  );

/**
 * O total gravado confere com a conta? Serve para a tela avisar quando um
 * registro é valor fixo/legado (digitado, não calculado) — hoje só o
 * "Furgão Elétrico 2026" (R$ 150.000, semente de demonstração) cai nesse caso.
 */
export const totalGravadoConfere = (
  inv: Partial<InnovationRecord>,
  hourlyCost?: any,
  tolerancia = 0.01
): boolean => {
  const calc = calcularEconomiaAnualDoRegistro(inv, hourlyCost);
  return Math.abs(calc.total - (parseNumero(inv.totalAnnualSavings))) <= tolerancia;
};

/**
 * ============================================================================
 *  PERGUNTAS ABERTAS — precisam de decisão do Edson, não de código
 * ============================================================================
 *  1) ECONOMIA ANUAL = custo evitado, ou custo evitado + margem de venda da
 *     capacidade liberada?  Hoje é a segunda (constante POLITICA_ECONOMIA_ANUAL).
 *     Se for só custo evitado, trocar a constante para 'SOMENTE_CUSTO_EVITADO'
 *     e recalcular os 4 registros com produtividade preenchida.
 *
 *  2) RECURRING_MONTHLY: o valor digitado é por MÊS (então total = valor x 12)
 *     ou por PEÇA (então é PER_UNIT com outro nome)?  Os 6 registros gravados
 *     dizem "por peça"; o rótulo da tela diz "ECONOMIA POR MÊS".
 *
 *  3) INVESTIMENTO: continua fora da economia anual (só informativo) ou deve
 *     virar payback em meses?  Hoje a tela mostra "INV: -R$ x" em vermelho, mas
 *     ele não é subtraído de nada.
 *
 *  4) MÁQUINA/DISPOSITIVO comprado uma vez (ex.: Catraca Aviária, R$ 230, 1 ano)
 *     deve sair só do primeiro ano, ser depreciado em N anos, ou ir para
 *     investimento?  Hoje sai TODO ano, porque o campo é depreciação anual.
 * ============================================================================
 */
