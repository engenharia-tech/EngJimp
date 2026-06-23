import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, ComposedChart, Line, ScatterChart, Scatter, ZAxis
} from 'recharts';
import { Sparkles, BarChart3, Download, Clock, Filter, Truck, User as UserIcon, Lightbulb, TrendingDown, TrendingUp, Target, Calendar, PauseCircle, Activity, DollarSign, Layers, FileText, CheckCircle2, RefreshCw, Users, Trash2, SlidersHorizontal, GitBranch } from 'lucide-react';
import { AppState, User, InnovationType, ProjectType, ProjectRequestStatus, ProjectSession, InterruptionRecord, AppSettings } from '../types';
import { EngineeringPerformance } from './EngineeringPerformance';
import { InterruptionDashboard } from './InterruptionDashboard';
import { PerCapitaConfigModal } from './PerCapitaConfigModal';
import { analyzePerformance } from '../services/geminiService';
import { MarkdownRenderer } from './MarkdownRenderer';
import { fetchUsers, deleteProjectById, deleteProjectRequest, addAuditLog } from '../services/storageService';
import { useToast } from './Toast';
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

const CustomHoursTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const hoursData = payload.find((p: any) => p.dataKey === 'horas');
    const percentData = payload.find((p: any) => p.dataKey === 'percentage');
    const capacityBase = hoursData?.payload?.capacityBase || 0;
    const projectHours = hoursData?.value || 0;
    const restHours = hoursData?.payload?.rest !== undefined ? hoursData.payload.rest : (capacityBase > projectHours ? capacityBase - projectHours : 0);
    const projectPercent = capacityBase > 0 ? parseFloat(((projectHours / capacityBase) * 100).toFixed(1)) : 0;
    const restPercent = capacityBase > 0 ? parseFloat((Math.max(0, 100 - projectPercent)).toFixed(1)) : 0;

    return (
      <div className="bg-white dark:bg-stone-900 border border-gray-100 dark:border-slate-800 p-4 rounded-xl shadow-lg space-y-2 min-w-[240px]">
        <p className="text-xs font-black text-black dark:text-white uppercase tracking-wide border-b border-gray-100 dark:border-slate-800 pb-1 mb-1">{label}</p>
        
        <p className="text-xs text-amber-500 font-mono flex justify-between gap-4">
          <span>Horas em Projeto:</span> 
          <span className="font-bold">{projectHours.toFixed(1)}h ({projectPercent}%)</span>
        </p>

        <p className="text-xs text-blue-500 font-mono flex justify-between gap-4">
          <span>Outras Atividades / Tempo Livre:</span> 
          <span className="font-bold">{restHours.toFixed(1)}h ({restPercent}%)</span>
        </p>

        <p className="text-[10px] text-gray-500 dark:text-slate-500 italic mt-1 border-t border-gray-50 dark:border-slate-900/50 pt-1 flex justify-between">
          <span>Capacidade Líquida (8.8h/dia):</span>
          <span>{capacityBase.toFixed(1)}h</span>
        </p>
      </div>
    );
  }
  return null;
};

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
  const { addToast } = useToast();
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});
  const [availableDesigners, setAvailableDesigners] = useState<User[]>([]);

  // Deletion States
  const [deleteConfirmationNs, setDeleteConfirmationNs] = useState<string | null>(null);
  const [isDeletingNs, setIsDeletingNs] = useState(false);

  const handleDeleteNs = async () => {
    if (!deleteConfirmationNs) return;
    setIsDeletingNs(true);
    try {
      const ns = deleteConfirmationNs;
      const request = data.projectRequests.find(r => r.ns === ns);
      const projects = data.projects.filter(p => p.ns === ns);

      let deletedRequestCount = 0;
      let deletedProjectsCount = 0;

      // 1. Delete matching project request
      if (request) {
        await deleteProjectRequest(request.id);
        deletedRequestCount++;
      }

      // 2. Delete matching project sessions
      for (const p of projects) {
        const res = await deleteProjectById(p.id, p.ns);
        if (res.success) {
          deletedProjectsCount++;
        }
      }

      addToast(`Sucesso: ${deletedRequestCount} pedido(s) de NS e ${deletedProjectsCount} sessão(ões) d-projeto excluídos para o NS "${ns}".`, 'success');

      // 3. Log to audit trails
      await addAuditLog({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'DELETE',
        entityType: 'PROJECT',
        entityId: ns,
        entityName: ns,
        details: `Exclusão forçada do NS "${ns}" realizada por ${currentUser.name} via Relatório Detalhado. Apagado(s) ${deletedRequestCount} pedido(s) e ${deletedProjectsCount} sessão(ões).`
      });

      // 4. Refresh app data
      if (onRefresh) {
        await onRefresh();
      } else {
        window.location.reload();
      }
    } catch (error: any) {
      console.error("Erro ao deletar NS:", error);
      addToast("Ocorreu um erro ao excluir os registros.", 'error');
    } finally {
      setIsDeletingNs(false);
      setDeleteConfirmationNs(null);
    }
  };

  // Estados para personalização do cálculo de produtividade Per Capita
  const [overrideMonths, setOverrideMonths] = useState<number | null>(() => {
    const saved = localStorage.getItem('per_capita_override_months');
    return saved ? parseFloat(saved) : null;
  });
  
  const [designerWeights, setDesignerWeights] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('per_capita_designer_weights');
    return saved ? JSON.parse(saved) : {};
  });

  const [isPerCapitaModalOpen, setIsPerCapitaModalOpen] = useState(false);

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
  const [nsFilterByPeriod, setNsFilterByPeriod] = useState<boolean>(false);
  const [selectedEdsonDay, setSelectedEdsonDay] = useState<number | null>(null);
  const [selectedEdsonAnalyticsUser, setSelectedEdsonAnalyticsUser] = useState<string>('ALL');
  const [projectTimeSearchQuery, setProjectTimeSearchQuery] = useState<string>('');
  const [projectTimePage, setProjectTimePage] = useState<number>(0);

  const hasPermissionForSection = (section: string): boolean => {
    const role = currentUser.role;
    switch (section) {
      case 'kpi':
        return role !== 'PROCESSOS';
      case 'ranking':
        return (role === 'CEO' || role === 'GESTOR' || role === 'COORDENADOR') && role !== 'PROCESSOS';
      case 'innovation':
        return true;
      case 'releases':
        return role !== 'PROCESSOS';
      case 'ns_analysis':
        return true;
      case 'detailed_report':
        return true;
      case 'project_hours_table':
        return true;
      case 'advanced_charts':
        return true;
      case 'interruption_report':
        return ['GESTOR', 'CEO', 'COORDENADOR'].includes(role);
      case 'engineering_compliance':
        return ['GESTOR', 'COORDENADOR', 'CEO', 'PROCESSOS'].includes(role);
      case 'activities':
        return role === 'GESTOR';
      case 'stops':
        return role === 'GESTOR';
      default:
        return true;
    }
  };

  const [visibleSections, setVisibleSections] = useState<string[]>(() => {
    const sections = ['kpi', 'ranking', 'innovation', 'releases', 'ns_analysis', 'detailed_report', 'interruption_report', 'engineering_compliance', 'advanced_charts', 'project_hours_table', 'activities', 'stops'];
    const role = currentUser.role;
    return sections.filter(section => {
      switch (section) {
        case 'kpi':
          return role !== 'PROCESSOS';
        case 'ranking':
          return (role === 'CEO' || role === 'GESTOR' || role === 'COORDENADOR') && role !== 'PROCESSOS';
        case 'innovation':
          return true;
        case 'releases':
          return role !== 'PROCESSOS';
        case 'ns_analysis':
          return true;
        case 'detailed_report':
          return true;
        case 'project_hours_table':
          return true;
        case 'advanced_charts':
          return true;
        case 'interruption_report':
          return ['GESTOR', 'CEO', 'COORDENADOR'].includes(role);
        case 'engineering_compliance':
          return ['GESTOR', 'COORDENADOR', 'CEO', 'PROCESSOS'].includes(role);
        case 'activities':
          return role === 'GESTOR';
        case 'stops':
          return role === 'GESTOR';
        default:
          return true;
      }
    });
  });

  useEffect(() => {
    const sections = ['kpi', 'ranking', 'innovation', 'releases', 'ns_analysis', 'detailed_report', 'interruption_report', 'engineering_compliance', 'advanced_charts', 'project_hours_table', 'activities', 'stops'];
    const role = currentUser.role;
    setVisibleSections(sections.filter(section => {
      switch (section) {
        case 'kpi':
          return role !== 'PROCESSOS';
        case 'ranking':
          return (role === 'CEO' || role === 'GESTOR' || role === 'COORDENADOR') && role !== 'PROCESSOS';
        case 'innovation':
          return true;
        case 'releases':
          return role !== 'PROCESSOS';
        case 'ns_analysis':
          return true;
        case 'detailed_report':
          return true;
        case 'project_hours_table':
          return true;
        case 'advanced_charts':
          return true;
        case 'interruption_report':
          return ['GESTOR', 'CEO', 'COORDENADOR'].includes(role);
        case 'engineering_compliance':
          return ['GESTOR', 'COORDENADOR', 'CEO', 'PROCESSOS'].includes(role);
        case 'activities':
          return role === 'GESTOR';
        case 'stops':
          return role === 'GESTOR';
        default:
          return true;
      }
    }));
  }, [currentUser.role]);

  // Helper to normalize strings for comparison (remove accents and uppercase)
  const normalize = (str: string) => 
    str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

  const isTypeMatch = (type: string, target: ProjectType) => 
    normalize(type) === normalize(target);

  const isInnovationTypeMatch = (type: string, target: InnovationType) => {
    if (!type) return false;
    const normType = normalize(type).replace(/_/g, " ").replace(/\s+/g, " ").trim();
    const normTarget = normalize(target).replace(/_/g, " ").replace(/\s+/g, " ").trim();

    if (normType === normTarget) return true;

    // Direct mappings for common Portuguese / English and legacy DB terms
    if (target === InnovationType.NEW_PROJECT) {
      return normType === 'NOVO PROJETO' || normType === 'NEW PROJECT';
    }
    if (target === InnovationType.PRODUCT_IMPROVEMENT) {
      return normType === 'MELHORIA DE PRODUTO' || normType === 'PRODUCT IMPROVEMENT';
    }
    if (target === InnovationType.PROCESS_OPTIMIZATION) {
      return normType === 'OTIMIZACAO DE PROCESSOS' || normType === 'PROCESS OPTIMIZATION';
    }

    return false;
  };

  useEffect(() => {
    // Load users for the manager chart from the data prop to avoid extra API calls and ensure consistency
    // Exclude 'PROCESSOS' role as they don't belong to product engineering
    const filteredUsers = data.users.filter(u => u.role !== 'PROCESSOS');
    const sortedUsers = [...filteredUsers].sort((a, b) => a.name.localeCompare(b.name));
    const map = sortedUsers.reduce((acc, u) => ({ ...acc, [u.id]: u.name }), {} as Record<string, string>);
    setUsersMap(map);
    setAvailableDesigners(sortedUsers.filter(u => u.role !== 'CEO' || u.id === currentUser.id));
  }, [data.users, currentUser.id]);

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

      if (!nsFilterByPeriod) return true;

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
  }, [data.projectRequests, selectedCategories, selectedSuspensions, selectedClients, startDate, endDate, nsFilterByPeriod]);

  const filteredProjects = useMemo(() => {
    return data.projects.filter(p => {
      // Exclude data from 'PROCESSOS' users
      const isSomeEdson = p.userId ? (() => {
        const u = data.users.find(x => x.id === p.userId);
        return u ? (u.email === 'efariaseng0@gmail.com' || u.username === 'edson' || (u.name && u.name.toLowerCase().includes('edson'))) : false;
      })() : false;

      if (p.userId && processUserIds.has(p.userId) && !isSomeEdson) {
        return false;
      }

      // Role-based filtering: Designers only see their own data in the dashboard
      if (currentUser.role === 'PROJETISTA' && p.userId !== currentUser.id) {
        return false;
      }

      // Filter project hours for PROJETISTA: useful hours are VARIATION, DEVELOPMENT, or RELEASE
      if (p.userId) {
        const u = data.users.find(x => x.id === p.userId);
        if (u && u.role === 'PROJETISTA') {
          const isProjectHour = p.type === ProjectType.VARIATION || p.type === ProjectType.DEVELOPMENT || p.type === ProjectType.RELEASE;
          if (!isProjectHour) return false;
        }
      }

      // Filter by selected designer (for roles other than PROJETISTA, which is already restricted)
      if (selectedDesignerForReleases !== 'ALL' && p.userId !== selectedDesignerForReleases) {
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
  }, [data.projects, startDate, endDate, currentUser.role, currentUser.id, selectedCategories, selectedSuspensions, selectedClients, data.projectRequests, selectedDesignerForReleases]);

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
      const isSomeEdson = i.designerId ? (() => {
        const u = data.users.find(x => x.id === i.designerId);
        return u ? (u.email === 'efariaseng0@gmail.com' || u.username === 'edson' || (u.name && u.name.toLowerCase().includes('edson'))) : false;
      })() : false;

      if (i.designerId && processUserIds.has(i.designerId) && !isSomeEdson) {
        return false;
      }

      // Security role constraint: Designers only see their own interruptions
      if (currentUser.role === 'PROJETISTA' && i.designerId !== currentUser.id) {
        return false;
      }

      // Filter by selected interruption designer
      if (selectedInterruptionDesigner !== 'ALL' && i.designerId !== selectedInterruptionDesigner) {
        return false;
      }

      // Filter by client
      if (selectedClients.length > 0 && !selectedClients.includes(i.clientName || '')) {
        return false;
      }

      // Filter by suspension reasons (problem types)
      if (selectedSuspensions.length > 0 && !selectedSuspensions.includes(i.problemType || '')) {
        return false;
      }

      // Filter by categories (corresponds to active project's type)
      if (selectedCategories.length > 0) {
        const project = data.projects.find(p => p.id === i.projectId || p.ns === i.projectNs);
        if (project) {
          if (!selectedCategories.includes(project.type || '')) return false;
        } else {
          const req = data.projectRequests.find(r => r.ns === i.projectNs);
          if (req) {
            if (!selectedCategories.includes(req.productType || '')) return false;
          } else {
            return false;
          }
        }
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
  }, [
    data.interruptions, 
    data.projects, 
    data.projectRequests, 
    startDate, 
    endDate, 
    processUserIds, 
    currentUser, 
    selectedClients, 
    selectedSuspensions, 
    selectedCategories, 
    selectedInterruptionDesigner
  ]);


  // 1. Calculate Average Time per Project Type
  const averageTimes = useMemo(() => {
    const sums: Record<string, { total: number; count: number }> = {};
    
    filteredProjects.forEach(p => {
      // Normalize type to handle potential casing inconsistencies
      const normalizedType = String(p.type || '').toUpperCase().trim();
      if (!normalizedType) return;

      if (!sums[normalizedType]) sums[normalizedType] = { total: 0, count: 0 };
      sums[normalizedType].total += p.totalActiveSeconds;
      sums[normalizedType].count += 1;
    });

    return Object.entries(sums).map(([type, stats]) => ({
      type,
      avgSeconds: Math.round(stats.total / stats.count)
    })).sort((a, b) => a.type.localeCompare(b.type));
  }, [filteredProjects]);

  const yearlyStats = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1).getTime();
    
    // Explicitly group into months for easier display
    const monthNames = [
      'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 
      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
    ];

    const yearlyProjects = data.projects.filter(p => {
       // Apply same logic as filteredProjects but for the whole year
       const isSomeEdson = p.userId ? (() => {
         const u = data.users.find(x => x.id === p.userId);
         return u ? (u.email === 'efariaseng0@gmail.com' || u.username === 'edson' || (u.name && u.name.toLowerCase().includes('edson'))) : false;
       })() : false;

       if (p.userId && processUserIds.has(p.userId) && !isSomeEdson) return false;
       
       // Role-based filtering: Designers only see their own data
       if (currentUser.role === 'PROJETISTA' && p.userId !== currentUser.id) {
         return false;
       }
       
       const pDate = new Date(p.startTime).getTime();
       return pDate >= startOfYear;
    });

    const devCount = yearlyProjects.filter(p => isTypeMatch(p.type, ProjectType.DEVELOPMENT)).length;
    const releaseCount = yearlyProjects.filter(p => isTypeMatch(p.type, ProjectType.RELEASE)).length;
    const variationCount = yearlyProjects.filter(p => isTypeMatch(p.type, ProjectType.VARIATION)).length;
    const totalHours = yearlyProjects.reduce((acc, p) => acc + (p.totalActiveSeconds || 0), 0) / 3600;

    const yearlyInnovations = data.innovations.filter(inv => {
      const iDate = new Date(inv.createdAt);
      return iDate.getFullYear() === currentYear;
    });

    const yearlyInnovationStats = yearlyInnovations.reduce((acc, curr) => {
      if (curr.status === 'REJECTED' || curr.status === 'PENDING') return acc;
      const isImplemented = curr.status === 'IMPLEMENTED';
      const projected = curr.totalAnnualSavings || 0;
      const effective = curr.effectiveAnnualSavings || 0;
      
      if (isImplemented) {
        acc.effective += effective > 0 ? effective : projected;
      } else if (curr.status === 'APPROVED') {
        acc.projected += projected;
      }
      return acc;
    }, { effective: 0, projected: 0 });

    const monthly: { name: string, dev: number, release: number, variation: number, hours: number }[] = monthNames.map((name, i) => ({
      name,
      dev: 0,
      release: 0,
      variation: 0,
      hours: 0
    }));

    yearlyProjects.forEach(p => {
      const pDate = new Date(p.startTime);
      if (pDate.getFullYear() === currentYear) {
         const m = pDate.getMonth();
         if (isTypeMatch(p.type, ProjectType.DEVELOPMENT)) monthly[m].dev++;
         if (isTypeMatch(p.type, ProjectType.RELEASE)) monthly[m].release++;
         if (isTypeMatch(p.type, ProjectType.VARIATION)) monthly[m].variation++;
         monthly[m].hours += (p.totalActiveSeconds || 0) / 3600;
      }
    });

    return {
      devCount,
      releaseCount,
      variationCount,
      totalHours,
      innovation: yearlyInnovationStats,
      monthly: monthly.filter(m => m.dev > 0 || m.release > 0 || m.variation > 0 || m.hours > 0)
    };
  }, [data.projects, processUserIds, currentUser.role, currentUser.id]);

  const devProjectsStats = useMemo(() => {
    const devProjects = filteredProjects.filter(p => 
      String(p.type || '').toUpperCase().trim() === 'DESENVOLVIMENTO'
    );
    
    const totalDevSeconds = devProjects.reduce((acc, p) => acc + p.totalActiveSeconds, 0);
    const totalDevHours = totalDevSeconds / 3600;
    const count = devProjects.length;
    
    const start = startDate ? new Date(startDate) : new Date();
    const end = endDate ? new Date(endDate) : new Date();
    let monthDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
    if (monthDiff <= 0) monthDiff = 1;

    return {
      totalHours: Number(totalDevHours.toFixed(1)),
      count,
      avgPerMonth: Number((totalDevHours / monthDiff).toFixed(1)),
      months: monthDiff
    };
  }, [filteredProjects, startDate, endDate]);

  const releaseStats = useMemo(() => {
    const releases = filteredProjects.filter(p => 
      String(p.type || '').toUpperCase().trim() === 'LIBERAÇÃO'
    );
    
    return {
      count: releases.length,
      totalHours: releases.reduce((acc, p) => acc + p.totalActiveSeconds, 0) / 3600
    };
  }, [filteredProjects]);

  const variationStats = useMemo(() => {
    const variations = filteredProjects.filter(p => 
      String(p.type || '').toUpperCase().trim() === 'VARIAÇÃO'
    );
    
    const start = startDate ? new Date(startDate) : new Date();
    const end = endDate ? new Date(endDate) : new Date();
    let monthDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
    if (monthDiff <= 0) monthDiff = 1;

    const totalVariationSeconds = variations.reduce((acc, p) => acc + p.totalActiveSeconds, 0);
    const totalVariationHours = totalVariationSeconds / 3600;

    return {
      count: variations.length,
      totalHours: Number(totalVariationHours.toFixed(1)),
      avgPerMonth: Number((totalVariationHours / monthDiff).toFixed(1)),
      months: monthDiff
    };
  }, [filteredProjects, startDate, endDate]);

  // 1.5 Calculate Total Savings (Filtered by period)
  const savingsStats = useMemo(() => {
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    const initialMonthly = monthNames.map(name => ({
      name,
      effective: 0,
      projected: 0,
      count: 0
    }));

    const stats = filteredInnovations.reduce((acc, curr) => {
        if (curr.status === 'REJECTED' || curr.status === 'PENDING') return acc;

        const isImplemented = curr.status === 'IMPLEMENTED';
        const projected = curr.totalAnnualSavings || 0;
        const effective = curr.effectiveAnnualSavings || 0;
        
        const invDate = new Date(curr.createdAt);
        const monthIndex = invDate.getMonth();

        if (isImplemented) {
          const value = effective > 0 ? effective : projected;
          acc.effective += value;
          acc.implementedCount++;
          acc.monthly[monthIndex].effective += value;
        } else if (curr.status === 'APPROVED') {
          acc.projected += projected;
          acc.pendingCount++; // This counts as "Planned/Approved" now
          acc.monthly[monthIndex].projected += projected;
        }
        
        acc.monthly[monthIndex].count++;
        
        return acc;
    }, { projected: 0, effective: 0, pendingCount: 0, implementedCount: 0, monthly: initialMonthly });

    return {
      ...stats,
      monthly: stats.monthly.filter(m => m.count > 0)
    };
  }, [filteredInnovations]);

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
        // Skip weekend / off-time activities completely to prevent messing up stats
        const nameUpper = (a.activityName || '').toUpperCase();
        if (nameUpper.includes('FOLGA') || nameUpper.includes('FIM DE SEMANA')) {
            return;
        }

        // Exclude training and classroom hours entirely from overall development/engineering totals
        if (
            nameUpper.includes('AULA') || 
            nameUpper.includes('AULAS') || 
            nameUpper.includes('TREINAMENTO') || 
            nameUpper.includes('CAPACIT')
        ) {
            return;
        }

        // Exclude data from 'PROCESSOS' users
        const isSomeEdson = a.userId ? (() => {
            const u = data.users.find(x => x.id === a.userId);
            return u ? (u.email === 'efariaseng0@gmail.com' || u.username === 'edson' || (u.name && u.name.toLowerCase().includes('edson'))) : false;
        })() : false;

        if (a.userId && processUserIds.has(a.userId) && !isSomeEdson) {
            return;
        }

        // Rule for PROJETISTA role: exclude operational activities from useful hours calculation entirely
        if (a.userId) {
            const u = data.users.find(x => x.id === a.userId);
            if (u && u.role === 'PROJETISTA') {
                return;
            }
        }

        // Role-based filtering: Designers only see their own data
        if (currentUser.role === 'PROJETISTA' && a.userId !== currentUser.id) {
            return;
        }

        // Filter by selected designer
        if (selectedDesignerForReleases !== 'ALL' && a.userId !== selectedDesignerForReleases) {
            return;
        }

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
  }, [filteredProjects, data.operationalActivities, data.interruptions, startDate, endDate, settings, t, selectedDesignerForReleases]);

  const perCapitaStats = useMemo(() => {
    const start = startDate ? new Date(startDate) : new Date();
    const end = endDate ? new Date(endDate) : new Date();
    
    // Calculate number of months in the period (minimum 1)
    let calculatedMonthDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
    if (calculatedMonthDiff <= 0) calculatedMonthDiff = 1;

    // Months divisor to use
    const monthsInPeriod = overrideMonths !== null ? overrideMonths : calculatedMonthDiff;

    // Use available designers excluding non-engineering roles
    const engineeringUsers = availableDesigners.filter(u => ['PROJETISTA', 'COORDENADOR', 'GESTOR'].includes(u.role));
    
    // Calculate sum of weights
    let totalWeight = 0;
    engineeringUsers.forEach(u => {
      const weight = designerWeights[u.id] !== undefined ? designerWeights[u.id] : 1.0;
      totalWeight += weight;
    });

    // If totalWeight is 0 (all excluded), fallback to 1 to avoid division by zero
    const designerCount = totalWeight > 0 ? totalWeight : 1;
    
    const avgPerDesignerMonth = totalHours / designerCount / monthsInPeriod;

    return {
      avgPerDesignerMonth: Number(avgPerDesignerMonth.toFixed(1)),
      designerCount: Number(designerCount.toFixed(2)),
      monthsInPeriod,
      calculatedMonths: calculatedMonthDiff,
      engineeringUsers,
      totalWeight,
      isCustomized: overrideMonths !== null || Object.values(designerWeights).some(w => w !== 1.0)
    };
  }, [totalHours, startDate, endDate, availableDesigners, overrideMonths, designerWeights]);

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

  // 2. Bar Chart Data: Releases and Overall Project Hours (Monthly, Yearly or Global)
  const barData = useMemo(() => {
    // 1. Get all-time valid projects of PROJETISTA or the selected user
    const validProjectsAllTime = data.projects.filter(p => {
      if (!p.userId) return false;
      const u = data.users.find(x => x.id === p.userId);
      if (!u) return false;

      // Exclude data from 'PROCESSOS' users
      const isSomeEdson = (() => {
        return u ? (u.email === 'efariaseng0@gmail.com' || u.username === 'edson' || (u.name && u.name.toLowerCase().includes('edson'))) : false;
      })();

      if (processUserIds.has(p.userId) && !isSomeEdson) {
        return false;
      }

      // Role-based filtering: Designers only see their own data
      if (currentUser.role === 'PROJETISTA' && p.userId !== currentUser.id) {
        return false;
      }

      const activeDesignerTarget = currentUser.role === 'PROJETISTA' ? currentUser.id : selectedDesignerForReleases;
      if (activeDesignerTarget !== 'ALL') {
        return p.userId === activeDesignerTarget;
      }

      return u.role === 'PROJETISTA';
    });

    // 2. Apply additional selected designer selector (if Gestor/CEO/Coordenador selects one)
    const designerFiltered = validProjectsAllTime;

    // 3. Group based on releaseGrouping
    const designersInTeam = data.users.filter(u => u.role === 'PROJETISTA');
    const teamSize = designersInTeam.length || 1;
    const isAll = selectedDesignerForReleases === 'ALL';

    // Helper to calculate working hours in a month for 2026 or fallback
    const getCapacityForMonth = (monthIndex: number, year: number): number => {
      // monthIndex is 0-indexed (0 = Jan, 5 = Jun)
      const holidays2026: Set<string> = new Set([
        "2026-01-01", // Ano Novo
        "2026-02-16", // Carnaval
        "2026-02-17", // Carnaval
        "2026-04-03", // Sexta-feira Santa
        "2026-04-21", // Tiradentes
        "2026-05-01", // Dia do Trabalhador
        "2026-06-04", // Corpus Christi
        "2026-06-24", // São João Batista (Padroeiro Garuva)
      ]);

      let workingDays = 0;
      const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, monthIndex, day);
        const dayOfWeek = d.getDay(); // 0 = Sunday, 6 = Saturday
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          const dateString = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          if (!holidays2026.has(dateString)) {
            workingDays++;
          }
        }
      }
      return workingDays * 8.8;
    };

    if (releaseGrouping === 'GLOBAL') {
        const completedCount = designerFiltered.filter(p => p.status === 'COMPLETED').length;
        const totalHours = designerFiltered.reduce((sum, p) => sum + (p.totalActiveSeconds || 0), 0) / 3600;
        
        // Find all unique months in designerFiltered or fallback to Jan-Jun 2026
        const uniqueMonthKeys = new Set<string>();
        designerFiltered.forEach(curr => {
          const d = curr.endTime ? new Date(curr.endTime) : (curr.startTime ? new Date(curr.startTime) : new Date());
          uniqueMonthKeys.add(`${d.getMonth()}/${d.getFullYear()}`);
        });

        let globalCapacity = 0;
        if (uniqueMonthKeys.size > 0) {
          uniqueMonthKeys.forEach(mKey => {
            const [mStr, yStr] = mKey.split('/');
            globalCapacity += getCapacityForMonth(parseInt(mStr), parseInt(yStr));
          });
        } else {
          for (let m = 0; m < 6; m++) {
            globalCapacity += getCapacityForMonth(m, 2026);
          }
        }

        const capacityBase = (isAll ? teamSize : 1) * globalCapacity;
        const percentage = parseFloat(((totalHours / capacityBase) * 100).toFixed(1));
        const rest = Math.max(0, capacityBase - totalHours);

        return [{
            name: 'Total Global',
            liberacoes: completedCount,
            horas: parseFloat(totalHours.toFixed(1)),
            percentage,
            capacityBase: parseFloat(capacityBase.toFixed(1)),
            rest: parseFloat(rest.toFixed(1))
        }];
    }

    const releasesByPeriod = designerFiltered.reduce((acc, curr) => {
        const date = curr.endTime ? new Date(curr.endTime) : (curr.startTime ? new Date(curr.startTime) : new Date());
        let key = '';
        
        if (releaseGrouping === 'MONTHLY') {
            const month = months[date.getMonth()];
            const year = date.getFullYear().toString().slice(-2);
            key = `${month}/${year}`;
        } else {
            key = date.getFullYear().toString();
        }
        
        if (!acc[key]) {
            acc[key] = { count: 0, hours: 0 };
        }
        if (curr.status === 'COMPLETED') {
            acc[key].count += 1;
        }
        acc[key].hours += (curr.totalActiveSeconds || 0) / 3600;
        return acc;
    }, {} as Record<string, { count: number; hours: number }>);

    return Object.keys(releasesByPeriod).map(key => {
      const hours = releasesByPeriod[key].hours;
      const count = releasesByPeriod[key].count;
      
      let capacityBase = 220;
      if (releaseGrouping === 'MONTHLY') {
        const [mStr, yStr] = key.split('/');
        const mIdx = months.indexOf(mStr);
        const parsedYear = parseInt(yStr);
        const fullYear = parsedYear < 100 ? parsedYear + 2000 : parsedYear;
        const singleCapacity = getCapacityForMonth(mIdx !== -1 ? mIdx : 0, fullYear);
        capacityBase = (isAll ? teamSize : 1) * singleCapacity;
      } else {
        const fullYear = parseInt(key);
        let yearlyCapacity = 0;
        for (let m = 0; m < 12; m++) {
          yearlyCapacity += getCapacityForMonth(m, fullYear);
        }
        capacityBase = (isAll ? teamSize : 1) * yearlyCapacity;
      }
      
      const percentage = parseFloat(((hours / capacityBase) * 100).toFixed(1));
      const rest = Math.max(0, capacityBase - hours);

      return {
        name: key,
        liberacoes: count,
        horas: parseFloat(hours.toFixed(1)),
        percentage,
        capacityBase: parseFloat(capacityBase.toFixed(1)),
        rest: parseFloat(rest.toFixed(1))
      };
    }).sort((a, b) => {
        if (releaseGrouping === 'MONTHLY') {
            const [mA, yA] = a.name.split('/');
            const [mB, yB] = b.name.split('/');
            if (yA !== yB) return parseInt(yA) - parseInt(yB);
            return months.indexOf(mA) - months.indexOf(mB);
        }
        return a.name.localeCompare(b.name);
    });
  }, [data.projects, processUserIds, currentUser.role, currentUser.id, selectedDesignerForReleases, releaseGrouping, months, data.users]);

  // Memo para listagem e pesquisa dinâmica da quantidade de horas por projeto
  const projectTimeDetails = useMemo(() => {
    const list = filteredProjects.map(p => {
      const hours = ((p.totalActiveSeconds || 0) / 3600).toFixed(2);
      const hoursFormatted = formatDuration(p.totalActiveSeconds || 0);
      const designerName = p.userId ? (usersMap[p.userId] || p.userId) : t('unknown');
      return {
        ...p,
        hours,
        hoursFormatted,
        designerName
      };
    });

    if (!projectTimeSearchQuery) return list;
    const query = projectTimeSearchQuery.toLowerCase();
    return list.filter(item => 
      item.ns.toLowerCase().includes(query) ||
      (item.clientName || '').toLowerCase().includes(query) ||
      (item.projectCode || '').toLowerCase().includes(query) ||
      (item.implementType || '').toLowerCase().includes(query) ||
      (item.designerName || '').toLowerCase().includes(query)
    );
  }, [filteredProjects, projectTimeSearchQuery, usersMap, t]);

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

  // 6. Stacked Bar Chart: Innovations by Status and Type (All-time suggestions pipeline/backlog)
  const innovationChartData = useMemo(() => {
    const statuses = ['PENDING', 'APPROVED', 'IMPLEMENTED', 'REJECTED'];
    const labelMap: Record<string, string> = {
        'PENDING': t('pending'),
        'APPROVED': t('approved'),
        'IMPLEMENTED': t('implemented'),
        'REJECTED': t('rejected')
    };

    return statuses.map(status => {
        const items = data.innovations.filter(i => i.status === status);
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
  }, [data.innovations, t]);


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

  // Memos for Advanced Indicators & Charts (Scatter, Funnel, Heatmap)
  const advancedScatterData = useMemo(() => {
    return filteredProjects
      .filter(p => p.status === 'COMPLETED')
      .map(p => {
        const hours = parseFloat(((p.totalActiveSeconds || 0) / 3600).toFixed(1));
        const interruptionsCount = p.pauses?.length || 0;
        const variationsCount = p.variations?.length || 0;
        return {
          name: p.name || p.ns || 'Sem Nome',
          ns: p.ns || '',
          hours, // X Axis
          interruptions: interruptionsCount, // Y Axis
          z: variationsCount + 2, // Size of bubble (minimum 2 for visibility)
        };
      })
      .slice(0, 30); // limit to recent 30 projects for clean display
  }, [filteredProjects]);

  const advancedFunnelData = useMemo(() => {
    const totalRequests = data.projectRequests?.length || 0;
    const todoTasks = data.ganttTasks?.filter(t => t.status === 'todo').length || 0;
    const workingTasks = data.ganttTasks?.filter(t => t.status === 'in_progress').length || 0;
    const blockedTasks = data.ganttTasks?.filter(t => t.status === 'closed').length || 0;
    const completedProjects = data.projects?.filter(p => p.status === 'COMPLETED').length || 0;

    const maxVal = Math.max(totalRequests, todoTasks, workingTasks, blockedTasks, completedProjects, 1);

    return [
      { stage: 'Solicitações Recebidas', count: totalRequests, colorBg: 'bg-blue-600 dark:bg-blue-600', colorText: 'text-blue-600 dark:text-blue-400', percent: Math.round((totalRequests / maxVal) * 100) },
      { stage: 'Fila Kanban (Todo)', count: todoTasks, colorBg: 'bg-indigo-500 dark:bg-indigo-600', colorText: 'text-indigo-500 dark:text-indigo-400', percent: Math.round((todoTasks / maxVal) * 100) },
      { stage: 'Em Desenvolvimento (Doing)', count: workingTasks, colorBg: 'bg-purple-500 dark:bg-purple-600', colorText: 'text-purple-500 dark:text-purple-400', percent: Math.round((workingTasks / maxVal) * 100) },
      { stage: 'Impedido / Pausado', count: blockedTasks, colorBg: 'bg-rose-500 dark:bg-rose-600', colorText: 'text-rose-500 dark:text-rose-400', percent: Math.round((blockedTasks / maxVal) * 100) },
      { stage: 'Projetos Concluídos (Done)', count: completedProjects, colorBg: 'bg-emerald-500 dark:bg-emerald-600', colorText: 'text-emerald-500 dark:text-emerald-400', percent: Math.round((completedProjects / maxVal) * 100) },
    ];
  }, [data.projectRequests, data.ganttTasks, data.projects]);

  const advancedWeeklyHeatmap = useMemo(() => {
    const daysName = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
    const designers = (data.users || []).filter(u => {
      const isUserEdson = u.email === 'efariaseng0@gmail.com' || u.username === 'edson' || (u.name && u.name.toLowerCase().includes('edson'));
      return ['PROJETISTA', 'COORDENADOR'].includes(u.role) || isUserEdson;
    });
    
    const matrix = designers.map(user => {
      const dayHours = [0, 0, 0, 0, 0]; // Seg to Sex
      let overtimeHoursSum = 0;
      
      const userProjects = filteredProjects.filter(p => p.userId === user.id);
      userProjects.forEach(proj => {
        if (!proj.startTime) return;

        // Apply strict engineering hours check for PROJETISTA role
        if (user.role === 'PROJETISTA') {
          const isProjectHour = proj.type === ProjectType.VARIATION || proj.type === ProjectType.DEVELOPMENT || proj.type === ProjectType.RELEASE;
          if (!isProjectHour) return;
        }

        const pDate = new Date(proj.startTime);
        if (isNaN(pDate.getTime())) return;
        
        const hours = (proj.totalActiveSeconds || 0) / 3600;
        const weekday = pDate.getDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
        
        // Count weekday normal working hours
        if (weekday >= 1 && weekday <= 5) {
          if (!proj.isOvertime) {
            dayHours[weekday - 1] += hours;
          }
        }
        
        // Sum overtime (if explicit flag is set, OR if it's Sunday (0) or Saturday (6))
        if (proj.isOvertime || weekday === 0 || weekday === 6) {
          overtimeHoursSum += hours;
        }
      });
      
      const normalTotal = dayHours.reduce((acc, h) => acc + h, 0);
      const grandTotal = normalTotal + overtimeHoursSum;
      
      return {
        id: user.id,
        name: user.name + (user.surname ? ` ${user.surname}` : ''),
        role: user.role,
        hours: dayHours.map(h => parseFloat(h.toFixed(1))),
        overtime: parseFloat(overtimeHoursSum.toFixed(1)),
        total: parseFloat(grandTotal.toFixed(1))
      };
    });

    return { daysName, matrix };
  }, [filteredProjects, data.users]);

  const edsonExtraHoursAnalytics = useMemo(() => {
    // Determine target users
    const usersList = data.users || [];
    
    // Find Edson specifically just to have his details as fallback or title
    const edsonUser = usersList.find(u => 
      u.email === 'efariaseng0@gmail.com' || 
      u.username === 'edson' || 
      (u.name && u.name.toLowerCase().includes('edson'))
    );

    let filteredTargetProjects = data.projects;
    let filteredTargetOps = data.operationalActivities;

    if (selectedEdsonAnalyticsUser !== 'ALL') {
      filteredTargetProjects = data.projects.filter(p => p.userId === selectedEdsonAnalyticsUser);
      filteredTargetOps = data.operationalActivities.filter(a => a.userId === selectedEdsonAnalyticsUser);
    }

    // Let's analyze June 2026 ("este mês")
    const targetYear = 2026;
    const targetMonth = 5; // June is index 5
    const daysInMonth = 30; // June has 30 days

    // Initialize daily metrics for June 2026
    const dailyData = Array.from({ length: daysInMonth }, (_, idx) => {
      const dayNum = idx + 1;
      return {
        day: dayNum,
        overtimeHours: 0,
        factoryHours: 0,
        normalHours: 0,
        descriptions: [] as string[]
      };
    });

    const getUserDisplayName = (userId: string | undefined) => {
      if (!userId) return 'Desconhecido';
      const found = usersList.find(u => u.id === userId);
      return found ? `${found.name} ${found.surname || ''}`.trim() : 'Desconhecido';
    };

    const processItem = (dateStr: string, hours: number, isOvertime: boolean, desc: string, isFactory: boolean, userId?: string) => {
      if (!dateStr) return;
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return;
      if (date.getFullYear() === targetYear && date.getMonth() === targetMonth) {
        const dayIdx = date.getDate() - 1;
        if (dayIdx >= 0 && dayIdx < daysInMonth) {
          if (isOvertime) {
            dailyData[dayIdx].overtimeHours += hours;
          } else {
            dailyData[dayIdx].normalHours += hours;
          }
          if (isFactory) {
            dailyData[dayIdx].factoryHours += hours;
          }
          
          let fullDesc = desc;
          if (selectedEdsonAnalyticsUser === 'ALL' && userId) {
            fullDesc = `${getUserDisplayName(userId)}: ${desc}`;
          }
          dailyData[dayIdx].descriptions.push(`${fullDesc} (${hours.toFixed(1)}h)`);
        }
      }
    };

    filteredTargetProjects.forEach(proj => {
      if (!proj.startTime) return;
      const hours = (proj.totalActiveSeconds || 0) / 3600;
      const pDate = new Date(proj.startTime);
      const weekday = pDate.getDay();
      const isOvertime = proj.isOvertime || weekday === 0 || weekday === 6;
      const desc = `Projeto: ${proj.clientName || 'Engine'} - NS ${proj.ns || ''}`;
      processItem(proj.startTime, hours, isOvertime, desc, false, proj.userId);
    });

    filteredTargetOps.forEach(a => {
      if (!a.startTime) return;
      const nameUpper = (a.activityName || '').toUpperCase();
      if (nameUpper.includes('FOLGA') || nameUpper.includes('FIM DE SEMANA')) {
        return;
      }
      if (
        nameUpper.includes('AULA') || 
        nameUpper.includes('AULAS') || 
        nameUpper.includes('TREINAMENTO') || 
        nameUpper.includes('CAPACIT')
      ) {
        return;
      }
      const start = new Date(a.startTime);
      const end = a.endTime ? new Date(a.endTime) : new Date();
      const hours = Math.max((end.getTime() - start.getTime()) / 3600000, 0);
      const weekday = start.getDay();
      const isOvertime = a.isOvertime || a.isFlagged || weekday === 0 || weekday === 6;
      const isFactory = a.activityName?.toLowerCase().includes('fabrica') || a.activityName?.toLowerCase().includes('fábrica');
      const desc = `Atividade: ${a.activityName || 'Operacional'}`;
      processItem(a.startTime, hours, isOvertime, desc, isFactory, a.userId);
    });

    let monthOvertimeSum = 0;
    let monthFactorySum = 0;
    let monthNormalSum = 0;
    dailyData.forEach(d => {
      monthOvertimeSum += d.overtimeHours;
      monthFactorySum += d.factoryHours;
      monthNormalSum += d.normalHours;
    });

    let historicOvertimeSum = 0;
    let historicFactorySum = 0;

    filteredTargetProjects.forEach(proj => {
      const hours = (proj.totalActiveSeconds || 0) / 3600;
      const pDate = new Date(proj.startTime);
      const weekday = pDate.getDay();
      if (proj.isOvertime || weekday === 0 || weekday === 6) {
        historicOvertimeSum += hours;
      }
    });

    filteredTargetOps.forEach(a => {
      const nameUpper = (a.activityName || '').toUpperCase();
      if (nameUpper.includes('FOLGA') || nameUpper.includes('FIM DE SEMANA')) {
        return;
      }
      if (
        nameUpper.includes('AULA') || 
        nameUpper.includes('AULAS') || 
        nameUpper.includes('TREINAMENTO') || 
        nameUpper.includes('CAPACIT')
      ) {
        return;
      }
      const start = new Date(a.startTime);
      const end = a.endTime ? new Date(a.endTime) : new Date();
      const hours = Math.max((end.getTime() - start.getTime()) / 3600000, 0);
      const weekday = start.getDay();
      if (a.isOvertime || a.isFlagged || weekday === 0 || weekday === 6) {
        historicOvertimeSum += hours;
      }
      if (a.activityName?.toLowerCase().includes('fabrica') || a.activityName?.toLowerCase().includes('fábrica')) {
        historicFactorySum += hours;
      }
    });

    let activeUserName = 'Todos os Colaboradores';
    if (selectedEdsonAnalyticsUser !== 'ALL') {
      const activeU = usersList.find(u => u.id === selectedEdsonAnalyticsUser);
      activeUserName = activeU ? `${activeU.name} ${activeU.surname || ''}` : 'Usuário Selecionado';
    }

    return {
      dailyData,
      monthOvertimeSum: parseFloat(monthOvertimeSum.toFixed(1)),
      monthFactorySum: parseFloat(monthFactorySum.toFixed(1)),
      monthNormalSum: parseFloat(monthNormalSum.toFixed(1)),
      historicOvertimeSum: parseFloat(historicOvertimeSum.toFixed(1)),
      historicFactorySum: parseFloat(historicFactorySum.toFixed(1)),
      activeUserName,
      edsonDefaultId: edsonUser?.id || ''
    };
  }, [data.projects, data.operationalActivities, data.users, selectedEdsonAnalyticsUser]);

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
        productType: request?.productType || projects[0]?.implementType || projects[0]?.type || '-',
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
    const headers = [
      'ID', 
      'NS', 
      'Código do Projeto', 
      'Número de Chassi', 
      'Tipo de Projeto', 
      'Tipo de Implemento', 
      'Projetista', 
      'Início', 
      'Fim', 
      'Tempo Produtivo Formatado', 
      'Tempo Total Ativo (S)', 
      'Horas Desempenhadas (H)', 
      'Status', 
      'Notas'
    ];
    const rows = filteredProjects.map(p => {
      const designerName = p.userId ? (usersMap[p.userId] || p.userId) : 'Não atribuído';
      const hours = ((p.totalActiveSeconds || 0) / 3600).toFixed(2);
      const hoursFormatted = formatDuration(p.totalActiveSeconds || 0);
      return [
        p.id,
        p.ns,
        p.projectCode || '',
        p.chassisNumber || '',
        p.type,
        p.implementType || '',
        `"${(designerName || '').replace(/"/g, '""')}"`,
        p.startTime,
        p.endTime || '',
        hoursFormatted,
        p.totalActiveSeconds || 0,
        hours,
        p.status,
        `"${(p.notes || '').replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `detalhamento_horas_projetos_${new Date().toISOString().slice(0,10)}.csv`);
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
            options={[...PRODUCT_CATEGORIES, ...Object.values(ProjectType)].sort()}
            selected={selectedCategories}
            onChange={setSelectedCategories}
            t={t}
          />

          {['GESTOR', 'CEO', 'COORDENADOR'].includes(currentUser.role) ? (
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
          <label className={`flex items-center gap-2 group ${!hasPermissionForSection('kpi') ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
            <input 
              type="checkbox" 
              checked={visibleSections.includes('kpi') && hasPermissionForSection('kpi')} 
              disabled={!hasPermissionForSection('kpi')}
              onChange={() => hasPermissionForSection('kpi') && setVisibleSections(prev => prev.includes('kpi') ? prev.filter(s => s !== 'kpi') : [...prev, 'kpi'])}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-[11px] sm:text-sm font-medium text-gray-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors uppercase">{t('totalHours')}</span>
          </label>
          <label className={`flex items-center gap-2 group ${!hasPermissionForSection('ranking') ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
            <input 
              type="checkbox" 
              checked={visibleSections.includes('ranking') && hasPermissionForSection('ranking')} 
              disabled={!hasPermissionForSection('ranking')}
              onChange={() => hasPermissionForSection('ranking') && setVisibleSections(prev => prev.includes('ranking') ? prev.filter(s => s !== 'ranking') : [...prev, 'ranking'])}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-[11px] sm:text-sm font-medium text-gray-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors uppercase">{t('productivityRankingTitle')}</span>
          </label>
          <label className={`flex items-center gap-2 group ${!hasPermissionForSection('innovation') ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
            <input 
              type="checkbox" 
              checked={visibleSections.includes('innovation') && hasPermissionForSection('innovation')} 
              disabled={!hasPermissionForSection('innovation')}
              onChange={() => hasPermissionForSection('innovation') && setVisibleSections(prev => prev.includes('innovation') ? prev.filter(s => s !== 'innovation') : [...prev, 'innovation'])}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-[11px] sm:text-sm font-medium text-gray-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors uppercase">{t('innovationStatus')}</span>
          </label>
          <label className={`flex items-center gap-2 group ${!hasPermissionForSection('ns_analysis') ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
            <input 
              type="checkbox" 
              checked={visibleSections.includes('ns_analysis') && hasPermissionForSection('ns_analysis')} 
              disabled={!hasPermissionForSection('ns_analysis')}
              onChange={() => hasPermissionForSection('ns_analysis') && setVisibleSections(prev => prev.includes('ns_analysis') ? prev.filter(s => s !== 'ns_analysis') : [...prev, 'ns_analysis'])}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-[11px] sm:text-sm font-medium text-gray-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors uppercase">{t('nsAnalysis')}</span>
          </label>
          <label className={`flex items-center gap-2 group ${!hasPermissionForSection('detailed_report') ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
            <input 
              type="checkbox" 
              checked={visibleSections.includes('detailed_report') && hasPermissionForSection('detailed_report')} 
              disabled={!hasPermissionForSection('detailed_report')}
              onChange={() => hasPermissionForSection('detailed_report') && setVisibleSections(prev => prev.includes('detailed_report') ? prev.filter(s => s !== 'detailed_report') : [...prev, 'detailed_report'])}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-[11px] sm:text-sm font-medium text-gray-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors uppercase">{t('detailedReport')}</span>
          </label>
          <label className={`flex items-center gap-2 group ${!hasPermissionForSection('advanced_charts') ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
            <input 
              type="checkbox" 
              checked={visibleSections.includes('advanced_charts') && hasPermissionForSection('advanced_charts')} 
              disabled={!hasPermissionForSection('advanced_charts')}
              onChange={() => hasPermissionForSection('advanced_charts') && setVisibleSections(prev => prev.includes('advanced_charts') ? prev.filter(s => s !== 'advanced_charts') : [...prev, 'advanced_charts'])}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-[11px] sm:text-sm font-medium text-gray-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors uppercase">Gráficos Avançados</span>
          </label>
          <label className={`flex items-center gap-2 group ${!hasPermissionForSection('project_hours_table') ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
            <input 
              type="checkbox" 
              checked={visibleSections.includes('project_hours_table') && hasPermissionForSection('project_hours_table')} 
              disabled={!hasPermissionForSection('project_hours_table')}
              onChange={() => hasPermissionForSection('project_hours_table') && setVisibleSections(prev => prev.includes('project_hours_table') ? prev.filter(s => s !== 'project_hours_table') : [...prev, 'project_hours_table'])}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-[11px] sm:text-sm font-medium text-gray-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors uppercase">Horas por Projeto</span>
          </label>
          <label className={`flex items-center gap-2 group ${!hasPermissionForSection('activities') ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
            <input 
              type="checkbox" 
              checked={visibleSections.includes('activities') && hasPermissionForSection('activities')} 
              disabled={!hasPermissionForSection('activities')}
              onChange={() => hasPermissionForSection('activities') && setVisibleSections(prev => prev.includes('activities') ? prev.filter(s => s !== 'activities') : [...prev, 'activities'])}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-[11px] sm:text-sm font-medium text-gray-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors uppercase">{t('activitiesByDesigner')}</span>
          </label>
          <label className={`flex items-center gap-2 group ${!hasPermissionForSection('stops') ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
            <input 
              type="checkbox" 
              checked={visibleSections.includes('stops') && hasPermissionForSection('stops')} 
              disabled={!hasPermissionForSection('stops')}
              onChange={() => hasPermissionForSection('stops') && setVisibleSections(prev => prev.includes('stops') ? prev.filter(s => s !== 'stops') : [...prev, 'stops'])}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-[11px] sm:text-sm font-medium text-gray-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors uppercase">{t('stopAnalysis')}</span>
          </label>
          <label className={`flex items-center gap-2 group ${!hasPermissionForSection('interruption_report') ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
            <input 
              type="checkbox" 
              checked={visibleSections.includes('interruption_report') && hasPermissionForSection('interruption_report')} 
              disabled={!hasPermissionForSection('interruption_report')}
              onChange={() => hasPermissionForSection('interruption_report') && setVisibleSections(prev => prev.includes('interruption_report') ? prev.filter(s => s !== 'interruption_report') : [...prev, 'interruption_report'])}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-[11px] sm:text-sm font-medium text-gray-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors uppercase">{t('interruptionReport')}</span>
          </label>
          <label className={`flex items-center gap-2 group ${!hasPermissionForSection('releases') ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
            <input 
              type="checkbox" 
              checked={visibleSections.includes('releases') && hasPermissionForSection('releases')} 
              disabled={!hasPermissionForSection('releases')}
              onChange={() => hasPermissionForSection('releases') && setVisibleSections(prev => prev.includes('releases') ? prev.filter(s => s !== 'releases') : [...prev, 'releases'])}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-[11px] sm:text-sm font-medium text-gray-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors uppercase">{t('teamReleases')}</span>
          </label>
          <label className={`flex items-center gap-2 group ${!hasPermissionForSection('engineering_compliance') ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
            <input 
              type="checkbox" 
              checked={visibleSections.includes('engineering_compliance') && hasPermissionForSection('engineering_compliance')} 
              disabled={!hasPermissionForSection('engineering_compliance')}
              onChange={() => hasPermissionForSection('engineering_compliance') && setVisibleSections(prev => prev.includes('engineering_compliance') ? prev.filter(s => s !== 'engineering_compliance') : [...prev, 'engineering_compliance'])}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-[11px] sm:text-sm font-medium text-gray-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors uppercase">{t('engineeringPerformance')}</span>
          </label>
        </div>
      </div>

      {/* Engineering Performance Compliance Section */}
      {['GESTOR', 'COORDENADOR', 'CEO', 'PROCESSOS'].includes(currentUser.role) && visibleSections.includes('engineering_compliance') && (
        <EngineeringPerformance 
          projects={data.projects}
          activities={data.operationalActivities}
          interruptions={data.interruptions}
          users={availableDesigners}
          settings={settings}
          theme={theme}
          t={t}
          startDate={startDate}
          endDate={endDate}
          currentUser={currentUser}
        />
      )}

      {/* KPI Section */}
      {visibleSections.includes('kpi') && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Unified Development Card */}
          {currentUser.role !== 'PROCESSOS' && (
             <div className="bg-white dark:bg-black p-3 sm:p-4 rounded-xl border border-blue-200 dark:border-blue-900/50 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 ring-2 ring-blue-500/5">
               <div className="w-full">
                 <p className="text-[9px] sm:text-xs font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-0.5 sm:mb-1">
                   Desenvolvimento Total
                 </p>
                 <div className="flex items-baseline gap-1">
                   <p className="text-xl sm:text-2xl font-black text-blue-800 dark:text-blue-300">
                     {devProjectsStats.totalHours}h
                   </p>
                   <span className="text-[10px] text-blue-500/70 font-bold uppercase italic">produtivas</span>
                 </div>
                 <div className="mt-2 pt-2 border-t border-gray-100 dark:border-slate-800 flex flex-col gap-0.5">
                    <p className="text-[9px] text-gray-500 font-bold uppercase flex items-center gap-1">
                      <Clock size={10} className="text-blue-400" />
                      Média: {devProjectsStats.avgPerMonth}h / mês
                    </p>
                    <p className="text-[9px] text-blue-600 font-black uppercase">
                      Total Ano: {yearlyStats.devCount} PROJETOS
                    </p>
                    <div className="flex flex-col gap-0.5 mt-1 border-t border-blue-50 dark:border-slate-800/50 pt-1">
                       <p className="text-[9px] text-gray-500 font-black uppercase mb-1">Resumo por mês (Total Período: {devProjectsStats.count})</p>
                       <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                         {yearlyStats.monthly.map(m => (
                           <span key={m.name} className="text-[7px] text-gray-400 dark:text-slate-500 font-bold uppercase italic">{m.name}: <span className="text-blue-500 dark:text-blue-400">{m.dev}</span></span>
                         ))}
                       </div>
                    </div>
                 </div>
               </div>
               <div className="h-7 w-7 sm:h-9 sm:w-9 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0">
                 <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
               </div>
             </div>
          )}

          {/* Releases Total Card */}
          {currentUser.role !== 'PROCESSOS' && (
             <div className="bg-white dark:bg-black p-3 sm:p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 ring-2 ring-emerald-500/5">
               <div className="w-full">
                 <p className="text-[9px] sm:text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-0.5 sm:mb-1">
                   Total de Liberações
                 </p>
                 <div className="flex items-baseline gap-1">
                   <p className="text-xl sm:text-2xl font-black text-emerald-800 dark:text-emerald-300">
                     {releaseStats.count}
                   </p>
                   <span className="text-[10px] text-emerald-500/70 font-bold uppercase italic">projetos</span>
                 </div>
                 <div className="mt-2 pt-2 border-t border-gray-100 dark:border-slate-800 flex flex-col gap-0.5">
                    <p className="text-[9px] text-gray-500 font-bold uppercase flex items-center gap-1">
                      <Clock size={10} className="text-emerald-400" />
                      Média: {(releaseStats.count / devProjectsStats.months).toFixed(1)} / mês
                    </p>
                    <p className="text-[8px] text-emerald-600 font-black uppercase">
                      Total Ano: {yearlyStats.releaseCount} PROJETOS
                    </p>
                    <div className="flex flex-col gap-0.5 mt-1 border-t border-emerald-50 dark:border-slate-800/50 pt-1">
                       <p className="text-[9px] text-gray-500 font-black uppercase mb-1">Resumo por mês (Total Período: {releaseStats.count})</p>
                       <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                         {yearlyStats.monthly.map(m => (
                           <span key={m.name} className="text-[7px] text-gray-400 dark:text-slate-500 font-bold uppercase italic">{m.name}: <span className="text-emerald-500 dark:text-emerald-400">{m.release}</span></span>
                         ))}
                       </div>
                    </div>
                 </div>
               </div>
               <div className="h-7 w-7 sm:h-9 sm:w-9 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                 <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
               </div>
             </div>
          )}

          {/* Total de Variações Card */}
          {currentUser.role !== 'PROCESSOS' && (
             <div className="bg-white dark:bg-black p-3 sm:p-4 rounded-xl border border-amber-200 dark:border-amber-900/50 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 ring-2 ring-amber-500/5">
                <div className="w-full">
                  <p className="text-[9px] sm:text-xs font-black text-amber-600 dark:text-amber-450 uppercase tracking-widest mb-0.5 sm:mb-1">
                    Total de Variações
                  </p>
                  <div className="flex items-baseline gap-1">
                    <p className="text-xl sm:text-2xl font-black text-amber-800 dark:text-amber-300">
                      {variationStats.count}
                    </p>
                    <span className="text-[10px] text-amber-500/70 font-bold uppercase italic">variações</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-100 dark:border-slate-800 flex flex-col gap-0.5">
                     <p className="text-[9px] text-gray-500 font-bold uppercase flex items-center gap-1">
                       <Clock size={10} className="text-amber-450" />
                       Média: {variationStats.avgPerMonth} / mês
                     </p>
                     <p className="text-[8px] text-amber-650 font-black uppercase">
                       Total Ano: {yearlyStats.variationCount} VARIAÇÕES
                     </p>
                     <div className="flex flex-col gap-0.5 mt-1 border-t border-amber-50 dark:border-slate-800/50 pt-1">
                        <p className="text-[9px] text-gray-500 font-black uppercase mb-1">Resumo por mês (Total Período: {variationStats.count})</p>
                        <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                          {yearlyStats.monthly.map(m => (
                            <span key={m.name} className="text-[7px] text-gray-400 dark:text-slate-500 font-bold uppercase italic">{m.name}: <span className="text-amber-500 dark:text-amber-400">{m.variation}</span></span>
                          ))}
                        </div>
                     </div>
                  </div>
                </div>
                <div className="h-7 w-7 sm:h-9 sm:w-9 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center text-amber-600 dark:text-amber-400 flex-shrink-0">
                  <GitBranch className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
             </div>
          )}

          {/* Real Average Per Capita / Month */}
          {currentUser.role !== 'PROCESSOS' && (
             <div className="bg-white dark:bg-black p-3 sm:p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
               <div className="w-full">
                 <div className="flex items-center justify-between">
                   <p className="text-[9px] sm:text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 sm:mb-1">
                     Produtividade Per Capita
                   </p>
                   {perCapitaStats.isCustomized && (
                     <span className="text-[7px] sm:text-[8px] px-1 py-0.5 bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400 font-bold uppercase rounded tracking-wider">
                       Ajustado
                     </span>
                   )}
                 </div>
                 <div className="flex items-baseline gap-1">
                   <p className="text-lg sm:text-xl font-black text-gray-800 dark:text-white">
                     {perCapitaStats.avgPerDesignerMonth}h
                   </p>
                   <span className="text-[8px] sm:text-[9px] text-gray-400 font-bold uppercase italic">/mês</span>
                 </div>
                 <div className="mt-2 pt-2 border-t border-gray-50 dark:border-slate-800/50 flex flex-col gap-0.5">
                    <p className="text-[8px] text-gray-400 uppercase">
                      Ref: <strong className="text-gray-600 dark:text-slate-300">{perCapitaStats.designerCount}</strong> projetistas {perCapitaStats.isCustomized ? 'equivalentes' : 'ativos'}
                    </p>
                    <p className="text-[8px] text-gray-500 font-bold uppercase">
                      {perCapitaStats.monthsInPeriod} {perCapitaStats.monthsInPeriod === 1 ? 'MÊS SELECIONADO' : 'MESES SELECIONADOS'}
                    </p>
                    <button 
                      onClick={() => setIsPerCapitaModalOpen(true)}
                      className="mt-1 flex items-center gap-1 text-[8.5px] font-bold uppercase text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer self-start border border-blue-50 dark:border-slate-800 bg-blue-50/50 dark:bg-slate-900/30 px-1.5 py-0.5 rounded transition shadow-sm hover:shadow"
                    >
                      <SlidersHorizontal size={9} />
                      Configurar Cálculo
                    </button>
                 </div>
               </div>
               <div className="h-7 w-7 sm:h-8 sm:w-8 bg-gray-50 dark:bg-slate-800 rounded-full flex items-center justify-center text-gray-400 dark:text-slate-500 flex-shrink-0">
                 <Users className="w-4 h-4" />
               </div>
             </div>
          )}

          {currentUser.role !== 'PROCESSOS' && averageTimes.length > 0 && averageTimes
            .filter(stat => stat.type !== 'DESENVOLVIMENTO')
            .map((stat) => (
            <div key={stat.type} className="bg-white dark:bg-black p-3 sm:p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
              <div>
                <p className="text-[9px] sm:text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-0.5 sm:mb-1">Duração Média Projetos ({stat.type})</p>
                <p className="text-sm sm:text-lg font-black text-black dark:text-white">{formatDuration(stat.avgSeconds)}</p>
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
                <div className="flex items-baseline gap-1">
                  <p className="text-sm sm:text-xl font-black text-indigo-800 dark:text-indigo-300">{totalHours}h</p>
                  <span className="text-[8px] text-indigo-500 font-bold italic">/ {(totalHours / devProjectsStats.months).toFixed(1)}h MÊS</span>
                </div>
                <p className="text-[8px] text-indigo-400 font-bold uppercase mt-0.5 leading-tight">Total Ano: {Math.round(yearlyStats.totalHours)}h</p>
                <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 mt-1 border-t border-indigo-50/50 dark:border-indigo-900/20 pt-1">
                  {yearlyStats.monthly.map(m => (
                    <span key={m.name} className="text-[7px] text-gray-400 dark:text-slate-500 font-bold uppercase italic">{m.name}: <span className="text-indigo-500 dark:text-indigo-400">{Math.round(m.hours)}h</span></span>
                  ))}
                </div>
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
              <div className="prose prose-sm max-w-none text-black dark:text-white bg-white/50 dark:bg-black p-6 rounded-xl border border-indigo-100/50 dark:border-indigo-900/20 shadow-inner">
                <MarkdownRenderer content={aiAnalysis} theme={theme} />
              </div>
            ) : (
              <p className="text-black dark:text-white text-sm uppercase">
                {t('aiAnalysisPrompt')}
              </p>
            )}
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
                                itemStyle={{ color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                                labelStyle={{ color: theme === 'dark' ? '#f8fafc' : '#0f172a', fontWeight: 'bold' }}
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-black p-4 rounded-xl border border-gray-100 dark:border-slate-800 shadow-sm">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center uppercase">
              <Layers className="w-5 h-5 mr-2 text-orange-500" />
              {t('nsReports')}
            </h3>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-gray-700 dark:text-slate-300 select-none bg-gray-50 dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 transition-colors hover:bg-gray-100 dark:hover:bg-slate-800">
                <input 
                  type="checkbox"
                  checked={nsFilterByPeriod}
                  onChange={(e) => setNsFilterByPeriod(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 dark:border-slate-600 text-orange-500 focus:ring-orange-500 bg-white dark:bg-slate-800 cursor-pointer"
                />
                <span>{t('filterByPeriod')}</span>
              </label>
              <button 
                onClick={handleExportNSCSV}
                className="flex items-center text-sm font-bold text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white bg-gray-50 dark:bg-black border border-gray-200 dark:border-slate-600 px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors uppercase"
              >
                <Download className="w-4 h-4 mr-2" />
                {t('exportNSReport')}
              </button>
            </div>
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
                    contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#fff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#fff' : '#000', borderRadius: '8px' }}
                    itemStyle={{ color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                    labelStyle={{ color: theme === 'dark' ? '#f8fafc' : '#0f172a', fontWeight: 'bold' }}
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
                    contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#fff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#fff' : '#000', borderRadius: '8px' }}
                    itemStyle={{ color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                    labelStyle={{ color: theme === 'dark' ? '#f8fafc' : '#0f172a', fontWeight: 'bold' }}
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
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                        item.status === ProjectRequestStatus.COMPLETED ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        item.status === ProjectRequestStatus.IN_PROGRESS ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                        'bg-gray-100 text-gray-700 dark:bg-black dark:text-slate-400'
                      }`}>
                        {item.status}
                      </span>
                      {['GESTOR', 'CEO', 'COORDENADOR'].includes(currentUser.role) && (
                        <button
                          onClick={() => setDeleteConfirmationNs(item.ns)}
                          className="p-1 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition"
                          title={t('delete') || 'Excluir'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
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
                  {['GESTOR', 'CEO', 'COORDENADOR'].includes(currentUser.role) && (
                    <th className="py-3 px-4 text-[10px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider text-right">{t('actions') || 'AÇÕES'}</th>
                  )}
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
                    {['GESTOR', 'CEO', 'COORDENADOR'].includes(currentUser.role) && (
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setDeleteConfirmationNs(item.ns)}
                          className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 dark:text-red-400 rounded transition"
                          title={t('delete') || 'Excluir'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {detailedProductReport.length > 20 && (
              <p className="mt-4 text-[10px] text-gray-500 dark:text-slate-500 italic text-center">
                {t('showingRecentNs', { count: 20 })}
              </p>
            )}

            {/* NS Delete Confirmation Modal */}
            {deleteConfirmationNs && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                  <div className="bg-white dark:bg-black rounded-xl shadow-2xl w-full max-w-md p-6 border border-gray-100 dark:border-slate-700 text-left">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 uppercase">{t('confirmDeletion') || 'CONFIRMAR EXCLUSÃO'}</h3>
                      <p className="text-gray-600 dark:text-slate-400 mb-6 text-sm">
                        {`Deseja realmente excluir todos os registros (pedido de rastreamento e sessões de projeto) vinculados ao NS "${deleteConfirmationNs}"? Essa ação é irreversível e removerá todos os dados históricos desse NS.`}
                      </p>
                      <div className="flex justify-end gap-3">
                          <button 
                              onClick={() => setDeleteConfirmationNs(null)}
                              disabled={isDeletingNs}
                              className="px-4 py-2 text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg font-medium text-sm transition-colors"
                          >
                              {t('cancel') || 'CANCELAR'}
                          </button>
                          <button 
                              onClick={handleDeleteNs}
                              disabled={isDeletingNs}
                              className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg font-medium text-sm transition-colors shadow-sm flex items-center"
                          >
                              {isDeletingNs ? (
                                <>
                                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                  {t('deleting') || 'EXCLUINDO...'}
                                </>
                              ) : (
                                <>
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  {t('yesDelete') || 'SIM, EXCLUIR'}
                                </>
                              )}
                          </button>
                      </div>
                  </div>
              </div>
            )}

            {/* Per Capita Configuration Modal */}
            {isPerCapitaModalOpen && (
              <PerCapitaConfigModal
                perCapitaStats={perCapitaStats}
                totalHours={totalHours}
                overrideMonths={overrideMonths}
                designerWeights={designerWeights}
                onClose={() => setIsPerCapitaModalOpen(false)}
                onSave={(newMonths, newWeights) => {
                  if (newMonths === null) {
                    localStorage.removeItem('per_capita_override_months');
                  } else {
                    localStorage.setItem('per_capita_override_months', String(newMonths));
                  }
                  localStorage.setItem('per_capita_designer_weights', JSON.stringify(newWeights));
                  setOverrideMonths(newMonths);
                  setDesignerWeights(newWeights);
                  setIsPerCapitaModalOpen(false);
                  addToast("Parâmetros per capita atualizados com sucesso!", "success");
                }}
                onReset={() => {
                  localStorage.removeItem('per_capita_override_months');
                  localStorage.removeItem('per_capita_designer_weights');
                  setOverrideMonths(null);
                  setDesignerWeights({});
                  setIsPerCapitaModalOpen(false);
                  addToast("Parâmetros per capita restaurados ao padrão!", "info");
                }}
                theme={theme}
              />
            )}
          </div>
        </div>
      )}

      {/* Interruption Report Section */}
      {visibleSections.includes('interruption_report') && (
        <div className="space-y-8 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {['GESTOR', 'CEO', 'COORDENADOR', 'PROJETISTA'].includes(currentUser.role) && (
            <div className="mt-6 bg-white dark:bg-black p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800">
              <div className="mb-4">
                <h2 className={`text-2xl font-bold uppercase ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>{t('interruptionReports')}</h2>
                <div className="text-xs text-gray-500 dark:text-slate-400 font-bold uppercase tracking-wide">{t('bottleneckAnalysis')}</div>
              </div>
              <InterruptionDashboard data={data} theme={theme} filteredInterruptions={filteredInterruptions} />
            </div>
          )}

          <div className="bg-white dark:bg-black p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800">
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
                    i.responsibleArea ? t(i.responsibleArea.toLowerCase() as any) : 'N/A',
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
                        <td className="py-3 px-4 text-xs text-gray-600 dark:text-slate-300">{item.problemType}</td>
                        <td className="py-3 px-4 text-xs text-gray-600 dark:text-slate-300">{item.responsibleArea ? t(item.responsibleArea.toLowerCase() as any) : 'N/A'}</td>
                        <td className="py-3 px-4 text-xs font-mono text-gray-700 dark:text-slate-200">{formatDuration(item.totalTimeSeconds)}</td>
                        <td className="py-3 px-4 text-xs font-bold text-red-600 dark:text-red-400">{formatCurrency(item.totalTimeSeconds * costPerSecond)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Removed: Issue Distribution (Pie Chart) */}

        {/* Releases and Hours Analysis Section */}
            {currentUser.role !== 'PROCESSOS' && visibleSections.includes('releases') && (
              <>
                {/* Dedicated Selector for individual designer right above the charts */}
                {['GESTOR', 'CEO', 'COORDENADOR'].includes(currentUser.role) && (
                  <div className="col-span-1 md:col-span-2 bg-gray-50/80 dark:bg-stone-900/50 p-4 rounded-xl border border-gray-100 dark:border-slate-800/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-xs">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-500/10 dark:bg-amber-500/20 rounded-lg text-amber-500">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-black dark:text-white uppercase tracking-wider">
                          Análise Comparativa de Aproveitamento (Tempo de Engenharia)
                        </h4>
                        <p className="text-[10px] text-gray-500 dark:text-slate-400 font-medium">
                          Filtre por indivíduo para calcular o aproveitamento real das horas em projeto frente à capacidade mensal legal regulamentar.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                      <span className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest shrink-0">Filtrar Projetista:</span>
                      <select
                        value={selectedDesignerForReleases}
                        onChange={(e) => {
                          setSelectedDesignerForReleases(e.target.value);
                          setSelectedDesignerForChart(e.target.value);
                        }}
                        className="w-full sm:w-60 p-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500/10 outline-none text-xs bg-white dark:bg-black text-black dark:text-white cursor-pointer font-bold transition-all shadow-sm"
                      >
                        <option value="ALL">TODOS OS PROJETISTAS DA EQUIPE</option>
                        {availableDesigners.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Chart 1: Projects Released */}
                <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 min-h-[350px]">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                      <div className="flex flex-col">
                          <h3 className="text-sm font-bold text-black dark:text-white flex items-center uppercase tracking-wide">
                              <BarChart3 className="w-5 h-5 mr-2 text-blue-500" />
                              {currentUser.role === 'GESTOR' || currentUser.role === 'CEO' ? t('teamReleases') : t('yourPerformance')}
                          </h3>
                          {selectedDesignerForReleases !== 'ALL' && (
                              <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold ml-7 uppercase">{t('filteredBy')}: {usersMap[selectedDesignerForReleases] || selectedDesignerForReleases}</span>
                          )}
                          <span className="text-[10px] text-gray-400 dark:text-slate-500 font-bold ml-7 uppercase tracking-wider">Quantidade total (Histórico completo)</span>
                      </div>
                      <div className="flex bg-gray-100 dark:bg-black p-1 rounded-lg self-end sm:self-auto">
                          <button 
                              onClick={() => setReleaseGrouping('MONTHLY')}
                              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${releaseGrouping === 'MONTHLY' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-slate-400'}`}
                          >
                              {t('monthly')}
                          </button>
                          <button 
                              onClick={() => setReleaseGrouping('YEARLY')}
                              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${releaseGrouping === 'YEARLY' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-slate-400'}`}
                          >
                              {t('yearly')}
                          </button>
                          <button 
                              onClick={() => setReleaseGrouping('GLOBAL')}
                              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${releaseGrouping === 'GLOBAL' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-slate-400'}`}
                          >
                              {t('global')}
                          </button>
                      </div>
                  </div>
                  <div className="h-[250px] w-full mt-4">
                      {barData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={barData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                          <XAxis dataKey="name" tickLine={false} axisLine={false} style={{fontSize: '11px', fill: theme === 'dark' ? '#94a3b8' : '#64748b'}} />
                          <YAxis allowDecimals={false} tickLine={false} axisLine={false} style={{fontSize: '11px', fill: theme === 'dark' ? '#94a3b8' : '#64748b'}} />
                          <Tooltip 
                              contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                              itemStyle={{ color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                              labelStyle={{ color: theme === 'dark' ? '#f8fafc' : '#0f172a', fontWeight: 'bold' }}
                              cursor={{ fill: theme === 'dark' ? '#334155' : '#f3f4f6' }} 
                          />
                          <Bar dataKey="liberacoes" name="Projetos Liberados" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={releaseGrouping === 'GLOBAL' ? 80 : 35} />
                          </BarChart>
                      </ResponsiveContainer>
                      ) : (
                      <div className="h-full flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm">
                          {t('noData')}
                      </div>
                      )}
                  </div>
                </div>

                {/* Chart 2: Hours Performed in Projects */}
                <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 min-h-[350px]">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                      <div className="flex flex-col">
                          <h3 className="text-sm font-bold text-black dark:text-white flex items-center uppercase tracking-wide">
                              <Clock className="w-5 h-5 mr-2 text-amber-500" />
                              Horas Desempenhadas em Projetos
                          </h3>
                          {selectedDesignerForReleases !== 'ALL' && (
                              <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold ml-7 uppercase">{t('filteredBy')}: {usersMap[selectedDesignerForReleases] || selectedDesignerForReleases}</span>
                          )}
                          <span className="text-[10px] text-gray-400 dark:text-slate-500 font-bold ml-7 uppercase tracking-wider">Tempo produtivo (Histórico completo)</span>
                      </div>
                      <div className="flex bg-gray-100 dark:bg-black p-1 rounded-lg self-end sm:self-auto">
                          <button 
                              onClick={() => setReleaseGrouping('MONTHLY')}
                              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${releaseGrouping === 'MONTHLY' ? 'bg-white dark:bg-slate-800 text-amber-500 dark:text-amber-400 shadow-sm' : 'text-gray-500 dark:text-slate-400'}`}
                          >
                              {t('monthly')}
                          </button>
                          <button 
                              onClick={() => setReleaseGrouping('YEARLY')}
                              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${releaseGrouping === 'YEARLY' ? 'bg-white dark:bg-slate-800 text-amber-500 dark:text-amber-400 shadow-sm' : 'text-gray-500 dark:text-slate-400'}`}
                          >
                              {t('yearly')}
                          </button>
                          <button 
                              onClick={() => setReleaseGrouping('GLOBAL')}
                              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${releaseGrouping === 'GLOBAL' ? 'bg-white dark:bg-slate-800 text-amber-500 dark:text-amber-400 shadow-sm' : 'text-gray-500 dark:text-slate-400'}`}
                          >
                              {t('global')}
                          </button>
                      </div>
                  </div>
                  <div className="h-[250px] w-full mt-4">
                      {barData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={barData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                          <XAxis dataKey="name" tickLine={false} axisLine={false} style={{fontSize: '11px', fill: theme === 'dark' ? '#94a3b8' : '#64748b'}} />
                          <YAxis yAxisId="left" orientation="left" allowDecimals={true} tickLine={false} axisLine={false} style={{fontSize: '11px', fill: theme === 'dark' ? '#94a3b8' : '#64748b'}} unit="h" />
                          <YAxis yAxisId="right" orientation="right" allowDecimals={true} tickLine={false} axisLine={false} style={{fontSize: '11px', fill: theme === 'dark' ? '#94a3b8' : '#64748b'}} unit="%" domain={[0, 'auto']} />
                          <Tooltip content={<CustomHoursTooltip />} />
                          <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                          <Bar yAxisId="left" dataKey="horas" name="Horas Registradas" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={releaseGrouping === 'GLOBAL' ? 80 : 35} />
                          <Line yAxisId="right" type="monotone" dataKey="percentage" name="% de Utilização da Capacidade Líquida" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                          </ComposedChart>
                      </ResponsiveContainer>
                      ) : (
                      <div className="h-full flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm">
                          {t('noData')}
                      </div>
                      )}
                  </div>
                </div>
              </>
            )}

            {/* Tabela de Detalhamento de Horas por Projeto - Standalone Section */}
            {visibleSections.includes('project_hours_table') && (
              <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 col-span-1 md:col-span-2 space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <h3 className="text-sm font-bold text-black dark:text-white flex items-center uppercase tracking-wide">
                        <Clock className="w-5 h-5 mr-2 text-blue-500" />
                        Quantidade de Horas Desempenhadas por Projeto
                      </h3>
                      <p className="text-[11px] text-gray-500 dark:text-slate-400">
                        Consulte e exporte o total de horas produtivas registradas em cada projeto finalizado ou em andamento.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <div className="relative flex-1 sm:flex-initial">
                        <input
                          type="text"
                          placeholder="Buscar por NS, Cliente, Código, Projetista..."
                          value={projectTimeSearchQuery}
                          onChange={(e) => {
                            setProjectTimeSearchQuery(e.target.value);
                            setProjectTimePage(0);
                          }}
                          className="w-full sm:w-64 pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-stone-900 text-black dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="absolute left-2.5 top-2 text-gray-400 dark:text-slate-500">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </span>
                        {projectTimeSearchQuery && (
                          <button
                            onClick={() => {
                              setProjectTimeSearchQuery('');
                              setProjectTimePage(0);
                            }}
                            className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600 dark:hover:text-white text-xs font-bold"
                          >
                            ×
                          </button>
                        )}
                      </div>

                      <button
                        onClick={handleExportCSV}
                        className="flex items-center text-[10px] font-black text-gray-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 bg-gray-50 dark:bg-stone-900 border border-gray-200 dark:border-slate-700 px-3 py-2 rounded-lg transition-all shadow-sm uppercase tracking-wider shrink-0"
                        title="Exportar listagem detalhada de horas para CSV"
                      >
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                        <span>Exportar Horas</span>
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-slate-800">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-stone-900 border-b border-gray-100 dark:border-slate-800">
                          <th className="py-2.5 px-4 text-[9px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">N.S. / Código</th>
                          <th className="py-2.5 px-4 text-[9px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">Cliente</th>
                          <th className="py-2.5 px-4 text-[9px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">Projetista</th>
                          <th className="py-2.5 px-4 text-[9px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">Tipo / Implemento</th>
                          <th className="py-2.5 px-4 text-[9px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">Período</th>
                          <th className="py-2.5 px-4 text-[9px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                          <th className="py-2.5 px-4 text-[9px] font-black text-gray-500 dark:text-slate-400 uppercase tracking-wider text-right">Tempo Realizado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-slate-900">
                        {projectTimeDetails.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-xs text-gray-400 dark:text-slate-500 italic">
                              Nenhum projeto encontrado para os filtros e busca atuais.
                            </td>
                          </tr>
                        ) : (
                          projectTimeDetails.slice(projectTimePage * 10, (projectTimePage + 1) * 10).map((item, idx) => {
                            const formattedStart = item.startTime ? new Date(item.startTime).toLocaleDateString('pt-BR') : '';
                            const formattedEnd = item.endTime ? new Date(item.endTime).toLocaleDateString('pt-BR') : '';
                            return (
                              <tr key={item.id || idx} className="hover:bg-gray-50/50 dark:hover:bg-slate-900/40 transition-colors">
                                <td className="py-2.5 px-4">
                                  <div className="flex flex-col">
                                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400 font-mono">{item.ns}</span>
                                    {item.projectCode && (
                                      <span className="text-[9px] text-gray-400 dark:text-slate-500 font-mono mt-0.5">#{item.projectCode}</span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2.5 px-4 text-xs font-bold text-black dark:text-white truncate max-w-[140px]">{item.clientName || '-'}</td>
                                <td className="py-2.5 px-4 text-xs text-gray-600 dark:text-slate-300 truncate max-w-[120px]" title={item.designerName}>{item.designerName}</td>
                                <td className="py-2.5 px-4">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px] font-medium text-black dark:text-white">{item.type}</span>
                                    {item.implementType && (
                                      <span className="text-[9px] text-gray-400 dark:text-slate-500 font-medium">{item.implementType}</span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2.5 px-4 text-[10px] text-gray-500 dark:text-slate-400 font-mono">
                                  <div className="flex flex-col">
                                    <span>Início: {formattedStart}</span>
                                    {formattedEnd && <span>Fim: {formattedEnd}</span>}
                                  </div>
                                </td>
                                <td className="py-2.5 px-4">
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black tracking-wide uppercase ${
                                    item.status === 'COMPLETED'
                                      ? 'bg-green-100/80 text-green-700 dark:bg-green-950/30 dark:text-green-400'
                                      : 'bg-blue-100/80 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
                                  }`}>
                                    {item.status === 'COMPLETED' ? 'Finalizado' : 'Em Andamento'}
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 text-right">
                                  <div className="flex flex-col items-end">
                                    <span className="text-xs font-extrabold text-amber-600 dark:text-amber-400 font-mono">{item.hours}h</span>
                                    <span className="text-[9px] text-gray-400 dark:text-slate-500 font-mono">{item.hoursFormatted}</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Paginação da Tabela */}
                  {projectTimeDetails.length > 10 && (
                    <div className="flex justify-between items-center text-xs text-gray-500 dark:text-slate-400 pt-2 border-t border-gray-50 dark:border-slate-900">
                      <span>
                        Exibindo de {projectTimePage * 10 + 1} a {Math.min((projectTimePage + 1) * 10, projectTimeDetails.length)} de <strong>{projectTimeDetails.length}</strong> projetos
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          disabled={projectTimePage === 0}
                          onClick={() => setProjectTimePage(p => p - 1)}
                          className="px-2.5 py-1 bg-gray-50 dark:bg-stone-900 border border-gray-200 dark:border-slate-800 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs"
                        >
                          Anterior
                        </button>
                        <button
                          disabled={(projectTimePage + 1) * 10 >= projectTimeDetails.length}
                          onClick={() => setProjectTimePage(p => p + 1)}
                          className="px-2.5 py-1 bg-gray-50 dark:bg-stone-900 border border-gray-200 dark:border-slate-800 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs"
                        >
                          Próximo
                        </button>
                      </div>
                    </div>
                  )}
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
                            itemStyle={{ color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                            labelStyle={{ color: theme === 'dark' ? '#f8fafc' : '#0f172a', fontWeight: 'bold' }}
                            cursor={{ fill: theme === 'dark' ? '#334155' : '#f3f4f6' }} 
                        />
                        <Legend />
                        <Bar dataKey={InnovationType.NEW_PROJECT} name={t('newProject').toUpperCase()} stackId="a" fill="#8b5cf6" />
                        <Bar dataKey={InnovationType.PRODUCT_IMPROVEMENT} name={t('productImprovement').toUpperCase()} stackId="a" fill="#3b82f6" />
                        <Bar dataKey={InnovationType.PROCESS_OPTIMIZATION} name={t('processOptimization').toUpperCase()} stackId="a" fill="#f97316" />
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
                                    itemStyle={{ color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                                    labelStyle={{ color: theme === 'dark' ? '#f8fafc' : '#0f172a', fontWeight: 'bold' }}
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
                                        itemStyle={{ color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                                        labelStyle={{ color: theme === 'dark' ? '#f8fafc' : '#0f172a', fontWeight: 'bold' }}
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
                                        itemStyle={{ color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                                        labelStyle={{ color: theme === 'dark' ? '#f8fafc' : '#0f172a', fontWeight: 'bold' }}
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

      {/* Advanced Indicators & Analytics Section */}
      {visibleSections.includes('advanced_charts') && (
        <div className="bg-white dark:bg-black/40 border border-gray-150 dark:border-slate-800 p-6 rounded-2xl col-span-1 md:col-span-2 space-y-6 mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col gap-1 border-b border-gray-100 dark:border-slate-800 pb-3">
            <h3 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 uppercase tracking-wide flex items-center gap-2">
              <TrendingUp className="text-indigo-500 w-5 h-5 animate-pulse" />
              Gráficos Avançados & Indicadores de Performance
            </h3>
            <p className="text-xs text-slate-400">Análise de dispersão, funil de progresso de entregas de engenharia e mapa de calor semanal de horas projetadas.</p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* 1. Scatter Plot (Dispersão) */}
            <div className="bg-white dark:bg-black p-6 rounded-xl border border-gray-100 dark:border-slate-850 shadow-sm flex flex-col justify-between min-h-[400px]">
              <div>
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase flex items-center gap-2 mb-1">
                  <Activity className="text-blue-500 w-4 h-4" />
                  Dispersão: Complexidade vs Interrupções
                </h4>
                <p className="text-[11px] text-gray-400 mb-4 font-medium uppercase">Mostra se os projetos mais longos (em horas) sofrem mais pausas ou retrabalhos.</p>
              </div>

              <div className="h-[280px] w-full">
                {advancedScatterData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                      <XAxis 
                        type="number" 
                        dataKey="hours" 
                        name="Horas do Projeto" 
                        unit="h" 
                        style={{fontSize: '11px', fill: theme === 'dark' ? '#94a3b8' : '#64748b'}} 
                        label={{ value: 'Duração (Horas)', position: 'insideBottom', offset: -5, fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: '11px' }}
                      />
                      <YAxis 
                        type="number" 
                        dataKey="interruptions" 
                        name="Paradas" 
                        unit="p" 
                        allowDecimals={false}
                        style={{fontSize: '11px', fill: theme === 'dark' ? '#94a3b8' : '#64748b'}} 
                        label={{ value: 'Qtd de Interrupções', angle: -90, position: 'insideLeft', fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: '11px' }}
                      />
                      <ZAxis type="number" dataKey="z" range={[40, 400]} />
                      <Tooltip 
                        cursor={{ strokeDasharray: '3 3' }}
                        contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                        itemStyle={{ color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                        labelStyle={{ color: theme === 'dark' ? '#f8fafc' : '#0f172a', fontWeight: 'bold' }}
                        formatter={(value: any, name: any) => {
                          if (name === "Horas do Projeto") return [`${value} horas`, "Duração"];
                          if (name === "Paradas") return [`${value} paradas`, "Interrupções"];
                          return [value, name];
                        }}
                      />
                      <Scatter name="Projetos" data={advancedScatterData} fill="#3b82f6" fillOpacity={0.8}>
                        {advancedScatterData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#3b82f6' : '#6366f1'} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm">
                    Aguardando projetos concluídos para gerar análise de dispersão.
                  </div>
                )}
              </div>
            </div>

            {/* 2. Pipeline Funnel Chart (Funil de Progresso de Entregas) */}
            <div className="bg-white dark:bg-black p-6 rounded-xl border border-gray-100 dark:border-slate-850 shadow-sm flex flex-col justify-between min-h-[400px]">
              <div>
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase flex items-center gap-2 mb-1">
                  <SlidersHorizontal className="text-indigo-500 w-4 h-4" />
                  Funil de Conversão & Entregas de Engenharia
                </h4>
                <p className="text-[11px] text-gray-400 mb-4 font-medium uppercase">Visualização de gargalos e taxas de conversão do fluxo operacional da fábrica.</p>
              </div>

              <div className="space-y-4 flex-grow flex flex-col justify-center">
                {advancedFunnelData.map((item) => {
                  return (
                    <div key={item.stage} className="space-y-1">
                      <div className="flex justify-between items-center text-xs font-bold text-slate-700 dark:text-slate-300">
                        <span className="flex items-center gap-2">
                          <span className={`w-3 h-3 rounded ${item.colorBg}`} />
                          {item.stage}
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px]">{item.count}</span>
                          <span className={`${item.colorText} text-[10px]`}>{item.percent}%</span>
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-900 h-3.5 rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-800/10">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 ${item.colorBg}`}
                          style={{ width: `${Math.max(item.percent, 3)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. Heatmap de Produtividade Semanal (Weekly Heatmap) */}
            <div className="bg-white dark:bg-black p-6 rounded-xl border border-gray-100 dark:border-slate-850 shadow-sm col-span-1 xl:col-span-2 flex flex-col justify-between min-h-[400px]">
              <div>
                <div className="flex flex-col sm:flex-row justify-between items-start gap-2 mb-1">
                  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase flex items-center gap-2">
                    <Calendar className="text-emerald-500 w-4 h-4" />
                    Mapa de Calor: Intensidade Diária por Projetista (Seg-Sex)
                  </h4>
                  <div className="flex items-center gap-2 text-[9px] font-black uppercase text-gray-400">
                    <span>Inativo (0h)</span>
                    <div className="w-3.5 h-3.5 rounded bg-gray-100 dark:bg-slate-900 border border-slate-250 dark:border-slate-800" />
                    <div className="w-3.5 h-3.5 rounded bg-indigo-100/40 dark:bg-indigo-950/25 border border-indigo-200/20" />
                    <div className="w-3.5 h-3.5 rounded bg-indigo-300/60 dark:bg-indigo-700/65" />
                    <div className="w-3.5 h-3.5 rounded bg-indigo-600" />
                    <span>Alto volume (6h+)</span>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 mb-4 font-medium uppercase">Matriz de esforço diário em horas dos projetistas para otimização do balanceamento de carga.</p>
              </div>

              <div className="overflow-x-auto w-full no-scrollbar border border-slate-100 dark:border-slate-850 rounded-xl">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-150 dark:border-slate-850">
                      <th className="py-2.5 px-4 text-left text-[11px] font-black text-slate-400 tracking-wider uppercase border-r border-slate-100 dark:border-slate-850">Projetista</th>
                      {advancedWeeklyHeatmap.daysName.map(day => (
                        <th key={day} className="py-2.5 px-4 text-center text-[11px] font-black text-slate-400 tracking-wide uppercase border-r border-slate-100 dark:border-slate-850">{day}</th>
                      ))}
                      {(() => {
                        const isEdson = currentUser?.email?.trim().toLowerCase() === 'efariaseng0@gmail.com' || currentUser?.username?.trim().toLowerCase() === 'edson' || (currentUser?.name && currentUser.name.toLowerCase().includes('edson'));
                        const isGestorOrEdson = ['GESTOR', 'CEO', 'COORDENADOR'].includes(currentUser?.role) || isEdson;
                        return isGestorOrEdson && (
                          <th className="py-2.5 px-4 text-center text-[11px] font-black text-amber-600 dark:text-amber-400 tracking-wide uppercase border-r border-slate-100 dark:border-slate-850 bg-amber-50/20 dark:bg-amber-950/10">H. Extra</th>
                        );
                      })()}
                      <th className="py-2.5 px-4 text-center text-[11px] font-black text-slate-400 tracking-wide uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const isEdson = currentUser?.email?.trim().toLowerCase() === 'efariaseng0@gmail.com' || currentUser?.username?.trim().toLowerCase() === 'edson' || (currentUser?.name && currentUser.name.toLowerCase().includes('edson'));
                      const isGestorOrEdson = ['GESTOR', 'CEO', 'COORDENADOR'].includes(currentUser?.role) || isEdson;
                      
                      const visibleRows = advancedWeeklyHeatmap.matrix.filter(row => {
                        const isRowEdson = row.id === 'edson' || row.id === currentUser.id || row.name.toLowerCase().includes('edson');
                        return ['PROJETISTA', 'COORDENADOR'].includes(row.role) || isRowEdson;
                      });

                      if (visibleRows.length > 0) {
                        return visibleRows.map(row => (
                          <tr key={row.id} className="border-b border-slate-100 dark:border-slate-900 hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors">
                            <td className="py-3 px-4 font-bold text-xs text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-850">
                              {row.name}
                            </td>
                            {row.hours.map((val, idx) => {
                              let bgClass = "bg-gray-100 dark:bg-slate-900 text-gray-400";
                              if (val > 0 && val <= 2) {
                                bgClass = "bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 border border-indigo-100/40 dark:border-indigo-900/10";
                              } else if (val > 2 && val <= 6) {
                                bgClass = "bg-indigo-200 dark:bg-indigo-700/60 text-indigo-800 dark:text-indigo-200 font-extrabold border border-indigo-300/40 dark:border-indigo-850";
                              } else if (val > 6) {
                                bgClass = "bg-indigo-600 text-white font-black";
                              }

                              return (
                                <td key={idx} className="p-1 border-r border-slate-100 dark:border-slate-850">
                                  <div 
                                    className={`py-2 px-1 text-center text-xs rounded-lg transition-all border border-transparent shadow-xs hover:scale-[1.03] duration-150 ${bgClass}`}
                                    title={`${row.name} - ${advancedWeeklyHeatmap.daysName[idx]}: ${val} horas projetadas.`}
                                  >
                                    {val > 0 ? `${val}h` : '0h'}
                                  </div>
                                </td>
                              );
                            })}
                            {isGestorOrEdson && (
                              <td className="p-1 border-r border-slate-100 dark:border-slate-850 bg-amber-50/10 dark:bg-amber-950/5">
                                <div 
                                  className={`py-2 px-1 text-center text-xs font-extrabold rounded-lg transition-all border border-transparent shadow-xs hover:scale-[1.03] duration-150 ${
                                    row.overtime > 0 
                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200/40' 
                                      : 'bg-gray-100 dark:bg-slate-900 text-gray-400'
                                  }`}
                                  title={`${row.name} - Horas Extras: ${row.overtime}h`}
                                >
                                  {row.overtime > 0 ? `${row.overtime}h` : '0h'}
                                </div>
                              </td>
                            )}
                            <td className="py-3 px-4 text-center font-black text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50/30 dark:bg-indigo-950/10">
                              {row.total}h
                            </td>
                          </tr>
                        ));
                      } else {
                        return (
                          <tr>
                            <td colSpan={isGestorOrEdson ? 8 : 7} className="py-8 text-center text-xs text-gray-400">
                              Nenhum projetista registrado ou horas de projeto alocadas para esta semana.
                            </td>
                          </tr>
                        );
                      }
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 4. Edson's Custom Overtime & Factory Activity Heatmap & Report (Edson Only) */}
          {(() => {
            const isEdson = currentUser?.email?.trim().toLowerCase() === 'efariaseng0@gmail.com' || currentUser?.username?.trim().toLowerCase() === 'edson' || (currentUser?.name && currentUser.name.toLowerCase().includes('edson'));
            if (!isEdson) return null;

            const { dailyData, monthOvertimeSum, monthFactorySum, monthNormalSum, historicOvertimeSum, historicFactorySum, activeUserName } = edsonExtraHoursAnalytics;
            
            // June 2026 starts on Monday. Columns will start at Monday.
            const weekdaysShort = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
            const selectedDayDetails = selectedEdsonDay !== null ? dailyData[selectedEdsonDay - 1] : null;

            return (
              <div className="bg-slate-50/55 dark:bg-slate-900/40 p-6 rounded-2xl border border-slate-100 dark:border-slate-850 space-y-6 mt-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-slate-100 dark:border-slate-850 pb-4 gap-4">
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-850 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                      Análise de Horas Extras & Fábrica — {activeUserName}
                    </h4>
                    <p className="text-[11px] text-gray-400 mt-0.5 uppercase tracking-wide">
                      Mapeamento exclusivo de intensidade operacional na planta e horas extras (Junho 2026)
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wide">Visualizar:</span>
                      <select
                        value={selectedEdsonAnalyticsUser}
                        onChange={(e) => {
                          setSelectedEdsonAnalyticsUser(e.target.value);
                          setSelectedEdsonDay(null); // Clear selected day
                        }}
                        className="px-3 py-1.5 text-xs bg-white dark:bg-slate-900 text-slate-850 dark:text-slate-100 rounded-lg border border-slate-200 dark:border-slate-800 font-bold uppercase transition-all duration-150 shadow-xs focus:ring-2 focus:ring-amber-500/30 focus:outline-hidden cursor-pointer"
                      >
                        <option value="ALL">🌟 Todos os Colaboradores</option>
                        {data.users.map(u => (
                          <option key={u.id} value={u.id}>
                            👤 {u.name} {u.surname || ''} ({u.role})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 flex-row">
                      <span className="px-2.5 py-1 text-[10px] font-black uppercase rounded-lg bg-indigo-50/80 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400 border border-indigo-100/40">
                        Normal: {monthNormalSum}h
                      </span>
                      <span className="px-2.5 py-1 text-[10px] font-black uppercase rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200/50">
                        Extras: {monthOvertimeSum}h
                      </span>
                      <span className="px-2.5 py-1 text-[10px] font-black uppercase rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/50">
                        No Chão: {monthFactorySum}h
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sub-Layout: Heatmap + Analytical Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Heatmap Section - 5 Columns */}
                  <div className="lg:col-span-5 bg-white dark:bg-black p-5 rounded-xl border border-slate-100 dark:border-slate-850 shadow-xs flex flex-col justify-between">
                    <div>
                      <h5 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-widest mb-3 flex items-center justify-between">
                        <span>Mapa de Calor: Junho 2026</span>
                        <span className="text-[9px] text-zinc-400 capitalize font-medium">clique no dia para ver detalhes</span>
                      </h5>
                      
                      {/* Grid Headers */}
                      <div className="grid grid-cols-7 gap-1 text-center mb-1">
                        {weekdaysShort.map((day) => (
                          <div key={day} className="text-[10px] font-black text-slate-450 uppercase py-1">
                            {day}
                          </div>
                        ))}
                      </div>

                      {/* Heatmap Grid of Days */}
                      <div className="grid grid-cols-7 gap-1.5 animate-in fade-in duration-300">
                        {dailyData.map((d) => {
                          const dailyTotal = d.overtimeHours + d.factoryHours;
                          
                          let bgClass = "bg-gray-100 dark:bg-slate-900/60 text-slate-400 hover:scale-[1.04]";
                          let borderClass = "border-transparent";

                          if (dailyTotal > 0 && dailyTotal <= 2) {
                            bgClass = "bg-amber-100/40 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300 hover:scale-[1.04]";
                            borderClass = "border-amber-200/10";
                          } else if (dailyTotal > 2 && dailyTotal <= 5) {
                            bgClass = "bg-amber-300 dark:bg-amber-700 text-amber-900 dark:text-amber-100 font-extrabold hover:scale-[1.04]";
                            borderClass = "border-amber-400/40";
                          } else if (dailyTotal > 5) {
                            bgClass = "bg-amber-600 text-white font-black hover:scale-[1.04] shadow-xs shadow-amber-500/10";
                            borderClass = "border-amber-800";
                          }

                          const isSelected = selectedEdsonDay === d.day;
                          if (isSelected) {
                            borderClass = "border-indigo-500 ring-2 ring-indigo-500/20 scale-[1.04]";
                          }

                          return (
                            <button
                              key={d.day}
                              onClick={() => setSelectedEdsonDay(isSelected ? null : d.day)}
                              className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs font-semibold border transition-all duration-150 cursor-pointer ${bgClass} ${borderClass}`}
                              title={`Dia ${d.day}: Extra: ${d.overtimeHours.toFixed(1)}h | Fábrica: ${d.factoryHours.toFixed(1)}h.`}
                            >
                              <span className="text-[9px] opacity-70 block mb-0.5">{d.day}</span>
                              {dailyTotal > 0 && (
                                <span className="text-[9px] font-extrabold">
                                  {dailyTotal.toFixed(1)}h
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Legend */}
                      <div className="flex items-center gap-3 mt-4 text-[9px] font-black uppercase text-gray-400 justify-center">
                        <span>Livre (0h)</span>
                        <div className="w-3 h-3 rounded bg-gray-100 dark:bg-slate-900 border border-slate-200/20" />
                        <div className="w-3 h-3 rounded bg-amber-100/40 dark:bg-amber-950/20 border border-amber-200/10" />
                        <div className="w-3 h-3 rounded bg-amber-300 dark:bg-amber-700" />
                        <div className="w-3 h-3 rounded bg-amber-600" />
                        <span>Elevado (5h+)</span>
                      </div>
                    </div>

                    <div className="mt-5 border-t border-slate-100 dark:border-slate-900 pt-3 text-[9px] text-gray-450 uppercase italic font-medium">
                      💡 Junho de 2026 iniciou-se em uma Segunda-feira.
                    </div>
                  </div>

                  {/* Day Details or Monthly breakdown - 4 Columns */}
                  <div className="lg:col-span-4 bg-white dark:bg-black p-5 rounded-xl border border-slate-100 dark:border-slate-850 shadow-xs flex flex-col justify-between">
                    <div>
                      <h5 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-widest mb-3">
                        {selectedDayDetails ? `Detalhes do Dia ${selectedDayDetails.day} de Junho` : "Selecione um Dia no Mapa"}
                      </h5>

                      {selectedDayDetails ? (
                        <div className="space-y-4 animate-in fade-in duration-200">
                          <div className="grid grid-cols-2 gap-2 text-center">
                            <div className="bg-slate-50/50 dark:bg-slate-900/40 p-2.5 rounded-lg border border-slate-100 dark:border-slate-850">
                              <p className="text-[9px] font-black text-slate-400 uppercase">H. Extra</p>
                              <p className="text-sm font-black text-amber-600 dark:text-amber-400">{selectedDayDetails.overtimeHours.toFixed(1)}h</p>
                            </div>
                            <div className="bg-slate-50/50 dark:bg-slate-900/40 p-2.5 rounded-lg border border-slate-100 dark:border-slate-850">
                              <p className="text-[9px] font-black text-slate-400 uppercase">Fábrica</p>
                              <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">{selectedDayDetails.factoryHours.toFixed(1)}h</p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide">Apontamentos Realizados:</p>
                            {selectedDayDetails.descriptions.length > 0 ? (
                              <ul className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1 no-scrollbar text-xs">
                                {selectedDayDetails.descriptions.map((desc, idx) => {
                                  const isFactoryAct = desc.toLowerCase().includes('fabrica') || desc.toLowerCase().includes('fábrica');
                                  return (
                                    <li key={idx} className="p-2 rounded bg-slate-50 dark:bg-slate-900/50 border-l-2 border-indigo-500 flex justify-between items-center text-slate-700 dark:text-slate-300">
                                      <span className="truncate pr-2 font-medium">{desc.split(' (')[0]}</span>
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase shrink-0 ${isFactoryAct ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                                        {desc.match(/\(([^)]+)\)/)?.[1] || ''}
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : (
                              <p className="text-xs text-slate-400 dark:text-slate-550 italic">Apenas horas de expediente normal sem apontamentos adicionais registrados.</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center py-8 text-gray-450 dark:text-slate-500">
                          <Activity className="w-8 h-8 opacity-25 mb-2 animate-bounce" />
                          <p className="text-xs max-w-[220px]">Clique em qualquer quadrado com horas no mapa de calor para expor a lista detalhada de apontamentos.</p>
                        </div>
                      )}
                    </div>

                    {selectedDayDetails && (
                      <button 
                        onClick={() => setSelectedEdsonDay(null)}
                        className="w-full mt-4 py-1.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-300 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        Limpar Seleção
                      </button>
                    )}
                  </div>

                  {/* Summary / Report Card - 3 Columns */}
                  <div className="lg:col-span-3 bg-white dark:bg-black p-5 rounded-xl border border-slate-100 dark:border-slate-850 shadow-xs flex flex-col justify-between space-y-4">
                    <div>
                      <h5 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-widest mb-3">
                        Acumulado Histórico
                      </h5>

                      <div className="space-y-4">
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Acumulado Horas Extras</p>
                          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 tracking-tight mt-0.5">
                            {historicOvertimeSum} <span className="text-xs font-normal text-slate-450">horas totais</span>
                          </p>
                        </div>

                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Total em Fábrica</p>
                          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight mt-0.5">
                            {historicFactorySum} <span className="text-xs font-normal text-slate-450">horas na planta</span>
                          </p>
                        </div>

                        <div className="border-t border-slate-100 dark:border-slate-900 pt-3">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Foco de Atuação</p>
                          <div className="flex gap-2">
                            <span className="p-1 px-1.5 rounded bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 text-[8px] font-bold uppercase">
                              Segurança
                            </span>
                            <span className="p-1 px-1.5 rounded bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 text-[8px] font-bold uppercase">
                              Planta de Fábrica
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-amber-50/15 dark:bg-amber-950/5 p-3 rounded-xl border border-amber-500/10">
                      <p className="text-[9px] font-black text-amber-600 uppercase tracking-wider">Nota de Engenharia</p>
                      <p className="text-[10.5px] text-slate-600 dark:text-slate-350 leading-relaxed mt-1">
                        {selectedEdsonAnalyticsUser === 'ALL' ? (
                          "Sua equipe demonstra uma presença active e resiliente nos layouts industriais e setups produtivos. O monitoramento centralizado consolida as horas extras acumuladas e o fôlego de execução fabril de toda a planta."
                        ) : selectedEdsonAnalyticsUser === edsonExtraHoursAnalytics.edsonDefaultId ? (
                          "Sua significativa presença física em fábrica assegura e agiliza setups e operações de alta complexidade. O banco acumulado realça a dedicação de liderança executiva na planta."
                        ) : (
                          `${activeUserName} tem contribuído vigorosamente nas operações listadas acima. O mapa de intensidade revela o engajamento e a dedicação técnica no chão de fábrica e em regimes extraordinários.`
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
