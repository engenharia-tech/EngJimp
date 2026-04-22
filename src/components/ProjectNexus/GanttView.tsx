import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Plus, 
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
  ChevronUp,
  Settings,
  Tag,
  Flag,
  FileText,
  HelpCircle,
  Layout,
  AlignLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
  subWeeks
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AppState, GanttTask, User as AppUser, GanttTaskStatus, TaskPriority } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';
import { addGanttTask, updateGanttTask, deleteGanttTask } from '../../services/storageService';

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
}

const COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 
  'bg-indigo-500', 'bg-cyan-500', 'bg-violet-500', 'bg-fuchsia-500',
  'bg-slate-500', 'bg-orange-500'
];

export const GanttView: React.FC<GanttViewProps> = ({ state, onUpdateState }) => {
  const { t, language } = useLanguage();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<GanttTask | null>(null);
  const [zoomLevel, setZoomLevel] = useState(32); // px per day
  const [searchTerm, setSearchTerm] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, taskId: string } | null>(null);
  const [inlineAdding, setInlineAdding] = useState<{ parentId: string | null, type: 'task' | 'milestone' } | null>(null);
  const [inlineTitle, setInlineTitle] = useState('');
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');

  const [interactingTask, setInteractingTask] = useState<{
    id: string;
    type: 'drag' | 'resize';
    startX: number;
    originalStartDate: string;
    originalEndDate: string;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const scrollHeaderRef = useRef<HTMLDivElement>(null);

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

  const currentUser = state.users.find(u => u.username === localStorage.getItem('nexus_user'));

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
        try { await updateGanttTask(task); } catch (error) { console.error(error); }
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
    const buildTree = (parentId: string | null = null): (GanttTask & { children: any[] })[] => {
      return state.ganttTasks
        .filter(t => t.parentId === parentId)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(t => ({
          ...t,
          children: buildTree(t.id)
        }));
    };
    return buildTree(null);
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

  const taskVerticalIndexMap = useMemo(() => {
    const map: Record<string, number> = {};
    flattenedTasks.forEach((t, i) => {
      map[t.id] = i;
    });
    return map;
  }, [flattenedTasks]);

  const toggleExpand = (id: string) => {
    const next = new Set(expandedTasks);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedTasks(next);
  };

  const handleAddTask = (parentId: string | null = null) => {
    const newTask: Partial<GanttTask> = {
      id: crypto.randomUUID(),
      title: '',
      parentId: parentId,
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
      color: COLORS[0],
      isMilestone: false,
      assignedTo: [],
      progress: 0,
      status: GanttTaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      order: state.ganttTasks.length
    };
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
      const newState = isNew ? await addGanttTask(task) : await updateGanttTask(task);
      onUpdateState(newState);
      setIsModalOpen(false);
      setEditingTask(null);
    } catch (error) { console.error(error); }
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
    } catch (error) { 
      console.error(error);
      alert("Erro ao atualizar campo. Verifique sua conexão.");
      // Re-fetch to sync
      window.location.reload(); // Hard fallback for sync if failed
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
      const newState = await deleteGanttTask(taskId);
      onUpdateState(newState);
    } catch (error) {
      console.error(error);
      alert("Erro ao excluir tarefa.");
    }
  };

  const handleSaveInline = async () => {
    const titleToSave = inlineTitle.trim();
    if (!titleToSave || !inlineAdding) return;
    
    // Immediate clear to prevent double-save
    const currentAdding = inlineAdding;
    setInlineAdding(null);
    setInlineTitle('');

    const newTask: GanttTask = {
      id: generateId(),
      title: titleToSave,
      parentId: currentAdding.parentId,
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
      color: currentAdding.type === 'milestone' ? 'bg-amber-500' : 'bg-blue-500',
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
    try {
      const newState = await addGanttTask(newTask);
      onUpdateState(newState);
    } catch (error) { 
      console.error("Save error:", error);
      alert("Erro ao salvar tarefa. Verifique sua conexão.");
      // Fallback: restore adding state if failed
      setInlineAdding(currentAdding);
      setInlineTitle(titleToSave);
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
                  className="flex-shrink-0 border-r border-slate-200 dark:border-slate-800 flex items-center pr-2 sticky left-0 z-10 bg-inherit group-hover:bg-slate-50 dark:group-hover:bg-slate-800 shadow-[4px_0_4px_-4px_rgba(0,0,0,0.1)] transition-colors"
                  style={{ paddingLeft: `${depth * (isMobile ? 12 : 20) + 8}px`, width: `${sidebarWidth}px` }}
                >
                  <div className="flex items-center gap-2 w-full">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 w-8 font-mono">{rowNumber}</span>
                    <button 
                      onClick={() => toggleExpand(task.id)}
                      className={`p-1 rounded text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors ${!hasChildren ? 'invisible' : ''}`}
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    
                    <div className="flex items-center gap-2 flex-grow min-w-0">
                      {task.isMilestone ? <Milestone size={14} className="text-amber-500 flex-shrink-0" /> : null}
                      {editingTitleId === task.id ? (
                        <div className="flex items-center gap-1 flex-grow">
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
                          <span className={`${isMobile ? 'text-[11px]' : 'text-sm'} truncate ${isTopLevel ? 'font-bold text-slate-800 dark:text-slate-100' : 'font-medium text-slate-600 dark:text-slate-400'}`}>
                            {task.title || 'Tarefa sem nome'}
                          </span>
                          <div className={`flex items-center gap-1 transition-opacity ${isMobile ? 'opacity-40' : 'opacity-0 group-hover/title:opacity-100'}`}>
                            <PlusCircle size={12} className="text-blue-500 dark:text-blue-400" onClick={(e) => { e.stopPropagation(); setInlineAdding({ parentId: task.id, type: 'task' }); }} />
                            {!isMobile && <Trash2 size={12} className="text-slate-400 hover:text-red-500 dark:hover:text-red-400" onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }} />}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {!isMobile && (
                      <>
                        <AssigneePicker assignedTo={task.assignedTo || []} users={state.users} onUpdate={(uids) => handleUpdateField(task.id, 'assignedTo', uids)} />
                        <StatusPicker status={task.status} onUpdate={(s) => handleUpdateField(task.id, 'status', s)} />
                      </>
                    )}
                    
                    <button onClick={(e) => { e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, taskId: task.id }); }} className="p-1 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-all">
                      <MoreVertical size={14} />
                    </button>
                  </div>
                </div>

                {/* Right Side: Timeline Row */}
                <div className="flex-grow relative overflow-hidden bg-white/50 dark:bg-slate-900/50 group-hover:bg-slate-100/30 dark:group-hover:bg-slate-800/20 transition-colors">
                   {/* Summary Bar for parents */}
                  {hasChildren ? (
                    <div 
                      className="absolute h-1.5 top-4 z-10 pointer-events-none"
                      style={{
                        left: `${differenceInDays(new Date(task.startDate), timelineInterval.start) * zoomLevel}px`,
                        width: `${(differenceInDays(new Date(task.endDate), new Date(task.startDate)) + 1) * zoomLevel}px`
                      }}
                    >
                      <div className="absolute inset-0 bg-slate-800 dark:bg-slate-300 rounded-full" />
                      <div className="absolute left-0 top-0 bottom-[-4px] w-1.5 bg-slate-800 dark:bg-slate-300 rounded-b-sm" />
                      <div className="absolute right-0 top-0 bottom-[-4px] w-1.5 bg-slate-800 dark:bg-slate-300 rounded-b-sm" />
                      {/* Name label for summary bars */}
                      <span className="absolute left-0 bottom-full mb-1 text-[10px] font-bold text-slate-800 dark:text-slate-300 whitespace-nowrap">
                        {task.title}
                      </span>
                    </div>
                  ) : !task.isMilestone ? (
                    /* Regular Task Bar */
                    <div 
                      className={`absolute h-6 top-2 rounded-sm flex items-center px-2 cursor-pointer transition-all ${task.color} shadow-sm group/bar z-10`}
                      style={{
                        left: `${differenceInDays(new Date(task.startDate), timelineInterval.start) * zoomLevel}px`,
                        width: `${(differenceInDays(new Date(task.endDate), new Date(task.startDate)) + 1) * zoomLevel}px`
                      }}
                      onMouseDown={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        if (rect.width - x < 8) setInteractingTask({ id: task.id, type: 'resize', startX: e.clientX, originalStartDate: task.startDate, originalEndDate: task.endDate });
                        else setInteractingTask({ id: task.id, type: 'drag', startX: e.clientX, originalStartDate: task.startDate, originalEndDate: task.endDate });
                        e.stopPropagation();
                      }}
                    >
                      <span className="text-[10px] text-white font-bold truncate select-none shadow-black/20 text-shadow-sm">{task.title}</span>
                      <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize" />
                    </div>
                  ) : (
                    /* Milestone */
                    <div 
                      className="absolute w-3 h-3 top-3.5 bg-amber-500 rotate-45 border border-white dark:border-slate-800 shadow-sm cursor-pointer z-10"
                      style={{ left: `${differenceInDays(new Date(task.startDate), timelineInterval.start) * zoomLevel}px`, transform: 'translateX(-50%) rotate(45deg)' }}
                    />
                  )}
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
                        className="flex-shrink-0 border-r border-slate-200 dark:border-slate-800 flex items-center pr-2 sticky left-0 z-10 bg-inherit" 
                        style={{ paddingLeft: `${(depth + 1) * 20 + 8}px`, width: `${sidebarWidth}px` }}
                      >
                         <div className="flex items-center gap-2 w-full">
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 w-8 font-mono">{rowNumber}.{task.children.length + 1}</span>
                            <div className="flex items-center gap-2 flex-grow border border-blue-300 dark:border-blue-700 rounded bg-white dark:bg-slate-900 px-2 py-0.5 shadow-sm">
                               <input 
                                autoFocus value={inlineTitle} onChange={e => setInlineTitle(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSaveInline()}
                                className="text-xs text-slate-600 dark:text-slate-300 w-full outline-none bg-transparent"
                                placeholder="..."
                               />
                               <button onClick={handleSaveInline} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"><CheckCircle2 size={12} /></button>
                               <button onClick={() => setInlineAdding(null)} className="text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 transition-colors"><X size={12} /></button>
                            </div>
                         </div>
                       </div>
                       <div className="flex-grow bg-white dark:bg-slate-900 transition-colors" />
                    </div>
                  ) : (
                    /* The buttons below the group, exactly like in the video */
                    <div className="flex h-10 border-b border-slate-100 dark:border-slate-800 items-stretch group/inline">
                       <div 
                        className="flex-shrink-0 border-r border-slate-200 dark:border-slate-800 flex items-center pr-2 sticky left-0 z-10 bg-white dark:bg-slate-900 transition-colors" 
                        style={{ paddingLeft: `${(depth + 1) * (isMobile ? 12 : 20) + (isMobile ? 16 : 28)}px`, width: `${sidebarWidth}px` }}
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
                       <div className="flex-grow bg-white/30 dark:bg-slate-900/30 transition-colors" />
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
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 select-none transition-colors duration-300">
      {/* Toolbar as seen in Image 1 */}
      <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shadow-sm z-30 transition-colors overflow-hidden">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar max-w-[60%] sm:max-w-none">
          <ToolbarButton icon={<Columns size={16} />} className="hidden sm:flex" />
          <ToolbarButton icon={<ArrowDownWideNarrow size={16} />} className="hidden sm:flex" />
          <ToolbarButton icon={<Maximize2 size={16} />} />
          <ToolbarButton icon={<Minimize2 size={16} />} />
          
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
                <div className="absolute left-[20%] w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-600" />
                <div className="absolute left-[40%] w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-600" />
                <div className="absolute left-[60%] w-3 h-3 rounded-full bg-blue-500 border-2 border-white dark:border-slate-800 shadow-sm" />
                <div className="absolute left-[80%] w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-600" />
              </div>
              <span className="text-[10px] font-bold text-slate-400">Dias</span>
            </div>
          )}

          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1" />

          <button className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded transition-colors">
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
            className="flex-shrink-0 border-r border-slate-300 dark:border-slate-800 flex items-center px-4 bg-white dark:bg-slate-900 relative transition-colors"
            style={{ width: `${sidebarWidth}px` }}
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
            <div className="flex border-b border-slate-200 h-6 bg-white min-w-max">
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
                      className={`h-full border-r border-slate-200 dark:border-slate-800 flex items-center px-4 text-[10px] font-black tracking-widest transition-colors ${i % 2 === 0 ? 'text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900' : 'text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/20'}`}
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
                  className={`flex-shrink-0 border-r border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center transition-colors ${isSameDay(day, new Date()) ? 'bg-rose-50 dark:bg-rose-900/30 border-rose-200 dark:border-rose-800' : isWeekend(day) ? 'bg-slate-50/50 dark:bg-slate-800/30' : ''}`}
                  style={{ width: `${zoomLevel}px` }}
                >
                  <span className={`text-[8px] font-bold ${isSameDay(day, new Date()) ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'}`}>
                    {format(day, 'd')}
                  </span>
                  <span className={`text-[9px] font-black uppercase ${isSameDay(day, new Date()) ? 'text-rose-600 dark:text-rose-400' : 'text-slate-300 dark:text-slate-600'}`}>
                    {format(day, 'EEE', { locale: language === 'pt-BR' ? ptBR : undefined }).substring(0, 1)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Rows (Scrolling area) */}
        <div className="flex-grow overflow-auto" onScroll={handleScroll}>
          <div className="relative min-w-max">
            {/* Today Line */}
            <div 
              className="absolute top-0 bottom-0 w-px bg-rose-400 dark:bg-rose-500/50 z-10 pointer-events-none"
              style={{ left: `${todayLeft}px` }} 
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-t tracking-tighter uppercase shadow-sm">
                Hoje
              </div>
            </div>

             {/* SVG Dependency Lines */}
             <svg 
                className="absolute top-0 z-0 pointer-events-none" 
                style={{ 
                  left: '0px', 
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
                     const x1 = (differenceInDays(new Date(pred.endDate), timelineInterval.start) + 1) * zoomLevel;
                     const y1 = predIdx * 40 + 20;
                     const x2 = differenceInDays(new Date(t.startDate), timelineInterval.start) * zoomLevel;
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
                    className="flex-shrink-0 border-r border-slate-200 dark:border-slate-800 flex items-center pr-2 sticky left-0 z-10 bg-white dark:bg-slate-900 transition-colors" 
                    style={{ paddingLeft: `8px`, width: `${sidebarWidth}px` }}
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
                  <div className="flex-grow bg-white/50 dark:bg-slate-900/30 transition-colors" />
                </div>
              )}
              
              {/* Bottom "Add" logic matches Image 2 */}
              <div className="flex items-center h-10 px-8 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-[#0070e0] dark:text-blue-400 font-medium transition-colors group">
                 <div className="flex items-center gap-4 text-xs">
                    <button onClick={() => setInlineAdding({ parentId: null, type: 'task' })} className="flex items-center gap-1.5 hover:underline">
                      <Plus size={16} /> Adicionar uma tarefa
                    </button>
                    <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
                    <button onClick={() => setInlineAdding({ parentId: null, type: 'milestone' })} className="hover:underline">
                      Adicionar um marco
                    </button>
                 </div>
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
            <div className="fixed inset-0 z-[110]" onClick={() => setContextMenu(null)} />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="fixed z-[120] bg-white dark:bg-slate-900 rounded shadow-xl border border-slate-200 dark:border-slate-800 py-2 w-64 text-slate-700 dark:text-slate-200 transition-colors"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <ContextItem icon={<Maximize2 size={16} />} label="Configurações da tarefa" onClick={() => { handleEditTask(state.ganttTasks.find(t => t.id === contextMenu.taskId)!); setContextMenu(null); }} />
              <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
              <ContextItem icon={<Minimize2 size={16} className="scale-y-[-1]" />} label="Adicionar uma subtarefa" onClick={() => { setInlineAdding({ parentId: contextMenu.taskId, type: 'task' }); setContextMenu(null); }} />
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
              <ContextItem icon={<div className="w-4 h-4 bg-blue-500 rounded" />} label="Escolher a cor de tarefa" />
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

const ToolbarButton = ({ icon, active = false, className = "" }: { icon: React.ReactNode, active?: boolean, className?: string }) => (
  <button className={`p-1.5 rounded transition-colors ${active ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'} ${className}`}>
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

const StatusPicker = ({ status, onUpdate }: { status: GanttTaskStatus, onUpdate: (s: GanttTaskStatus) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const options = [
    { id: GanttTaskStatus.TODO, label: 'Aberto', color: 'bg-slate-400' },
    { id: GanttTaskStatus.IN_PROGRESS, label: 'Em projeto', color: 'bg-amber-400' },
    { id: GanttTaskStatus.DONE, label: 'Feito', color: 'bg-cyan-400' },
    { id: GanttTaskStatus.CLOSED, label: 'Fechado', color: 'bg-emerald-400' },
  ];

  const current = options.find(o => o.id === status) || options[0];

  return (
    <div className="relative w-24 flex-shrink-0" ref={containerRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-2 py-1 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <div className={`w-1.5 h-1.5 rounded-full ${current.color}`} />
          <span className="text-[10px] font-bold text-slate-600 truncate">{current.label}</span>
        </div>
        <ChevronDown size={10} className="text-slate-400" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            className="absolute top-full left-0 mt-1 w-32 bg-white rounded shadow-xl border border-slate-200 py-1 z-50 overflow-hidden"
          >
            {options.map(opt => (
              <button 
                key={opt.id}
                onClick={() => { onUpdate(opt.id); setIsOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 transition-colors transition-all"
              >
                <div className={`w-2 h-2 rounded-full ${opt.color}`} />
                <span className="text-[10px] font-semibold text-slate-600">{opt.label}</span>
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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const assignedUsers = assignedTo.map(id => users.find(u => u.id === id)).filter(Boolean);

  return (
    <div className="relative mr-4 flex-shrink-0" ref={containerRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex -space-x-2 items-center"
      >
        {assignedUsers.length > 0 ? (
          <>
            {assignedUsers.slice(0, 2).map((u: any) => (
              <div key={u.id} className="w-6 h-6 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-600 overflow-hidden">
                 {u.name.charAt(0)}
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
        <Plus size={10} className="ml-1 text-slate-300 opacity-0 group-hover:opacity-100" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-slate-900 rounded shadow-2xl border border-slate-200 dark:border-slate-800 py-2 z-50"
          >
            <div className="px-3 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <Search size={12} className="text-slate-400" />
              <input type="text" placeholder="Buscar..." className="w-full text-[10px] outline-none bg-transparent text-slate-700 dark:text-slate-200" />
            </div>
            <div className="max-h-48 overflow-y-auto py-1">
              {users.map(u => (
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
                       {u.name.charAt(0)}
                    </div>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{u.name}</span>
                  </div>
                  {assignedTo.includes(u.id) && <CheckCircle2 size={14} className="text-blue-500" />}
                </button>
              ))}
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

const TaskEditorModal = ({ isOpen, task, onClose, onSave, users, tasks }: any) => {
  const [formData, setFormData] = useState<GanttTask>(task);

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
        </div>
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
           <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700">Cancelar</button>
           <button onClick={() => onSave(formData)} className="px-6 py-2 bg-blue-600 text-white rounded text-xs font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all">Salvar Alterações</button>
        </div>
      </motion.div>
    </div>
  );
};
