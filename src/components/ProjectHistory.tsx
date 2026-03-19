import React, { useState, useMemo, useEffect } from 'react';
import { Filter, Calendar, Search, Clock, Hash, User as UserIcon, Truck, Trash2, Layers, Box, Eye, X, FileCheck, FileX, AlertTriangle, Edit, Timer, RefreshCw, AlertCircle, CheckCircle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { AppState, ProjectType, User, VariationRecord, ProjectSession, ImplementType } from '../types';
import { PROJECT_TYPES, IMPLEMENT_TYPES, FLOORING_TYPES } from '../constants';
import { fetchUsers, supabase, findDuplicateProjects, deleteProjectById, DuplicateGroup } from '../services/storageService';
import { useToast } from './Toast';
import { calcActiveSeconds } from '../utils/workdayCalc';
import { useLanguage } from '../i18n/LanguageContext';

interface ProjectHistoryProps {
  data: AppState;
  currentUser: User;
  onDelete?: (id: string) => void;
  onUpdate?: (project: ProjectSession) => Promise<void>;
}

export const ProjectHistory: React.FC<ProjectHistoryProps> = ({ data, currentUser, onDelete, onUpdate }) => {
  const { t, language } = useLanguage();
  const { addToast } = useToast();
  const [filterNs, setFilterNs] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterSuspicious, setFilterSuspicious] = useState(false);
  const [usersMap, setUsersMap] = useState<Record<string, User>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [showRecalculateConfirm, setShowRecalculateConfirm] = useState(false);
  const [recalculateProgress, setRecalculateProgress] = useState({ current: 0, total: 0 });

  // Sorting State
  const [sortKey, setSortKey] = useState<string>('startTime');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Duplicate Management State
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);

  // State for the Variations Modal
  const [selectedProject, setSelectedProject] = useState<ProjectSession | null>(null);
  
  // Sub-tabs state
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'search'>('list');
  
  // State for Edit Modal
  const [editingProject, setEditingProject] = useState<ProjectSession | null>(null);
  const [editForm, setEditForm] = useState({ 
      ns: '', 
      clientName: '',
      projectCode: '',
      type: ProjectType.RELEASE,
      implementType: ImplementType.BASE,
      flooringType: '',
      hours: 0, 
      minutes: 0,
      estHours: 0,
      estMinutes: 0,
      userId: '',
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      isOvertime: false
  });

  // Helper to format date for input
  const getLocalDate = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper to format time for input
  const getLocalTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${mins}`;
  };

  useEffect(() => {
    const load = async () => {
      const users = await fetchUsers();
      const map = users.reduce((acc, u) => ({ ...acc, [u.id]: u }), {} as Record<string, User>);
      setUsersMap(map);
    };
    load();
  }, []);

  const filteredProjects = useMemo(() => {
    const filtered = data.projects.filter(p => {
      const searchLower = filterNs.toLowerCase();
      const matchSearch = 
        p.ns.toLowerCase().includes(searchLower) || 
        (p.clientName || '').toLowerCase().includes(searchLower) || 
        (p.projectCode || '').toLowerCase().includes(searchLower) ||
        (p.flooringType || '').toLowerCase().includes(searchLower) ||
        (p.implementType || '').toLowerCase().includes(searchLower) ||
        (p.notes || '').toLowerCase().includes(searchLower);
      
      const matchType = filterType ? p.type === filterType : true;
      
      let matchDate = true;
      if (startDate || endDate) {
        const pDate = new Date(p.startTime).getTime();
        const start = startDate ? new Date(startDate).getTime() : 0;
        // End of the selected day
        const end = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : Infinity;
        matchDate = pDate >= start && pDate <= end;
      }

      let matchSuspicious = true;
      if (filterSuspicious) {
          const isTooShort = p.totalActiveSeconds < 300; // < 5 mins
          const isTooLong = p.totalActiveSeconds > 43200; // > 12 hours
          const isFuture = new Date(p.startTime).getTime() > Date.now();
          matchSuspicious = isTooShort || isTooLong || isFuture;
      }

      return matchSearch && matchType && matchDate && matchSuspicious;
    });

    return filtered.sort((a, b) => {
      let valA: any;
      let valB: any;

      switch (sortKey) {
        case 'startTime':
          valA = new Date(a.startTime).getTime();
          valB = new Date(b.startTime).getTime();
          break;
        case 'ns':
          valA = a.ns.toLowerCase();
          valB = b.ns.toLowerCase();
          break;
        case 'clientName':
          valA = (a.clientName || '').toLowerCase();
          valB = (b.clientName || '').toLowerCase();
          break;
        case 'totalActiveSeconds':
          valA = a.totalActiveSeconds;
          valB = b.totalActiveSeconds;
          break;
        case 'status':
          valA = a.status;
          valB = b.status;
          break;
        case 'type':
          valA = a.type;
          valB = b.type;
          break;
        case 'userId':
          valA = (usersMap[a.userId || '']?.name || '').toLowerCase();
          valB = (usersMap[b.userId || '']?.name || '').toLowerCase();
          break;
        default:
          valA = 0;
          valB = 0;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data.projects, filterNs, filterType, startDate, endDate, filterSuspicious, sortKey, sortDirection, usersMap]);

  const handleOpenEdit = (project: ProjectSession) => {
      setEditingProject(project);
      setEditForm({
          ns: project.ns,
          clientName: project.clientName || '',
          projectCode: project.projectCode || '',
          type: project.type,
          implementType: project.implementType,
          flooringType: project.flooringType || '',
          hours: Math.floor(project.totalActiveSeconds / 3600),
          minutes: Math.floor((project.totalActiveSeconds % 3600) / 60),
          estHours: project.estimatedSeconds ? Math.floor(project.estimatedSeconds / 3600) : 0,
          estMinutes: project.estimatedSeconds ? Math.floor((project.estimatedSeconds % 3600) / 60) : 0,
          userId: project.userId || '',
          startDate: getLocalDate(project.startTime),
          startTime: getLocalTime(project.startTime),
          endDate: project.endTime ? getLocalDate(project.endTime) : '',
          endTime: project.endTime ? getLocalTime(project.endTime) : '',
          isOvertime: !!project.isOvertime
      });
  };

  const handleRecalculateClick = () => {
    if (!currentUser || currentUser.role !== 'GESTOR') return;
    setShowRecalculateConfirm(true);
  };

  const executeRecalculation = async () => {
    setShowRecalculateConfirm(false);
    setIsRecalculating(true);
    let updatedCount = 0;

    try {
        console.log("Starting recalculation...");
        const updates: { id: string; total_active_seconds: number }[] = [];
        
        // Identify projects to update
        for (const project of data.projects) {
            if (project.status !== 'COMPLETED' || !project.startTime || !project.endTime) continue;

            const start = new Date(project.startTime);
            const end = new Date(project.endTime);

            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                console.warn(`Invalid dates for project ${project.id}: Start=${project.startTime}, End=${project.endTime}`);
                continue;
            }

            // Calculate correct duration using Working Hours
            const totalWorkingSeconds = calcActiveSeconds(start, end, data.settings, !!project.isOvertime);
            
            // Subtract Working Time spent in Pauses
            let totalPauseWorkingSeconds = 0;
            (project.pauses || []).forEach((p: any) => {
                const dur = Number(p.durationSeconds);
                if (dur > 0) {
                    const pStart = new Date(p.timestamp);
                    const pEnd = new Date(pStart.getTime() + dur * 1000);
                    totalPauseWorkingSeconds += calcActiveSeconds(pStart, pEnd, data.settings, !!project.isOvertime);
                }
            });
            
            const netSeconds = Math.max(0, totalWorkingSeconds - totalPauseWorkingSeconds);

            // If different, queue update
            // We use a threshold of 60 seconds to avoid minor drifts if any, or just exact match
            if (Math.abs(project.totalActiveSeconds - netSeconds) > 1) {
                console.log(`Project ${project.id} needs update: Current=${project.totalActiveSeconds}, New=${netSeconds}`);
                updates.push({
                    id: project.id,
                    total_active_seconds: netSeconds
                });
            }
        }

        if (updates.length === 0) {
            addToast("Todos os projetos já estão com as horas corretas.", "success");
            setIsRecalculating(false);
            return;
        }

        console.log(`Found ${updates.length} projects to update.`);
        setRecalculateProgress({ current: 0, total: updates.length });

        // Execute updates in batches
        const BATCH_SIZE = 10;
        for (let i = 0; i < updates.length; i += BATCH_SIZE) {
            const batch = updates.slice(i, i + BATCH_SIZE);
            
            await Promise.all(batch.map(u => 
                supabase.from('projects').update({ total_active_seconds: u.total_active_seconds }).eq('id', u.id)
            ));
            
            updatedCount += batch.length;
            setRecalculateProgress(prev => ({ ...prev, current: updatedCount }));
        }

        addToast(`Sucesso! ${updatedCount} projetos foram recalculados e atualizados.`, "success");
        
        // Force refresh by reloading page as it's the cleanest way to sync everything
        setTimeout(() => {
            window.location.reload();
        }, 1500);

    } catch (error) {
        console.error("Recalculation failed", error);
        addToast("Ocorreu um erro ao recalcular os projetos.", "error");
    } finally {
        setIsRecalculating(false);
    }
  };

    // Calculate preview of duration
    const durationPreview = useMemo(() => {
        if (!editForm.startDate || !editForm.startTime || !editForm.endDate || !editForm.endTime) {
            return { gross: 0, pauses: 0, net: 0, valid: false };
        }

        const start = new Date(`${editForm.startDate}T${editForm.startTime}`);
        const end = new Date(`${editForm.endDate}T${editForm.endTime}`);
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return { gross: 0, pauses: 0, net: 0, valid: false };
        if (end < start) return { gross: 0, pauses: 0, net: 0, valid: false, error: t('endDateBeforeStart') };

        const totalWorkingSeconds = calcActiveSeconds(start, end, data.settings, editForm.isOvertime);
        
        let totalPauseWorkingSeconds = 0;
        (editingProject?.pauses || []).forEach((p: any) => {
            const dur = Number(p.durationSeconds);
            if (dur > 0) {
                const pStart = new Date(p.timestamp);
                const pEnd = new Date(pStart.getTime() + dur * 1000);
                totalPauseWorkingSeconds += calcActiveSeconds(pStart, pEnd, data.settings, editForm.isOvertime);
            }
        });

        const netSeconds = Math.max(0, totalWorkingSeconds - totalPauseWorkingSeconds);

        return { 
            gross: totalWorkingSeconds, 
            pauses: totalPauseWorkingSeconds, 
            net: netSeconds, 
            valid: true 
        };
    }, [editForm.startDate, editForm.startTime, editForm.endDate, editForm.endTime, editForm.isOvertime, editingProject]);

    const handleSaveEdit = async () => {
      if (!editingProject || !onUpdate) return;
      
      setIsSaving(true);
      try {
        const estimatedSeconds = (editForm.estHours * 3600) + (editForm.estMinutes * 60);

        // Construct ISO strings from date/time inputs
        const startIso = new Date(`${editForm.startDate}T${editForm.startTime}`).toISOString();
        
        let endIso: string | null = null;
        let totalActiveSeconds = 0;

        if (editForm.endDate && editForm.endTime) {
            endIso = new Date(`${editForm.endDate}T${editForm.endTime}`).toISOString();
            
            // Use the same logic as preview
            if (durationPreview.valid) {
                totalActiveSeconds = durationPreview.net;
            } else {
                // Fallback or 0 if invalid
                totalActiveSeconds = 0;
            }
        } else {
            totalActiveSeconds = editingProject.totalActiveSeconds;
        }

        const updatedProject = {
            ...editingProject,
            ns: editForm.ns,
            clientName: editForm.clientName,
            projectCode: editForm.projectCode,
            type: editForm.type,
            implementType: editForm.implementType,
            flooringType: editForm.flooringType,
            totalActiveSeconds: totalActiveSeconds,
            estimatedSeconds: estimatedSeconds > 0 ? estimatedSeconds : undefined,
            userId: editForm.userId || undefined,
            startTime: startIso,
            endTime: endIso,
            isOvertime: editForm.isOvertime
        };
        
        await onUpdate(updatedProject);
        setEditingProject(null);
      } catch (error) {
        console.error("Failed to save project", error);
        alert("Erro ao salvar alterações. Tente novamente.");
      } finally {
        setIsSaving(false);
      }
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const formatDate = (isoString: string) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getVariationCounts = (variations: VariationRecord[]) => {
      if (!variations) return { parts: 0, assemblies: 0 };
      const parts = variations.filter(v => v.type === 'Peça').length;
      const assemblies = variations.filter(v => v.type === 'Montagem').length;
      return { parts, assemblies };
  };

  const isGestor = ['GESTOR', 'COORDENADOR'].includes(currentUser.role);
  const totalEngineeringSalary = data.users.reduce((acc, u) => acc + (u.salary || 0), 0);
  const engineeringHourlyRate = totalEngineeringSalary / 220;

  const getTranslatedType = (type: string) => {
    switch (type) {
      case ProjectType.RELEASE: return t('release');
      case ProjectType.VARIATION: return t('variation');
      case ProjectType.DEVELOPMENT: return t('development');
      default: return type;
    }
  };

  const getTranslatedImplement = (type: string) => {
    switch (type) {
      case ImplementType.BASE: return t('base');
      case ImplementType.FURGAO: return t('furgao');
      case ImplementType.SIDER: return t('sider');
      case ImplementType.CAIXA_CARGA: return t('caixaCarga');
      case ImplementType.BASCULANTE: return t('basculante');
      case ImplementType.SOBRECHASSI: return t('sobrechassi');
      case ImplementType.GRANELEIRO: return t('graneleiro');
      case ImplementType.CARGA_SECA: return t('cargaSeca');
      case ImplementType.COMPONENTES: return t('componentes');
      case ImplementType.OUTROS: return t('outros');
      case ImplementType.SOBRE_CHASSI_FURGAO: return t('sobreChassiFurgao');
      case ImplementType.SOBRE_CHASSI_LONADO: return t('sobreChassiLonado');
      default: return type;
    }
  };

  const getTranslatedStatus = (status: string) => {
    return status === 'COMPLETED' ? t('completed') : t('inProgress');
  };

  const getTranslatedUserRole = (role: string) => {
    switch (role) {
      case 'GESTOR': return t('gestor');
      case 'PROJETISTA': return t('projetista');
      case 'CEO': return t('ceo');
      case 'COORDENADOR': return t('coordenador');
      default: return role;
    }
  };

  // Calculate Stats
  const stats = useMemo(() => {
    const totalProjects = filteredProjects.length;
    const totalSeconds = filteredProjects.reduce((acc, p) => acc + p.totalActiveSeconds, 0);
    const avgSeconds = totalProjects > 0 ? totalSeconds / totalProjects : 0;
    
    let totalCost = 0;
    if (isGestor) {
      const totalEngineeringSalary = data.users.reduce((acc, u) => acc + (u.salary || 0), 0);
      const engineeringHourlyRate = totalEngineeringSalary / 220;
      
      filteredProjects.forEach(p => {
        totalCost += engineeringHourlyRate * (p.totalActiveSeconds / 3600);
      });
    }

    return {
      totalProjects,
      totalHours: Math.floor(totalSeconds / 3600),
      totalMinutes: Math.floor((totalSeconds % 3600) / 60),
      avgHours: Math.floor(avgSeconds / 3600),
      avgMinutes: Math.floor((avgSeconds % 3600) / 60),
      totalCost
    };
  }, [filteredProjects, isGestor, usersMap]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortKey !== columnKey) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
    return sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 text-blue-600" /> : <ArrowDown className="w-3 h-3 ml-1 text-blue-600" />;
  };

  return (
    <div className="space-y-6">
      {/* Sub-Tabs Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex p-1 bg-gray-100 dark:bg-slate-900 rounded-xl w-fit">
            <button
              onClick={() => setActiveSubTab('list')}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeSubTab === 'list' ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'}`}
            >
              <Layers className="w-4 h-4" />
              {t('generalHistory')}
            </button>
            <button
              onClick={() => setActiveSubTab('search')}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeSubTab === 'search' ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'}`}
            >
              <Search className="w-4 h-4" />
              {t('searchProjects')}
            </button>
        </div>

        {activeSubTab === 'list' && (
          <div className="hidden md:flex items-center gap-4 text-xs font-medium text-gray-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span>{stats.totalProjects} {t('totalProjects')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>{stats.totalHours}h {stats.totalMinutes}m {t('totalTime')}</span>
            </div>
          </div>
        )}
      </div>

      {/* Stats Cards (Only in List view) */}
      {activeSubTab === 'list' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-black p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
            <div className="text-xs text-gray-500 dark:text-slate-400 mb-1 flex items-center gap-1.5">
              <FileCheck className="w-3.5 h-3.5 text-blue-500" />
              {t('totalProjects')}
            </div>
            <div className="text-2xl font-bold text-black dark:text-white">{stats.totalProjects}</div>
          </div>
          <div className="bg-white dark:bg-black p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
            <div className="text-xs text-gray-500 dark:text-slate-400 mb-1 flex items-center gap-1.5">
              <Timer className="w-3.5 h-3.5 text-green-500" />
              {t('totalTime')}
            </div>
            <div className="text-2xl font-bold text-black dark:text-white">{stats.totalHours}h {stats.totalMinutes}m</div>
          </div>
          <div className="bg-white dark:bg-black p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
            <div className="text-xs text-gray-500 dark:text-slate-400 mb-1 flex items-center gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-orange-500" />
              {t('avgPerProject')}
            </div>
            <div className="text-2xl font-bold text-black dark:text-white">{stats.avgHours}h {stats.avgMinutes}m</div>
          </div>
          {isGestor && (
            <div className="bg-white dark:bg-black p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
              <div className="text-xs text-gray-500 dark:text-slate-400 mb-1 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                {t('totalCost')}
              </div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalCost)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters Section */}
      <div className={`bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 ${activeSubTab === 'list' ? 'hidden md:block' : 'block'}`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center text-black dark:text-white font-bold text-lg">
            <Filter className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
            {activeSubTab === 'search' ? t('advancedSearchTool') : t('searchFilters')}
          </div>
          {(filterNs || filterType || startDate || endDate || filterSuspicious) && (
            <button 
              onClick={() => {
                setFilterNs('');
                setFilterType('');
                setStartDate('');
                setEndDate('');
                setFilterSuspicious(false);
              }}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              {t('clearFilters')}
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={filterNs}
              onChange={(e) => setFilterNs(e.target.value)}
              className="w-full pl-10 p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
            />
          </div>
          
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
          >
            <option value="">{t('allTypes')}</option>
            {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <div className="flex items-center gap-2">
            <span className="text-xs text-black dark:text-white">{t('from')}</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm dark:bg-black dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-black dark:text-white">{t('to')}</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm dark:bg-black dark:text-white"
            />
          </div>

          {isGestor && (
            <div className="flex gap-2">
              <button 
                onClick={() => setFilterSuspicious(!filterSuspicious)}
                className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg border transition-all font-medium text-sm ${
                    filterSuspicious 
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 shadow-sm' 
                    : 'bg-white dark:bg-black border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-600'
                }`}
              >
                <AlertTriangle className={`w-4 h-4 ${filterSuspicious ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`} />
                {t('suspicious')}
              </button>
              
              <button 
                onClick={handleRecalculateClick}
                disabled={isRecalculating}
                className={`p-2 rounded-lg border transition-colors flex items-center justify-center ${isRecalculating ? 'bg-gray-100 dark:bg-black text-gray-400 cursor-not-allowed' : 'bg-white dark:bg-black border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 hover:text-blue-600 dark:hover:text-blue-400'}`}
                title={t('recalculateDuration')}
              >
                <RefreshCw className={`w-4 h-4 ${isRecalculating ? 'animate-spin' : ''}`} />
              </button>

              <button 
                onClick={async () => {
                    addToast("Buscando duplicatas...", "info");
                    setIsCheckingDuplicates(true);
                    try {
                        const res = await findDuplicateProjects();
                        if (res.success) {
                            if (res.duplicates.length > 0) {
                                setDuplicateGroups(res.duplicates);
                                setShowDuplicateModal(true);
                                addToast(`${res.duplicates.length} duplicatas encontradas.`, "success");
                            } else {
                                addToast("Nenhuma duplicata encontrada.", "success");
                            }
                        } else {
                            addToast("Erro: " + res.message, "error");
                        }
                    } catch (e) {
                        addToast("Erro inesperado ao processar.", "error");
                    } finally {
                        setIsCheckingDuplicates(false);
                    }
                }}
                disabled={isCheckingDuplicates}
                className={`p-2 rounded-lg border transition-colors flex items-center justify-center ${isCheckingDuplicates ? 'bg-gray-100 dark:bg-black text-gray-400 cursor-not-allowed' : 'bg-white dark:bg-black border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 hover:text-orange-600 dark:hover:text-orange-400'}`}
                title={t('searchDuplicates')}
              >
                {isCheckingDuplicates ? <RefreshCw className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Recalculate Confirmation Modal */}
      {showRecalculateConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-black rounded-xl shadow-2xl w-full max-w-md p-6 border border-gray-100 dark:border-slate-700">
                <div className="flex items-center gap-3 mb-4 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-6 h-6" />
                    <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">Confirmar Recálculo</h3>
                </div>
                <p className="text-gray-600 dark:text-slate-400 mb-6">
                    Isso irá recalcular a duração de <strong>TODOS</strong> os projetos concluídos com base nas das de início/fim e pausas registradas.
                    <br/><br/>
                    Esta ação pode corrigir registros antigos onde a duração estava zerada ou incorreta.
                </p>
                <div className="flex justify-end gap-3">
                    <button 
                        onClick={() => setShowRecalculateConfirm(false)}
                        className="px-4 py-2 text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-black hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg font-medium transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={executeRecalculation}
                        className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors shadow-sm flex items-center"
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Confirmar e Recalcular
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Progress Modal */}
      {isRecalculating && !showRecalculateConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-black rounded-xl shadow-2xl w-full max-w-sm p-8 text-center border border-gray-100 dark:border-slate-700">
                <div className="mb-4 flex justify-center">
                    <RefreshCw className="w-12 h-12 text-blue-600 dark:text-blue-400 animate-spin" />
                </div>
                <h3 className="text-xl font-bold text-gray-800 dark:text-slate-100 mb-2">{t('updatingProjects')}</h3>
                <p className="text-gray-500 dark:text-slate-400 mb-6">
                    {t('waitRecalculate')}
                </p>
                
                {recalculateProgress.total > 0 && (
                    <div className="space-y-2">
                        <div className="w-full bg-gray-100 dark:bg-black rounded-full h-2.5 overflow-hidden">
                            <div 
                                className="bg-blue-600 dark:bg-blue-500 h-2.5 rounded-full transition-all duration-300" 
                                style={{ width: `${(recalculateProgress.current / recalculateProgress.total) * 100}%` }}
                            ></div>
                        </div>
                        <div className="flex justify-between text-xs font-medium text-gray-500 dark:text-slate-400">
                            <span>{recalculateProgress.current} {t('updated')}</span>
                            <span>{t('total')}: {recalculateProgress.total}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
      )}

      {/* Results Table */}
      <div className="bg-white dark:bg-black rounded-xl shadow-md border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-slate-900 text-black dark:text-white font-medium border-b border-gray-100 dark:border-slate-700 shadow-sm">
              <tr>
                <th className="p-4 w-32">{t('statusActions')}</th>
                <th className="p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-black transition-colors" onClick={() => handleSort('userId')}>
                  <div className="flex items-center">{t('designerCol')} <SortIcon columnKey="userId" /></div>
                </th>
                <th className="p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-black transition-colors" onClick={() => handleSort('clientName')}>
                  <div className="flex items-center">{t('clientProjectCol')} <SortIcon columnKey="clientName" /></div>
                </th>
                <th className="p-4">{t('specsVariationsCol')}</th>
                <th className="p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-black transition-colors" onClick={() => handleSort('startTime')}>
                  <div className="flex items-center">{t('scheduleTimeCol')} <SortIcon columnKey="startTime" /></div>
                </th>
                {isGestor && <th className="p-4">{t('costCol')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {filteredProjects.map((project) => {
                const { parts, assemblies } = getVariationCounts(project.variations);
                const totalVariations = (project.variations || []).length;
                
                const user = usersMap[project.userId || ''];
                const salary = user?.salary || 0;
                const hourlyRate = engineeringHourlyRate;
                const cost = hourlyRate * (project.totalActiveSeconds / 3600);
                
                const canEdit = ['GESTOR', 'COORDENADOR'].includes(currentUser.role);

                return (
                <tr key={project.id} className="hover:bg-gray-50 dark:hover:bg-black/50 transition-colors group">
                  <td className="p-4">
                    <div className="flex flex-col gap-3">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm text-center ${
                        project.status === 'COMPLETED' 
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border border-green-200 dark:border-green-800' 
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                      }`}>
                        {getTranslatedStatus(project.status)}
                      </span>
                      
                      <div className="flex items-center justify-center gap-1">
                          <button 
                              onClick={() => setSelectedProject(project)}
                              className="text-gray-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 p-1.5 rounded transition"
                              title={t('viewDetails')}
                          >
                              <Eye className="w-4 h-4" />
                          </button>
                          {canEdit && (
                            <>
                                <button 
                                    onClick={() => handleOpenEdit(project)}
                                    className="text-gray-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 p-1.5 rounded transition"
                                    title={t('edit')}
                                >
                                    <Edit className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (onDelete) onDelete(project.id);
                                    }}
                                    className="text-gray-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 p-1.5 rounded transition"
                                    title={t('delete')}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </>
                          )}
                      </div>
                    </div>
                  </td>
                  
                  {/* Projetista */}
                  <td className="p-4">
                    <div className="flex items-center text-black dark:text-white font-medium">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xs mr-3 font-bold shadow-sm ring-2 ring-white dark:ring-slate-800 shrink-0">
                        {(user?.name || '?').charAt(0)}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-bold truncate max-w-[100px]" title={user?.name}>
                              {user?.name || t('unknown')}
                          </span>
                          <span className="text-[10px] text-gray-500 dark:text-slate-500 uppercase tracking-tighter">
                            {user?.role ? getTranslatedUserRole(user.role) : t('member')}
                          </span>
                        </div>
                    </div>
                  </td>

                  {/* Cliente / Projeto */}
                  <td className="p-4">
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="text-sm font-bold text-black dark:text-white truncate max-w-[180px]" title={project.clientName}>
                        {project.clientName || '-'}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-blue-600 dark:text-blue-400 text-sm">{project.ns}</span>
                        {project.projectCode && (
                          <span className="text-[10px] text-gray-500 dark:text-slate-500 font-mono flex items-center gap-1 truncate max-w-[100px]">
                            <Hash className="w-2.5 h-2.5" />
                            {project.projectCode}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Especificações / Variações */}
                  <td className="p-4">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-black dark:text-white bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{getTranslatedType(project.type)}</span>
                        {project.isOvertime && (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[9px] font-bold rounded border border-amber-200 dark:border-amber-800 uppercase">
                            {t('overtimeAbbr')}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-500 dark:text-slate-500 flex items-center gap-1">
                        <Truck className="w-3 h-3" />
                        {project.implementType ? getTranslatedImplement(project.implementType) : '-'}
                        {project.flooringType && <span className="mx-1">|</span>}
                        {project.flooringType}
                      </div>
                      {totalVariations > 0 && (
                        <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                          <Layers className="w-3 h-3" />
                          {totalVariations} Cód. ({parts}{t('part').charAt(0)} / {assemblies}{t('assembly').charAt(0)})
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Cronograma / Tempo */}
                  <td className="p-4">
                    <div className="flex flex-col gap-2 min-w-[160px]">
                        <div className="text-[10px] text-gray-500 dark:text-slate-500 flex flex-col">
                          <span><span className="font-bold dark:text-slate-400">{t('startAbbr')}</span> {formatDate(project.startTime)}</span>
                          {project.endTime && <span><span className="font-bold dark:text-slate-400">{t('endAbbr')}</span> {formatDate(project.endTime)}</span>}
                        </div>
                        
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-[10px] font-bold">
                              <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                                  <Timer className="w-3 h-3" />
                                  {t('estimatedAbbr')} {project.estimatedSeconds ? formatDuration(project.estimatedSeconds) : '-'}
                              </span>
                              <span className="text-gray-500 dark:text-slate-500 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatDuration(project.totalActiveSeconds)}
                              </span>
                          </div>
                          
                          {project.estimatedSeconds ? (
                            <div className="w-full h-1 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${
                                  project.totalActiveSeconds <= project.estimatedSeconds 
                                    ? 'bg-green-500' 
                                    : 'bg-red-500'
                                }`}
                                style={{ width: `${Math.min(100, (project.totalActiveSeconds / project.estimatedSeconds) * 100)}%` }}
                              ></div>
                            </div>
                          ) : (
                            <div className="w-full h-1 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden opacity-30"></div>
                          )}

                          {project.estimatedSeconds && (
                              <div className={`text-[9px] font-black uppercase tracking-tighter ${
                                  project.totalActiveSeconds <= project.estimatedSeconds ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                              }`}>
                                  {project.totalActiveSeconds <= project.estimatedSeconds 
                                      ? `✓ +${formatDuration(project.estimatedSeconds - project.totalActiveSeconds)}`
                                      : `⚠ -${formatDuration(project.totalActiveSeconds - project.estimatedSeconds)}`
                                  }
                              </div>
                          )}
                        </div>
                    </div>
                  </td>

                  {isGestor && (
                    <td className="p-4">
                      {salary > 0 ? (
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-red-600 dark:text-red-400">
                            {new Intl.NumberFormat(language, { style: 'currency', currency: 'BRL' }).format(cost)}
                          </span>
                          <span className="text-[10px] text-gray-500 dark:text-slate-500">
                            {new Intl.NumberFormat(language, { style: 'currency', currency: 'BRL' }).format(hourlyRate)}/h
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-slate-500 italic">{t('salaryNotDef')}</span>
                      )}
                    </td>
                  )}
                </tr>
                );
              })}
              {filteredProjects.length === 0 && (
                <tr>
                  <td colSpan={isGestor ? 10 : 9} className="p-20 text-center">
                    <div className="flex flex-col items-center justify-center space-y-4">
                      <div className="w-16 h-16 bg-gray-50 dark:bg-slate-900 rounded-full flex items-center justify-center">
                        <Search className="w-8 h-8 text-gray-300 dark:text-slate-700" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">{t('noProjectsFound')}</h3>
                        <p className="text-sm text-gray-500 dark:text-slate-400 max-w-xs mx-auto">
                          {t('noProjectsFoundDesc')}
                        </p>
                      </div>
                      <button 
                        onClick={() => {
                          setFilterNs('');
                          setFilterType('');
                          setStartDate('');
                          setEndDate('');
                          setFilterSuspicious(false);
                        }}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-colors shadow-sm"
                      >
                        {t('clearAllFilters')}
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Project Details Modal */}
      {selectedProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-black rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] border border-gray-100 dark:border-slate-700">
                <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center bg-gray-50 dark:bg-black">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100 flex items-center">
                            <FileCheck className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
                            {t('projectDetails')}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-slate-400">NS: <span className="font-mono font-bold text-gray-700 dark:text-slate-200">{selectedProject.ns}</span></p>
                    </div>
                    <button 
                        onClick={() => setSelectedProject(null)}
                        className="p-2 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full transition"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto flex-1 space-y-8">
                    {/* Main Info Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-4">
                            <h4 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider border-b dark:border-slate-700 pb-1">{t('generalInfo')}</h4>
                            <div>
                                <div className="text-xs text-gray-500 dark:text-slate-400">{t('client')}</div>
                                <div className="font-medium text-gray-800 dark:text-slate-200">{selectedProject.clientName || '-'}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 dark:text-slate-400">{t('projectCode')}</div>
                                <div className="font-mono text-sm text-gray-800 dark:text-slate-200">{selectedProject.projectCode || '-'}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 dark:text-slate-400">{t('designerCol')}</div>
                                <div className="flex items-center mt-1">
                                    <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-bold mr-2">
                                        {(usersMap[selectedProject.userId || '']?.name || '?').charAt(0)}
                                    </div>
                                    <span className="text-sm text-gray-700 dark:text-slate-300">{usersMap[selectedProject.userId || '']?.name || t('unknown')}</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider border-b dark:border-slate-700 pb-1">{t('specs')}</h4>
                            <div>
                                <div className="text-xs text-gray-500 dark:text-slate-400">{t('projectType')}</div>
                                <div className="font-medium text-gray-800 dark:text-slate-200">{getTranslatedType(selectedProject.type)}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 dark:text-slate-400">{t('implement')}</div>
                                <div className="flex items-center text-gray-800 dark:text-slate-200">
                                    <Truck className="w-3 h-3 mr-1 text-gray-400 dark:text-slate-500" />
                                    {selectedProject.implementType ? getTranslatedImplement(selectedProject.implementType) : '-'}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 dark:text-slate-400">{t('flooringType')}</div>
                                <div className="font-medium text-gray-800 dark:text-slate-200">{selectedProject.flooringType || '-'}</div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider border-b dark:border-slate-700 pb-1">{t('scheduleTime')}</h4>
                            <div>
                                <div className="text-xs text-gray-500 dark:text-slate-400">{t('status')}</div>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold mt-1 ${
                                    selectedProject.status === 'COMPLETED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                }`}>
                                    {getTranslatedStatus(selectedProject.status)}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <div className="text-xs text-gray-500 dark:text-slate-400">{t('start')}</div>
                                    <div className="text-xs font-mono text-gray-700 dark:text-slate-300">{formatDate(selectedProject.startTime)}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-500 dark:text-slate-400">{t('end')}</div>
                                    <div className="text-xs font-mono text-gray-700 dark:text-slate-300">{selectedProject.endTime ? formatDate(selectedProject.endTime) : '-'}</div>
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 dark:text-slate-400">{t('realEstimatedDuration')}</div>
                                <div className="text-sm font-mono font-bold text-gray-800 dark:text-slate-200">
                                    {formatDuration(selectedProject.totalActiveSeconds)} 
                                    <span className="text-gray-400 dark:text-slate-500 font-normal mx-1">/</span>
                                    {selectedProject.estimatedSeconds ? formatDuration(selectedProject.estimatedSeconds) : '-'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Notes Section */}
                    {selectedProject.notes && (
                        <div className="bg-yellow-50 dark:bg-amber-900/20 p-4 rounded-lg border border-yellow-100 dark:border-amber-800">
                            <h4 className="text-xs font-bold text-yellow-700 dark:text-amber-400 uppercase tracking-wider mb-2">{t('notes')}</h4>
                            <p className="text-sm text-yellow-800 dark:text-amber-200 whitespace-pre-wrap">{selectedProject.notes}</p>
                        </div>
                    )}

                    {/* Variations Table Section */}
                    <div>
                        <h4 className="text-sm font-bold text-gray-800 dark:text-slate-100 mb-3 flex items-center">
                            <Layers className="w-4 h-4 mr-2 text-blue-600 dark:text-blue-400" />
                            {t('variations')} ({selectedProject.variations?.length || 0})
                        </h4>
                        <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 dark:bg-black text-gray-600 dark:text-slate-400 font-semibold border-b border-gray-200 dark:border-slate-700">
                                    <tr>
                                        <th className="p-3">{t('oldCode')}</th>
                                        <th className="p-3">{t('description')}</th>
                                        <th className="p-3">{t('newCode')}</th>
                                        <th className="p-3">{t('type')}</th>
                                        <th className="p-3 text-center">{t('files')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                                    {selectedProject.variations?.map((v) => (
                                        <tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                                            <td className="p-3 font-mono text-gray-500 dark:text-slate-500 text-xs">{v.oldCode || '-'}</td>
                                            <td className="p-3 text-gray-800 dark:text-slate-200 font-medium">{v.description}</td>
                                            <td className="p-3 font-mono text-blue-600 dark:text-blue-400 font-bold text-xs">{v.newCode || '-'}</td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${v.type === 'Montagem' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-gray-200 text-gray-700 dark:bg-black dark:text-slate-300'}`}>
                                                    {v.type === 'Montagem' ? t('assembly') : t('part')}
                                                </span>
                                            </td>
                                            <td className="p-3 text-center">
                                            {v.filesGenerated ? (
                                                <span className="inline-flex items-center text-[10px] font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded border border-green-100 dark:border-green-800">
                                                    <FileCheck className="w-3 h-3 mr-1" /> {t('ok')}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center text-[10px] font-bold text-red-400 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded border border-red-100 dark:border-red-800">
                                                    <FileX className="w-3 h-3 mr-1" /> {t('pending')}
                                                </span>
                                            )}
                                            </td>
                                        </tr>
                                    ))}
                                    {(!selectedProject.variations || selectedProject.variations.length === 0) && (
                                        <tr>
                                            <td colSpan={5} className="p-6 text-center text-gray-400 dark:text-slate-500 italic text-xs">
                                                {t('noVariationsFound')}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-black text-right">
                    <button 
                        onClick={() => setSelectedProject(null)}
                        className="px-6 py-2 bg-gray-800 dark:bg-black text-white dark:text-slate-100 rounded-lg hover:bg-gray-900 dark:hover:bg-slate-600 font-medium transition-colors"
                    >
                        {t('close')}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Edit Project Modal */}
      {editingProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-black rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-gray-100 dark:border-slate-700">
                <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center bg-gray-50 dark:bg-black">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100 flex items-center">
                        <Edit className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
                        {t('editRelease')}
                    </h3>
                    <button 
                        onClick={() => setEditingProject(null)}
                        className="p-2 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-200 dark:hover:bg-black rounded-full transition"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">{t('projectNs')}</label>
                            <input 
                                type="text"
                                value={editForm.ns}
                                onChange={(e) => setEditForm({...editForm, ns: e.target.value})}
                                className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono font-bold dark:bg-black dark:text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">{t('projectCode')}</label>
                            <input 
                                type="text"
                                value={editForm.projectCode}
                                onChange={(e) => setEditForm({...editForm, projectCode: e.target.value})}
                                className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-slate-300">{t('client')}</label>
                        <input 
                            type="text"
                            value={editForm.clientName}
                            onChange={(e) => setEditForm({...editForm, clientName: e.target.value})}
                            className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">{t('projectType')}</label>
                            <select 
                                value={editForm.type}
                                onChange={(e) => setEditForm({...editForm, type: e.target.value as ProjectType})}
                                className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
                            >
                                {PROJECT_TYPES.map(t_val => <option key={t_val} value={t_val}>{getTranslatedType(t_val)}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">{t('implement')}</label>
                            <select 
                                value={editForm.implementType}
                                onChange={(e) => setEditForm({...editForm, implementType: e.target.value as ImplementType})}
                                className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
                            >
                                {IMPLEMENT_TYPES.map(t_val => <option key={t_val} value={t_val}>{getTranslatedImplement(t_val)}</option>)}
                            </select>
                        </div>
                    </div>

                    {[
                        ImplementType.BASE, 
                        ImplementType.FURGAO, 
                        ImplementType.SIDER,
                        ImplementType.SOBRE_CHASSI_FURGAO,
                        ImplementType.SOBRE_CHASSI_LONADO
                    ].includes(editForm.implementType) && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">{t('flooringType')}</label>
                            <select 
                                value={editForm.flooringType}
                                onChange={(e) => setEditForm({...editForm, flooringType: e.target.value})}
                                className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
                            >
                                <option value="">{t('select')}...</option>
                                {FLOORING_TYPES.map(t_val => <option key={t_val} value={t_val}>{t_val}</option>)}
                            </select>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-slate-300">{t('designerCol')}</label>
                        <select 
                            value={editForm.userId}
                            onChange={(e) => setEditForm({...editForm, userId: e.target.value})}
                            className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
                            disabled={isSaving}
                        >
                            <option value="">{t('selectDesigner')}</option>
                            {Object.keys(usersMap).length === 0 ? (
                                <option disabled>{t('loadingUsers')}...</option>
                            ) : (
                                Object.keys(usersMap).map(userId => {
                                    const user = usersMap[userId];
                                    return (
                                        <option key={user.id} value={user.id}>
                                            {user.name}
                                        </option>
                                    );
                                })
                            )}
                        </select>
                    </div>

                    <div className="flex items-center space-x-2 pt-2">
                        <input 
                            type="checkbox"
                            id="isOvertime"
                            checked={editForm.isOvertime}
                            onChange={(e) => setEditForm({...editForm, isOvertime: e.target.checked})}
                            className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                        />
                        <label htmlFor="isOvertime" className="text-sm font-bold text-black dark:text-white cursor-pointer">
                            {t('enableOvertime')} ({t('enableOvertimeDesc')})
                        </label>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">{t('startDate')}</label>
                            <input 
                                type="date"
                                value={editForm.startDate}
                                onChange={(e) => setEditForm({...editForm, startDate: e.target.value})}
                                className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">{t('startTime')}</label>
                            <input 
                                type="time"
                                value={editForm.startTime}
                                onChange={(e) => setEditForm({...editForm, startTime: e.target.value})}
                                className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">{t('endDate')}</label>
                            <input 
                                type="date"
                                value={editForm.endDate}
                                onChange={(e) => setEditForm({...editForm, endDate: e.target.value})}
                                className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">{t('endTime')}</label>
                            <input 
                                type="time"
                                value={editForm.endTime}
                                onChange={(e) => setEditForm({...editForm, endTime: e.target.value})}
                                className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">{t('estHours')}</label>
                            <input 
                                type="number"
                                value={editForm.estHours}
                                onChange={(e) => setEditForm({...editForm, estHours: parseInt(e.target.value) || 0})}
                                className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
                                disabled={isSaving}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">{t('estMinutes')}</label>
                            <input 
                                type="number"
                                value={editForm.estMinutes}
                                onChange={(e) => setEditForm({...editForm, estMinutes: parseInt(e.target.value) || 0})}
                                className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
                                disabled={isSaving}
                            />
                        </div>
                    </div>

                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg text-xs text-blue-800 dark:text-blue-300">
                        <div className="flex items-start mb-2">
                            <Clock className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />
                            <p className="text-gray-500 dark:text-slate-400">{t('autoCalculateTime')}:</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="bg-white dark:bg-black p-2 rounded border border-blue-100 dark:border-blue-900/50">
                                <div className="text-[10px] text-gray-500 dark:text-slate-500">{t('gross')}</div>
                                <div className="font-mono font-bold text-gray-800 dark:text-slate-200">{formatDuration(durationPreview.gross)}</div>
                            </div>
                            <div className="bg-white dark:bg-black p-2 rounded border border-blue-100 dark:border-blue-900/50">
                                <div className="text-[10px] text-gray-500 dark:text-slate-500">{t('pauses')}</div>
                                <div className="font-mono font-bold text-red-500 dark:text-red-400">-{formatDuration(durationPreview.pauses)}</div>
                            </div>
                            <div className="bg-white dark:bg-black p-2 rounded border border-blue-100 dark:border-blue-900/50 ring-1 ring-blue-200 dark:ring-blue-900/50">
                                <div className="text-[10px] text-gray-500 dark:text-slate-500">{t('net')}</div>
                                <div className="font-mono font-bold text-green-600 dark:text-green-400">{formatDuration(durationPreview.net)}</div>
                            </div>
                        </div>
                        {durationPreview.error && (
                            <div className="mt-2 text-red-600 dark:text-red-400 font-bold text-center">
                                {durationPreview.error}
                            </div>
                        )}
                    </div>

                    <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-300">
                        <div className="flex items-start">
                            <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />
                            <p>{t('editWarning')}</p>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-black flex gap-3">
                    <button 
                        onClick={() => setEditingProject(null)}
                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 font-medium transition-colors"
                        disabled={isSaving}
                    >
                        {t('cancel')}
                    </button>
                    <button 
                        onClick={handleSaveEdit}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isSaving}
                    >
                        {isSaving ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                                {t('saving')}...
                            </>
                        ) : (
                            t('saveChanges')
                        )}
                    </button>
                </div>
            </div>
        </div>
      )}
      {/* Duplicate Resolution Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-black rounded-xl shadow-2xl w-full max-w-4xl p-6 max-h-[90vh] flex flex-col border border-gray-100 dark:border-slate-700">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100 flex items-center">
                        <AlertCircle className="w-6 h-6 mr-2 text-orange-600 dark:text-orange-400" />
                        {t('resolveDuplicates')} ({duplicateGroups.length})
                    </h3>
                    <button onClick={() => setShowDuplicateModal(false)} className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="overflow-y-auto flex-1 space-y-4 pr-2">
                    {duplicateGroups.map((group) => (
                        <div key={group.discard.id} className="border border-gray-200 dark:border-slate-700 rounded-lg p-4 bg-gray-50 dark:bg-black grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                            {/* Keep */}
                            <div className="bg-white dark:bg-black p-3 rounded border border-green-200 dark:border-green-900/50 shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 text-xs font-bold px-2 py-1 rounded">{t('keep')}</span>
                                    <span className="text-xs text-gray-400 dark:text-slate-500">{t('id')}: ...{group.keep.id.slice(-4)}</span>
                                </div>
                                <p className="font-bold text-gray-800 dark:text-slate-200">{group.keep.ns}</p>
                                <p className="text-sm text-gray-600 dark:text-slate-400">{group.keep.clientName || t('noClient')}</p>
                                <div className="mt-2 text-xs text-gray-500 dark:text-slate-500 space-y-1">
                                    <p>{t('start')}: {new Date(group.keep.startTime).toLocaleString()}</p>
                                    <p>{t('totalTime')}: {(group.keep.totalActiveSeconds / 3600).toFixed(2)}h</p>
                                    <p>{t('status')}: {getTranslatedStatus(group.keep.status)}</p>
                                </div>
                            </div>

                            {/* Discard */}
                            <div className="bg-white dark:bg-black p-3 rounded border border-red-200 dark:border-red-900/50 shadow-sm opacity-75 hover:opacity-100 transition-opacity">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 text-xs font-bold px-2 py-1 rounded">{t('discard')}</span>
                                    <span className="text-xs text-gray-400 dark:text-slate-500">{t('id')}: ...{group.discard.id.slice(-4)}</span>
                                </div>
                                <p className="font-bold text-gray-800 dark:text-slate-200">{group.discard.ns}</p>
                                <p className="text-sm text-gray-600 dark:text-slate-400">{group.discard.clientName || t('noClient')}</p>
                                <div className="mt-2 text-xs text-gray-500 dark:text-slate-500 space-y-1">
                                    <p>{t('start')}: {new Date(group.discard.startTime).toLocaleString()}</p>
                                    <p>{t('totalTime')}: {(group.discard.totalActiveSeconds / 3600).toFixed(2)}h</p>
                                    <p>{t('status')}: {getTranslatedStatus(group.discard.status)}</p>
                                </div>
                                <button 
                                    onClick={async () => {
                                        if(!window.confirm(t('deleteConfirm'))) return;
                                        console.log("Deleting duplicate:", group.discard.id);
                                        const res = await deleteProjectById(group.discard.id, group.discard.ns);
                                        if (res.success) {
                                            console.log("Deletion successful for:", group.discard.id);
                                            // Pop-up requested by user
                                            window.alert(t('deleteSuccess'));
                                            // Update UI instantly without reload
                                            setDuplicateGroups(prev => {
                                                const newGroups = prev.filter(g => g.discard.id !== group.discard.id);
                                                console.log("Remaining duplicates:", newGroups.length);
                                                return newGroups;
                                            });
                                        } else {
                                            console.error("Deletion failed:", res.message);
                                            addToast(t('errorDeleting') + res.message, "error");
                                            window.alert(t('errorDeleting') + res.message);
                                        }
                                    }}
                                    className="mt-3 w-full bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 py-1 rounded text-xs font-bold flex items-center justify-center"
                                >
                                    <Trash2 className="w-3 h-3 mr-1" />
                                    {t('deleteThis')}
                                </button>
                            </div>
                            
                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-black rounded-full p-1 border border-gray-200 dark:border-slate-700 shadow-sm z-10 hidden md:block">
                                <div className="text-gray-400 dark:text-slate-500 text-xs font-bold">VS</div>
                            </div>
                        </div>
                    ))}
                    {duplicateGroups.length === 0 && (
                        <div className="text-center py-10 text-gray-500 dark:text-slate-400">
                            <CheckCircle className="w-12 h-12 mx-auto text-green-500 dark:text-green-400 mb-3" />
                            <p>{t('allDuplicatesResolved')}</p>
                        </div>
                    )}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700 flex justify-end">
                    <button 
                        onClick={() => {
                            setShowDuplicateModal(false);
                            window.location.reload();
                        }}
                        className="px-4 py-2 bg-gray-800 dark:bg-black hover:bg-gray-900 dark:hover:bg-slate-600 text-white dark:text-slate-100 rounded-lg font-medium text-sm"
                    >
                        {t('closeAndUpdate')}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
