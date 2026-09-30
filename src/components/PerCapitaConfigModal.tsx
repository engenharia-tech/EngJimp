import React, { useState, useMemo } from 'react';
import { X, SlidersHorizontal, RefreshCw, User, Calendar, Info } from 'lucide-react';
import { User as UserType } from '../types';
import { useDialog } from '../hooks/useDialog';
import { fracaoAteDesligar, rotuloDesligado, ultimoDiaTrabalhado } from '../utils/custoHora';

interface PerCapitaConfigModalProps {
  perCapitaStats: {
    avgPerDesignerMonth: number;
    designerCount: number;
    monthsInPeriod: number;
    calculatedMonths: number;
    engineeringUsers: UserType[];
    totalWeight: number;            // Σ peso × fração do período (a conta do Dashboard)
    temDesligadoNoPeriodo?: boolean;
    isCustomized: boolean;
  };
  totalHours: number;
  overrideMonths: number | null;
  designerWeights: Record<string, number>;
  onClose: () => void;
  onSave: (months: number | null, weights: Record<string, number>) => void;
  onReset: () => void;
  theme: 'light' | 'dark';
  // O período do filtro ('AAAA-MM-DD'). Com ele, a fração de cada um é fracaoAteDesligar, a
  // MESMA conta do Dashboard. Sem ele, a fração sai da conta que o Dashboard já fez (abaixo).
  inicio?: string;
  fim?: string;
}

// Fração do período em que cada um ainda estava (decisão do Edson, 30/09/2026: desligar, não
// excluir — pesa pelos DIAS ÚTEIS em que a pessoa estava, como o Dashboard). Sem o período em
// mãos: quem não tem desligamento pesa 1, e se UMA só pessoa tem data de desligamento, a fração
// dela sai exata do que o Dashboard já somou (totalWeight = Σ peso × fração). Mais de uma com
// data e sem o período: não dá para separar — fica 1 e a tela avisa (`aproximado`).
const fracoesDoPeriodo = (
  lista: UserType[], pesos: Record<string, number>, totalWeight: number, temDesligado: boolean | undefined,
  inicio?: string, fim?: string,
): { fr: Record<string, number>; aproximado: boolean } => {
  const fr: Record<string, number> = {};
  if (inicio && fim) { lista.forEach(u => { fr[u.id] = fracaoAteDesligar(u, inicio, fim); }); return { fr, aproximado: false }; }
  lista.forEach(u => { fr[u.id] = 1; });
  if (temDesligado === false) return { fr, aproximado: false };
  const comData = lista.filter(u => ultimoDiaTrabalhado(u) !== null);
  if (comData.length === 0) return { fr, aproximado: false };
  const peso = (u: UserType) => (pesos[u.id] !== undefined ? pesos[u.id] : 1.0);
  const alvo = comData[0];
  if (comData.length > 1 || !(peso(alvo) > 0) || !Number.isFinite(totalWeight)) return { fr, aproximado: true };
  const outros = lista.reduce((s, u) => (u.id === alvo.id ? s : s + peso(u)), 0);
  const f = (totalWeight - outros) / peso(alvo);
  if (!Number.isFinite(f)) return { fr, aproximado: true };
  fr[alvo.id] = Math.max(0, Math.min(1, Number(f.toFixed(6))));
  return { fr, aproximado: false };
};

export const PerCapitaConfigModal: React.FC<PerCapitaConfigModalProps> = ({
  perCapitaStats,
  totalHours,
  overrideMonths,
  designerWeights,
  onClose,
  onSave,
  onReset,
  theme,
  inicio,
  fim
}) => {
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  // Local state for months divisor
  const [isMonthAuto, setIsMonthAuto] = useState<boolean>(overrideMonths === null);
  const [localMonths, setLocalMonths] = useState<number>(() => {
    return overrideMonths !== null ? overrideMonths : perCapitaStats.calculatedMonths;
  });

  // Local state for designer weights
  const [localWeights, setLocalWeights] = useState<Record<string, number>>(() => {
    const weights: Record<string, number> = {};
    perCapitaStats.engineeringUsers.forEach(u => {
      weights[u.id] = designerWeights[u.id] !== undefined ? designerWeights[u.id] : 1.0;
    });
    return weights;
  });

  // A fração do período de cada um (1 = o período todo; desligado no meio = os dias úteis em que estava).
  const { fr: fracoes, aproximado } = useMemo(
    () => fracoesDoPeriodo(perCapitaStats.engineeringUsers, designerWeights, perCapitaStats.totalWeight, perCapitaStats.temDesligadoNoPeriodo, inicio, fim),
    [perCapitaStats, designerWeights, inicio, fim]
  );
  const fracaoDe = (id: string) => (fracoes[id] !== undefined ? fracoes[id] : 1);

  // Calculate stats in real-time for live preview inside modal
  const previewStats = useMemo(() => {
    const months = isMonthAuto ? perCapitaStats.calculatedMonths : localMonths;
    const finalMonths = months > 0 ? months : 1;

    // Peso × fração do período — a mesma conta do Dashboard (quem saiu no meio pesa só os dias
    // úteis em que estava). Sem desligado, a fração é 1 e o número é o de antes.
    let totalWeight = 0;
    perCapitaStats.engineeringUsers.forEach(u => {
      totalWeight += (localWeights[u.id] !== undefined ? localWeights[u.id] : 1.0) * (fracoes[u.id] !== undefined ? fracoes[u.id] : 1);
    });

    const finalDesignerCount = totalWeight > 0 ? totalWeight : 1;
    const newPerCapita = totalHours / finalDesignerCount / finalMonths;

    return {
      months: finalMonths,
      designerCount: totalWeight,
      avgPerDesignerMonth: Number(newPerCapita.toFixed(1))
    };
  }, [isMonthAuto, localMonths, localWeights, perCapitaStats, totalHours, fracoes]);

  const handleWeightChange = (userId: string, value: number) => {
    // Ensure value is between 0 and 1
    const cleanVal = Math.max(0, Math.min(1, value));
    setLocalWeights(prev => ({
      ...prev,
      [userId]: Number(cleanVal.toFixed(2))
    }));
  };

  const handleToggleInclude = (userId: string, isIncluded: boolean) => {
    setLocalWeights(prev => ({
      ...prev,
      [userId]: isIncluded ? 1.0 : 0.0
    }));
  };

  const currentMonthsToDisplay = isMonthAuto ? perCapitaStats.calculatedMonths : localMonths;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Configurar cálculo per capita" tabIndex={-1} className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg p-6 border border-gray-100 dark:border-slate-800 text-left flex flex-col max-h-[90vh] outline-none">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3 border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-blue-500 dark:text-blue-400" />
            <h3 className="text-md sm:text-lg font-bold text-gray-900 dark:text-white uppercase tracking-wider">
              Parâmetros Per Capita
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 transition rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Container */}
        <div className="overflow-y-auto py-4 space-y-5 pr-1 flex-1">
          <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed uppercase font-medium">
            Personalize a quantidade de meses e a participação dos projetistas no período. Perfeito para ajustar entradas recentes na equipe ou saídas de funcionários/projetistas.
          </p>

          {/* Seção 1: Meses */}
          <div className="space-y-3 bg-gray-50 dark:bg-slate-900/40 p-3.5 rounded-xl border border-gray-100 dark:border-slate-800">
            <h4 className="text-xs font-black text-gray-700 dark:text-slate-300 uppercase flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-blue-500" />
              1. Quantidade de Meses (Divisor)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Opção Automático */}
              <label className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                isMonthAuto 
                  ? 'border-blue-400 bg-blue-50/30 dark:bg-blue-950/20' 
                  : 'border-gray-200 dark:border-slate-800 hover:bg-gray-100 dark:hover:bg-slate-900/60'
              }`}>
                <input 
                  type="radio" 
                  checked={isMonthAuto} 
                  onChange={() => setIsMonthAuto(true)} 
                  className="mt-0.5" 
                />
                <div className="text-[10px] uppercase font-bold text-gray-600 dark:text-slate-300">
                  <span>Automático do Filtro</span>
                  <span className="block text-xs font-black text-blue-600 dark:text-blue-400 mt-0.5">
                    {perCapitaStats.calculatedMonths} {perCapitaStats.calculatedMonths === 1 ? 'Mês' : 'Meses'}
                  </span>
                </div>
              </label>

              {/* Opção Personalizado */}
              <label className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                !isMonthAuto 
                  ? 'border-blue-400 bg-blue-50/30 dark:bg-blue-950/20' 
                  : 'border-gray-200 dark:border-slate-800 hover:bg-gray-100 dark:hover:bg-slate-900/60'
              }`}>
                <input 
                  type="radio" 
                  checked={!isMonthAuto} 
                  onChange={() => setIsMonthAuto(false)} 
                  className="mt-0.5" 
                />
                <div className="text-[10px] uppercase font-bold text-gray-600 dark:text-slate-300 w-full">
                  <span>Manual Personalizado</span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <input 
                      type="number" 
                      min="0.1" 
                      max="120" 
                      step="0.1"
                      disabled={isMonthAuto}
                      value={localMonths}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setLocalMonths(isNaN(v) ? 1 : v);
                      }}
                      className="w-20 px-1.5 py-0.5 text-xs bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded text-center font-black"
                    />
                    <span className="text-[10px] text-gray-400">Meses</span>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Seção 2: Projetistas e Pesos */}
          <div className="space-y-3 bg-gray-50 dark:bg-slate-900/40 p-3.5 rounded-xl border border-gray-100 dark:border-slate-800">
            <h4 className="text-xs font-black text-gray-700 dark:text-slate-300 uppercase flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-indigo-500" />
              2. Pesos de Participação dos Projetistas
            </h4>
            <p className="text-[10px] text-gray-400 uppercase font-semibold leading-relaxed">
              Defina o peso de atuação de cada um. Use <strong className="text-indigo-400">1.0</strong> para período integral, <strong className="text-indigo-400">0.0</strong> para excluir, ou decimal (ex: <strong className="text-indigo-400">0.50</strong>) de acordo com os dias atuados no período de {currentMonthsToDisplay} {currentMonthsToDisplay === 1 ? 'mês' : 'meses'}.
            </p>

            <div className="space-y-2 mt-2 max-h-[180px] overflow-y-auto pr-1">
              {perCapitaStats.engineeringUsers.map(u => {
                const weight = localWeights[u.id] !== undefined ? localWeights[u.id] : 1.0;
                const isIncluded = weight > 0;

                // Calcs individual months equivalent (× a fração do período em que ainda estava)
                const fracao = fracaoDe(u.id);
                const individualMonths = (weight * fracao * currentMonthsToDisplay).toFixed(2);
                const desligado = rotuloDesligado(u);

                return (
                  <div 
                    key={u.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-2 rounded-lg border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 gap-2 sm:gap-0"
                  >
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        checked={isIncluded}
                        onChange={(e) => handleToggleInclude(u.id, e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <span className="text-xs font-black text-gray-800 dark:text-white uppercase block leading-none">
                          {u.name}{desligado && <span className="font-bold normal-case text-gray-400 dark:text-slate-500">{desligado}</span>}
                        </span>
                        <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase italic">{u.role}</span>
                        {fracao < 1 && (
                          <span className="block text-[10px] font-bold text-amber-600 dark:text-amber-400 normal-case"
                            title="Desligado no meio do período: conta só os dias úteis em que ainda estava (a mesma regra do painel)">
                            estava em {(fracao * 100).toFixed(0)}% dos dias úteis do período
                          </span>
                        )}
                      </div>
                    </div>

                    {isIncluded && (
                      <div className="flex items-center gap-2 sm:self-center self-end">
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-gray-400 block leading-tight">Equivalente</span>
                          <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase italic">
                            {individualMonths} meses
                          </span>
                        </div>
                        <div className="flex items-center gap-1 bg-gray-50 dark:bg-slate-900 border rounded p-0.5">
                          <input 
                            type="number" 
                            min="0" 
                            max="1" 
                            step="0.05"
                            value={weight}
                            onChange={(e) => handleWeightChange(u.id, parseFloat(e.target.value))}
                            className="w-14 text-center text-xs font-black bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded py-0.5"
                          />
                          <input 
                            type="range" 
                            min="0" 
                            max="1" 
                            step="0.05"
                            value={weight}
                            onChange={(e) => handleWeightChange(u.id, parseFloat(e.target.value))}
                            className="w-16 h-1 bg-gray-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      </div>
                    )}

                    {!isIncluded && (
                      <span className="text-[10px] font-black text-red-500 bg-red-50 dark:bg-red-950/20 px-1.5 py-0.5 rounded uppercase italic self-end sm:self-auto">
                        Inativo / Excluído
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Prévia Prática */}
          <div className="bg-amber-50 dark:bg-yellow-950/10 border border-amber-200 dark:border-yellow-900/30 rounded-xl p-3.5 shadow-inner">
            <h4 className="text-xs font-black text-amber-800 dark:text-yellow-400 uppercase flex items-center gap-1 mb-1.5">
              <Info className="w-3.5 h-3.5" />
              Resultado Prévia com Novos Parâmetros
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[10px] uppercase font-bold text-amber-700 dark:text-yellow-500/70 border-b border-amber-100 dark:border-yellow-900/10 pb-2">
              <div>
                <span className="block text-amber-600 dark:text-yellow-500">Horas Totais</span>
                <span className="text-xs font-black text-amber-900 dark:text-yellow-100">{totalHours}h</span>
              </div>
              <div>
                <span className="block text-amber-600 dark:text-yellow-500">Total Meses</span>
                <span className="text-xs font-black text-amber-900 dark:text-yellow-100">{previewStats.months}</span>
              </div>
              <div>
                <span className="block text-amber-600 dark:text-yellow-500">Projetistas Equiv.</span>
                <span className="text-xs font-black text-amber-900 dark:text-yellow-100">{previewStats.designerCount.toFixed(2)}</span>
              </div>
              <div>
                <span className="block text-amber-600 dark:text-yellow-500">Produtividade</span>
                <span className="text-xs font-black text-amber-900 dark:text-yellow-100">Atual: {perCapitaStats.avgPerDesignerMonth}h</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-black text-amber-900 dark:text-yellow-200 uppercase">NOVO VALOR PER CAPITA/MÊS:</span>
              <span className="text-lg font-black text-amber-950 dark:text-yellow-100 bg-amber-200 dark:bg-yellow-900/30 px-2.5 py-0.5 rounded">
                ⚡ {previewStats.avgPerDesignerMonth}h/mês
              </span>
            </div>
            {aproximado && (
              <p className="pt-2 text-[10px] font-semibold text-amber-800 dark:text-yellow-300/80 normal-case">
                Há mais de um desligado no período: esta prévia conta cada um pelo período inteiro. O valor que vale é o do painel, que conta os dias úteis em que cada um estava.
              </p>
            )}
          </div>

        </div>

        {/* Footer actions */}
        <div className="border-t pt-3.5 border-gray-100 dark:border-slate-800 flex flex-wrap gap-2 justify-between items-center mt-2">
          <button
            onClick={onReset}
            className="px-3.5 py-2 text-gray-500 hover:text-red-500 border border-gray-200 hover:border-red-200 dark:border-slate-800 dark:hover:border-red-950 bg-gray-50 dark:bg-slate-900/50 hover:bg-red-50 dark:hover:bg-red-950/10 rounded-lg text-[10px] sm:text-xs font-black uppercase transition-all flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Restaurar Padrão
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg text-[10px] sm:text-xs font-black uppercase transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                const finalMonths = isMonthAuto ? null : localMonths;
                onSave(finalMonths, localWeights);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all shadow-sm flex items-center gap-1"
            >
              Salvar Configurações
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
