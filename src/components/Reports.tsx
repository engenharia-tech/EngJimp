import React, { useMemo, useState } from 'react';
import { 
  AppState, 
  ProjectSession, 
  InterruptionRecord, 
  User 
} from '../types';
import { 
  FileText, 
  Download, 
  Filter, 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  AlertTriangle, 
  TrendingDown, 
  Activity,
  BarChart3,
  User as UserIcon
} from 'lucide-react';

interface ReportsProps {
  data: AppState;
  currentUser: User;
  theme: 'light' | 'dark';
}

export const Reports: React.FC<ReportsProps> = ({ data, currentUser, theme }) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [expandedSection, setExpandedSection] = useState<string | null>('productivity');

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return [currentYear, currentYear - 1, currentYear - 2];
  }, []);

  const productivityData = useMemo(() => {
    const filtered = data.projects.filter(p => {
      if (p.status !== 'COMPLETED') return false;
      const date = new Date(p.endTime || p.startTime);
      return date.getMonth() === selectedMonth && date.getFullYear() === selectedYear;
    });

    const totalProductiveSeconds = filtered.reduce((acc, curr) => acc + (curr.totalActiveSeconds || 0), 0);
    const totalInterruptionSeconds = filtered.reduce((acc, curr) => acc + (curr.interruptionSeconds || 0), 0);
    const totalSeconds = totalProductiveSeconds + totalInterruptionSeconds;
    
    const lossPercentage = totalSeconds > 0 ? (totalInterruptionSeconds / totalSeconds) * 100 : 0;

    return {
      projects: filtered,
      totalCount: filtered.length,
      totalProductiveSeconds,
      totalInterruptionSeconds,
      totalSeconds,
      lossPercentage,
      avgProductiveSeconds: filtered.length > 0 ? totalProductiveSeconds / filtered.length : 0
    };
  }, [data.projects, selectedMonth, selectedYear]);

  const designerData = useMemo(() => {
    const filtered = data.projects.filter(p => {
      if (p.status !== 'COMPLETED') return false;
      const date = new Date(p.endTime || p.startTime);
      return date.getMonth() === selectedMonth && date.getFullYear() === selectedYear;
    });

    const stats: Record<string, { 
      name: string, 
      count: number, 
      productiveSeconds: number, 
      interruptionSeconds: number,
      totalCost: number
    }> = {};

    filtered.forEach(p => {
      const designerId = p.userId || 'unknown';
      if (!stats[designerId]) {
        stats[designerId] = { 
          name: p.userName || 'Desconhecido', 
          count: 0, 
          productiveSeconds: 0, 
          interruptionSeconds: 0,
          totalCost: 0
        };
      }
      stats[designerId].count += 1;
      stats[designerId].productiveSeconds += p.totalActiveSeconds;
      stats[designerId].interruptionSeconds += p.interruptionSeconds || 0;
      stats[designerId].totalCost += p.totalCost || 0;
    });

    return Object.values(stats).sort((a, b) => b.productiveSeconds - a.productiveSeconds);
  }, [data.projects, selectedMonth, selectedYear]);

  const bottleneckData = useMemo(() => {
    const filtered = data.interruptions.filter(i => {
      const date = new Date(i.startTime);
      return date.getMonth() === selectedMonth && date.getFullYear() === selectedYear;
    });

    const areaStats: Record<string, { count: number, totalSeconds: number }> = {};
    
    filtered.forEach(i => {
      if (!areaStats[i.responsibleArea]) {
        areaStats[i.responsibleArea] = { count: 0, totalSeconds: 0 };
      }
      areaStats[i.responsibleArea].count += 1;
      areaStats[i.responsibleArea].totalSeconds += i.totalTimeSeconds;
    });

    return Object.entries(areaStats)
      .map(([area, stats]) => ({
        area,
        count: stats.count,
        totalHours: Number((stats.totalSeconds / 3600).toFixed(1)),
        avgMinutes: stats.count > 0 ? Number((stats.totalSeconds / 60 / stats.count).toFixed(0)) : 0
      }))
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [data.interruptions, selectedMonth, selectedYear]);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const handleExportProductivity = () => {
    const headers = ['Projeto', 'Cliente', 'Projetista', 'Tempo Produtivo', 'Tempo Interrupção', 'Tempo Total', 'Custo Total'];
    const rows = productivityData.projects.map(p => [
      p.ns,
      p.clientName,
      p.userName || 'N/A',
      formatDuration(p.totalActiveSeconds),
      formatDuration(p.interruptionSeconds || 0),
      formatDuration(p.totalSeconds || 0),
      (p.totalCost || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    ].join(','));

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `relatorio_produtividade_${months[selectedMonth]}_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportBottlenecks = () => {
    const headers = ['Área Responsável', 'Qtd. Interrupções', 'Tempo Total Perdido (h)', 'Tempo Médio (m)'];
    const rows = bottleneckData.map(item => [
      item.area,
      item.count,
      item.totalHours,
      item.avgMinutes
    ].join(','));

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `relatorio_gargalos_${months[selectedMonth]}_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center text-black dark:text-white font-bold">
          <FileText className="w-5 h-5 mr-2 text-blue-600" />
          Relatórios Gerenciais
        </div>
        <div className="flex items-center gap-4">
          <select 
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="p-2 border dark:border-slate-600 rounded-lg outline-none text-sm dark:bg-slate-700 dark:text-white"
          >
            {months.map((m, i) => (
              <option key={i} value={i}>{m}</option>
            ))}
          </select>
          <select 
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="p-2 border dark:border-slate-600 rounded-lg outline-none text-sm dark:bg-slate-700 dark:text-white"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Productivity Report Section */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <button 
          onClick={() => setExpandedSection(expandedSection === 'productivity' ? null : 'productivity')}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-black dark:text-white">Relatório de Produtividade Detalhado</h3>
          </div>
          {expandedSection === 'productivity' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>

        {expandedSection === 'productivity' && (
          <div className="p-6 border-t border-gray-100 dark:border-slate-700 space-y-6">
            {/* Summary Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900/30">
                <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase mb-1">Projetos Realizados</p>
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-200">{productivityData.totalCount}</p>
              </div>
              <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase mb-1">Tempo Produtivo</p>
                <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-200">{formatDuration(productivityData.totalProductiveSeconds)}</p>
              </div>
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-900/30">
                <p className="text-xs font-bold text-red-600 dark:text-red-400 uppercase mb-1">Tempo Perdido</p>
                <p className="text-2xl font-bold text-red-900 dark:text-red-200">{formatDuration(productivityData.totalInterruptionSeconds)}</p>
              </div>
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-900/30">
                <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase mb-1">% de Perda</p>
                <p className="text-2xl font-bold text-amber-900 dark:text-amber-200">{productivityData.lossPercentage.toFixed(1)}%</p>
              </div>
            </div>

            {/* Detailed Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-slate-900/50 text-black dark:text-white font-medium border-b border-gray-100 dark:border-slate-700">
                  <tr>
                    <th className="p-3">NS / Projeto</th>
                    <th className="p-3">Cliente</th>
                    <th className="p-3">Projetista</th>
                    <th className="p-3 text-center">Produtivo</th>
                    <th className="p-3 text-center">Interrupção</th>
                    <th className="p-3 text-center">Total</th>
                    <th className="p-3 text-right">Custo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {productivityData.projects.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                      <td className="p-3 font-medium text-black dark:text-white">{p.ns}</td>
                      <td className="p-3 text-black dark:text-white">{p.clientName}</td>
                      <td className="p-3 text-black dark:text-white">{p.userName || 'N/A'}</td>
                      <td className="p-3 text-center text-emerald-600 dark:text-emerald-400 font-medium">{formatDuration(p.totalActiveSeconds)}</td>
                      <td className="p-3 text-center text-red-600 dark:text-red-400 font-medium">{formatDuration(p.interruptionSeconds || 0)}</td>
                      <td className="p-3 text-center text-black dark:text-white font-bold">{formatDuration(p.totalSeconds || 0)}</td>
                      <td className="p-3 text-right text-black dark:text-white font-bold">
                        {(p.totalCost || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                    </tr>
                  ))}
                  {productivityData.projects.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-500 italic">Nenhum projeto concluído neste período.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <button 
                onClick={handleExportProductivity}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                <Download className="w-4 h-4 mr-2" />
                Exportar CSV
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottleneck Report Section */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <button 
          onClick={() => setExpandedSection(expandedSection === 'bottlenecks' ? null : 'bottlenecks')}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-amber-600" />
            <h3 className="font-bold text-black dark:text-white">Relatório de Gargalos (Ranking por Área)</h3>
          </div>
          {expandedSection === 'bottlenecks' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>

        {expandedSection === 'bottlenecks' && (
          <div className="p-6 border-t border-gray-100 dark:border-slate-700 space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-slate-900/50 text-black dark:text-white font-medium border-b border-gray-100 dark:border-slate-700">
                  <tr>
                    <th className="p-3">Área Responsável</th>
                    <th className="p-3 text-center">Qtd. Interrupções</th>
                    <th className="p-3 text-center">Tempo Total Perdido</th>
                    <th className="p-3 text-center">Tempo Médio</th>
                    <th className="p-3 text-center">Impacto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {bottleneckData.map((item, index) => (
                    <tr key={item.area} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                      <td className="p-3 font-medium text-black dark:text-white">
                        <div className="flex items-center">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-2 ${
                            index === 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                          }`}>
                            {index + 1}
                          </span>
                          {item.area}
                        </div>
                      </td>
                      <td className="p-3 text-center text-black dark:text-white">{item.count}</td>
                      <td className="p-3 text-center text-red-600 dark:text-red-400 font-bold">{item.totalHours}h</td>
                      <td className="p-3 text-center text-black dark:text-white">{item.avgMinutes}m</td>
                      <td className="p-3 text-center">
                        <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-2 max-w-[100px] mx-auto">
                          <div 
                            className="bg-red-500 h-2 rounded-full" 
                            style={{ width: `${(item.totalHours / (bottleneckData[0]?.totalHours || 1)) * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {bottleneckData.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-500 italic">Nenhuma interrupção registrada neste período.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <button 
                onClick={handleExportBottlenecks}
                className="flex items-center px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium"
              >
                <Download className="w-4 h-4 mr-2" />
                Exportar CSV
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Designer Productivity Section */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <button 
          onClick={() => setExpandedSection(expandedSection === 'designers' ? null : 'designers')}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <UserIcon className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-black dark:text-white">Produtividade por Projetista</h3>
          </div>
          {expandedSection === 'designers' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>

        {expandedSection === 'designers' && (
          <div className="p-6 border-t border-gray-100 dark:border-slate-700">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-slate-900/50 text-black dark:text-white font-medium border-b border-gray-100 dark:border-slate-700">
                  <tr>
                    <th className="p-3">Projetista</th>
                    <th className="p-3 text-center">Projetos</th>
                    <th className="p-3 text-center">Tempo Produtivo</th>
                    <th className="p-3 text-center">Tempo Interrupção</th>
                    <th className="p-3 text-right">Custo Gerado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {designerData.map((item) => (
                    <tr key={item.name} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                      <td className="p-3 font-medium text-black dark:text-white">{item.name}</td>
                      <td className="p-3 text-center text-black dark:text-white">{item.count}</td>
                      <td className="p-3 text-center text-emerald-600 dark:text-emerald-400 font-bold">{formatDuration(item.productiveSeconds)}</td>
                      <td className="p-3 text-center text-red-600 dark:text-red-400 font-bold">{formatDuration(item.interruptionSeconds)}</td>
                      <td className="p-3 text-right text-black dark:text-white font-bold">
                        {item.totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                    </tr>
                  ))}
                  {designerData.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-500 italic">Nenhum dado de projetista para este período.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
