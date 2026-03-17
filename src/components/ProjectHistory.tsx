import React, { useState, useMemo, useEffect } from 'react';
import { Filter, Calendar, Search, Clock, Hash, User as UserIcon, Truck, Trash2, Layers, Box, Eye, X, FileCheck, FileX, AlertTriangle, Edit, Timer, RefreshCw, AlertCircle, CheckCircle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { AppState, ProjectType, User, VariationRecord, ProjectSession, ImplementType } from '../types';
import { PROJECT_TYPES, IMPLEMENT_TYPES, FLOORING_TYPES } from '../constants';
import { fetchUsers, supabase, findDuplicateProjects, deleteProjectById, DuplicateGroup } from '../services/storageService';
import { useToast } from './Toast';
import { getWorkingSeconds } from '../utils/timeUtils';

interface ProjectHistoryProps {
  data: AppState;
  currentUser: User;
  onDelete?: (id: string) => void;
  onUpdate?: (project: ProjectSession) => Promise<void>;
}

export const ProjectHistory: React.FC<ProjectHistoryProps> = ({ data, currentUser, onDelete, onUpdate }) => {
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
      const matchNs = p.ns.toLowerCase().includes(filterNs.toLowerCase());
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

      return matchNs && matchType && matchDate && matchSuspicious;
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
            const totalWorkingSeconds = getWorkingSeconds(start, end, !!project.isOvertime);
            
            // Subtract Working Time spent in Pauses
            let totalPauseWorkingSeconds = 0;
            (project.pauses || []).forEach((p: any) => {
                const dur = Number(p.durationSeconds);
                if (dur > 0) {
                    const pStart = new Date(p.timestamp);
                    const pEnd = new Date(pStart.getTime() + dur * 1000);
                    totalPauseWorkingSeconds += getWorkingSeconds(pStart, pEnd, !!project.isOvertime);
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
        if (end < start) return { gross: 0, pauses: 0, net: 0, valid: false, error: "Data Fim anterior ao Início" };

        const totalWorkingSeconds = getWorkingSeconds(start, end, editForm.isOvertime);
        
        let totalPauseWorkingSeconds = 0;
        (editingProject?.pauses || []).forEach((p: any) => {
            const dur = Number(p.durationSeconds);
            if (dur > 0) {
                const pStart = new Date(p.timestamp);
                const pEnd = new Date(pStart.getTime() + dur * 1000);
                totalPauseWorkingSeconds += getWorkingSeconds(pStart, pEnd, editForm.isOvertime);
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

  const isGestor = currentUser.role === 'GESTOR';

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
      {/* Filters Section */}
      <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
        <div className="flex items-center mb-4 text-black dark:text-white font-bold">
          <Filter className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
          Filtros de Busca
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por NS..."
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
            <option value="">Todos os Tipos</option>
            {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <div className="flex items-center gap-2">
            <span className="text-xs text-black dark:text-white">De:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm dark:bg-black dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-black dark:text-white">Até:</span>
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
                Suspeitos
              </button>
              
              <button 
                onClick={handleRecalculateClick}
                disabled={isRecalculating}
                className={`p-2 rounded-lg border transition-colors flex items-center justify-center ${isRecalculating ? 'bg-gray-100 dark:bg-black text-gray-400 cursor-not-allowed' : 'bg-white dark:bg-black border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 hover:text-blue-600 dark:hover:text-blue-400'}`}
                title="Recalcular Duração de Todos os Projetos"
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
                title="Buscar Projetos Duplicados"
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
                <h3 className="text-xl font-bold text-gray-800 dark:text-slate-100 mb-2">Atualizando Projetos...</h3>
                <p className="text-gray-500 dark:text-slate-400 mb-6">
                    Por favor, aguarde enquanto recalculamos as durações.
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
                            <span>{recalculateProgress.current} atualizados</span>
                            <span>Total: {recalculateProgress.total}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
      )}

      {/* Results Table */}
      <div className="bg-white dark:bg-black rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-black text-black dark:text-white font-medium border-b border-gray-100 dark:border-slate-700">
              <tr>
                <th className="p-4 text-center w-24">Ações</th>
                <th className="p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-black transition-colors" onClick={() => handleSort('status')}>
                  <div className="flex items-center">Status <SortIcon columnKey="status" /></div>
                </th>
                <th className="p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-black transition-colors" onClick={() => handleSort('userId')}>
                  <div className="flex items-center">Projetista <SortIcon columnKey="userId" /></div>
                </th>
                <th className="p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-black transition-colors" onClick={() => handleSort('clientName')}>
                  <div className="flex items-center">Cliente <SortIcon columnKey="clientName" /></div>
                </th>
                <th className="p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-black transition-colors" onClick={() => handleSort('ns')}>
                  <div className="flex items-center">NS / Cód. <SortIcon columnKey="ns" /></div>
                </th>
                <th className="p-4">Variações (Total)</th>
                <th className="p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-black transition-colors" onClick={() => handleSort('type')}>
                  <div className="flex items-center">Tipo / Impl. <SortIcon columnKey="type" /></div>
                </th>
                <th className="p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-black transition-colors" onClick={() => handleSort('startTime')}>
                  <div className="flex items-center">Início / Fim <SortIcon columnKey="startTime" /></div>
                </th>
                <th className="p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-black transition-colors" onClick={() => handleSort('totalActiveSeconds')}>
                  <div className="flex items-center">Tempo (Est. / Real) <SortIcon columnKey="totalActiveSeconds" /></div>
                </th>
                {isGestor && <th className="p-4">Custo</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {filteredProjects.map((project) => {
                const { parts, assemblies } = getVariationCounts(project.variations);
                const totalVariations = (project.variations || []).length;
                
                const user = usersMap[project.userId || ''];
                const salary = user?.salary || 0;
                const hourlyRate = salary / 220; // Assuming 220 working hours per month
                const cost = hourlyRate * (project.totalActiveSeconds / 3600);
                
                // Permission Logic
                // "Somente eu (CEO/Gestor) ou o dono do projeto"
                // Assuming "Me" includes GESTOR based on current user context, but strictly following "CEO" request for the new feature.
                // For History: Owner can always edit their own. CEO/GESTOR can edit all.
                // User said: "deixe esta opção de alteração disponível somente para mim" (Me = Gestor/CEO)
                // "para os demais usuarios... não pode ser possível excluir ou alterar"
                
                const isGestor = currentUser.role === 'GESTOR';
                const canEdit = isGestor;
                const canViewVariations = true; // Everyone can view variations

                return (
                <tr key={project.id} className="hover:bg-gray-50 dark:hover:bg-black/50 transition-colors group">
                  <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                          <button 
                              onClick={() => setSelectedProject(project)}
                              className="text-gray-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 p-2 rounded transition"
                              title="Ver Detalhes Completos"
                          >
                              <Eye className="w-4 h-4" />
                          </button>
                          {canEdit && (
                            <>
                                <button 
                                    onClick={() => handleOpenEdit(project)}
                                    className="text-gray-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 p-2 rounded transition"
                                    title="Editar Projeto"
                                >
                                    <Edit className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        console.log("Delete button clicked for project:", project.id);
                                        if (onDelete) onDelete(project.id);
                                    }}
                                    className="text-gray-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded transition"
                                    title="Excluir Projeto"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </>
                          )}
                      </div>
                  </td>

                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      project.status === 'COMPLETED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    }`}>
                      {project.status === 'COMPLETED' ? 'Concluído' : 'Em And.'}
                    </span>
                  </td>
                  
                  {/* Projetista */}
                  <td className="p-4">
                    <div className="flex items-center text-black dark:text-white font-medium">
                        <div className="w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs mr-2 font-bold border border-blue-100 dark:border-blue-800">
                        {(user?.name || '?').charAt(0)}
                        </div>
                        <span className="truncate max-w-[120px]" title={user?.name}>
                            {user?.name || 'Desconhecido'}
                        </span>
                    </div>
                  </td>

                  {/* Cliente */}
                  <td className="p-4 text-black dark:text-white font-medium truncate max-w-[150px]" title={project.clientName}>
                    {project.clientName || '-'}
                  </td>

                  {/* NS e Código */}
                  <td className="p-4">
                     <div className="font-mono font-bold text-black dark:text-white">{project.ns}</div>
                     {project.projectCode && (
                         <div className="text-xs text-blue-600 dark:text-blue-400 font-mono mt-0.5">{project.projectCode}</div>
                     )}
                  </td>

                  {/* Variações Count Simplificado + Botão */}
                  <td className="p-4">
                    {totalVariations === 0 ? (
                        <span className="text-gray-400 dark:text-slate-600 text-xs">-</span>
                    ) : (
                        <div>
                            <div className="text-sm font-bold text-black dark:text-white flex items-center">
                                {totalVariations} <span className="text-xs font-normal text-gray-500 dark:text-slate-500 ml-1">Cód. Criados</span>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                                <div className="text-[10px] text-gray-500 dark:text-slate-500 flex items-center gap-2">
                                    <span className={parts > 0 ? "text-blue-600 dark:text-blue-400 font-medium" : ""}>{parts} Pç</span>
                                    <span className="text-gray-300 dark:text-slate-700">|</span>
                                    <span className={assemblies > 0 ? "text-orange-600 dark:text-orange-400 font-medium" : ""}>{assemblies} Mont</span>
                                </div>
                            </div>
                        </div>
                    )}
                  </td>

                  {/* Tipo e Implemento */}
                  <td className="p-4">
                     <div className="flex items-center gap-2">
                        <div className="text-xs font-bold text-black dark:text-white">{project.type}</div>
                        {project.isOvertime && (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] font-bold rounded border border-amber-200 dark:border-amber-800 uppercase">
                            H.E.
                          </span>
                        )}
                     </div>
                     <div className="flex items-center text-xs text-gray-500 dark:text-slate-500 mt-1">
                      <Truck className="w-3 h-3 mr-1 text-gray-400 dark:text-slate-500" />
                      {project.implementType || '-'}
                    </div>
                  </td>

                  {/* Datas */}
                  <td className="p-4 text-xs text-gray-500 dark:text-slate-500">
                      <div><span className="font-semibold dark:text-slate-400">I:</span> {formatDate(project.startTime)}</div>
                      {project.endTime && <div><span className="font-semibold dark:text-slate-400">F:</span> {formatDate(project.endTime)}</div>}
                  </td>

                  <td className="p-4 font-medium text-black dark:text-white">
                    <div className="flex flex-col">
                        <div className="flex items-center text-xs text-blue-600 dark:text-blue-400 font-bold mb-1">
                            <Timer className="w-3 h-3 mr-1" />
                            Est: {project.estimatedSeconds ? formatDuration(project.estimatedSeconds) : '-'}
                        </div>
                        <div className="flex items-center">
                            <Clock className="w-4 h-4 mr-1 text-gray-400 dark:text-slate-500" />
                            Real: {formatDuration(project.totalActiveSeconds)}
                        </div>
                        {project.estimatedSeconds && (
                            <div className={`text-[10px] mt-1 font-bold ${
                                project.totalActiveSeconds <= project.estimatedSeconds ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                            }`}>
                                {project.totalActiveSeconds <= project.estimatedSeconds 
                                    ? `Economia: ${formatDuration(project.estimatedSeconds - project.totalActiveSeconds)}`
                                    : `Atraso: ${formatDuration(project.totalActiveSeconds - project.estimatedSeconds)}`
                                }
                            </div>
                        )}
                    </div>
                  </td>

                  {isGestor && (
                    <td className="p-4 font-medium text-black dark:text-white">
                      {salary > 0 ? (
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-red-600 dark:text-red-400">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cost)}
                          </span>
                          <span className="text-[10px] text-gray-500 dark:text-slate-500">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(hourlyRate)}/h
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-slate-500 italic">Salário não def.</span>
                      )}
                    </td>
                  )}
                </tr>
              )})}
              {filteredProjects.length === 0 && (
                <tr>
                  <td colSpan={isGestor ? 10 : 9} className="p-12 text-center text-gray-400 dark:text-slate-500">
                    Nenhum projeto encontrado com os filtros selecionados.
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
                            Detalhes do Projeto
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
                            <h4 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider border-b dark:border-slate-700 pb-1">Informações Gerais</h4>
                            <div>
                                <div className="text-xs text-gray-500 dark:text-slate-400">Cliente</div>
                                <div className="font-medium text-gray-800 dark:text-slate-200">{selectedProject.clientName || '-'}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 dark:text-slate-400">Código do Projeto</div>
                                <div className="font-mono text-sm text-gray-800 dark:text-slate-200">{selectedProject.projectCode || '-'}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 dark:text-slate-400">Projetista</div>
                                <div className="flex items-center mt-1">
                                    <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-bold mr-2">
                                        {(usersMap[selectedProject.userId || '']?.name || '?').charAt(0)}
                                    </div>
                                    <span className="text-sm text-gray-700 dark:text-slate-300">{usersMap[selectedProject.userId || '']?.name || 'Desconhecido'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider border-b dark:border-slate-700 pb-1">Especificações</h4>
                            <div>
                                <div className="text-xs text-gray-500 dark:text-slate-400">Tipo de Projeto</div>
                                <div className="font-medium text-gray-800 dark:text-slate-200">{selectedProject.type}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 dark:text-slate-400">Implemento</div>
                                <div className="flex items-center text-gray-800 dark:text-slate-200">
                                    <Truck className="w-3 h-3 mr-1 text-gray-400 dark:text-slate-500" />
                                    {selectedProject.implementType || '-'}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 dark:text-slate-400">Tipo de Assoalho</div>
                                <div className="font-medium text-gray-800 dark:text-slate-200">{selectedProject.flooringType || '-'}</div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider border-b dark:border-slate-700 pb-1">Tempo e Status</h4>
                            <div>
                                <div className="text-xs text-gray-500 dark:text-slate-400">Status</div>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold mt-1 ${
                                    selectedProject.status === 'COMPLETED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                }`}>
                                    {selectedProject.status === 'COMPLETED' ? 'Concluído' : 'Em Andamento'}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <div className="text-xs text-gray-500 dark:text-slate-400">Início</div>
                                    <div className="text-xs font-mono text-gray-700 dark:text-slate-300">{formatDate(selectedProject.startTime)}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-500 dark:text-slate-400">Fim</div>
                                    <div className="text-xs font-mono text-gray-700 dark:text-slate-300">{selectedProject.endTime ? formatDate(selectedProject.endTime) : '-'}</div>
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 dark:text-slate-400">Duração Real / Estimada</div>
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
                            <h4 className="text-xs font-bold text-yellow-700 dark:text-amber-400 uppercase tracking-wider mb-2">Observações</h4>
                            <p className="text-sm text-yellow-800 dark:text-amber-200 whitespace-pre-wrap">{selectedProject.notes}</p>
                        </div>
                    )}

                    {/* Variations Table Section */}
                    <div>
                        <h4 className="text-sm font-bold text-gray-800 dark:text-slate-100 mb-3 flex items-center">
                            <Layers className="w-4 h-4 mr-2 text-blue-600 dark:text-blue-400" />
                            Variações Registradas ({selectedProject.variations?.length || 0})
                        </h4>
                        <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 dark:bg-black text-gray-600 dark:text-slate-400 font-semibold border-b border-gray-200 dark:border-slate-700">
                                    <tr>
                                        <th className="p-3">Código Antigo</th>
                                        <th className="p-3">Descrição</th>
                                        <th className="p-3">Código Novo</th>
                                        <th className="p-3">Tipo</th>
                                        <th className="p-3 text-center">Arquivos</th>
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
                                                    {v.type}
                                                </span>
                                            </td>
                                            <td className="p-3 text-center">
                                            {v.filesGenerated ? (
                                                <span className="inline-flex items-center text-[10px] font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded border border-green-100 dark:border-green-800">
                                                    <FileCheck className="w-3 h-3 mr-1" /> OK
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center text-[10px] font-bold text-red-400 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded border border-red-100 dark:border-red-800">
                                                    <FileX className="w-3 h-3 mr-1" /> Pendente
                                                </span>
                                            )}
                                            </td>
                                        </tr>
                                    ))}
                                    {(!selectedProject.variations || selectedProject.variations.length === 0) && (
                                        <tr>
                                            <td colSpan={5} className="p-6 text-center text-gray-400 dark:text-slate-500 italic text-xs">
                                                Nenhuma variação registrada neste projeto.
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
                        Fechar
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
                        Editar Liberação
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
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">NS do Projeto</label>
                            <input 
                                type="text"
                                value={editForm.ns}
                                onChange={(e) => setEditForm({...editForm, ns: e.target.value})}
                                className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono font-bold dark:bg-black dark:text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Cód. Projeto</label>
                            <input 
                                type="text"
                                value={editForm.projectCode}
                                onChange={(e) => setEditForm({...editForm, projectCode: e.target.value})}
                                className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Cliente</label>
                        <input 
                            type="text"
                            value={editForm.clientName}
                            onChange={(e) => setEditForm({...editForm, clientName: e.target.value})}
                            className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Tipo de Projeto</label>
                            <select 
                                value={editForm.type}
                                onChange={(e) => setEditForm({...editForm, type: e.target.value as ProjectType})}
                                className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
                            >
                                {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Implemento</label>
                            <select 
                                value={editForm.implementType}
                                onChange={(e) => setEditForm({...editForm, implementType: e.target.value as ImplementType})}
                                className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
                            >
                                {IMPLEMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
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
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Tipo de Assoalho</label>
                            <select 
                                value={editForm.flooringType}
                                onChange={(e) => setEditForm({...editForm, flooringType: e.target.value})}
                                className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
                            >
                                <option value="">Selecione...</option>
                                {FLOORING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Projetista</label>
                        <select 
                            value={editForm.userId}
                            onChange={(e) => setEditForm({...editForm, userId: e.target.value})}
                            className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
                            disabled={isSaving}
                        >
                            <option value="">Selecione um projetista</option>
                            {Object.keys(usersMap).length === 0 ? (
                                <option disabled>Carregando usuários...</option>
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
                            Habilitar Hora Extra (Contabiliza domingos e fora do horário padrão)
                        </label>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Data Início</label>
                            <input 
                                type="date"
                                value={editForm.startDate}
                                onChange={(e) => setEditForm({...editForm, startDate: e.target.value})}
                                className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Hora Início</label>
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
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Data Fim</label>
                            <input 
                                type="date"
                                value={editForm.endDate}
                                onChange={(e) => setEditForm({...editForm, endDate: e.target.value})}
                                className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Hora Fim</label>
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
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Horas Estimadas</label>
                            <input 
                                type="number"
                                value={editForm.estHours}
                                onChange={(e) => setEditForm({...editForm, estHours: parseInt(e.target.value) || 0})}
                                className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
                                disabled={isSaving}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Minutos Estimados</label>
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
                            <p className="text-gray-500 dark:text-slate-400">O tempo total realizado será calculado automaticamente:</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="bg-white dark:bg-black p-2 rounded border border-blue-100 dark:border-blue-900/50">
                                <div className="text-[10px] text-gray-500 dark:text-slate-500">Bruto</div>
                                <div className="font-mono font-bold text-gray-800 dark:text-slate-200">{formatDuration(durationPreview.gross)}</div>
                            </div>
                            <div className="bg-white dark:bg-black p-2 rounded border border-blue-100 dark:border-blue-900/50">
                                <div className="text-[10px] text-gray-500 dark:text-slate-500">Pausas</div>
                                <div className="font-mono font-bold text-red-500 dark:text-red-400">-{formatDuration(durationPreview.pauses)}</div>
                            </div>
                            <div className="bg-white dark:bg-black p-2 rounded border border-blue-100 dark:border-blue-900/50 ring-1 ring-blue-200 dark:ring-blue-900/50">
                                <div className="text-[10px] text-gray-500 dark:text-slate-500">Líquido (Real)</div>
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
                            <p>Alterar o tempo de uma liberação concluída afetará diretamente os indicadores de produtividade e os gráficos de desempenho.</p>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-black flex gap-3">
                    <button 
                        onClick={() => setEditingProject(null)}
                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 font-medium transition-colors"
                        disabled={isSaving}
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleSaveEdit}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isSaving}
                    >
                        {isSaving ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                                Salvando...
                            </>
                        ) : (
                            'Salvar Alterações'
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
                        Resolver Duplicatas ({duplicateGroups.length})
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
                                    <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 text-xs font-bold px-2 py-1 rounded">MANTER</span>
                                    <span className="text-xs text-gray-400 dark:text-slate-500">ID: ...{group.keep.id.slice(-4)}</span>
                                </div>
                                <p className="font-bold text-gray-800 dark:text-slate-200">{group.keep.ns}</p>
                                <p className="text-sm text-gray-600 dark:text-slate-400">{group.keep.clientName || 'Sem cliente'}</p>
                                <div className="mt-2 text-xs text-gray-500 dark:text-slate-500 space-y-1">
                                    <p>Início: {new Date(group.keep.startTime).toLocaleString()}</p>
                                    <p>Tempo: {(group.keep.totalActiveSeconds / 3600).toFixed(2)}h</p>
                                    <p>Status: {group.keep.status}</p>
                                </div>
                            </div>

                            {/* Discard */}
                            <div className="bg-white dark:bg-black p-3 rounded border border-red-200 dark:border-red-900/50 shadow-sm opacity-75 hover:opacity-100 transition-opacity">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 text-xs font-bold px-2 py-1 rounded">APAGAR</span>
                                    <span className="text-xs text-gray-400 dark:text-slate-500">ID: ...{group.discard.id.slice(-4)}</span>
                                </div>
                                <p className="font-bold text-gray-800 dark:text-slate-200">{group.discard.ns}</p>
                                <p className="text-sm text-gray-600 dark:text-slate-400">{group.discard.clientName || 'Sem cliente'}</p>
                                <div className="mt-2 text-xs text-gray-500 dark:text-slate-500 space-y-1">
                                    <p>Início: {new Date(group.discard.startTime).toLocaleString()}</p>
                                    <p>Tempo: {(group.discard.totalActiveSeconds / 3600).toFixed(2)}h</p>
                                    <p>Status: {group.discard.status}</p>
                                </div>
                                <button 
                                    onClick={async () => {
                                        if(!window.confirm("Confirmar exclusão deste item?")) return;
                                        console.log("Deleting duplicate:", group.discard.id);
                                        const res = await deleteProjectById(group.discard.id, group.discard.ns);
                                        if (res.success) {
                                            console.log("Deletion successful for:", group.discard.id);
                                            // Pop-up requested by user
                                            window.alert("Projeto excluído com sucesso!");
                                            // Update UI instantly without reload
                                            setDuplicateGroups(prev => {
                                                const newGroups = prev.filter(g => g.discard.id !== group.discard.id);
                                                console.log("Remaining duplicates:", newGroups.length);
                                                return newGroups;
                                            });
                                        } else {
                                            console.error("Deletion failed:", res.message);
                                            addToast("Erro ao excluir: " + res.message, "error");
                                            window.alert("Erro ao excluir: " + res.message);
                                        }
                                    }}
                                    className="mt-3 w-full bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 py-1 rounded text-xs font-bold flex items-center justify-center"
                                >
                                    <Trash2 className="w-3 h-3 mr-1" />
                                    EXCLUIR ESTE
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
                            <p>Todas as duplicatas foram resolvidas!</p>
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
                        Fechar e Atualizar
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
