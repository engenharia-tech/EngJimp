import React, { useMemo, useState } from 'react';
import { 
  Users, Clock, AlertTriangle, TrendingDown, 
  ChevronRight, X, BarChart3, PieChart as PieChartIcon,
  PauseCircle, Info
} from 'lucide-react';
import { AppState, InterruptionRecord, InterruptionStatus, User } from '../types';

interface InterruptionDashboardProps {
  data: AppState;
  theme: 'light' | 'dark';
}

export const InterruptionDashboard: React.FC<InterruptionDashboardProps> = ({ data, theme }) => {
  const interruptions = data.interruptions;
  const [selectedDesigner, setSelectedDesigner] = useState<string | null>(null);

  const designerStats = useMemo(() => {
    const stats: Record<string, { 
      id: string,
      name: string, 
      totalInterruptions: number, 
      totalLostTime: number,
      projectIds: Set<string>
    }> = {};

    interruptions.forEach(i => {
      const designerId = i.designerId;
      const designer = data.users.find(u => u.id === designerId);
      const designerName = designer ? `${designer.name} ${designer.surname || ''}`.trim() : 'Desconhecido';
      
      if (!stats[designerId]) {
        stats[designerId] = { 
          id: designerId,
          name: designerName, 
          totalInterruptions: 0, 
          totalLostTime: 0,
          projectIds: new Set()
        };
      }
      stats[designerId].totalInterruptions += 1;
      stats[designerId].totalLostTime += i.totalTimeSeconds;
      if (i.projectNs) stats[designerId].projectIds.add(i.projectNs);
    });

    return Object.values(stats).sort((a, b) => b.totalInterruptions - a.totalInterruptions);
  }, [interruptions, data.users]);

  const areaStats = useMemo(() => {
    const stats: Record<string, { 
      area: string, 
      totalInterruptions: number, 
      totalLostTime: number 
    }> = {};

    interruptions.forEach(i => {
      const area = i.responsibleArea;
      if (!stats[area]) {
        stats[area] = { area, totalInterruptions: 0, totalLostTime: 0 };
      }
      stats[area].totalInterruptions += 1;
      stats[area].totalLostTime += i.totalTimeSeconds;
    });

    return Object.values(stats).sort((a, b) => b.totalLostTime - a.totalLostTime);
  }, [interruptions]);

  const selectedDesignerData = useMemo(() => {
    if (!selectedDesigner) return null;
    return designerStats.find(s => s.id === selectedDesigner);
  }, [selectedDesigner, designerStats]);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const costPerSecond = useMemo(() => {
    const totalSalary = data.users.reduce((acc, u) => acc + (u.salary || 0), 0);
    return (totalSalary / 220) / 3600;
  }, [data.users]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Area Stats Section */}
      <div className="bg-white dark:bg-black rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-black flex items-center justify-between">
          <h3 className="text-lg font-bold text-black dark:text-white flex items-center">
            <BarChart3 className="w-5 h-5 mr-2 text-amber-500" />
            Paradas por Departamento / Área
          </h3>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {areaStats.map((stat) => (
            <div key={stat.area} className="p-4 bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-gray-100 dark:border-slate-800">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{stat.area}</span>
                <span className="text-xs font-bold text-red-600 dark:text-red-400">{formatDuration(stat.totalLostTime)}</span>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-2xl font-black text-black dark:text-white">{stat.totalInterruptions}</p>
                  <p className="text-[10px] text-gray-400 uppercase font-bold">Interrupções</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-red-600 dark:text-red-400">{formatCurrency(stat.totalLostTime * costPerSecond)}</p>
                  <p className="text-[10px] text-gray-400 uppercase font-bold">Custo Estimado</p>
                </div>
              </div>
              <div className="mt-3 w-full bg-gray-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-amber-500 h-full rounded-full" 
                  style={{ width: `${Math.min(100, (stat.totalLostTime / (areaStats[0]?.totalLostTime || 1)) * 100)}%` }}
                />
              </div>
            </div>
          ))}
          {areaStats.length === 0 && (
            <div className="col-span-full py-8 text-center text-gray-500 italic">
              Nenhuma parada registrada por área.
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-black rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-black flex items-center justify-between">
          <h3 className="text-lg font-bold text-black dark:text-white flex items-center">
            <Users className="w-5 h-5 mr-2 text-blue-500" />
            Paradas por Projetista
          </h3>
          <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
            Total de {designerStats.length} Projetistas
          </span>
        </div>
        
        <div className="divide-y divide-gray-100 dark:divide-slate-700">
          {designerStats.map((stat) => (
            <button
              key={stat.id}
              onClick={() => setSelectedDesigner(stat.id)}
              className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
                  {stat.name.charAt(0)}
                </div>
                <div className="text-left">
                  <p className="font-bold text-black dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {stat.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    {stat.totalInterruptions} paradas registradas
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-bold text-red-600 dark:text-red-400">
                    {formatDuration(stat.totalLostTime)}
                  </p>
                  <p className="text-[10px] text-gray-400 uppercase font-bold">Tempo Perdido</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors" />
              </div>
            </button>
          ))}
          {designerStats.length === 0 && (
            <div className="p-12 text-center text-gray-500 italic">
              Nenhuma interrupção registrada até o momento.
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedDesignerData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-black rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between bg-gray-50 dark:bg-black">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-bold shadow-lg">
                  {selectedDesignerData.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-black dark:text-white">{selectedDesignerData.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400 uppercase font-bold tracking-wider">Detalhamento de Impacto</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedDesigner(null)}
                className="p-2 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>

            <div className="p-8 grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Projetos Impactados</p>
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-blue-500" />
                  <p className="text-2xl font-black text-black dark:text-white">{selectedDesignerData.projectIds.size}</p>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Interrupções</p>
                <div className="flex items-center gap-2">
                  <PauseCircle className="w-5 h-5 text-amber-500" />
                  <p className="text-2xl font-black text-black dark:text-white">{selectedDesignerData.totalInterruptions}</p>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Tempo Total Perdido</p>
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-red-500" />
                  <p className="text-2xl font-black text-red-600 dark:text-red-400">{formatDuration(selectedDesignerData.totalLostTime)}</p>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Média por Interrupção</p>
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-indigo-500" />
                  <p className="text-2xl font-black text-black dark:text-white">
                    {Math.round(selectedDesignerData.totalLostTime / selectedDesignerData.totalInterruptions / 60)}m
                  </p>
                </div>
              </div>

              <div className="space-y-1 col-span-2 pt-4 border-t border-gray-100 dark:border-slate-700">
                <p className="text-xs font-bold text-red-500 uppercase tracking-wider">Custo Total das Paradas</p>
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                    <TrendingDown className="w-6 h-6 text-red-600 dark:text-red-400" />
                  </div>
                  <p className="text-4xl font-black text-red-600 dark:text-red-400">
                    {formatCurrency(selectedDesignerData.totalLostTime * costPerSecond)}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 bg-gray-50 dark:bg-black border-t border-gray-100 dark:border-slate-700">
              <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-900/30">
                <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Este projetista teve paradas em <strong>{selectedDesignerData.projectIds.size}</strong> projetos diferentes, resultando em uma perda de produtividade de <strong>{formatDuration(selectedDesignerData.totalLostTime)}</strong>.
                </p>
              </div>
              <button 
                onClick={() => setSelectedDesigner(null)}
                className="w-full mt-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-lg"
              >
                Fechar Detalhes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
