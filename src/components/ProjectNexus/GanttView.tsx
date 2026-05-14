import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  ChevronRight, 
  ChevronDown, 
  Calendar, 
  User as UserIcon, 
  Trash2, 
  Edit2, 
  Clock,
  Search,
  Milestone,
  MoreVertical,
  ChevronLeft,
  Columns,
  Filter,
  Download,
  Eye,
  Maximize2,
  Minimize2,
  ArrowDownWideNarrow,
  CheckCircle2,
  AlertCircle,
  X,
  PlusCircle,
  MoreHorizontal,
  Plus,
  Target,
  History,
  ChevronUp,
  Settings,
  Tag,
  Flag,
  FileText,
  HelpCircle,
  Layout,
  AlignLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  format, 
  addDays, 
  startOfWeek, 
  eachDayOfInterval, 
  isSameDay, 
  addMonths, 
  subMonths,
  differenceInDays,
  startOfMonth,
  isWeekend,
  addWeeks,
  subWeeks,
  parseISO,
  isValid
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AppState, GanttTask, User as AppUser, GanttTaskStatus, TaskPriority } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';
import { addGanttTask, updateGanttTask, deleteGanttTask, addAuditLog } from '../../services/storageService';
import { useToast } from '../Toast';
import { User } from '../../types';

const generateId = () => {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch (e) {}
  
  // Basic UUID v4 generator fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

interface GanttViewProps {
  state: AppState;
  onUpdateState: (newState: AppState) => void;
  onRefresh?: () => void;
  currentUser: User;
}

const COLORS = [
  '#3b82f6', // Azul
  '#10b981', // Esmeralda
  '#f59e0b', // Âmbar
  '#ef4444', // Vermelho
  '#6366f1', // Índigo
  '#06b6d4', // Ciano
  '#8b5cf6', // Violeta
  '#d946ef', // Fúcsia
  '#64748b', // Ardósia
  '#f97316'  // Laranja
];

export const GanttView: React.FC<GanttViewProps> = ({ state, onUpdateState, onRefresh, currentUser }) => {
  const { t, language } = useLanguage();
  const { addToast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<GanttTask | null>(null);
  const [zoomLevel, setZoomLevel] = useState(32); // px per day
  const [searchTerm, setSearchTerm] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, taskId: string } | null>(null);
  const [showColorOptions, setShowColorOptions] = useState(false);
  const [inlineAdding, setInlineAdding] = useState<{ parentId: string | null, type: 'task' | 'milestone' } | null>(null);
  const [inlineTitle, setInlineTitle] = useState('');
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [statusPickerOpenId, setStatusPickerOpenId] = useState<string | null>(null);

  const [interactingTask, setInteractingTask] = useState<{
    id: string;
    type: 'drag' | 'resize';
    startX: number;
    originalStartDate: string;
    originalEndDate: string;
  } | null>(null);

  // Panning state
  const [isPanning, setIsPanning] = useState(false);
  const [panStartX, setPanStartX] = useState(0);
  const [panScrollLeft, setPanScrollLeft] = useState(0);

  const [isSaving, setIsSaving] = useState(false);
  const hasAutoExpanded = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const scrollHeaderRef = useRef<HTMLDivElement>(null);
  const rowsAreaRef = useRef<HTMLDivElement>(null);

  // Auto-expand all tasks on first load
  useEffect(() => {
    if (state.ganttTasks.length > 0 && !hasAutoExpanded.current) {
      const allParentIds = new Set(
        state.ganttTasks
          .filter(t => state.ganttTasks.some(child => child.parentId === t.id))
          .map(t => t.id)
      );
      setExpandedTasks(allParentIds);
      hasAutoExpanded.current = true;
    }
  }, [state.ganttTasks]);

  // Auto-scroll to today on mount
  useEffect(() => {
    if (rowsAreaRef.current) {
      const scrollPos = todayLeft - 200; // Show a bit before today
      rowsAreaRef.current.scrollLeft = Math.max(0, scrollPos);
    }
  }, []); // Only once

  const [sidebarWidth, setSidebarWidth] = useState(window.innerWidth < 768 ? 180 : 450);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const isResizingRef = useRef(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile && sidebarWidth > 250) {
        setSidebarWidth(180);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [sidebarWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const minWidth = isMobile ? 120 : 200;
      const maxWidth = isMobile ? 300 : 800;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, e.clientX));
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = 'default';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Sync horizontal scroll with header
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (scrollHeaderRef.current) {
      scrollHeaderRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!interactingTask || !containerRef.current) return;
      const deltaX = e.clientX - interactingTask.startX;
      const daysMoved = Math.round(deltaX / zoomLevel);
      const task = state.ganttTasks.find(t => t.id === interactingTask.id);
      if (!task) return;

      if (interactingTask.type === 'drag') {
        const newStart = format(addDays(new Date(interactingTask.originalStartDate), daysMoved), 'yyyy-MM-dd');
        const newEnd = format(addDays(new Date(interactingTask.originalEndDate), daysMoved), 'yyyy-MM-dd');
        const updatedTasks = state.ganttTasks.map(t => 
          t.id === task.id ? { ...t, startDate: newStart, endDate: newEnd } : t
        );
        onUpdateState({ ...state, ganttTasks: updatedTasks });
      } else if (interactingTask.type === 'resize') {
        const newEnd = format(addDays(new Date(interactingTask.originalEndDate), daysMoved), 'yyyy-MM-dd');
        if (differenceInDays(new Date(newEnd), new Date(task.startDate)) >= 0) {
          const updatedTasks = state.ganttTasks.map(t => 
            t.id === task.id ? { ...t, endDate: newEnd } : t
          );
          onUpdateState({ ...state, ganttTasks: updatedTasks });
        }
      }
    };

    const handleMouseUp = async () => {
      if (!interactingTask) return;
      const task = state.ganttTasks.find(t => t.id === interactingTask.id);
      if (task) {
        try { 
          await updateGanttTask(task); 

          // Audit Log for movement
          addAuditLog({
            userId: currentUser.id,
            userName: currentUser.name,
            action: 'UPDATE',
            entityType: 'GANTT_TASK',
            entityId: task.id,
            entityName: task.title,
            details: `Tarefa "${task.title}" movida/redimensionada no Gantt por ${currentUser.name}`
          });
        } catch (error) { 
          console.error("Gantt drag/resize sync error:", error);
          alert("Erro ao sincronizar movimento: " + (error instanceof Error ? error.message : "Desconhecido"));
        }
      }
      setInteractingTask(null);
    };

    if (interactingTask) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [interactingTask, zoomLevel, state, onUpdateState]);

  // Panning Effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isPanning || !rowsAreaRef.current) return;
      const dx = e.clientX - panStartX;
      rowsAreaRef.current.scrollLeft = panScrollLeft - dx;
    };

    const handleMouseUp = () => {
      setIsPanning(false);
      if (containerRef.current) containerRef.current.classList.remove('cursor-grabbing');
    };

    if (isPanning) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPanning, panStartX, panScrollLeft]);

  const handlePanStart = (e: React.MouseEvent) => {
    // Only primary button, and not on task bars or buttons
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.task-bar') || target.closest('button') || target.closest('input')) return;

    setIsPanning(true);
    setPanStartX(e.clientX);
    setPanScrollLeft(rowsAreaRef.current?.scrollLeft || 0);
    if (containerRef.current) containerRef.current.classList.add('cursor-grabbing');
  };

  const safeParseDate = (dateStr: string | undefined): Date => {
    if (!dateStr) return new Date();
    const d = parseISO(dateStr);
    return isValid(d) ? d : new Date();
  };

  const timelineInterval = useMemo(() => {
    const start = startOfMonth(subMonths(currentDate, 1));
    const end = addMonths(start, 6);
    return { start, end };
  }, [currentDate]);

  const days = useMemo(() => {
    return eachDayOfInterval({ start: timelineInterval.start, end: timelineInterval.end });
  }, [timelineInterval]);

  const todayLeft = differenceInDays(new Date(), timelineInterval.start) * zoomLevel;

  const rootTasks = useMemo(() => {
    const buildTree = (parentId: string | null = null, depth = 0): (GanttTask & { children: any[] })[] => {
      if (depth > 20) return []; // Safety recursion break
      return state.ganttTasks
        .filter(t => {
          // A task is a root task if its parentId is null, empty, or points to a non-existent task
          if (parentId === null) {
            const isAtRoot = !t.parentId || t.parentId === "" || t.parentId === "null" || t.parentId === "undefined";
            if (isAtRoot) return true;
            // Also include orphaned tasks at root
            const parentExists = state.ganttTasks.some(p => p.id === t.parentId);
            return !parentExists;
          }
          return t.parentId === parentId || (String(t.parentId) === String(parentId));
        })
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(t => ({
          ...t,
          children: buildTree(t.id, depth + 1)
        }));
    };
    const tree = buildTree(null);
    console.log("BUILT GANTT TREE WITH", tree.length, "ROOT NODES", tree);
    return tree;
  }, [state.ganttTasks]);

  const flattenedTasks = useMemo(() => {
    const getVisible = (tasks: any[]): any[] => {
      let result: any[] = [];
      tasks.forEach(t => {
        result.push(t);
        if (expandedTasks.has(t.id) && t.children.length > 0) {
          result.push(...getVisible(t.children));
        }
      });
      return result;
    };
    return getVisible(rootTasks);
  }, [rootTasks, expandedTasks]);

  const handleExportCSV = () => {
    const headers = ['ID', 'Titulo', 'Inicio', 'Fim', 'Estado', 'Prioridade', 'Progresso', 'Responsaveis'];
    const rows = state.ganttTasks.map(t => {
      const assignees = t.assignedTo.map(uid => {
        const u = state.users.find(usr => usr.id === uid);
        return u ? u.name : uid;
      }).join('; ');
      
      return [
        t.id,
        `"${t.title.replace(/"/g, '""')}"`,
        t.startDate,
        t.endDate,
        t.status,
        t.priority,
        t.progress + '%',
        `"${assignees.replace(/"/g, '""')}"`
      ];
    });
    
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers, ...rows].map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `gantt_nexus_${format(new Date(), 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast("Gantt exportado com sucesso", "success");
  };

  const handleRefreshData = async () => {
    try {
      await onRefresh();
      addToast("Dados atualizados", "success");
    } catch(e) {
      addToast("Erro ao atualizar", "error");
    }
  };

  const taskVerticalIndexMap = useMemo(() => {
    const map: Record<string, number> = {};
    flattenedTasks.forEach((t, i) => {
      map[t.id] = i;
    });
    return map;
  }, [flattenedTasks]);

  const renderTaskBar = (task: GanttTask) => {
    const start = safeParseDate(task.startDate);
    const end = safeParseDate(task.endDate);
    const dayOffset = differenceInDays(start, timelineInterval.start);
    const duration = differenceInDays(end, start) + 1;
    const left = dayOffset * zoomLevel;
    const width = Math.max(duration * zoomLevel, 30);
    const hasChildren = state.ganttTasks.some(t => t.parentId === task.id);
    const isLevelZero = task.parentId === null;
    const isDone = task.status === GanttTaskStatus.DONE;
    // Sanitize color: if it's not a hex, use a default or map from old classes
    const getSafeColor = (color: string | undefined) => {
      if (!color) return '#3b82f6';
      if (color.startsWith('#')) return color;
      
      // Fallback for old Tailwind classes
      if (color.includes('blue')) return '#3b82f6';
      if (color.includes('emerald') || color.includes('green')) return '#10b981';
      if (color.includes('amber') || color.includes('yellow')) return '#f59e0b';
      if (color.includes('rose') || color.includes('red')) return '#ef4444';
      if (color.includes('indigo')) return '#6366f1';
      if (color.includes('cyan')) return '#06b6d4';
      if (color.includes('violet') || color.includes('purple')) return '#8b5cf6';
      if (color.includes('fuchsia') || color.includes('pink')) return '#d946ef';
      if (color.includes('slate') || color.includes('gray')) return '#64748b';
      if (color.includes('orange')) return '#f97316';
      
      return '#3b82f6';
    };
    
    const taskColor = getSafeColor(task.color);

    if (task.isMilestone) {
      return (
        <div 
          className="absolute h-full flex items-center justify-center group z-10"
          style={{ left: `${left}px`, width: `${zoomLevel}px` }}
        >
          <div 
            className="w-4 h-4 rotate-45 transform border-2 border-white dark:border-slate-900 shadow-lg transition-transform group-hover:scale-125" 
            style={{ backgroundColor: taskColor }}
          />
          <div className="absolute top-0 left-full ml-3 opacity-0 group-hover:opacity-100 bg-slate-900 text-white text-[10px] px-2 py-1 rounded shadow-xl whitespace-nowrap z-50 pointer-events-none font-black transition-all">
             {task.title || 'Marco'}
          </div>
        </div>
      );
    }

    if (hasChildren || isLevelZero) {
      const parentColor = task.color && task.color.startsWith('#') ? task.color : (isLevelZero ? '#0f172a' : '#475569');
      return (
        <div 
          className="absolute h-6 top-1.5 flex flex-col pointer-events-none z-10"
          style={{ left: `${left}px`, width: `${width}px` }}
        >
          <div className="h-1.5 w-full rounded-t-sm shadow-sm opacity-90" style={{ backgroundColor: parentColor }} />
          <div className="flex justify-between w-full h-full px-0">
            <div className="w-0.5 h-full opacity-40" style={{ backgroundColor: parentColor }} />
            <div className="w-0.5 h-full opacity-40" style={{ backgroundColor: parentColor }} />
          </div>
        </div>
      );
    }

    return (
      <motion.div 
        initial={{ opacity: 0, scaleX: 0.8 }}
        animate={{ opacity: 1, scaleX: 1 }}
        onMouseDown={(e) => { e.stopPropagation(); setInteractingTask({ id: task.id, type: 'drag', startX: e.clientX, originalStartDate: task.startDate, originalEndDate: task.endDate }); }}
        className="task-bar absolute h-7 top-1.5 rounded-md shadow-md border flex items-center px-3 cursor-grab active:cursor-grabbing hover:brightness-110 transition-all group/bar z-10 overflow-hidden border-black/10"
        style={{ 
          left: `${left}px`, 
          width: `${width}px`,
          backgroundColor: isDone ? '#f1f5f9' : taskColor,
        }}
      >
        {/* Progress Overlay */}
        <div 
          className="absolute inset-y-0 left-0 transition-all duration-700 bg-black/15 pointer-events-none" 
          style={{ width: `${task.progress}%` }} 
        />
        
        <div className="relative z-10 flex items-center justify-between w-full min-w-0 gap-2">
          <span className={`text-[9px] font-black truncate drop-shadow-md ${isDone ? 'text-slate-500' : 'text-white'}`}>
            {task.title}
          </span>
          <span className={`text-[10px] font-black drop-shadow-md shrink-0 ${isDone ? 'text-slate-400' : 'text-white'}`}>
            {task.progress}%
          </span>
        </div>
        
        <div 
          onMouseDown={(e) => { e.stopPropagation(); setInteractingTask({ id: task.id, type: 'resize', startX: e.clientX, originalStartDate: task.startDate, originalEndDate: task.endDate }); }}
          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize group-hover/bar:bg-white/10 transition-colors" 
        />

        {/* Floating Tooltip */}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 border border-slate-700 text-white rounded-xl opacity-0 group-hover/bar:opacity-100 transition-all scale-75 group-hover/bar:scale-100 pointer-events-none whitespace-nowrap z-50 shadow-2xl">
           <div className="flex items-center gap-2 mb-1">
             <div className="w-2 h-2 rounded-full" style={{ backgroundColor: taskColor }} />
             <div className="font-black uppercase tracking-widest text-[8px] opacity-50">{task.status}</div>
           </div>
           <div className="font-black text-xs">{task.title || 'Sem título'}</div>
           {task.reports && (
             <div className="text-[8px] italic text-blue-300 mt-1 max-w-[150px] truncate">
               "{task.reports}"
             </div>
           )}
           <div className="text-[9px] font-bold opacity-60 mt-1 flex items-center gap-1">
             <Clock size={10} />
             {format(start, 'dd/MM')} — {format(end, 'dd/MM')}
           </div>
        </div>
      </motion.div>
    );
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expandedTasks);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedTasks(next);
  };

  const handleAddTask = (parentId: string | null = null) => {
    const newTask: Partial<GanttTask> = {
      id: generateId(),
      title: '',
      parentId: parentId,
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
      color: COLORS[state.ganttTasks.length % COLORS.length],
      isMilestone: false,
      assignedTo: [],
      progress: 0,
      status: GanttTaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      order: state.ganttTasks.length,
      dependencies: []
    };
    if (parentId) {
      setExpandedTasks(prev => new Set(prev).add(parentId));
    }
    setEditingTask(newTask as GanttTask);
    setIsModalOpen(true);
  };

  const handleEditTask = (task: GanttTask) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleSaveTask = async (task: GanttTask) => {
    try {
      const isNew = !state.ganttTasks.find(t => t.id === task.id);
      setIsModalOpen(false); // Close early for better UX
      const newState = isNew ? await addGanttTask(task) : await updateGanttTask(task);
      onUpdateState(newState);
      setEditingTask(null);
      addToast(isNew ? "Tarefa adicionada com sucesso!" : "Tarefa atualizada!", "success");

      // Audit Log
      addAuditLog({
          userId: currentUser.id,
          userName: currentUser.name,
          action: isNew ? 'CREATE' : 'UPDATE',
          entityType: 'GANTT_TASK',
          entityId: task.id,
          entityName: task.title,
          details: `Tarefa de Gantt "${task.title}" ${isNew ? 'criada' : 'atualizada'} via modal por ${currentUser.name}`
      });
    } catch (error: any) { 
      console.error(error); 
      addToast("Erro ao salvar tarefa. Verifique se o bando de dados está atualizado (veja Gestão de Equipe).", "error");
      setIsModalOpen(true); // Reopen on error
    }
  };

  const getStatusColor = (status: GanttTaskStatus) => {
    switch (status) {
      case GanttTaskStatus.TODO: return 'bg-slate-100 text-slate-600';
      case GanttTaskStatus.IN_PROGRESS: return 'bg-amber-100 text-amber-600';
      case GanttTaskStatus.DONE: return 'bg-cyan-100 text-cyan-600';
      case GanttTaskStatus.CLOSED: return 'bg-emerald-100 text-emerald-600';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  const getStatusLabel = (status: GanttTaskStatus) => {
    switch (status) {
      case GanttTaskStatus.TODO: return 'Aberto';
      case GanttTaskStatus.IN_PROGRESS: return 'Em projeto';
      case GanttTaskStatus.DONE: return 'Feito';
      case GanttTaskStatus.CLOSED: return 'Fechado';
      default: return status;
    }
  };

  const [showFiltroSidebar, setShowFiltroSidebar] = useState(false);
  const [showCamposSidebar, setShowCamposSidebar] = useState(false);

  const handleUpdateField = async (taskId: string, field: string, value: any) => {
    const task = state.ganttTasks.find(t => t.id === taskId);
    if (!task) return;
    
    // Optimistic update
    const updatedTask = { ...task, [field]: value, updatedAt: new Date().toISOString() };
    const optimisticTasks = state.ganttTasks.map(t => t.id === taskId ? updatedTask : t);
    onUpdateState({ ...state, ganttTasks: optimisticTasks });

    try {
      const newState = await updateGanttTask(updatedTask);
      onUpdateState(newState);

      // Audit Log for field update
      addAuditLog({
          userId: currentUser.id,
          userName: currentUser.name,
          action: 'UPDATE',
          entityType: 'GANTT_TASK',
          entityId: taskId,
          entityName: task.title,
          details: `Campo "${field}" da tarefa de Gantt "${task.title}" atualizado para "${value}" por ${currentUser.name}`
      });
    } catch (error) { 
      console.error("Gantt update field error:", error);
      alert("Erro ao sincronizar alteração. " + (error instanceof Error ? error.message : "Verifique sua conexão."));
      // Don't reload, let the optimistic state stay or suggest refresh
    }
  };

  const handleSaveTitle = async (taskId: string) => {
    const trimmedValue = editingTitleValue.trim();
    if (!trimmedValue) {
      setEditingTitleId(null);
      return;
    }
    const task = state.ganttTasks.find(t => t.id === taskId);
    if (task && task.title === trimmedValue) {
      setEditingTitleId(null);
      return;
    }
    await handleUpdateField(taskId, 'title', trimmedValue);
    setEditingTitleId(null);
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm("Tem certeza que deseja excluir esta tarefa?")) return;
    try {
      const taskToDelete = state.ganttTasks.find(t => t.id === taskId);
      const newState = await deleteGanttTask(taskId);
      onUpdateState(newState);

      // Audit Log
      if (taskToDelete) {
          addAuditLog({
              userId: currentUser.id,
              userName: currentUser.name,
              action: 'DELETE',
              entityType: 'GANTT_TASK',
              entityId: taskId,
              entityName: taskToDelete.title,
              details: `Tarefa de Gantt "${taskToDelete.title}" excluída por ${currentUser.name}`
          });
      }
    } catch (error) {
      console.error(error);
      alert("Erro ao excluir tarefa.");
    }
  };

  const handleSaveInline = async () => {
    const titleToSave = inlineTitle.trim();
    if (!titleToSave || !inlineAdding || isSaving) return;
    
    setIsSaving(true);
    const currentAdding = inlineAdding;

    const newTask: GanttTask = {
      id: generateId(),
      title: titleToSave,
      parentId: currentAdding.parentId || null,
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
      color: currentAdding.type === 'milestone' ? '#f59e0b' : COLORS[state.ganttTasks.length % COLORS.length],
      isMilestone: currentAdding.type === 'milestone',
      assignedTo: [],
      progress: 0,
      status: GanttTaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      order: state.ganttTasks.length,
      dependencies: []
    };
    // Optimistic Update
    onUpdateState({ ...state, ganttTasks: [...state.ganttTasks, newTask] });
    setInlineAdding(null);
    setInlineTitle('');

    try {
      const newState = await addGanttTask(newTask);
      onUpdateState(newState);

      // Audit Log for inline creation
      addAuditLog({
          userId: currentUser.id,
          userName: currentUser.name,
          action: 'CREATE',
          entityType: 'GANTT_TASK',
          entityId: newTask.id,
          entityName: newTask.title,
          details: `Tarefa de Gantt "${newTask.title}" criada (Inline) por ${currentUser.name}`
      });
    } catch (error) { 
      console.error("Save error:", error);
      alert("Erro ao salvar tarefa: " + (error instanceof Error ? error.message : "Erro desconhecido"));
      // Revert optimistic update
      onUpdateState(state);
    } finally {
      setIsSaving(false);
    }
  };

  const renderTaskRows = (tasks: any[], depth: number = 0, prefix: string = '') => {
    return (
      <>
        {tasks.map((task, idx) => {
          const isExpanded = expandedTasks.has(task.id);
          const hasChildren = task.children.length > 0;
          const rowNumber = prefix ? `${prefix}.${idx + 1}` : `${idx + 1}`;
          const isTopLevel = depth === 0;

          return (
            <React.Fragment key={task.id}>
              {/* Task Row */}
              <div className={`flex h-10 border-b border-slate-100 dark:border-slate-800 items-stretch hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group ${isTopLevel ? 'bg-white dark:bg-slate-900' : ''}`}>
                {/* Left Side: Task Info */}
                <div 
                  className={`flex-shrink-0 border-r border-slate-200 dark:border-slate-800 flex items-center pr-2 sticky left-0 bg-inherit group-hover:bg-slate-50 dark:group-hover:bg-slate-800 shadow-[4px_0_4px_-4px_rgba(0,0,0,0.1)] transition-all duration-300 ${isSidebarVisible ? 'overflow-visible' : 'overflow-hidden opacity-0'} ${statusPickerOpenId === task.id ? 'z-50' : 'z-10'} ${!isSidebarVisible ? 'w-0 border-r-0' : ''}`}
                  style={{ paddingLeft: `${depth * (isMobile ? 12 : 20) + 8}px`, width: isSidebarVisible ? `${sidebarWidth}px` : '0px' }}
                >
                  <div className="flex items-center gap-2 w-full overflow-visible">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 w-8 font-mono">{rowNumber}</span>
                    <button 
                      onClick={() => toggleExpand(task.id)}
                      className={`p-1 rounded text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors ${!hasChildren ? 'invisible' : ''}`}
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    
                    <div className="flex items-center gap-2 flex-grow min-w-0 overflow-visible">
                      {task.isMilestone ? <Milestone size={14} className="text-amber-500 flex-shrink-0" /> : null}
                    {editingTitleId === task.id ? (
                      <div className="flex items-center gap-1 flex-grow overflow-visible">
                        <input 
                          autoFocus
                          value={editingTitleValue}
                          onChange={e => setEditingTitleValue(e.target.value)}
                          onBlur={(e) => {
                            if (e.relatedTarget && (e.relatedTarget as HTMLElement).closest('.save-btn')) return;
                            handleSaveTitle(task.id);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleSaveTitle(task.id);
                            if (e.key === 'Escape') setEditingTitleId(null);
                          }}
                          className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 font-medium bg-blue-50 dark:bg-slate-800 border-b border-blue-400 dark:border-blue-600 outline-none w-full px-1"
                        />
                        <button onClick={() => handleSaveTitle(task.id)} className="save-btn p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-700 rounded transition-colors"><CheckCircle2 size={12} /></button>
                      </div>
                    ) : (
                      <div 
                        className="flex items-center gap-2 flex-grow min-w-0 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 rounded px-1 transition-colors group/title"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTitleId(task.id);
                          setEditingTitleValue(task.title);
                        }}
                      >
                        <span className={`${isMobile ? 'text-[11px]' : 'text-sm'} truncate ${isTopLevel ? 'font-black text-slate-900 dark:text-white' : 'font-bold text-slate-700 dark:text-slate-300'}`}>
                          {task.title || 'Tarefa sem nome'}
                        </span>
                        <div className={`flex items-center gap-1 transition-opacity ${isMobile ? 'opacity-40' : 'opacity-0 group-hover/title:opacity-100'}`}>
                          <button 
                            className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded"
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              if (!expandedTasks.has(task.id)) toggleExpand(task.id);
                              setInlineAdding({ parentId: task.id, type: 'task' }); 
                            }}
                          >
                            <PlusCircle size={14} className="text-blue-600 dark:text-blue-400" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                    
                    {!isMobile && (
                      <>
                        <AssigneePicker assignedTo={task.assignedTo || []} users={state.users} onUpdate={(uids) => handleUpdateField(task.id, 'assignedTo', uids)} />
                        <StatusPicker 
                          status={task.status} 
                          onUpdate={(s) => handleUpdateField(task.id, 'status', s)} 
                          onOpenChange={(open) => setStatusPickerOpenId(open ? task.id : null)}
                        />
                      </>
                    )}
                    
                    <button onClick={(e) => { e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, taskId: task.id }); }} className="p-1 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-all">
                      <MoreVertical size={14} />
                    </button>
                  </div>
                </div>

                {/* Right Side: Timeline Row */}
                <div 
                  className="relative flex-shrink-0 bg-white/50 dark:bg-slate-900/50 group-hover:bg-slate-100/30 dark:group-hover:bg-slate-800/20 transition-colors"
                  style={{ width: `${days.length * zoomLevel}px` }}
                >
                  {renderTaskBar(task)}
                </div>
              </div>

              {/* Children and Inline adding within group */}
              {isExpanded && (
                <>
                  {hasChildren && renderTaskRows(task.children, depth + 1, rowNumber)}
                  
                  {/* Inline adding for this group */}
                  {inlineAdding && inlineAdding.parentId === task.id ? (
                    <div className="flex h-10 border-b border-slate-100 dark:border-slate-800 items-stretch bg-blue-50/20 dark:bg-blue-900/10">
                        <div 
                          className={`flex-shrink-0 border-r border-slate-200 dark:border-slate-800 flex items-center pr-2 sticky left-0 z-10 bg-inherit transition-all duration-300 overflow-hidden ${!isSidebarVisible ? 'w-0 opacity-0 border-none' : 'opacity-100'}`} 
                          style={{ paddingLeft: `${(depth + 1) * 20 + 8}px`, width: isSidebarVisible ? `${sidebarWidth}px` : '0px' }}
                        >
                         <div className="flex items-center gap-2 w-full">
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 w-8 font-mono">{rowNumber}.{task.children.length + 1}</span>
                            <div className="flex items-center gap-2 flex-grow border border-blue-300 dark:border-blue-700 rounded bg-white dark:bg-slate-900 px-2 py-0.5 shadow-sm">
                               <input 
                                autoFocus value={inlineTitle} onChange={e => setInlineTitle(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSaveInline()}
                                disabled={isSaving}
                                className={`text-xs text-slate-600 dark:text-slate-300 w-full outline-none bg-transparent ${isSaving ? 'opacity-50' : ''}`}
                                placeholder="..."
                               />
                               <button disabled={isSaving} onClick={handleSaveInline} className={`text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors ${isSaving ? 'animate-pulse' : ''}`}><CheckCircle2 size={12} /></button>
                               <button disabled={isSaving} onClick={() => setInlineAdding(null)} className="text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 transition-colors"><X size={12} /></button>
                            </div>
                         </div>
                       </div>
                       <div className="flex-grow bg-white dark:bg-slate-900 transition-colors" />
                    </div>
                  ) : (
                    /* The buttons below the group, exactly like in the video */
                    <div className="flex h-10 border-b border-slate-100 dark:border-slate-800 items-stretch group/inline">
                        <div 
                          className={`flex-shrink-0 border-r border-slate-200 dark:border-slate-800 flex items-center pr-2 sticky left-0 z-10 bg-white dark:bg-slate-900 transition-all duration-300 overflow-hidden ${!isSidebarVisible ? 'w-0 opacity-0 border-none' : 'opacity-100'}`} 
                          style={{ paddingLeft: `${(depth + 1) * (isMobile ? 12 : 20) + (isMobile ? 16 : 28)}px`, width: isSidebarVisible ? `${sidebarWidth}px` : '0px' }}
                        >
                         <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-[11px] font-bold text-[#0070e0] dark:text-blue-400 opacity-60 hover:opacity-100 transition-opacity">
                            <button onClick={() => setInlineAdding({ parentId: task.id, type: 'task' })} className="flex items-center gap-1.5 hover:underline whitespace-nowrap">
                              <Plus size={14} /> {isMobile ? "Tarefa" : "Adicionar uma tarefa"}
                            </button>
                            <div className="w-px h-3 bg-slate-200 dark:bg-slate-700" />
                            <button onClick={() => setInlineAdding({ parentId: task.id, type: 'milestone' })} className="hover:underline whitespace-nowrap">
                               {isMobile ? "Marco" : "Adicionar um marco"}
                            </button>
                         </div>
                       </div>
                       <div className="flex-shrink-0 bg-white/30 dark:bg-slate-900/30 transition-colors" style={{ width: `${days.length * zoomLevel}px` }} />
                    </div>
                  )}
                </>
              )}
            </React.Fragment>
          );
        })}
      </>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-black select-none transition-colors duration-300">
      {/* Toolbar as seen in Image 1 */}
      <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-black flex items-center justify-between shadow-sm z-30 transition-colors overflow-hidden">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar max-w-[60%] sm:max-w-none">
          <div className="flex items-center gap-1 group">
             <button 
              onClick={() => {
                if (rowsAreaRef.current) {
                  const today = new Date();
                  setCurrentDate(today);
                  setTimeout(() => {
                    if (rowsAreaRef.current) {
                      const newTodayLeft = differenceInDays(today, startOfMonth(subMonths(today, 1))) * zoomLevel;
                      rowsAreaRef.current.scrollTo({ left: newTodayLeft - 200, behavior: 'smooth' });
                    }
                  }, 100);
                }
              }}
              className="p-1.5 rounded text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/40 transition-colors flex items-center gap-1"
             >
                <Target size={18} />
                <span className="text-[10px] font-bold uppercase hidden md:inline">Hoje</span>
             </button>

             <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 ml-1">
               <button 
                onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded text-slate-500 transition-all"
               >
                 <ChevronLeft size={14} />
               </button>
               <span className="text-[9px] font-bold text-slate-600 dark:text-slate-400 px-2 min-w-24 text-center whitespace-nowrap">
                 {format(currentDate, 'MMMM yyyy', { locale: language === 'pt-BR' ? ptBR : undefined }).toUpperCase()}
               </span>
               <button 
                onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded text-slate-500 transition-all"
               >
                 <ChevronRight size={14} />
               </button>
             </div>
          </div>
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1 flex-shrink-0" />
          <ToolbarButton 
            icon={<History size={16} />} 
            onClick={handleRefreshData} 
            title="Atualizar dados"
            className="flex"
          />
          <ToolbarButton 
            icon={isSidebarVisible ? <Minimize2 size={16} /> : <Maximize2 size={16} />} 
            onClick={() => setIsSidebarVisible(!isSidebarVisible)}
            title={isSidebarVisible ? "Recolher lateral" : "Expandir lateral"}
          />
          <ToolbarButton 
            icon={<Columns size={16} />} 
            onClick={() => setSidebarWidth(isSidebarVisible && sidebarWidth > 200 ? 200 : 450)}
            title="Ajustar largura"
            className="hidden sm:flex" 
          />
          <ToolbarButton icon={<ArrowDownWideNarrow size={16} />} className="hidden sm:flex" />
          
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1 flex-shrink-0" />
          
          <button 
            onClick={() => {
              const allIds = new Set(state.ganttTasks.filter(t => state.ganttTasks.some(child => child.parentId === t.id)).map(t => t.id));
              setExpandedTasks(allIds);
            }}
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded transition-colors whitespace-nowrap"
          >
            <ChevronDown size={14} className="text-slate-400" />
            <span className="hidden sm:inline">Expandir tudo</span>
            <span className="sm:hidden">Expandir</span>
          </button>
          <button 
            onClick={() => setExpandedTasks(new Set())}
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded transition-colors whitespace-nowrap"
          >
            <ChevronDown size={14} className="text-slate-400" />
            <span className="hidden sm:inline">Recolher tudo</span>
            <span className="sm:hidden">Recolher</span>
          </button>
          <button 
            onClick={() => {
              const sorted = [...state.ganttTasks].sort((a, b) => {
                if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
                return a.endDate.localeCompare(b.endDate);
              });
              onUpdateState({ ...state, ganttTasks: sorted.map((t, i) => ({ ...t, order: i })) });
            }}
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded transition-colors whitespace-nowrap"
          >
            <Minimize2 size={14} className="text-slate-400 scale-x-[-1]" />
            <span className="hidden sm:inline">Ordenar em cascata</span>
            <span className="sm:hidden">Cascata</span>
          </button>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <SidebarButton 
            icon={<Columns size={16} />} 
            label={isMobile ? "" : "Campos"} 
            onClick={() => setShowCamposSidebar(true)} 
            active={showCamposSidebar}
          />
          <SidebarButton 
            icon={<Filter size={16} />} 
            label={isMobile ? "" : "Filtro"} 
            onClick={() => setShowFiltroSidebar(true)}
            active={showFiltroSidebar}
          />

          {!isMobile && (
            <div className="flex items-center gap-2 ml-2">
              <div className="w-24 h-5 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center px-1 relative">
                <button 
                  onClick={() => setZoomLevel(16)}
                  className={`absolute left-[20%] w-2 h-2 rounded-full transition-all ${zoomLevel === 16 ? 'bg-blue-500 scale-125 z-10 shadow-sm' : 'bg-slate-400 dark:bg-slate-600 hover:bg-slate-500'}`} 
                  title="Meses"
                />
                <button 
                  onClick={() => setZoomLevel(32)}
                  className={`absolute left-[45%] w-2 h-2 rounded-full transition-all ${zoomLevel === 32 ? 'bg-blue-500 scale-125 z-10 shadow-sm' : 'bg-slate-400 dark:bg-slate-600 hover:bg-slate-500'}`}
                  title="Dias"
                />
                <button 
                  onClick={() => setZoomLevel(48)}
                  className={`absolute left-[70%] w-2 h-2 rounded-full transition-all ${zoomLevel === 48 ? 'bg-blue-500 scale-125 z-10 shadow-sm' : 'bg-slate-400 dark:bg-slate-600 hover:bg-slate-500'}`}
                  title="Semanas"
                />
                <button 
                  onClick={() => setZoomLevel(64)}
                  className={`absolute left-[90%] w-2 h-2 rounded-full transition-all ${zoomLevel === 64 ? 'bg-blue-500 scale-125 z-10 shadow-sm' : 'bg-slate-400 dark:bg-slate-600 hover:bg-slate-500'}`}
                  title="Detalhado"
                />
              </div>
              <span className="text-[10px] font-bold text-slate-400">
                {zoomLevel === 16 ? 'Meses' : zoomLevel === 32 ? 'Dias' : zoomLevel === 48 ? 'Semanas' : 'Foco'}
              </span>
            </div>
          )}

          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1" />

          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded transition-colors"
          >
            <Download size={14} />
            Exportar
          </button>
          
          <button className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 transition-colors">
            Visualização
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* Main Gantt Body */}
      <div className="flex-grow flex flex-col overflow-hidden relative" ref={containerRef}>
        {/* Timeline Header (Sync horizontal scroll with rows) */}
        <div className="flex-shrink-0 flex items-stretch border-b border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/50 z-30 overflow-hidden sticky top-0 transition-colors">
          <div 
            className={`flex-shrink-0 border-r border-slate-300 dark:border-slate-800 flex items-center px-4 bg-white dark:bg-slate-900 relative transition-all duration-300 overflow-hidden ${!isSidebarVisible ? 'w-0 opacity-0 border-none' : 'opacity-100'}`}
            style={{ width: isSidebarVisible ? `${sidebarWidth}px` : '0px' }}
          >
            <div className="flex items-center gap-2 sm:gap-8 w-full">
              <span className="text-[10px] sm:text-xs font-bold text-slate-400 dark:text-slate-500 w-4">#</span>
              <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 flex-grow text-[8px] sm:text-[9px] uppercase tracking-wider truncate">Nome de tarefa</span>
              {!isMobile && (
                <>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 w-16 text-[9px] uppercase tracking-wider">Atribuído</span>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 w-24 text-center text-[9px] uppercase tracking-wider">Estado</span>
                </>
              )}
              <Plus size={16} className="text-slate-300 dark:text-slate-600 cursor-pointer hover:text-blue-500 transition-colors flex-shrink-0" onClick={() => handleAddTask(null)} />
            </div>
            
            {/* Draggable Separator */}
            <div 
              onMouseDown={(e) => { isResizingRef.current = true; document.body.style.cursor = 'ew-resize'; e.preventDefault(); }}
              className="absolute right-0 top-0 bottom-0 w-1 hover:bg-blue-400 cursor-ew-resize transition-colors z-50"
            />
          </div>
          
            <div className="flex-grow overflow-hidden relative" ref={scrollHeaderRef}>
            <div className="flex border-b border-slate-200 dark:border-slate-800 h-6 bg-white dark:bg-slate-900 min-w-max transition-colors">
                {/* Dynamically calculate month breaks */}
                {(() => {
                  const months: any[] = [];
                  let currentMonth: string | null = null;
                  let currentMonthDays = 0;

                  days.forEach((day, i) => {
                    const m = format(day, 'MMMM yyyy', { locale: language === 'pt-BR' ? ptBR : undefined });
                    if (m !== currentMonth) {
                      if (currentMonth) {
                        months.push({ label: currentMonth.toUpperCase(), days: currentMonthDays });
                      }
                      currentMonth = m;
                      currentMonthDays = 1;
                    } else {
                      currentMonthDays++;
                    }
                  });
                  if (currentMonth) months.push({ label: currentMonth.toUpperCase(), days: currentMonthDays });

                  return months.map((m, i) => (
                    <div 
                      key={i} 
                      className={`h-full border-r border-slate-300 dark:border-slate-700 flex items-center px-4 text-[10px] font-black tracking-widest transition-colors ${i % 2 === 0 ? 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800' : 'text-blue-600 dark:text-blue-400 bg-blue-100/30 dark:bg-blue-900/40'}`}
                      style={{ width: `${m.days * zoomLevel}px` }}
                    >
                      {m.label}
                    </div>
                  ));
                })()}
            </div>
            <div className="flex h-8 bg-white dark:bg-slate-900 min-w-max transition-colors">
              {days.map((day, i) => (
                <div 
                  key={i} 
                  className={`flex-shrink-0 border-r border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center transition-colors ${isSameDay(day, new Date()) ? 'bg-rose-100 dark:bg-rose-900/50 border-rose-300 dark:border-rose-600 z-10 scale-y-105 shadow-sm' : isWeekend(day) ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
                  style={{ width: `${zoomLevel}px` }}
                >
                  <span className={`text-[8px] font-black ${isSameDay(day, new Date()) ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'}`}>
                    {format(day, 'd')}
                  </span>
                  <span className={`text-[9px] font-black uppercase ${isSameDay(day, new Date()) ? 'text-rose-700 dark:text-rose-300' : 'text-slate-400 dark:text-slate-600'}`}>
                    {format(day, 'EEE', { locale: language === 'pt-BR' ? ptBR : undefined }).substring(0, 1)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Rows (Scrolling area) */}
        <div 
          className={`flex-grow overflow-auto custom-scrollbar ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`} 
          onScroll={handleScroll} 
          onMouseDown={handlePanStart}
          ref={rowsAreaRef}
        >
          {/* Floating Navigation Controls */}
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 z-[60] pointer-events-none">
            <button 
              onClick={() => rowsAreaRef.current?.scrollBy({ left: -400, behavior: 'smooth' })}
              className="p-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur shadow-2xl rounded-full border border-slate-200 dark:border-slate-800 text-blue-600 dark:text-blue-400 hover:scale-110 active:scale-95 transition-all pointer-events-auto"
              title="Rolar para esquerda"
            >
              <ChevronLeft size={24} />
            </button>
            <button 
              onClick={() => rowsAreaRef.current?.scrollBy({ left: 400, behavior: 'smooth' })}
              className="p-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur shadow-2xl rounded-full border border-slate-200 dark:border-slate-800 text-blue-600 dark:text-blue-400 hover:scale-110 active:scale-95 transition-all pointer-events-auto"
              title="Rolar para direita"
            >
              <ChevronRight size={24} />
            </button>
          </div>
          <div className="relative min-w-max">
            {/* Grid Background Lines for Tasks */}
            <div className="absolute inset-0 flex pointer-events-none z-0">
              {/* Sidebar Spacer */}
              {isSidebarVisible && (
                <div style={{ width: `${sidebarWidth}px` }} className="flex-shrink-0 border-r-2 border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40" />
              )}
              {days.map((day, i) => (
                <div 
                  key={i} 
                  className={`flex-shrink-0 border-r transition-colors ${
                    isSameDay(day, new Date()) 
                      ? 'bg-rose-50/40 dark:bg-rose-900/20 border-rose-200/50 dark:border-rose-700/30' 
                      : isWeekend(day) 
                        ? 'bg-slate-100/40 dark:bg-slate-800/20 border-slate-200/30 dark:border-slate-700/20' 
                        : i % 2 === 0 
                          ? 'bg-slate-50/30 dark:bg-slate-900/50 border-slate-100/50 dark:border-slate-800/10' 
                          : 'border-slate-100/30 dark:border-slate-800/5'
                  } ${day.getDate() === 1 ? 'border-slate-300 dark:border-slate-600 border-r-2' : ''}`}
                  style={{ width: `${zoomLevel}px` }}
                />
              ))}
            </div>
            {/* Today Line (Indicator of current day) */}
            <div 
              className="absolute top-0 bottom-0 pointer-events-none z-[15]"
              style={{ left: isSidebarVisible ? `${sidebarWidth}px` : '0px', width: `${days.length * zoomLevel}px` }}
            >
              <div 
                className="absolute top-0 bottom-0 w-0.5 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.3)]"
                style={{ left: `${todayLeft}px` }}
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-rose-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-lg flex items-center gap-1 border border-white/20 whitespace-nowrap">
                  <Target size={8} className="animate-pulse" />
                  HOJE
                </div>
              </div>
            </div>

            {/* Empty State */}
            {state.ganttTasks.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-20 text-slate-400 bg-white/50 dark:bg-slate-900/50 z-20">
                <Target size={48} className="mb-4 opacity-20" />
                <p className="text-sm font-medium">Nenhuma tarefa encontrada no Gantt</p>
                <p className="text-xs mt-1">Use os botões acima para criar a primeira tarefa ou marco.</p>
                <button 
                  onClick={() => handleAddTask(null)}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 transition-colors"
                >
                  Criar Nova Tarefa
                </button>
              </div>
            )}
             <svg 
                className="absolute top-0 z-0 pointer-events-none" 
                style={{ 
                  left: isSidebarVisible ? `${sidebarWidth}px` : '0px', 
                  width: `${days.length * zoomLevel}px`, 
                  height: `${flattenedTasks.length * 40}px` 
                }}
             >
                <defs>
                  <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                    <polygon points="0 0, 6 2, 0 4" className="fill-slate-300 dark:fill-slate-600" />
                  </marker>
                </defs>
                {state.ganttTasks.map((t) => {
                  if (!t.dependencies || taskVerticalIndexMap[t.id] === undefined) return null;
                  return t.dependencies.map(depId => {
                     const pred = state.ganttTasks.find(p => p.id === depId);
                     if (!pred || taskVerticalIndexMap[pred.id] === undefined) return null;
                     const predIdx = taskVerticalIndexMap[pred.id];
                     const taskIdx = taskVerticalIndexMap[t.id];
                     const x1 = (differenceInDays(safeParseDate(pred.endDate), timelineInterval.start) + 1) * zoomLevel;
                     const y1 = predIdx * 40 + 20;
                     const x2 = differenceInDays(safeParseDate(t.startDate), timelineInterval.start) * zoomLevel;
                     const y2 = taskIdx * 40 + 20;
                     return (
                       <path 
                         key={`${pred.id}-${t.id}`} 
                         d={`M ${x1} ${y1} L ${x1 + 10} ${y1} L ${x1 + 10} ${y2} L ${x2} ${y2}`} 
                         fill="none" className="stroke-slate-300 dark:stroke-slate-600 transition-colors" strokeWidth="1.5" markerEnd="url(#arrowhead)" 
                       />
                     );
                  });
                })}
             </svg>

            <div className="flex flex-col">
              {renderTaskRows(rootTasks)}

              {/* Inline Add at root */}
              {inlineAdding && inlineAdding.parentId === null && (
                <div className="flex h-10 border-b border-slate-100 dark:border-slate-800 items-stretch bg-blue-50/30 dark:bg-blue-900/10 transition-colors">
                  <div 
                    className={`flex-shrink-0 border-r border-slate-200 dark:border-slate-800 flex items-center pr-2 sticky left-0 z-10 bg-white dark:bg-slate-900 transition-all duration-300 overflow-hidden ${!isSidebarVisible ? 'w-0 opacity-0 border-none' : 'opacity-100'}`} 
                    style={{ paddingLeft: `8px`, width: isSidebarVisible ? `${sidebarWidth}px` : '0px' }}
                  >
                      <div className="flex items-center gap-2 w-full">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 w-8 font-mono">{rootTasks.length + 1}</span>
                        <div className="flex items-center gap-2 flex-grow min-w-0 border border-blue-400 dark:border-blue-700 rounded bg-white dark:bg-slate-900 px-2 py-1 shadow-sm transition-colors">
                          <input 
                            autoFocus
                            value={inlineTitle}
                            onChange={e => setInlineTitle(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSaveInline()}
                            className="text-xs text-slate-700 dark:text-slate-200 w-full outline-none bg-transparent"
                            placeholder="Nome da tarefa"
                          />
                          <button onClick={handleSaveInline} className="p-0.5 bg-blue-600 dark:bg-blue-700 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"><CheckCircle2 size={12} /></button>
                          <button onClick={() => setInlineAdding(null)} className="p-0.5 bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"><X size={12} /></button>
                        </div>
                      </div>
                  </div>
                  <div className="flex-shrink-0 bg-white/50 dark:bg-slate-900/30 transition-colors" style={{ width: `${days.length * zoomLevel}px` }} />
                </div>
              )}
              
              {/* Bottom "Add" logic matches Image 2 */}
              <div className="flex items-stretch h-10 border-b border-slate-100 dark:border-slate-800 transition-colors group">
                <div 
                  className={`flex-shrink-0 border-r border-slate-200 dark:border-slate-800 flex items-center pr-2 sticky left-0 z-10 bg-white dark:bg-slate-900 transition-all duration-300 overflow-hidden ${!isSidebarVisible ? 'w-0 opacity-0 border-none' : 'opacity-100'}`} 
                  style={{ paddingLeft: `12px`, width: isSidebarVisible ? `${sidebarWidth}px` : '0px' }}
                >
                  <div className="flex items-center gap-4 text-[11px] font-bold text-[#0070e0] dark:text-blue-400 opacity-60 hover:opacity-100 transition-opacity">
                    <button onClick={() => setInlineAdding({ parentId: null, type: 'task' })} className="flex items-center gap-1.5 hover:underline">
                      <Plus size={16} /> Adicionar uma tarefa
                    </button>
                    <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
                    <button onClick={() => setInlineAdding({ parentId: null, type: 'milestone' })} className="hover:underline">
                      Adicionar um marco
                    </button>
                  </div>
                </div>
                <div className="flex-shrink-0 bg-white/50 dark:bg-slate-900/30 transition-colors" style={{ width: `${days.length * zoomLevel}px` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reusing Modal logic but matching design */}
      {isModalOpen && (
        <TaskEditorModal 
          isOpen={isModalOpen}
          task={editingTask as GanttTask}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveTask}
          users={state.users}
          tasks={state.ganttTasks}
        />
      )}

      {/* Task Context Menu matches Image 3 */}
      <AnimatePresence>
        {contextMenu && (
          <>
            <div className="fixed inset-0 z-[110]" onClick={() => { setContextMenu(null); setShowColorOptions(false); }} />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="fixed z-[120] bg-white dark:bg-slate-900 rounded shadow-xl border border-slate-200 dark:border-slate-800 py-2 w-64 text-slate-700 dark:text-slate-200 transition-colors"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <ContextItem icon={<Maximize2 size={16} />} label="Configurações da tarefa" onClick={() => { handleEditTask(state.ganttTasks.find(t => t.id === contextMenu.taskId)!); setContextMenu(null); }} />
              <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
              <ContextItem icon={<Minimize2 size={16} className="scale-y-[-1]" />} label="Adicionar uma subtarefa" onClick={() => { 
                if (!expandedTasks.has(contextMenu.taskId)) toggleExpand(contextMenu.taskId);
                setInlineAdding({ parentId: contextMenu.taskId, type: 'task' }); 
                setContextMenu(null); 
              }} />
              <ContextItem icon={<Plus size={16} />} label="Adicionar uma tarefa" onClick={() => { setInlineAdding({ parentId: null, type: 'task' }); setContextMenu(null); }} />
              <ContextItem icon={<Milestone size={16} />} label="Adicionar um marco" onClick={() => { setInlineAdding({ parentId: null, type: 'milestone' }); setContextMenu(null); }} />
              <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
              <ContextItem icon={<ChevronLeft size={16} />} label="Recurar para a esquerda" />
              <ContextItem icon={<Milestone size={16} />} label="Converter em um marco" />
              <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
              <ContextItem icon={<Download size={16} />} label="Copiar" />
              <ContextItem icon={<Download size={16} className="opacity-30" />} label="Colar (Copia necessária primeiro)" disabled />
              <ContextItem icon={<Clock size={16} />} label="Configurações de cópia" />
              <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
              <ContextItem icon={<CheckCircle2 size={16} />} label="Selecionar" />
              {showColorOptions ? (
                <div className="px-4 py-2 grid grid-cols-5 gap-2 bg-slate-50 dark:bg-slate-800/50 rounded-b mt-1 border-t border-slate-100 dark:border-slate-800">
                  {COLORS.map(c => (
                    <button 
                      key={c}
                      onClick={async (e) => {
                        e.stopPropagation();
                        const task = state.ganttTasks.find(t => t.id === contextMenu.taskId);
                        if (task) {
                          const newState = await updateGanttTask({ ...task, color: c });
                          onUpdateState(newState);
                          addToast('Cor atualizada com sucesso!', 'success');
                        }
                        setContextMenu(null);
                        setShowColorOptions(false);
                      }}
                      className="w-8 h-8 rounded-full border border-white dark:border-slate-700 hover:scale-110 active:scale-95 transition-all shadow-sm"
                      style={{ backgroundColor: c }}
                      title="Clique para aplicar esta cor"
                    />
                  ))}
                </div>
              ) : (
                <ContextItem 
                  icon={<div className="w-4 h-4 rounded shadow-sm" style={{ backgroundColor: state.ganttTasks.find(t => t.id === contextMenu.taskId)?.color || '#3b82f6' }} />} 
                  label="Escolher a cor de tarefa" 
                  onClick={(e: any) => { e.stopPropagation(); setShowColorOptions(true); }}
                />
              )}
              <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
              <ContextItem icon={<Trash2 size={16} className="text-rose-500" />} label="Excluir" className="text-rose-500" onClick={async () => {
                try {
                  const newState = await deleteGanttTask(contextMenu.taskId);
                  onUpdateState(newState);
                  setContextMenu(null);
                } catch (error) { console.error(error); }
              }} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showFiltroSidebar && (
          <FiltroSidebar 
            isOpen={showFiltroSidebar} 
            onClose={() => setShowFiltroSidebar(false)} 
            users={state.users}
          />
        )}
        {showCamposSidebar && (
          <CamposSidebar 
            isOpen={showCamposSidebar} 
            onClose={() => setShowCamposSidebar(false)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
};

const ContextItem = ({ icon, label, onClick, className = "", disabled = false }: any) => (
  <button 
    disabled={disabled}
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    <span className="text-slate-400 dark:text-slate-500">{icon}</span>
    <span className="dark:text-slate-200">{label}</span>
  </button>
);

const ToolbarButton = ({ icon, active = false, onClick, title, className = "" }: { icon: React.ReactNode, active?: boolean, onClick?: () => void, title?: string, className?: string }) => (
  <button 
    onClick={onClick}
    title={title}
    className={`p-1.5 rounded transition-colors ${active ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'} ${className}`}
  >
    {icon}
  </button>
);

const SidebarButton = ({ icon, label, onClick, active, className = "" }: any) => (
  <button 
    onClick={onClick}
    className={`flex items-center gap-2 px-2 py-1 rounded transition-colors ${active ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200'} ${className}`}
  >
    {icon}
    {label && <span className="text-xs font-bold">{label}</span>}
  </button>
);

const StatusPicker = ({ status, onUpdate, onOpenChange }: { status: GanttTaskStatus, onUpdate: (s: GanttTaskStatus) => void, onOpenChange?: (open: boolean) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        onOpenChange?.(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onOpenChange]);

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    onOpenChange?.(next);
  };

  const options = [
    { id: GanttTaskStatus.TODO, label: 'Aberto', color: 'bg-slate-400' },
    { id: GanttTaskStatus.IN_PROGRESS, label: 'Em projeto', color: 'bg-amber-400' },
    { id: GanttTaskStatus.DONE, label: 'Feito', color: 'bg-cyan-400' },
    { id: GanttTaskStatus.CLOSED, label: 'Fechado', color: 'bg-emerald-400' },
  ];

  const current = options.find(o => o.id === status) || options[0];

  return (
    <div className="relative w-24 flex-shrink-0" ref={containerRef} style={{ zIndex: isOpen ? 100 : 1 }}>
      <button 
        onClick={toggle}
        className="w-full flex items-center justify-between px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <div className={`w-1.5 h-1.5 rounded-full ${current.color}`} />
          <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 truncate">{current.label}</span>
        </div>
        <ChevronDown size={10} className="text-slate-400 dark:text-slate-500" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            className="absolute top-full left-0 mt-1 w-32 bg-white dark:bg-slate-900 rounded shadow-xl border border-slate-200 dark:border-slate-800 py-1 z-50 overflow-hidden"
          >
            {options.map(opt => (
              <button 
                key={opt.id}
                onClick={() => { onUpdate(opt.id); setIsOpen(false); onOpenChange?.(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors transition-all"
              >
                <div className={`w-2 h-2 rounded-full ${opt.color}`} />
                <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">{opt.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const AssigneePicker = ({ assignedTo, users, onUpdate }: { assignedTo: string[], users: AppUser[], onUpdate: (uids: string[]) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [addingName, setAddingName] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const assignedUsers = assignedTo.map(id => {
    const u = users.find(usr => usr.id === id);
    if (u) return { id: u.id, name: u.name, type: 'user' };
    return { id, name: id, type: 'custom' };
  });

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(search.toLowerCase()) || 
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative mr-4 flex-shrink-0" ref={containerRef} style={{ zIndex: isOpen ? 100 : 1 }}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex -space-x-2 items-center"
      >
        {assignedUsers.length > 0 ? (
          <>
            {assignedUsers.slice(0, 2).map((u) => (
              <div 
                key={u.id} 
                className={`w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold overflow-hidden shadow-sm ${u.type === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-600'}`}
                title={u.name}
              >
                 {u.name.charAt(0).toUpperCase()}
              </div>
            ))}
            {assignedUsers.length > 2 && (
              <div className="w-6 h-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[8px] font-bold text-slate-400">
                +{assignedUsers.length - 2}
              </div>
            )}
          </>
        ) : (
          <div className="w-6 h-6 rounded-full bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 hover:border-slate-400 hover:text-slate-400 transition-colors">
            <UserIcon size={12} />
          </div>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-slate-900 rounded shadow-2xl border border-slate-200 dark:border-slate-800 py-2 z-50"
          >
            <div className="px-3 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <Search size={12} className="text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar ou adicionar nome..." 
                className="w-full text-[10px] outline-none bg-transparent text-slate-700 dark:text-slate-200" 
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && search.trim()) {
                    if (!assignedTo.includes(search.trim())) {
                      onUpdate([...assignedTo, search.trim()]);
                      setSearch('');
                    }
                  }
                }}
              />
            </div>
            
            <div className="max-h-48 overflow-y-auto py-1">
              {filteredUsers.length > 0 && (
                <div className="px-3 py-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">Colaboradores</div>
              )}
              {filteredUsers.map(u => (
                <button 
                  key={u.id}
                  onClick={() => {
                    const next = assignedTo.includes(u.id) ? assignedTo.filter(id => id !== u.id) : [...assignedTo, u.id];
                    onUpdate(next);
                  }}
                  className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-[10px] font-bold text-indigo-600 dark:text-indigo-400 flex-shrink-0 overflow-hidden">
                       {u.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{u.name}</span>
                  </div>
                  {assignedTo.includes(u.id) && <CheckCircle2 size={14} className="text-blue-500" />}
                </button>
              ))}

              {search.trim() && !users.find(u => u.name.toLowerCase() === search.toLowerCase()) && (
                <button 
                  onClick={() => {
                    onUpdate([...assignedTo, search.trim()]);
                    setSearch('');
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 transition-colors border-t border-slate-100 dark:border-slate-800 mt-1"
                >
                  <Plus size={14} />
                  <span className="text-xs font-bold truncate">Adicionar "{search}"</span>
                </button>
              )}
              
              {/* Custom Names already added */}
              {assignedUsers.filter(au => au.type === 'custom').length > 0 && (
                <>
                  <div className="px-3 py-1 mt-2 text-[9px] font-black text-slate-400 uppercase tracking-widest border-t border-slate-50 dark:border-slate-800">Outros atribuídos</div>
                  {assignedUsers.filter(au => au.type === 'custom').map(au => (
                    <div key={au.id} className="w-full flex items-center justify-between px-3 py-1.5 group">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-600 flex-shrink-0 uppercase">
                          {au.name.charAt(0)}
                        </div>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{au.name}</span>
                      </div>
                      <button 
                        onClick={() => onUpdate(assignedTo.filter(id => id !== au.id))}
                        className="text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const FiltroSidebar = ({ isOpen, onClose, users }: any) => {
  return (
    <motion.div 
      initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      className="fixed top-0 right-0 h-full w-80 bg-white dark:bg-slate-900 shadow-2xl z-[200] border-l border-slate-200 dark:border-slate-800 flex flex-col transition-colors"
    >
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
           <Filter size={18} className="text-slate-400" />
           <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Filtro</h3>
        </div>
        <div className="flex items-center gap-3">
           <HelpCircle size={18} className="text-amber-500 cursor-pointer" />
           <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 transition-colors"><X size={20} /></button>
        </div>
      </div>
      
      <div className="flex-grow overflow-y-auto p-4 space-y-6">
        <div>
           <select className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-400 outline-none transition-colors">
             <option>Selecionar filtro salvo</option>
           </select>
        </div>

        <FiltroSection label="Nome da tarefa">
           <div className="relative">
             <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
             <input type="text" placeholder="Buscar por nome da tarefa" className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-xs outline-none focus:border-blue-400 transition-colors text-slate-700 dark:text-slate-200" />
           </div>
        </FiltroSection>

        <FiltroSection label="Tipo">
           <div className="p-2 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-400 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
             <span>Todos</span>
             <ChevronDown size={14} />
           </div>
        </FiltroSection>

        <FiltroSection label="Cessionário">
           <div className="p-2 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-400 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
             <span>Todos</span>
             <ChevronDown size={14} />
           </div>
        </FiltroSection>

        <FiltroSection label="Estado" active>
           <div className="space-y-2 mt-2">
             <FiltroCheckbox label="Aberto" color="bg-slate-400" />
             <FiltroCheckbox label="Em projeto" color="bg-amber-400" checked />
             <FiltroCheckbox label="Feito" color="bg-cyan-400" />
             <FiltroCheckbox label="Fechado" color="bg-emerald-400" />
           </div>
        </FiltroSection>

        <FiltroSection label="Prioridade">
           <div className="p-2 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-400 flex items-center justify-between font-bold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
             <span>Todos</span>
             <ChevronDown size={14} />
           </div>
        </FiltroSection>
      </div>

      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-2 transition-colors">
         <button className="w-full py-2 text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">Limpar filtro</button>
         <button className="w-full py-2 bg-blue-50/50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-[#0070e0] dark:text-blue-400 font-bold text-xs rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors">Salvar filtro</button>
      </div>
    </motion.div>
  );
};

const CamposSidebar = ({ isOpen, onClose }: any) => (
  <motion.div 
    initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
    className="fixed top-0 right-0 h-full w-80 bg-white dark:bg-slate-900 shadow-2xl z-[200] border-l border-slate-200 dark:border-slate-800 flex flex-col transition-colors"
  >
    <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
      <div className="flex items-center gap-2">
         <button className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 transition-colors"><ChevronLeft size={18} /></button>
         <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Adicionando um campo</h3>
      </div>
      <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 transition-colors"><X size={20} /></button>
    </div>
    
    <div className="flex border-b border-slate-100 dark:border-slate-800 transition-colors">
       <button className="flex-1 py-3 text-xs font-bold text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 tracking-wide uppercase">Novo campo</button>
       <button className="flex-1 py-3 text-xs font-bold text-slate-400 dark:text-slate-500 tracking-wide uppercase">Dos existentes</button>
    </div>

    <div className="p-6 space-y-6">
       <div>
          <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-tight">Título</label>
          <input type="text" placeholder="Texto" className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded text-xs outline-none text-slate-700 dark:text-slate-200 transition-colors" />
       </div>
       <div>
          <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-tight">Tipo</label>
          <div className="space-y-1">
             <FieldTypeItem icon={<FileText size={14} />} label="Texto" active />
             <FieldTypeItem icon={<div className="text-[10px] font-bold">1</div>} label="Número" />
             <FieldTypeItem icon={<Calendar size={14} />} label="Data" />
             <FieldTypeItem icon={<MoreHorizontal size={14} />} label="Lista" />
             <FieldTypeItem icon={<CheckCircle2 size={14} />} label="Caixa de seleção" />
             <FieldTypeItem icon={<Tag size={14} />} label="Pessoas" />
          </div>
       </div>
    </div>

    <div className="mt-auto p-4 flex justify-end bg-blue-600 dark:bg-blue-700 transition-colors">
       <button className="text-white font-bold text-sm tracking-widest uppercase">Guardar</button>
    </div>
  </motion.div>
);

const FiltroSection = ({ label, children, active = false }: any) => (
  <div>
    <div className={`flex items-center justify-between mb-2 ${active ? 'text-blue-600' : 'text-slate-500'}`}>
       <span className="text-[11px] font-black uppercase tracking-wider">{label}</span>
       {active && <ChevronUp size={14} />}
    </div>
    {children}
  </div>
);

const FiltroCheckbox = ({ label, color, checked = false }: any) => (
  <div className="flex items-center gap-3 cursor-pointer group">
     <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${checked ? 'bg-blue-600 border-blue-600' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700'}`}>
        {checked && <div className="w-1.5 h-1.5 rounded-full bg-white transition-all scale-110" />}
     </div>
     <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors">{label}</span>
     </div>
  </div>
);

const FieldTypeItem = ({ icon, label, active = false }: any) => (
  <div className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-all ${active ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 dark:shadow-none' : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
     <span className={active ? 'text-white' : 'text-slate-400 dark:text-slate-500'}>{icon}</span>
     <span className="text-xs font-bold uppercase tracking-tight">{label}</span>
  </div>
);

export const TaskEditorModal = ({ isOpen, task, onClose, onSave, onDelete, users, tasks }: any) => {
  const [formData, setFormData] = useState<GanttTask>(task);

  const COLORS = [
    '#3b82f6', // Azul
    '#10b981', // Esmeralda
    '#f59e0b', // Âmbar
    '#ef4444', // Vermelho
    '#6366f1', // Índigo
    '#06b6d4', // Ciano
    '#8b5cf6', // Violeta
    '#d946ef', // Fúcsia
    '#64748b', // Ardósia
    '#f97316'  // Laranja
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 transition-colors"
      >
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800 transition-colors">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 uppercase tracking-tight">Editar Tarefa</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-400"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Nome da Tarefa</label>
            <input 
              type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})}
              className="w-full px-3 py-2 bg-slate-100 rounded border-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 outline-none transition-all"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Início</label>
                <input type="date" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} className="w-full px-3 py-2 bg-slate-100 rounded border-none font-bold text-slate-700 outline-none" />
             </div>
             <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Fim</label>
                <input type="date" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} className="w-full px-3 py-2 bg-slate-100 rounded border-none font-bold text-slate-700 outline-none" />
             </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Estado</label>
                <select 
                  value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as GanttTaskStatus})}
                  className="w-full px-3 py-2 bg-slate-100 rounded border-none font-bold text-slate-700 outline-none"
                >
                  <option value={GanttTaskStatus.TODO}>Aberto</option>
                  <option value={GanttTaskStatus.IN_PROGRESS}>Em projeto</option>
                  <option value={GanttTaskStatus.DONE}>Feito</option>
                  <option value={GanttTaskStatus.CLOSED}>Fechado</option>
                </select>
             </div>
             <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Prioridade</label>
                <select 
                  value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value as TaskPriority})}
                  className="w-full px-3 py-2 bg-slate-100 rounded border-none font-bold text-slate-700 outline-none"
                >
                  <option value={TaskPriority.LOW}>Baixa</option>
                  <option value={TaskPriority.MEDIUM}>Média</option>
                  <option value={TaskPriority.HIGH}>Alta</option>
                  <option value={TaskPriority.URGENT}>Urgente</option>
                </select>
             </div>
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Responsáveis</label>
            <div className="flex flex-wrap gap-1">
               {users.map((u:any) => (
                 <button 
                  key={u.id} onClick={() => {
                    const next = formData.assignedTo.includes(u.id) ? formData.assignedTo.filter(id => id !== u.id) : [...formData.assignedTo, u.id];
                    setFormData({...formData, assignedTo: next});
                  }}
                  className={`px-3 py-1 rounded text-[10px] font-bold transition-all border ${formData.assignedTo.includes(u.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-100 text-slate-500 border-slate-200'}`}
                 >
                   {u.name}
                 </button>
               ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Anotações Detalhadas</label>
            <textarea 
              value={formData.reports || ''} 
              onChange={e => setFormData({...formData, reports: e.target.value})}
              placeholder="Descreva os detalhes da tarefa, anotações, impedimentos ou observações importantes..."
              className="w-full px-3 py-2 bg-slate-100 rounded border-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700 outline-none transition-all min-h-[100px] text-sm resize-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Cor da Tarefa</label>
            <div className="flex flex-wrap gap-2">
               {COLORS.map(c => (
                 <button 
                  key={c}
                  onClick={() => setFormData({...formData, color: c})}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${formData.color === c ? 'border-slate-900 scale-125 shadow-md' : 'border-transparent hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                 />
               ))}
            </div>
          </div>
        </div>
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between gap-2">
           <button 
             onClick={() => onDelete?.(formData.id)} 
             className="px-4 py-2 text-xs font-bold text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
           >
             <Trash2 size={14} /> Excluir
           </button>
           <div className="flex gap-2">
             <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700">Cancelar</button>
             <button onClick={() => onSave(formData)} className="px-6 py-2 bg-blue-600 text-white rounded text-xs font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all">Salvar Alterações</button>
           </div>
        </div>
      </motion.div>
    </div>
  );
};
