import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, ComposedChart, Line
} from 'recharts';
import { Sparkles, BarChart3, Download, Clock, Filter, Truck, User as UserIcon, Lightbulb, TrendingDown, Target, Calendar, PauseCircle, Activity, DollarSign, Layers, FileText, CheckCircle2, RefreshCw } from 'lucide-react';
import { AppState, User, InnovationType, ProjectType, ProjectRequestStatus, ProjectSession, InterruptionRecord, AppSettings } from '../types';
import { analyzePerformance } from '../services/geminiService';
import { fetchUsers } from '../services/storageService';
import { useLanguage } from '../i18n/LanguageContext';
import { PRODUCT_CATEGORIES, SUSPENSION_TYPES } from '../constants';
import { parseISO } from 'date-fns';
import { calcActiveSeconds } from '../utils/workdayCalc';

interface DashboardProps {
  data: AppState;
  currentUser: User;
  theme: 'light' | 'dark';
  settings: any;
  onRefresh?: () => Promise<void>;
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#3b82f6', '#8b5cf6', '#ec4899'];

const MultiSelect: React.FC<{
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  t: any;
}> = ({ label, options, selected, onChange, t }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter(o => o !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider px-1">{label}</span>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center justify-between w-full md:w-48 px-3 py-2 border rounded-lg text-sm text-left transition-all duration-200 ${
            isOpen 
              ? 'border-blue-500 ring-2 ring-blue-500/10 bg-white dark:bg-black' 
              : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-black hover:border-gray-300 dark:hover:border-slate-600'
          }`}
        >
          <span className="truncate text-gray-700 dark:text-slate-200 font-medium">
            {selected.length === 0 ? t('all') : `${selected.length} ${t('selected') || 'Selecionados'}`}
          </span>
          <Filter className={`w-3.5 h-3.5 ml-2 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-500' : ''}`} />
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-64 bg-white dark:bg-black border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl p-2 max-h-80 overflow-y-auto animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between p-2 border-b border-gray-100 dark:border-slate-800 mb-2 sticky top-0 bg-white dark:bg-black z-10">
            <button 
              onClick={() => onChange([])}
              className="text-[10px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 uppercase tracking-tight"
            >
              {t('clearAll') || 'Limpar'}
            </button>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-[10px] font-bold text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 uppercase tracking-tight"
            >
              {t('close')}
            </button>
          </div>
          <div className="space-y-0.5">
            {options.map(option => (
              <label key={option} className="flex items-center gap-2.5 p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg cursor-pointer transition-colors group">
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    checked={selected.includes(option)}
                    onChange={() => toggleOption(option)}
                    className="peer w-4 h-4 rounded border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 bg-white dark:bg-black transition-all"
                  />
                </div>
                <span className={`text-xs transition-colors truncate ${
                  selected.includes(option) 
                    ? 'text-blue-700 dark:text-blue-300 font-bold' 
                    : 'text-gray-600 dark:text-slate-400 group-hover:text-gray-900 dark:group-hover:text-slate-200'
                }`}>
                  {option}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const Dashboard: React.FC<DashboardProps> = ({ data, currentUser, theme, settings, onRefresh }) => {
  const { t } = useLanguage();
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});
  const [availableDesigners, setAvailableDesigners] = useState<User[]>([]);

  // Filter States
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  
  // Grouping States
  const [releaseGrouping, setReleaseGrouping] = useState<'MONTHLY' | 'YEARLY' | 'GLOBAL'>('MONTHLY');
  const [designerGrouping, setDesignerGrouping] = useState<'MONTHLY' | 'YEARLY' | 'TOTAL'>('TOTAL');
  const [monthlyGoal, setMonthlyGoal] = useState<number>(160); // Default 160h

  // Ranking Period State
  const [rankingPeriod, setRankingPeriod] = useState<'MONTH' | 'YEAR' | 'CUSTOM'>('MONTH');

  // Novo Estado: Filtro de Projetista para os Gráficos
  const [selectedDesignerForChart, setSelectedDesignerForChart] = useState<string>('ALL');
  const [selectedDesignerForReleases, setSelectedDesignerForReleases] = useState<string>('ALL');
  const [selectedInterruptionDesigner, setSelectedInterruptionDesigner] = useState<string>('ALL');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSuspensions, setSelectedSuspensions] = useState<string[]>([]);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);

  const [visibleSections, setVisibleSections] = useState<string[]>(['kpi', 'ranking', 'innovation', 'releases', 'ns_analysis', 'detailed_report', 'interruption_report']);

  // Helper to normalize strings for comparison (remove accents and uppercase)
  const normalize = (str: string) => 
    str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

  const isTypeMatch = (type: string, target: ProjectType) => 
    normalize(type) === normalize(target);

  const isInnovationTypeMatch = (type: string, target: InnovationType) => 
    normalize(type) === normalize(target);

  useEffect(() => {
    // Load users for the manager chart from the data prop to avoid extra API calls and ensure consistency
    // Exclude 'PROCESSOS' role as they don't belong to product engineering
    const filteredUsers = data.users.filter(u => u.role !== 'PROCESSOS');
    const sortedUsers = [...filteredUsers].sort((a, b) => a.name.localeCompare(b.name));
    const map = sortedUsers.reduce((acc, u) => ({ ...acc, [u.id]: u.name }), {} as Record<string, string>);
    setUsersMap(map);
    setAvailableDesigners(sortedUsers.filter(u => u.role !== 'CEO'));
  }, [data.users]);

  const processUserIds = useMemo(() => {
    return new Set(data.users.filter(u => u.role === 'PROCESSOS').map(u => u.id));
  }, [data.users]);

  const months = useMemo(() => [
    t('jan'), t('feb'), t('mar'), t('apr'), t('may'), t('jun'), 
    t('jul'), t('aug'), t('sep'), t('oct'), t('nov'), t('dec')
  ], [t]);

  const availableClients = useMemo(() => {
    const clients = new Set<string>();
    data.projectRequests.forEach(r => { if (r.clientName) clients.add(r.clientName); });
    data.projects.forEach(p => { if (p.clientName) clients.add(p.clientName); });
    return Array.from(clients).sort();
  }, [data.projectRequests, data.projects]);

  // Filter Data Logic
  const filteredRequests = useMemo(() => {
    return data.projectRequests.filter(r => {
      if (selectedCategories.length > 0 && !selectedCategories.includes(r.productType || '')) {
        return false;
      }

      if (selectedSuspensions.length > 0 && !selectedSuspensions.includes(r.setup || '')) {
        return false;
      }

      if (selectedClients.length > 0 && !selectedClients.includes(r.clientName || '')) {
        return false;
      }

      if (!startDate && !endDate) return true;

      const rDate = new Date(r.createdAt).getTime();
      
      let start = 0;
      if (startDate) {
        const d = new Date(startDate);
        if (!isNaN(d.getTime())) start = d.getTime();
      }

      let end = Infinity;
      if (endDate) {
        const d = new Date(endDate);
        if (!isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          end = d.getTime();
        }
      }

      return rDate >= start && rDate <= end;
    });
  }, [data.projectRequests, selectedCategories, selectedSuspensions, selectedClients, startDate, endDate]);

  const filteredProjects = useMemo(() => {
    return data.projects.filter(p => {
      // Exclude data from 'PROCESSOS' users
      if (p.userId && processUserIds.has(p.userId)) {
        return false;
      }

      // Role-based filtering: Designers only see their own data in the dashboard
      if (currentUser.role === 'PROJETISTA' && p.userId !== currentUser.id) {
        return false;
      }

      // Category Filter
      if (selectedCategories.length > 0) {
        const req = data.projectRequests.find(r => r.ns === p.ns);
        const pCat = req?.productType || p.implementType;
        if (!selectedCategories.includes(pCat as string)) return false;
      }

      // Suspension Filter
      if (selectedSuspensions.length > 0) {
        const req = data.projectRequests.find(r => r.ns === p.ns);
        const pSusp = req?.setup || '';
        if (!selectedSuspensions.includes(pSusp)) return false;
      }

      // Client Filter
      if (selectedClients.length > 0) {
        const req = data.projectRequests.find(r => r.ns === p.ns);
        const pClient = req?.clientName || p.clientName || '';
        if (!selectedClients.includes(pClient)) return false;
      }

      if (!startDate && !endDate) return true;

      const pStart = new Date(p.startTime).getTime();
      const pEnd = p.endTime ? new Date(p.endTime).getTime() : Infinity;
      
      let start = 0;
      if (startDate) {
        const d = new Date(startDate);
        if (!isNaN(d.getTime())) start = d.getTime();
      }

      let end = Infinity;
      if (endDate) {
        const d = new Date(endDate);
        if (!isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          end = d.getTime();
        }
      }
      
      // A project is relevant if it overlaps with the selected range
      return pStart <= end && pEnd >= start;
    });
  }, [data.projects, startDate, endDate, currentUser.role, currentUser.id, selectedCategories, selectedSuspensions, selectedClients, data.projectRequests]);

  const filteredIssues = useMemo(() => {
     return data.issues.filter(i => {
      if (!startDate && !endDate) return true;

      const iDate = new Date(i.date).getTime();
      
      let start = 0;
      if (startDate) {
        const d = new Date(startDate);
        if (!isNaN(d.getTime())) start = d.getTime();
      }

      let end = Infinity;
      if (endDate) {
        const d = new Date(endDate);
        if (!isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          end = d.getTime();
        }
      }

      return iDate >= start && iDate <= end;
     });
  }, [data.issues, startDate, endDate]);

   const filteredInnovations = useMemo(() => {
    return data.innovations.filter(inv => {
      if (!startDate && !endDate) return true;

      const iDate = inv.createdAt ? new Date(inv.createdAt).getTime() : 0;
      if (!iDate) return true; // Include if no date (legacy or error)
      
      let start = 0;
      if (startDate) {
        const d = new Date(startDate);
        if (!isNaN(d.getTime())) start = d.getTime();
      }

      let end = Infinity;
      if (endDate) {
        const d = new Date(endDate);
        if (!isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          end = d.getTime();
        }
      }

      return iDate >= start && iDate <= end;
    });
  }, [data.innovations, startDate, endDate]);

  const filteredInterruptions = useMemo(() => {
    return data.interruptions.filter(i => {
      // Exclude data from 'PROCESSOS' users
      if (i.designerId && processUserIds.has(i.designerId)) {
        return false;
      }

      if (!startDate && !endDate) return true;

      const iDate = new Date(i.startTime).getTime();
      
      let start = 0;
      if (startDate) {
        const d = new Date(startDate);
        if (!isNaN(d.getTime())) start = d.getTime();
      }

      let end = Infinity;
      if (endDate) {
        const d = new Date(endDate);
        if (!isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          end = d.getTime();
        }
      }

      return iDate >= start && iDate <= end;
    });
  }, [data.interruptions, startDate, endDate]);


  // 1. Calculate Average Time per Project Type
  const averageTimes = useMemo(() => {
    const sums: Record<string, { total: number; count: number }> = {};
    
    filteredProjects.forEach(p => {
      if (!sums[p.type]) sums[p.type] = { total: 0, count: 0 };
      sums[p.type].total += p.totalActiveSeconds;
      sums[p.type].count += 1;
    });

    return Object.entries(sums).map(([type, stats]) => ({
      type,
      avgSeconds: Math.round(stats.total / stats.count)
    })).sort((a, b) => a.type.localeCompare(b.type));
  }, [filteredProjects]);

  // 1.5 Calculate Total Savings (ALL APPROVED/IMPLEMENTED - regardless of period)
  const totalSavings = useMemo(() => {
    return data.innovations.reduce((acc, curr) => {
        // Include PENDING as well since the label says "Predicted/Expected"
        if (curr.status === 'APPROVED' || curr.status === 'IMPLEMENTED' || curr.status === 'PENDING') {
            return acc + (curr.totalAnnualSavings || 0);
        }
        return acc;
    }, 0);
  }, [data.innovations]);

  const totalHours = useMemo(() => {
    // Para um cálculo linear "sem margem de erro", precisamos unir todos os intervalos produtivos
    // de projetos e atividades operacionais, subtraindo as pausas e interrupções.
    
    const allProductiveSegments: { start: number; end: number }[] = [];

    // Processar Projetos
    filteredProjects.forEach(p => {
        if (!p.startTime) return;
        const pStart = parseISO(p.startTime).getTime();
        const pEnd = (p.endTime ? parseISO(p.endTime) : new Date()).getTime();

        let pSegments = [{ start: pStart, end: pEnd }];

        // Subtrair pausas do projeto
        (p.pauses || []).forEach(pause => {
            const pauseStart = parseISO(pause.timestamp).getTime();
            const pauseEnd = pause.durationSeconds === -1 ? Date.now() : pauseStart + pause.durationSeconds * 1000;
            
            const next: typeof pSegments = [];
            pSegments.forEach(seg => {
                if (pauseEnd <= seg.start || pauseStart >= seg.end) next.push(seg);
                else {
                    if (pauseStart > seg.start) next.push({ start: seg.start, end: pauseStart });
                    if (pauseEnd < seg.end) next.push({ start: pauseEnd, end: seg.end });
                }
            });
            pSegments = next;
        });

        // Subtrair interrupções resolvidas deste projeto
        data.interruptions.filter(i => (i.projectId === p.id || i.projectNs === p.ns) && i.status === 'RESOLVED').forEach(i => {
            const iStart = parseISO(i.startTime).getTime();
            const iEnd = (i.endTime ? parseISO(i.endTime) : new Date()).getTime();
            
            const next: typeof pSegments = [];
            pSegments.forEach(seg => {
                if (iEnd <= seg.start || iStart >= seg.end) next.push(seg);
                else {
                    if (iStart > seg.start) next.push({ start: seg.start, end: iStart });
                    if (iEnd < seg.end) next.push({ start: iEnd, end: seg.end });
                }
            });
            pSegments = next;
        });

        allProductiveSegments.push(...pSegments);
    });

    // Processar Atividades Operacionais (que já são produtivas por natureza)
    data.operationalActivities.forEach(a => {
        const aStart = parseISO(a.startTime).getTime();
        const aEnd = (a.endTime ? parseISO(a.endTime) : new Date()).getTime();
        
        // Filtro de período simplificado comparando timestamps se startDate/endDate existirem
        let include = true;
        if (startDate) {
            const filterStart = new Date(startDate).setHours(0,0,0,0);
            if (aEnd < filterStart) include = false;
        }
        if (endDate) {
            const filterEnd = new Date(endDate).setHours(23,59,59,999);
            if (aStart > filterEnd) include = false;
        }

        if (include) {
            allProductiveSegments.push({ start: aStart, end: aEnd });
        }
    });

    if (allProductiveSegments.length === 0) return 0;

    // Unir intervalos (Interval Union)
    allProductiveSegments.sort((a, b) => a.start - b.start);
    const merged: typeof allProductiveSegments = [];
    let current = { ...allProductiveSegments[0] };
    
    for (let i = 1; i < allProductiveSegments.length; i++) {
        const next = allProductiveSegments[i];
        if (next.start < current.end) {
            current.end = Math.max(current.end, next.end);
        } else {
            merged.push(current);
            current = { ...next };
        }
    }
    merged.push(current);

    // Calcular segundos de trabalho reais dentro da união (respeitando expediente e almoço)
    let totalWorkingSeconds = 0;
    merged.forEach(seg => {
        totalWorkingSeconds += calcActiveSeconds(new Date(seg.start), new Date(seg.end), settings, true);
    });

    return Math.round(totalWorkingSeconds / 3600);
  }, [filteredProjects, data.operationalActivities, data.interruptions, startDate, endDate, settings, t]);

  const goalProgress = useMemo(() => {
    if (monthlyGoal <= 0) return 0;
    return Math.min(Math.round((totalHours / monthlyGoal) * 100), 100);
  }, [totalHours, monthlyGoal]);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const rankingStats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const allUserIds = new Set([
        ...Object.keys(usersMap),
        ...filteredProjects.map(p => p.userId).filter(Boolean) as string[]
    ]);

    return Array.from(allUserIds).map(userId => {
        const userName = usersMap[userId] || (userId.length < 30 ? userId : t('unknown'));
        
        // Always start with filteredProjects to respect role-based access
        const userProjects = filteredProjects.filter(p => {
            if (p.userId !== userId) return false;

            const pDate = new Date(p.endTime || p.startTime);
            
            if (rankingPeriod === 'MONTH') {
                return pDate.getMonth() === currentMonth && pDate.getFullYear() === currentYear;
            } else if (rankingPeriod === 'YEAR') {
                return pDate.getFullYear() === currentYear;
            }
            // For 'CUSTOM', filteredProjects already handles the date range
            return true; 
        });

        const releases = userProjects.filter(p => isTypeMatch(p.type, ProjectType.RELEASE)).length;
        const variations = userProjects.filter(p => isTypeMatch(p.type, ProjectType.VARIATION)).length;
        const developments = userProjects.filter(p => isTypeMatch(p.type, ProjectType.DEVELOPMENT)).length;

        return { id: userId, name: userName, releases, variations, developments, total: releases + variations + developments };
    }).filter(stat => stat.total > 0).sort((a, b) => b.total - a.total);
  }, [usersMap, rankingPeriod, filteredProjects]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);
  };

  const costPerSecond = useMemo(() => {
    return (settings?.hourlyCost || 0) / 3600;
  }, [settings]);

  const costData = useMemo(() => {
    let totalProductive = 0;

    // 1. Costs from finished projects
    filteredProjects.forEach(p => {
      // Recalculate based on the new formula for consistency
      const productiveCost = (p.totalActiveSeconds / 3600) * (costPerSecond * 3600);
      totalProductive += productiveCost;
    });

    // 2. Costs from filtered interruptions
    const totalInterruptionSeconds = filteredInterruptions.reduce((acc, i) => acc + i.totalTimeSeconds, 0);
    const totalInterruptionCost = totalInterruptionSeconds * costPerSecond;

    const totalOverall = totalProductive + totalInterruptionCost;

    return {
      productive: totalProductive,
      interruption: totalInterruptionCost,
      totalInterruptionSeconds,
      total: totalOverall,
      percentageLost: totalOverall > 0 ? (totalInterruptionCost / totalOverall) * 100 : 0
    };
  }, [filteredProjects, filteredInterruptions, costPerSecond]);

  // --- NOVO GRÁFICO: Horas Realizadas vs Meta Mensal ---
  const hoursVsGoalData = useMemo(() => {
    const sums: Record<string, number> = {};
    
    filteredProjects.forEach(p => {
      const date = new Date(p.endTime || p.startTime);
      const month = months[date.getMonth()];
      const year = date.getFullYear().toString().slice(-2);
      const key = `${month}/${year}`;
      
      if (selectedDesignerForChart === 'ALL' || p.userId === selectedDesignerForChart) {
        sums[key] = (sums[key] || 0) + (p.totalActiveSeconds || 0);
      }
    });

    return Object.keys(sums).map(key => ({
      name: key,
      Realizado: Number((sums[key] / 3600).toFixed(1)),
      Meta: monthlyGoal
    })).sort((a, b) => {
        // Chronological sort: Parse "Mês/Ano" (e.g., "Jan/24")
        const [monthA, yearA] = a.name.split('/');
        const [monthB, yearB] = b.name.split('/');
        
        const yearDiff = parseInt(yearA) - parseInt(yearB);
        if (yearDiff !== 0) return yearDiff;
        
        return months.indexOf(monthA) - months.indexOf(monthB);
    });
  }, [filteredProjects, selectedDesignerForChart, monthlyGoal, months]);

  // 2. Bar Chart Data: Releases (Monthly, Yearly or Global)
  const barData = useMemo(() => {
    if (releaseGrouping === 'GLOBAL') {
        return [{
            name: 'Total Global',
            liberacoes: filteredProjects.length
        }];
    }

    const releasesByPeriod = filteredProjects
      .filter(p => selectedDesignerForReleases === 'ALL' || p.userId === selectedDesignerForReleases)
      .reduce((acc, curr) => {
        const date = new Date(curr.endTime || curr.startTime);
        let key = '';
        
        if (releaseGrouping === 'MONTHLY') {
            const month = months[date.getMonth()];
            const year = date.getFullYear().toString().slice(-2);
            key = `${month}/${year}`;
        } else {
            key = date.getFullYear().toString();
        }
        
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    return Object.keys(releasesByPeriod).map(key => ({
      name: key,
      liberacoes: releasesByPeriod[key]
    })).sort((a, b) => {
        if (releaseGrouping === 'MONTHLY') {
            const [mA, yA] = a.name.split('/');
            const [mB, yB] = b.name.split('/');
            if (yA !== yB) return parseInt(yA) - parseInt(yB);
            return months.indexOf(mA) - months.indexOf(mB);
        }
        return a.name.localeCompare(b.name);
    });
  }, [filteredProjects, releaseGrouping, selectedDesignerForReleases, months]);

  // 3. Removed: Issue Type Distribution (Pie Chart)

  // 4. Pie Chart: Implement Type Distribution
  const implementData = useMemo(() => {
    const counts = filteredProjects.reduce((acc, curr) => {
      const type = curr.implementType || t('notInformed');
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.keys(counts).map(key => ({
      name: key,
      value: counts[key]
    }));
  }, [filteredProjects, t]);

  // 5. Bar Chart: Releases by Designer (Manager Only)
  const designerData = useMemo(() => {
    if (currentUser.role !== 'GESTOR') return [];

    const counts = filteredProjects.reduce((acc, curr) => {
      const name = usersMap[curr.userId || ''] || (curr.userId && curr.userId.length < 30 ? curr.userId : t('unknown'));
      const date = new Date(curr.endTime || curr.startTime);
      
      let key = name;
      if (designerGrouping === 'MONTHLY') {
          const month = months[date.getMonth()];
          const year = date.getFullYear().toString().slice(-2);
          key = `${name} (${month}/${year})`;
      } else if (designerGrouping === 'YEARLY') {
          const year = date.getFullYear();
          key = `${name} (${year})`;
      }

      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.keys(counts).map(key => ({
      name: key,
      liberacoes: counts[key]
    }));
  }, [filteredProjects, currentUser.role, usersMap, designerGrouping, months, t]);

  // 6. Stacked Bar Chart: Innovations by Status and Type
  const innovationChartData = useMemo(() => {
    const statuses = ['PENDING', 'APPROVED', 'IMPLEMENTED', 'REJECTED'];
    const labelMap: Record<string, string> = {
        'PENDING': t('pending'),
        'APPROVED': t('approved'),
        'IMPLEMENTED': t('implemented'),
        'REJECTED': t('rejected')
    };

    return statuses.map(status => {
        const items = filteredInnovations.filter(i => i.status === status);
        const newProjects = items.filter(i => isInnovationTypeMatch(i.type, InnovationType.NEW_PROJECT)).length;
        const improvements = items.filter(i => isInnovationTypeMatch(i.type, InnovationType.PRODUCT_IMPROVEMENT)).length;
        const optimizations = items.filter(i => isInnovationTypeMatch(i.type, InnovationType.PROCESS_OPTIMIZATION)).length;
        
        return {
            name: labelMap[status],
            [InnovationType.NEW_PROJECT]: newProjects,
            [InnovationType.PRODUCT_IMPROVEMENT]: improvements,
            [InnovationType.PROCESS_OPTIMIZATION]: optimizations
        };
    });
  }, [filteredInnovations]);


  // 7. Stacked Bar Chart: Activities by Designer (Release, Variation, Development)
  const activitiesByDesigner = useMemo(() => {
    const data: Record<string, { name: string, [key: string]: any }> = {};

    filteredProjects.forEach(p => {
        const userName = usersMap[p.userId || ''] || (p.userId && p.userId.length < 30 ? p.userId : t('unknown'));
        if (!data[userName]) {
            data[userName] = { 
                name: userName, 
                [ProjectType.RELEASE]: 0, 
                [ProjectType.VARIATION]: 0, 
                [ProjectType.DEVELOPMENT]: 0 
            };
        }
        
        // Count occurrences with normalization
        if (isTypeMatch(p.type, ProjectType.RELEASE)) data[userName][ProjectType.RELEASE]++;
        else if (isTypeMatch(p.type, ProjectType.VARIATION)) data[userName][ProjectType.VARIATION]++;
        else if (isTypeMatch(p.type, ProjectType.DEVELOPMENT)) data[userName][ProjectType.DEVELOPMENT]++;
    });

    return Object.values(data);
  }, [filteredProjects, usersMap]);

  // 8. Stacked Bar Chart: Interruptions by Designer (Reason Breakdown)
  const interruptionsByDesigner = useMemo(() => {
    const data: Record<string, { name: string, [key: string]: any }> = {};
    const allReasons = new Set<string>();

    filteredProjects.forEach(p => {
        const userName = usersMap[p.userId || ''] || (p.userId && p.userId.length < 30 ? p.userId : t('unknown'));
        if (!data[userName]) {
            data[userName] = { name: userName };
        }
        
        if (p.pauses && p.pauses.length > 0) {
            p.pauses.forEach(pause => {
                const reason = pause.reason || t('others');
                allReasons.add(reason);
                data[userName][reason] = (data[userName][reason] || 0) + 1;
            });
        }
    });

    // Ensure all keys exist for recharts to stack correctly (optional but good practice)
    const result = Object.values(data).map(item => {
        allReasons.forEach(r => {
            if (!item[r]) item[r] = 0;
        });
        return item;
    });

    return { data: result, reasons: Array.from(allReasons) };
  }, [filteredProjects, usersMap]);

  // 8.1. Monthly Interruptions (General View)
  const interruptionsByMonth = useMemo(() => {
    const data: Record<string, { name: string, total: number, [key: string]: any }> = {};
    const allReasons = new Set<string>();

    filteredProjects.forEach(p => {
        const date = new Date(p.startTime);
        const monthYear = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        
        if (!data[monthYear]) {
            data[monthYear] = { name: monthYear, total: 0 };
        }
        
        if (p.pauses && p.pauses.length > 0) {
            p.pauses.forEach(pause => {
                const reason = pause.reason || t('others');
                allReasons.add(reason);
                data[monthYear][reason] = (data[monthYear][reason] || 0) + 1;
                data[monthYear].total++;
            });
        }
    });

    const result = Object.values(data).sort((a, b) => {
        const [mA, yA] = a.name.split('/');
        const [mB, yB] = b.name.split('/');
        return new Date(`20${yA}-${mA}-01`).getTime() - new Date(`20${yB}-${mB}-01`).getTime();
    });

    return { data: result, reasons: Array.from(allReasons) };
  }, [filteredProjects]);

  // 9. Interruptions for Selected Designer (Grouped by Project)
  const interruptionsForSelectedDesigner = useMemo(() => {
    if (selectedInterruptionDesigner === 'ALL') return [];

    const data: Record<string, { name: string, [key: string]: any }> = {};
    const allReasons = new Set<string>();

    const designerProjects = filteredProjects.filter(p => p.userId === selectedInterruptionDesigner);

    designerProjects.forEach(p => {
        const date = new Date(p.startTime);
        const monthYear = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        
        if (!data[monthYear]) {
            data[monthYear] = { name: monthYear };
        }
        
        if (p.pauses && p.pauses.length > 0) {
            p.pauses.forEach(pause => {
                const reason = pause.reason || t('others');
                allReasons.add(reason);
                data[monthYear][reason] = (data[monthYear][reason] || 0) + 1;
            });
        }
    });

    const result = Object.values(data).sort((a, b) => {
        const [mA, yA] = a.name.split('/');
        const [mB, yB] = b.name.split('/');
        return new Date(`20${yA}-${mA}-01`).getTime() - new Date(`20${yB}-${mB}-01`).getTime();
    });

    return { data: result, reasons: Array.from(allReasons) };
  }, [filteredProjects, selectedInterruptionDesigner]);

  // 10. NS Queue Analysis
  const nsQueueAnalysis = useMemo(() => {
    const statusCounts: Record<string, number> = {
      [ProjectRequestStatus.PENDING]: 0,
      [ProjectRequestStatus.IN_PROGRESS]: 0,
      [ProjectRequestStatus.COMPLETED]: 0,
      [ProjectRequestStatus.CANCELLED]: 0,
    };

    const categoryCounts: Record<string, number> = {};

    filteredRequests.forEach(r => {
      statusCounts[r.status]++;
      const cat = r.productType || 'Outros';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name: t(name.toLowerCase() as any), value }));
    const categoryData = Object.entries(categoryCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return { statusData, categoryData };
  }, [filteredRequests]);

  const keyProductsReport = useMemo(() => {
    return PRODUCT_CATEGORIES.filter(cat => cat !== 'Outros').map(category => {
      const queueItems = data.projectRequests.filter(r => 
        (r.productType === category || r.setup === category) && 
        r.status !== ProjectRequestStatus.COMPLETED && 
        r.status !== ProjectRequestStatus.CANCELLED
      );

      const inQueue = queueItems.length;
      const totalEstimatedHours = queueItems.reduce((acc, r) => acc + (r.managementEstimate || 0), 0);

      const completedItems = data.projects.filter(p => {
        const req = data.projectRequests.find(r => r.ns === p.ns);
        const matchesRequest = req && (req.productType === category || req.setup === category);
        const matchesProject = p.implementType === (category as any);
        return (matchesRequest || matchesProject) && p.status === 'COMPLETED';
      });

      const completed = completedItems.length;

      return {
        label: category,
        inQueue,
        completed,
        totalEstimatedHours,
        nsList: queueItems.map(r => r.ns).slice(0, 5) // Show first 5 NSs
      };
    }).filter(item => item.inQueue > 0 || item.completed > 0);
  }, [data.projectRequests, data.projects]);

  const detailedProductReport = useMemo(() => {
    const allNs = Array.from(new Set([
      ...data.projectRequests.map(r => r.ns),
      ...data.projects.map(p => p.ns)
    ])).sort((a, b) => b.localeCompare(a));

    return allNs.map(ns => {
      const request = data.projectRequests.find(r => r.ns === ns);
      const projects = data.projects.filter(p => p.ns === ns);
      const completedProject = projects.find(p => p.status === 'COMPLETED');

      return {
        ns,
        clientName: request?.clientName || projects[0]?.clientName || '-',
        productType: request?.productType || projects[0]?.implementType || '-',
        dimension: request?.dimension || '-',
        setup: request?.setup || '-',
        chassis: request?.chassisNumber || projects[0]?.chassisNumber || '-',
        status: request?.status || (completedProject ? ProjectRequestStatus.COMPLETED : ProjectRequestStatus.IN_PROGRESS),
        isReleasedThisMonth: completedProject ? (
          new Date(completedProject.endTime!).getMonth() === new Date().getMonth() && 
          new Date(completedProject.endTime!).getFullYear() === new Date().getFullYear()
        ) : false
      };
    }).filter(item => {
      // Apply filters to the detailed report as well
      if (selectedCategories.length > 0 && !selectedCategories.includes(item.productType)) return false;
      if (selectedSuspensions.length > 0 && !selectedSuspensions.includes(item.setup)) return false;
      if (selectedClients.length > 0 && !selectedClients.includes(item.clientName)) return false;
      return true;
    });
  }, [data.projectRequests, data.projects, selectedCategories, selectedSuspensions, selectedClients]);

  const handleAiAnalysis = async () => {
    setIsLoadingAi(true);
    const result = await analyzePerformance(filteredProjects, filteredIssues, filteredInterruptions, data.settings, data.users);
    setAiAnalysis(result);
    setIsLoadingAi(false);
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'NS', 'Codigo', 'Bastidor', 'Tipo', 'Implemento', 'Inicio', 'Fim', 'Tempo Total(s)', 'Status', 'Notas'];
    const rows = filteredProjects.map(p => [
      p.id,
      p.ns,
      p.projectCode || '',
      p.chassisNumber || '',
      p.type,
      p.implementType || '',
      p.startTime,
      p.endTime || '',
      p.totalActiveSeconds,
      p.status,
      `"${(p.notes || '').replace(/"/g, '""')}"`
    ].join(','));

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `design_track_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportNSCSV = () => {
    const headers = [
      t('idHeader'), 
      t('nsHeader'), 
      t('clientHeader'), 
      t('chassisHeader'), 
      t('createdAtHeader'), 
      t('statusHeader'), 
      t('categoryHeader'), 
      t('dimensionHeader'), 
      t('flooringHeader'), 
      t('setupHeader')
    ];
    const rows = filteredRequests.map(r => [
      r.id,
      r.ns,
      r.clientName || '',
      r.chassisNumber || '',
      r.createdAt,
      r.status,
      r.productType || '',
      `"${(r.dimension || '').replace(/"/g, '""')}"`,
      r.flooring || '',
      r.setup || ''
    ].join(','));

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ns_queue_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      
      {/* Date Filter Section */}
      <div className="bg-white dark:bg-black p-5 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center text-black dark:text-white font-black uppercase tracking-widest text-sm">
            <Filter className="w-5 h-5 mr-3 text-blue-600" />
            {t('analysisFilters')}
          </div>
          
          <div className="flex items-center gap-2 ml-auto">
            {onRefresh && (
              <button 
                onClick={onRefresh}
                className="p-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl text-gray-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-all hover:shadow-md active:scale-95"
                title={t('refreshData')}
              >
                <Activity className="w-4 h-4" />
              </button>
            )}
            <button 
              onClick={handleExportCSV}
              className="flex items-center text-[10px] font-black text-gray-600 dark:text-slate-300 hover:text-white bg-white dark:bg-black border border-gray-200 dark:border-slate-700 px-4 py-2.5 rounded-xl hover:bg-blue-600 dark:hover:bg-blue-600 hover:border-blue-600 transition-all shadow-sm uppercase tracking-wider"
            >
              <Download className="w-3.5 h-3.5 mr-2" />
              {t('exportCsv')}
            </button>
          </div>
        </div>



        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-x-3 gap-y-4 items-end pt-3 border-t border-gray-50 dark:border-slate-800">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider px-1">{t('from')}</span>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-[12px] bg-gray-50 dark:bg-black text-gray-700 dark:text-white transition-all shadow-sm"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider px-1">{t('to')}</span>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-[12px] bg-gray-50 dark:bg-black text-gray-700 dark:text-white transition-all shadow-sm"
              />
            </div>
          </div>

          <MultiSelect 
            label={t('client')}
            options={availableClients}
            selected={selectedClients}
            onChange={setSelectedClients}
            t={t}
          />

          <MultiSelect 
            label={t('category')}
            options={PRODUCT_CATEGORIES}
            selected={selectedCategories}
            onChange={setSelectedCategories}
            t={t}
          />

          {currentUser.role === 'GESTOR' ? (
            <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
              <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider px-1">{t('designer')}</span>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <select
                  value={selectedDesignerForReleases}
                  onChange={(e) => {
                    setSelectedDesignerForReleases(e.target.value);
                    setSelectedDesignerForChart(e.target.value);
                  }}
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-[12px] bg-gray-50 dark:bg-black text-gray-700 dark:text-white cursor-pointer appearance-none transition-all shadow-sm"
                >
                  <option value="ALL">{t('all')}</option>
                  {availableDesigners.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <MultiSelect 
              label={t('suspension')}
              options={SUSPENSION_TYPES}
              selected={selectedSuspensions}
              onChange={setSelectedSuspensions}
              t={t}
            />
          )}
        </div>

        {(selectedClients.length > 0 || selectedCategories.length > 0 || selectedSuspensions.length > 0 || selectedDesignerForReleases !== 'ALL') && (
          <div className="flex items-center gap-3 pt-2">
            <button 
              onClick={() => {
                setSelectedClients([]);
                setSelectedCategories([]);
                setSelectedSuspensions([]);
                setSelectedDesignerForReleases('ALL');
                setSelectedDesignerForChart('ALL');
              }}
              className="text-[10px] font-black text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 uppercase tracking-widest flex items-center gap-1.5 transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              {t('clearFilters') || 'Limpar Filtros'}
            </button>
            <div className="h-3 w-px bg-gray-200 dark:bg-black" />
            <span className="text-[10px] font-medium text-gray-400 dark:text-slate-500 uppercase tracking-wider">
              {filteredProjects.length} {t('results') || 'Resultados'}
            </span>
          </div>
        )}
      </div>

      {/* Dashboard Visibility Controls */}
      <div className="bg-white dark:bg-black p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm">
        <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase mb-3">{t('selectDashboards')}</p>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-x-4 gap-y-3">
          <label className="flex items-center gap-2 cursor-pointer group">
            <input 
              type="checkbox" 
              checked={visibleSections.includes('kpi')} 
              onChange={() => setVisibleSections(prev => prev.includes('kpi') ? prev.filter(s => s !== 'kpi') : [...prev, 'kpi'])}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-[11px] sm:text-sm font-medium text-gray-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors uppercase">{t('totalHours')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer group">
            <input 
              type="checkbox" 
              checked={visibleSections.includes('ranking')} 
              onChange={() => setVisibleSections(prev => prev.includes('ranking') ? prev.filter(s => s !== 'ranking') : [...prev, 'ranking'])}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-[11px] sm:text-sm font-medium text-gray-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors uppercase">{t('productivityRankingTitle')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer group">
            <input 
              type="checkbox" 
              checked={visibleSections.includes('innovation')} 
              onChange={() => setVisibleSections(prev => prev.includes('innovation') ? prev.filter(s => s !== 'innovation') : [...prev, 'innovation'])}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-[11px] sm:text-sm font-medium text-gray-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors uppercase">{t('innovationStatus')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer group">
            <input 
              type="checkbox" 
              checked={visibleSections.includes('ns_analysis')} 
              onChange={() => setVisibleSections(prev => prev.includes('ns_analysis') ? prev.filter(s => s !== 'ns_analysis') : [...prev, 'ns_analysis'])}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-[11px] sm:text-sm font-medium text-gray-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors uppercase">{t('nsAnalysis')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer group">
            <input 
              type="checkbox" 
              checked={visibleSections.includes('detailed_report')} 
              onChange={() => setVisibleSections(prev => prev.includes('detailed_report') ? prev.filter(s => s !== 'detailed_report') : [...prev, 'detailed_report'])}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-[11px] sm:text-sm font-medium text-gray-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors uppercase">{t('detailedReport')}</span>
          </label>
          {['GESTOR', 'CEO', 'COORDENADOR'].includes(currentUser.role) && (
            <>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={visibleSections.includes('activities')} 
                  onChange={() => setVisibleSections(prev => prev.includes('activities') ? prev.filter(s => s !== 'activities') : [...prev, 'activities'])}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-[11px] sm:text-sm font-medium text-gray-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors uppercase">{t('activitiesByDesigner')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={visibleSections.includes('stops')} 
                  onChange={() => setVisibleSections(prev => prev.includes('stops') ? prev.filter(s => s !== 'stops') : [...prev, 'stops'])}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-[11px] sm:text-sm font-medium text-gray-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors uppercase">{t('stopAnalysis')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={visibleSections.includes('interruption_report')} 
                  onChange={() => setVisibleSections(prev => prev.includes('interruption_report') ? prev.filter(s => s !== 'interruption_report') : [...prev, 'interruption_report'])}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-[11px] sm:text-sm font-medium text-gray-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors uppercase">{t('interruptionReport')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={visibleSections.includes('releases')} 
                  onChange={() => setVisibleSections(prev => prev.includes('releases') ? prev.filter(s => s !== 'releases') : [...prev, 'releases'])}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-[11px] sm:text-sm font-medium text-gray-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors uppercase">{t('teamReleases')}</span>
              </label>
            </>
          )}
        </div>
      </div>

      {/* KPI Section */}
      {visibleSections.includes('kpi') && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {currentUser.role !== 'PROCESSOS' && averageTimes.length > 0 && averageTimes.map((stat) => (
            <div key={stat.type} className="bg-white dark:bg-black p-3 sm:p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
              <div>
                <p className="text-[9px] sm:text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 sm:mb-1">{t('avgTime')} {stat.type}</p>
                <p className="text-sm sm:text-xl font-black text-black dark:text-white">{formatDuration(stat.avgSeconds)}</p>
              </div>
              <div className="h-7 w-7 sm:h-8 sm:w-8 bg-blue-50 dark:bg-black rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0">
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>
          ))}
          
          {currentUser.role !== 'PROCESSOS' && (
            <div className="bg-white dark:bg-black p-3 sm:p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/30 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
              <div className="w-full">
                <p className="text-[9px] sm:text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-0.5 sm:mb-1">{t('totalHours')}</p>
                <p className="text-sm sm:text-xl font-black text-indigo-800 dark:text-indigo-300">{totalHours}h</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1 sm:h-1.5 bg-gray-100 dark:bg-black rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500" style={{ width: `${goalProgress}%` }}></div>
                  </div>
                  <span className="text-[8px] sm:text-[10px] font-bold text-indigo-600 dark:text-indigo-400">{goalProgress}%</span>
                </div>
              </div>
              <div className="h-7 w-7 sm:h-8 sm:w-8 bg-indigo-50 dark:bg-black rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>
          )}

          {/* Innovation KPI */}
           <div className="bg-white dark:bg-black p-3 sm:p-4 rounded-xl border border-emerald-100 dark:border-emerald-900/30 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
              <div>
                <p className="text-[9px] sm:text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-0.5 sm:mb-1">{t('annualSavings')}</p>
                <p className="text-sm sm:text-xl font-black text-emerald-800 dark:text-emerald-300">{formatCurrency(totalSavings)}</p>
              </div>
              <div className="h-7 w-7 sm:h-8 sm:w-8 bg-emerald-50 dark:bg-black rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                <TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            </div>

          {/* Cost KPI */}
          <div className="bg-white dark:bg-black p-3 sm:p-4 rounded-xl border border-blue-100 dark:border-blue-900/30 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
            <div>
              <p className="text-[9px] sm:text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-0.5 sm:mb-1">{t('totalProjectValue')}</p>
              <p className="text-sm sm:text-xl font-black text-blue-800 dark:text-blue-300">{formatCurrency(costData.productive)}</p>
              <p className="text-[8px] sm:text-[10px] text-blue-500 font-medium mt-0.5 sm:mt-1">{t('productiveTimeBase')}</p>
            </div>
            <div className="h-7 w-7 sm:h-8 sm:w-8 bg-blue-50 dark:bg-slate-900 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0">
              <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>

          {/* Interruption Cost KPI */}
          <div className="bg-white dark:bg-black p-3 sm:p-4 rounded-xl border border-red-100 dark:border-red-900/30 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
            <div>
              <p className="text-[9px] sm:text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-0.5 sm:mb-1">{t('interruptionCost')}</p>
              <p className="text-sm sm:text-xl font-black text-red-800 dark:text-red-300">{formatCurrency(costData.interruption)}</p>
              <p className="text-[8px] sm:text-[10px] text-red-500 font-medium mt-0.5 sm:mt-1">{t('totalTime')}: {formatDuration(costData.totalInterruptionSeconds)}</p>
            </div>
            <div className="h-7 w-7 sm:h-8 sm:w-8 bg-red-50 dark:bg-black rounded-full flex items-center justify-center text-red-600 dark:text-red-400 flex-shrink-0">
              <TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
        </div>
      )}

      {/* AI Insights Section */}
        {currentUser.role !== 'PROCESSOS' && (
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:bg-black p-6 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
            <div className="flex flex-col sm:flex-row items-center justify-between mb-4 gap-4">
              <h3 className="text-xl font-bold text-indigo-900 dark:text-indigo-300 flex items-center">
                <Sparkles className="w-5 h-5 mr-2 text-indigo-600 dark:text-indigo-400" />
                {t('aiAnalysis')}
              </h3>
              <button 
                onClick={handleAiAnalysis}
                disabled={isLoadingAi}
                className="w-full sm:w-auto bg-indigo-600 text-white px-6 py-3 sm:py-2 rounded-xl text-sm font-black hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-500/20 uppercase tracking-widest active:scale-95"
              >
                {isLoadingAi ? t('analyzing') : t('generateReport')}
              </button>
            </div>
            
            {aiAnalysis ? (
              <div className="prose prose-sm max-w-none text-black dark:text-white bg-white/50 dark:bg-black p-4 rounded-lg">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed uppercase">{aiAnalysis}</pre>
              </div>
            ) : (
              <p className="text-black dark:text-white text-sm uppercase">
                {t('aiAnalysisPrompt')}
              </p>
            )}
          </div>
        )}

      {/* NOVO: Gráfico Horas Realizadas vs Meta Mensal */}
      {currentUser.role !== 'PROCESSOS' && visibleSections.includes('kpi') && (
        <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 min-h-[400px]">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div className="flex flex-col">
                <h3 className="text-lg font-bold text-black dark:text-white flex items-center uppercase">
                    <Target className="w-5 h-5 mr-2 text-indigo-500" />
                    {t('hoursVsGoalTitle')}
                </h3>
                <p className="text-xs text-black dark:text-white ml-7 opacity-70 uppercase">{t('hoursVsGoalSub')}</p>
            </div>
              
              <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 dark:text-slate-400">{t('goalLabel')}</span>
                      <input 
                          type="number" 
                          value={monthlyGoal}
                          onChange={(e) => setMonthlyGoal(Number(e.target.value))}
                          className="w-16 p-1 border dark:border-slate-600 rounded text-sm outline-none focus:ring-1 focus:ring-indigo-500 dark:bg-black dark:text-white"
                      />
                  </div>

                  {currentUser.role === 'GESTOR' && (
                  <select
                      value={selectedDesignerForChart}
                      onChange={(e) => setSelectedDesignerForChart(e.target.value)}
                      className="p-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-gray-50 dark:bg-black dark:text-white cursor-pointer"
                  >
                      <option value="ALL">{t('allDesigners')}</option>
                      {availableDesigners.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                  </select>
                  )}
              </div>
            </div>

            <div className="h-[250px] sm:h-[300px] w-full">
              {hoursVsGoalData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={hoursVsGoalData} margin={{ top: 10, right: window.innerWidth < 640 ? 10 : 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} style={{ fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} />
                    <YAxis 
                      allowDecimals={false} 
                      tickLine={false} 
                      axisLine={false} 
                      style={{ fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b' }}
                      label={{ value: t('hours'), angle: -90, position: 'insideLeft', style: { fill: theme === 'dark' ? '#64748b' : '#9ca3af', fontSize: '12px' } }}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                      cursor={{ fill: theme === 'dark' ? '#334155' : '#f3f4f6' }}
                      formatter={(value: number) => [`${value}h`, '']}
                    />
                    <Legend wrapperStyle={{ paddingTop: '10px' }} />
                    <Bar dataKey="Realizado" name={t('realizedHours')} fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40} />
                    <Line type="monotone" dataKey="Meta" name={t('goal')} stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-slate-500 text-sm">
                  <Target className="w-8 h-8 text-gray-200 dark:text-slate-700 mb-2" />
                  {t('noHoursData')}
                </div>
              )}
            </div>
          </div>
        )}

      {/* NOVO: Ranking do Mês (CEO/GESTOR/COORDENADOR) */}
      {(currentUser.role === 'CEO' || currentUser.role === 'GESTOR' || currentUser.role === 'COORDENADOR') && currentUser.role !== 'PROCESSOS' && visibleSections.includes('ranking') && (
        <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
            <div className="flex flex-col md:flex-row items-center justify-between mb-4 gap-4">
                    <h3 className="text-lg font-bold text-black dark:text-white flex items-center uppercase">
                        <Target className="w-5 h-5 mr-2 text-purple-600" />
                        {t('productivityRankingTitle')}
                    </h3>
                
                <div className="flex bg-gray-100 dark:bg-black p-1 rounded-lg">
                    <button 
                        onClick={() => setRankingPeriod('MONTH')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${rankingPeriod === 'MONTH' ? 'bg-white dark:bg-black text-purple-600 dark:text-purple-400 shadow-sm' : 'text-gray-500 dark:text-slate-400'}`}
                    >
                        <Calendar className="w-3 h-3" />
                        {t('thisMonth')}
                    </button>
                    <button 
                        onClick={() => setRankingPeriod('YEAR')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${rankingPeriod === 'YEAR' ? 'bg-white dark:bg-black text-purple-600 dark:text-purple-400 shadow-sm' : 'text-gray-500 dark:text-slate-400'}`}
                    >
                        <Calendar className="w-3 h-3" />
                        {t('thisYear')}
                    </button>
                    <button 
                        onClick={() => setRankingPeriod('CUSTOM')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${rankingPeriod === 'CUSTOM' ? 'bg-white dark:bg-black text-purple-600 dark:text-purple-400 shadow-sm' : 'text-gray-500 dark:text-slate-400'}`}
                    >
                        <Filter className="w-3 h-3" />
                        {t('custom')}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                   {/* Mobile List / Desktop Table */}
                   <div className="md:hidden space-y-3 mb-6">
                        {rankingStats.length === 0 ? (
                            <div className="p-8 text-center bg-gray-50 dark:bg-black rounded-xl text-gray-500 dark:text-slate-400 italic text-sm">
                                {t('noProjects')}
                            </div>
                        ) : (
                            rankingStats.map((stat, index) => (
                                <div key={index} className="bg-gray-50 dark:bg-black p-4 rounded-xl border border-gray-100 dark:border-slate-800">
                                    <div className="flex items-center justify-between mb-3 border-b border-gray-100 dark:border-slate-800 pb-2">
                                        <div className="flex items-center">
                                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-2 ${
                                                index === 0 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30' : 
                                                index === 1 ? 'bg-gray-200 text-gray-700 dark:bg-slate-700' : 
                                                index === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30' : 'bg-blue-50 text-blue-600'
                                            }`}>
                                                {index + 1}
                                            </span>
                                            <span className="font-bold text-gray-900 dark:text-white uppercase">{stat.name}</span>
                                        </div>
                                        <div className="bg-white dark:bg-black px-2 py-1 rounded text-xs font-black text-indigo-600 dark:text-indigo-400 shadow-sm">
                                            {stat.total} {t('total').toUpperCase()}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="text-center">
                                            <div className="text-[10px] text-gray-500 dark:text-slate-500 uppercase font-bold">{t('releases')}</div>
                                            <div className="text-sm font-black text-blue-600">{stat.releases}</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-[10px] text-gray-500 dark:text-slate-500 uppercase font-bold">{t('variations')}</div>
                                            <div className="text-sm font-black text-orange-600">{stat.variations}</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-[10px] text-gray-500 dark:text-slate-500 uppercase font-bold">{t('developments')}</div>
                                            <div className="text-sm font-black text-green-600">{stat.developments}</div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                   </div>

                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 dark:bg-black text-black dark:text-white font-medium border-b border-gray-100 dark:border-slate-700">
                                <tr>
                                    <th className="p-3">{t('designerCol')}</th>
                                    <th className="p-3 text-center">{t('releases')}</th>
                                    <th className="p-3 text-center">{t('variations')}</th>
                                    <th className="p-3 text-center">{t('developments')}</th>
                                    <th className="p-3 text-center">{t('total')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                                {rankingStats.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-4 text-center text-black dark:text-white italic">
                                            {rankingPeriod === 'MONTH' ? t('noProjectsMonth') : 
                                            rankingPeriod === 'YEAR' ? t('noProjectsYear') : 
                                            t('noProjects')}
                                        </td>
                                    </tr>
                                ) : (
                                    rankingStats.map((stat, index) => (
                                        <tr key={index} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                                            <td className="p-3 font-medium text-black dark:text-white">
                                                <div className="flex items-center">
                                                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-2 ${
                                                        index === 0 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 
                                                        index === 1 ? 'bg-gray-100 text-gray-700 dark:bg-black dark:text-slate-300' : 
                                                        index === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                                    }`}>
                                                        {index + 1}
                                                    </span>
                                                    {stat.name}
                                                </div>
                                            </td>
                                            <td className="p-3 text-center font-bold text-blue-600 dark:text-blue-400">{stat.releases}</td>
                                            <td className="p-3 text-center font-bold text-orange-600 dark:text-orange-400">{stat.variations}</td>
                                            <td className="p-3 text-center font-bold text-green-600 dark:text-green-400">{stat.developments}</td>
                                            <td className="p-3 text-center font-bold text-black dark:text-white">{stat.total}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="h-[250px] sm:h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={rankingStats}
                            layout="vertical"
                            margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                            <XAxis type="number" hide />
                            <YAxis 
                                dataKey="name" 
                                type="category" 
                                axisLine={false} 
                                tickLine={false}
                                style={{ fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b' }}
                                width={100}
                            />
                            <Tooltip 
                                contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                                cursor={{ fill: theme === 'dark' ? '#334155' : '#f3f4f6' }}
                            />
                            <Bar dataKey="total" name={t('totalDeliveries').toUpperCase()} fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={30}>
                                {rankingStats.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={index === 0 ? '#8b5cf6' : index === 1 ? '#a78bfa' : index === 2 ? '#c4b5fd' : '#ddd6fe'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
      )}

      {/* NS Queue Analysis Section */}
      {visibleSections.includes('ns_analysis') && (
        <div className="space-y-6 mb-6">
          <div className="flex items-center justify-between bg-white dark:bg-black p-4 rounded-xl border border-gray-100 dark:border-slate-800 shadow-sm">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center uppercase">
              <Layers className="w-5 h-5 mr-2 text-orange-500" />
              {t('nsReports')}
            </h3>
            <button 
              onClick={handleExportNSCSV}
              className="flex items-center text-sm font-bold text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white bg-gray-50 dark:bg-black border border-gray-200 dark:border-slate-600 px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors uppercase"
            >
              <Download className="w-4 h-4 mr-2" />
              {t('exportNSReport')}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white dark:bg-black p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center uppercase">
                <Layers className="w-5 h-5 mr-2 text-orange-500" />
                {t('nsStatus')}
              </h3>
            </div>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={nsQueueAnalysis.statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {nsQueueAnalysis.statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: theme === 'dark' ? '#000' : '#fff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#fff' : '#000' }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-black p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center uppercase">
                <Truck className="w-5 h-5 mr-2 text-blue-500" />
                {t('nsByCategory')}
              </h3>
            </div>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={nsQueueAnalysis.categoryData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} horizontal={false} />
                  <XAxis type="number" stroke={theme === 'dark' ? '#94a3b8' : '#64748b'} fontSize={12} />
                  <YAxis dataKey="name" type="category" stroke={theme === 'dark' ? '#94a3b8' : '#64748b'} fontSize={10} width={100} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: theme === 'dark' ? '#000' : '#fff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#fff' : '#000' }}
                  />
                  <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} name={t('ordersCount')} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    )}

      {/* Detailed Product Report Section */}
      {visibleSections.includes('detailed_report') && (
        <div className="bg-white dark:bg-black p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 animate-in fade-in slide-in-from-bottom-4 duration-500 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center uppercase">
              <FileText className="w-5 h-5 mr-2 text-blue-500" />
              {t('detailedProductReport')}
            </h3>
            <div className="flex items-center gap-2">
              {(selectedClients.length > 0 || selectedCategories.length > 0 || selectedSuspensions.length > 0) && (
                <button 
                  onClick={() => {
                    setSelectedClients([]);
                    setSelectedCategories([]);
                    setSelectedSuspensions([]);
                  }}
                  className="text-[10px] font-bold text-red-500 hover:text-red-600 uppercase px-2 py-1 bg-red-50 dark:bg-red-900/20 rounded-lg transition-colors"
                >
                  {t('clearFilters')}
                </button>
              )}
              <button 
                onClick={() => {
                const headers = [
                  t('nsHeader'), 
                  t('clientHeader'), 
                  t('productHeader'), 
                  t('chassisHeader'), 
                  t('setupHeader'), 
                  t('dimensionHeader'), 
                  t('statusHeader'), 
                  t('releasedThisMonthHeader')
                ];
                const rows = detailedProductReport.map(item => [
                  item.ns,
                  item.clientName,
                  item.productType,
                  item.chassis,
                  item.setup,
                  item.dimension,
                  item.status,
                  item.isReleasedThisMonth ? t('yes') : t('no')
                ]);
                const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                const url = URL.createObjectURL(blob);
                link.setAttribute("href", url);
                link.setAttribute("download", `relatorio_detalhado_produtos_${new Date().toISOString().split('T')[0]}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="flex items-center text-xs font-bold text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white bg-gray-50 dark:bg-black border border-gray-200 dark:border-slate-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors uppercase"
            >
              <Download className="w-4 h-4 mr-1" />
              {t('exportReport')}
            </button>
          </div>
        </div>

          <div className="flex flex-wrap items-end gap-4 mb-6">
            <div className="w-full mb-2 flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-[10px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-widest">{t('detailedReport') || 'Relatório Detalhado'}</span>
              </div>
              <div className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                {detailedProductReport.length} {t('results') || 'Resultados'}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {/* Mobile Cards / Desktop Table */}
            <div className="md:hidden space-y-4">
              {detailedProductReport.slice(0, 10).map((item, idx) => (
                <div key={idx} className="bg-gray-50 dark:bg-black p-4 rounded-xl border border-gray-100 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">{item.ns}</span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                      item.status === ProjectRequestStatus.COMPLETED ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                      item.status === ProjectRequestStatus.IN_PROGRESS ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                      'bg-gray-100 text-gray-700 dark:bg-black dark:text-slate-400'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-2 uppercase">{item.clientName}</h4>
                  <div className="grid grid-cols-2 gap-y-2 text-[10px] font-medium uppercase text-gray-500 dark:text-slate-400">
                    <div>
                      <span className="block text-[8px] opacity-60">{t('productType')}</span>
                      <span className="text-gray-700 dark:text-slate-200">{item.productType}</span>
                    </div>
                    <div>
                      <span className="block text-[8px] opacity-60">{t('bastidor')}</span>
                      <span className="text-gray-700 dark:text-slate-200">{item.chassis}</span>
                    </div>
                    <div>
                      <span className="block text-[8px] opacity-60">{t('setup')}</span>
                      <span className="text-gray-700 dark:text-slate-200">{item.setup}</span>
                    </div>
                    <div>
                      <span className="block text-[8px] opacity-60">{t('releasedMonth')}</span>
                      <span className={item.isReleasedThisMonth ? 'text-emerald-600 font-bold' : ''}>{item.isReleasedThisMonth ? t('yes') : t('no')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <table className="hidden md:table w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 dark:border-slate-800">
                  <th className="py-3 px-4 text-[10px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t('productNs')}</th>
                  <th className="py-3 px-4 text-[10px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t('client')}</th>
                  <th className="py-3 px-4 text-[10px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t('productType')}</th>
                  <th className="py-3 px-4 text-[10px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t('bastidor')}</th>
                  <th className="py-3 px-4 text-[10px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t('setup')}</th>
                  <th className="py-3 px-4 text-[10px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t('dimension')}</th>
                  <th className="py-3 px-4 text-[10px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t('status')}</th>
                  <th className="py-3 px-4 text-[10px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t('releasedMonth')}</th>
                </tr>
              </thead>
              <tbody>
                {detailedProductReport.slice(0, 20).map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-50 dark:border-slate-900 hover:bg-gray-50/50 dark:hover:bg-slate-900/50 transition-colors">
                    <td className="py-3 px-4 text-xs font-bold text-blue-600 dark:text-blue-400">{item.ns}</td>
                    <td className="py-3 px-4 text-xs font-medium text-gray-800 dark:text-white">{item.clientName}</td>
                    <td className="py-3 px-4 text-xs text-gray-600 dark:text-slate-300">{item.productType}</td>
                    <td className="py-3 px-4 text-xs font-mono text-gray-500 dark:text-slate-400">{item.chassis}</td>
                    <td className="py-3 px-4 text-xs text-gray-600 dark:text-slate-300">{item.setup}</td>
                    <td className="py-3 px-4 text-xs text-gray-600 dark:text-slate-300">{item.dimension}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                        item.status === ProjectRequestStatus.COMPLETED ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        item.status === ProjectRequestStatus.IN_PROGRESS ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                        'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {item.isReleasedThisMonth && (
                        <span className="flex items-center text-emerald-600 dark:text-emerald-400 font-black text-[10px]">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          {t('yes')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detailedProductReport.length > 20 && (
              <p className="mt-4 text-[10px] text-gray-500 dark:text-slate-500 italic text-center">
                {t('showingRecentNs', { count: 20 })}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Interruption Report Section */}
      {visibleSections.includes('interruption_report') && (
        <div className="bg-white dark:bg-black p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 animate-in fade-in slide-in-from-bottom-4 duration-500 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center uppercase">
              <PauseCircle className="w-5 h-5 mr-2 text-red-500" />
              {t('interruptionReport')}
            </h3>
            <button 
              onClick={() => {
                const headers = [
                  t('nsHeader'), 
                  t('clientHeader'), 
                  t('designerCol'), 
                  t('reason'), 
                  t('area'), 
                  t('start'), 
                  t('totalTime'), 
                  t('estimatedCost')
                ];
                const rows = filteredInterruptions.map(i => [
                  i.projectNs,
                  i.clientName,
                  usersMap[i.designerId] || i.designerId,
                  i.problemType,
                  t(i.responsibleArea.toLowerCase() as any),
                  i.startTime,
                  formatDuration(i.totalTimeSeconds),
                  formatCurrency(i.totalTimeSeconds * costPerSecond)
                ]);
                const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                const url = URL.createObjectURL(blob);
                link.setAttribute("href", url);
                link.setAttribute("download", `relatorio_interrupcoes_custos_${new Date().toISOString().split('T')[0]}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="flex items-center text-xs font-bold text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white bg-gray-50 dark:bg-black border border-gray-200 dark:border-slate-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors uppercase"
            >
              <Download className="w-4 h-4 mr-1" />
              {t('exportReport')}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 dark:border-slate-800">
                  <th className="py-3 px-4 text-[10px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t('nsHeader')}</th>
                  <th className="py-3 px-4 text-[10px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t('client')}</th>
                  <th className="py-3 px-4 text-[10px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t('designerCol')}</th>
                  <th className="py-3 px-4 text-[10px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t('reason')}</th>
                  <th className="py-3 px-4 text-[10px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t('area')}</th>
                  <th className="py-3 px-4 text-[10px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t('totalTime')}</th>
                  <th className="py-3 px-4 text-[10px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">{t('estimatedCost')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredInterruptions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-gray-400 dark:text-slate-500 italic text-sm">
                      {t('noInterruptions')}
                    </td>
                  </tr>
                ) : (
                  filteredInterruptions.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-50 dark:border-slate-900 hover:bg-gray-50/50 dark:hover:bg-slate-900/50 transition-colors">
                      <td className="py-3 px-4 text-xs font-bold text-red-600 dark:text-red-400">{item.projectNs}</td>
                      <td className="py-3 px-4 text-xs font-medium text-gray-800 dark:text-white truncate max-w-[150px]">{item.clientName}</td>
                      <td className="py-3 px-4 text-xs text-gray-600 dark:text-slate-300">{usersMap[item.designerId] || item.designerId}</td>
                      <td className="py-3 px-4 text-xs text-gray-600 dark:text-slate-300 truncate max-w-[200px]" title={item.problemType}>{item.problemType}</td>
                      <td className="py-3 px-4 text-xs text-gray-600 dark:text-slate-300">{t(item.responsibleArea.toLowerCase() as any)}</td>
                      <td className="py-3 px-4 text-xs font-mono text-gray-700 dark:text-slate-200">{formatDuration(item.totalTimeSeconds)}</td>
                      <td className="py-3 px-4 text-xs font-bold text-red-600 dark:text-red-400">{formatCurrency(item.totalTimeSeconds * costPerSecond)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Removed: Issue Distribution (Pie Chart) */}

        {/* Releases per Month (Bar Chart) */}
            {currentUser.role !== 'PROCESSOS' && visibleSections.includes('releases') && (
              <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 min-h-[350px] col-span-1 md:col-span-2">
              <div className="flex justify-between items-center mb-4">
                  <div className="flex flex-col">
                      <h3 className="text-lg font-bold text-black dark:text-white flex items-center uppercase">
                          <BarChart3 className="w-5 h-5 mr-2 text-blue-500" />
                          {currentUser.role === 'GESTOR' || currentUser.role === 'CEO' ? t('teamReleases') : t('yourPerformance')}
                      </h3>
                      {selectedDesignerForReleases !== 'ALL' && (
                          <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold ml-7 uppercase">{t('filteredBy')}: {usersMap[selectedDesignerForReleases] || selectedDesignerForReleases}</span>
                      )}
                  </div>
                  <div className="flex bg-gray-100 dark:bg-black p-1 rounded-lg">
                      <button 
                          onClick={() => setReleaseGrouping('MONTHLY')}
                          className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${releaseGrouping === 'MONTHLY' ? 'bg-white dark:bg-black text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-slate-400'}`}
                      >
                          {t('monthly')}
                      </button>
                      <button 
                          onClick={() => setReleaseGrouping('YEARLY')}
                          className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${releaseGrouping === 'YEARLY' ? 'bg-white dark:bg-black text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-slate-400'}`}
                      >
                          {t('yearly')}
                      </button>
                      <button 
                          onClick={() => setReleaseGrouping('GLOBAL')}
                          className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${releaseGrouping === 'GLOBAL' ? 'bg-white dark:bg-black text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-slate-400'}`}
                      >
                          {t('global')}
                      </button>
                  </div>
              </div>
              <div className="h-[250px] w-full">
                  {barData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} style={{fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b'}} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} style={{fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b'}} />
                      <Tooltip 
                          contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                          cursor={{ fill: theme === 'dark' ? '#334155' : '#f3f4f6' }} 
                      />
                      <Bar dataKey="liberacoes" name={t('releases')} fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={releaseGrouping === 'GLOBAL' ? 80 : 40} />
                      </BarChart>
                  </ResponsiveContainer>
                  ) : (
                  <div className="h-full flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm">
                      {t('noData')}
                  </div>
                  )}
              </div>
              </div>
            )}

        {/* Innovations Chart */}
        {visibleSections.includes('innovation') && (
            <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 min-h-[350px]">
            <h3 className="text-lg font-bold text-black dark:text-white mb-4 flex items-center">
                <Lightbulb className="w-5 h-5 mr-2 text-yellow-500" />
                {t('innovationStatus')}
            </h3>
            <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={innovationChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                        <XAxis dataKey="name" tickLine={false} axisLine={false} style={{fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b'}} />
                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} style={{fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b'}} />
                        <Tooltip 
                            contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                            cursor={{ fill: theme === 'dark' ? '#334155' : '#f3f4f6' }} 
                        />
                        <Legend />
                        <Bar dataKey={InnovationType.NEW_PROJECT} name={t('newProject').toUpperCase()} stackId="a" fill="#8b5cf6" />
                        <Bar dataKey={InnovationType.PRODUCT_IMPROVEMENT} name={t('improvement').toUpperCase()} stackId="a" fill="#3b82f6" />
                        <Bar dataKey={InnovationType.PROCESS_OPTIMIZATION} name={t('optimization').toUpperCase()} stackId="a" fill="#f97316" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            </div>
        )}

        {/* Implement Type (Pie Chart) - REMOVED AS REQUESTED */}


        {/* Manager Only: Releases by Designer */}
        {currentUser.role === 'GESTOR' && (
          <>
            {/* 1. Activities by Designer (Stacked Bar) */}
            {visibleSections.includes('activities') && (
              <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 min-h-[350px]">
                  <h3 className="text-lg font-bold text-black dark:text-white mb-4 flex items-center uppercase">
                      <Activity className="w-5 h-5 mr-2 text-indigo-600" />
                      {t('activitiesByDesigner')}
                  </h3>
                <div className="h-[300px] w-full">
                    {activitiesByDesigner.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={activitiesByDesigner}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                                <XAxis dataKey="name" tickLine={false} axisLine={false} style={{fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b'}} />
                                <YAxis allowDecimals={false} tickLine={false} axisLine={false} style={{fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b'}} />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                                    cursor={{ fill: theme === 'dark' ? '#334155' : '#f3f4f6' }} 
                                />
                                <Legend />
                                <Bar dataKey={ProjectType.RELEASE} name={t('releases').toUpperCase()} stackId="a" fill="#3b82f6" />
                                <Bar dataKey={ProjectType.VARIATION} name={t('variations').toUpperCase()} stackId="a" fill="#f97316" />
                                <Bar dataKey={ProjectType.DEVELOPMENT} name={t('developments').toUpperCase()} stackId="a" fill="#10b981" />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm">
                            {t('noActivityData')}
                        </div>
                    )}
                </div>
            </div>
          )}

            {/* 2. Paradas by Designer (Stacked Bar) */}
            {visibleSections.includes('stops') && (
              <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 min-h-[350px] col-span-1 md:col-span-2">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-gray-700 dark:text-slate-200 flex items-center uppercase">
                          <PauseCircle className="w-5 h-5 mr-2 text-red-500" />
                          {t('stopAnalysis')}
                      </h3>
                    <select 
                        value={selectedInterruptionDesigner}
                        onChange={(e) => setSelectedInterruptionDesigner(e.target.value)}
                        className="p-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-sm bg-gray-50 dark:bg-black dark:text-white cursor-pointer"
                    >
                        <option value="ALL">{t('overviewAll')}</option>
                        {availableDesigners.map((u) => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                    </select>
                </div>

                <div className="h-[300px] w-full">
                    {selectedInterruptionDesigner === 'ALL' ? (
                        interruptionsByMonth.data.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={interruptionsByMonth.data}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                                    <XAxis dataKey="name" tickLine={false} axisLine={false} style={{fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b'}} />
                                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} label={{ value: t('stopCount'), angle: -90, position: 'insideLeft', style: { fill: theme === 'dark' ? '#64748b' : '#9ca3af', fontSize: '12px' } }} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                                        cursor={{ fill: theme === 'dark' ? '#334155' : '#f3f4f6' }} 
                                    />
                                    {/* No legend in general view as requested */}
                                    <Bar dataKey="total" name={t('stopCount')} fill="#ef4444" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm">
                                {t('noStopsPeriod')}
                            </div>
                        )
                    ) : (
                        interruptionsForSelectedDesigner.data.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={interruptionsForSelectedDesigner.data}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                                    <XAxis dataKey="name" tickLine={false} axisLine={false} style={{fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b'}} />
                                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} label={{ value: t('stopCount'), angle: -90, position: 'insideLeft', style: { fill: theme === 'dark' ? '#64748b' : '#9ca3af', fontSize: '12px' } }} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                                        cursor={{ fill: theme === 'dark' ? '#334155' : '#f3f4f6' }} 
                                    />
                                    <Legend />
                                    {interruptionsForSelectedDesigner.reasons.map((reason, index) => (
                                        <Bar 
                                            key={reason} 
                                            dataKey={reason} 
                                            stackId="a" 
                                            fill={COLORS[index % COLORS.length]} 
                                        />
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm border-2 border-dashed border-gray-100 dark:border-slate-700 rounded-lg">
                                {t('noStopsDesigner')}
                            </div>
                        )
                    )}
                </div>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
};
