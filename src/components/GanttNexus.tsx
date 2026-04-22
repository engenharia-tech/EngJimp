import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Plus, 
  ChevronRight, 
  ChevronDown, 
  Calendar, 
  User, 
  Paperclip, 
  MessageSquare, 
  Copy, 
  Trash2, 
  Edit2, 
  Lock, 
  Clock,
  Search,
  FileText,
  Milestone,
  MoreVertical,
  ChevronLeft
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
  endOfMonth,
  isWeekend,
  addWeeks,
  subWeeks
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AppState, GanttTask, User as AppUser, GanttAttachment } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { addGanttTask, updateGanttTask, deleteGanttTask } from '../services/storageService';

interface GanttNexusProps {
  state: AppState;
  onUpdateState: (newState: AppState) => void;
}

const COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 
  'bg-indigo-500', 'bg-cyan-500', 'bg-violet-500', 'bg-fuchsia-500',
  'bg-slate-500', 'bg-orange-500'
];

export const GanttNexus: React.FC<GanttNexusProps> = ({ state, onUpdateState }) => {
  const { t, language } = useLanguage();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<GanttTask | null>(null);
  const [viewMode, setViewMode] = useState<'week' | 'month'>('month');
  const [zoomLevel, setZoomLevel] = useState(32); // px per day
  const [showOnlyMyTasks, setShowOnlyMyTasks] = useState(false);

  // Drag and drop state
  const [interactingTask, setInteractingTask] = useState<{
    id: string;
    type: 'drag' | 'resize';
    startX: number;
    originalStartDate: string;
    originalEndDate: string;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const currentUser = state.users.find(u => u.username === localStorage.getItem('nexus_user'));

  // Drag and drop / Resize Logic
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
        
        // Update local state temporarily for preview
        const updatedTasks = state.ganttTasks.map(t => 
          t.id === task.id ? { ...t, startDate: newStart, endDate: newEnd } : t
        );
        onUpdateState({ ...state, ganttTasks: updatedTasks });
      } else if (interactingTask.type === 'resize') {
        const newEnd = format(addDays(new Date(interactingTask.originalEndDate), daysMoved), 'yyyy-MM-dd');
        
        // Ensure end date is not before start date
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
        // Persist to DB
        try {
          await updateGanttTask(task);
        } catch (error) {
          console.error("Failed to persist task update after interaction", error);
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

  // Timeline preparation
  const timelineInterval = useMemo(() => {
    if (viewMode === 'week') {
      const start = startOfWeek(currentDate, { locale: language === 'pt-BR' ? ptBR : undefined });
      const end = addWeeks(start, 4); 
      return { start, end };
    }
    const start = startOfMonth(subMonths(currentDate, 1));
    const end = addMonths(start, 5); // Show longer timeline
    return { start, end };
  }, [currentDate, viewMode, language]);

  useEffect(() => {
    if (viewMode === 'week') setZoomLevel(64);
    else setZoomLevel(32);
  }, [viewMode]);

  const days = useMemo(() => {
    return eachDayOfInterval({ start: timelineInterval.start, end: timelineInterval.end });
  }, [timelineInterval]);

  // Today Line
  const todayLeft = differenceInDays(new Date(), timelineInterval.start) * zoomLevel;

  // Hierarchical task structure
  const rootTasks = useMemo(() => {
    const buildTree = (parentId: string | null = null): (GanttTask & { children: any[] })[] => {
      let tasks = state.ganttTasks.filter(t => t.parentId === parentId);
      
      if (showOnlyMyTasks && currentUser) {
        // If filtering by my tasks, we need to keep nodes that have assigned children too
        // But for simplicity, we'll filter top-level if any child or self matches
        // Actually, let's just filter the final list for display
      }

      return tasks
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(t => ({
          ...t,
          children: buildTree(t.id)
        }));
    };

    let tree = buildTree(null);

    if (showOnlyMyTasks && currentUser) {
      const filterTree = (nodes: any[]): any[] => {
        return nodes.filter(node => {
          const matches = node.assignedTo.includes(currentUser.id);
          const childrenMatch = filterTree(node.children);
          if (matches || childrenMatch.length > 0) {
            node.children = childrenMatch;
            return true;
          }
          return false;
        });
      };
      return filterTree(tree);
    }

    return tree;
  }, [state.ganttTasks, showOnlyMyTasks, currentUser]);

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
      description: '',
      parentId: parentId,
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
      color: COLORS[0],
      isMilestone: false,
      assignedTo: [],
      progress: 0,
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      workload: {},
      reports: '',
      order: state.ganttTasks.length
    };
    setEditingTask(newTask as GanttTask);
    setIsModalOpen(true);
  };

  const handleEditTask = (task: GanttTask) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleDeleteTask = async (id: string) => {
    if (confirm(t('confirmDelete'))) {
      try {
        const newState = await deleteGanttTask(id);
        onUpdateState(newState);
      } catch (error) {
        console.error(error);
      }
    }
  };

  const handleCopyTask = async (task: GanttTask) => {
    const copy: GanttTask = {
      ...task,
      id: crypto.randomUUID(),
      title: `${task.title} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      const newState = await addGanttTask(copy);
      onUpdateState(newState);
    } catch (error) {
      console.error(error);
    }
  };

  const handleSaveTask = async (task: GanttTask) => {
    try {
      const isNew = !state.ganttTasks.find(t => t.id === task.id);
      const newState = isNew ? await addGanttTask(task) : await updateGanttTask(task);
      onUpdateState(newState);
      setIsModalOpen(false);
      setEditingTask(null);
    } catch (error) {
      console.error(error);
    }
  };

  const renderTaskRow = (task: any, depth: number = 0) => {
    const isExpanded = expandedTasks.has(task.id);
    const hasChildren = task.children.length > 0;

    // Today Line
    const todayLeft = differenceInDays(new Date(), timelineInterval.start) * zoomLevel;

    return (
      <React.Fragment key={task.id}>
        <div className="flex border-b border-slate-200 hover:bg-slate-50 transition-colors group relative">
          {/* Left Column - Task Info */}
          <div 
            className="flex-shrink-0 w-80 border-r border-slate-200 p-2 flex items-center pr-4 overflow-hidden bg-white group-hover:bg-slate-50 sticky left-0 z-20"
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
          >
            <div className="flex items-center gap-2 w-full">
              {hasChildren ? (
                <button 
                  onClick={() => toggleExpand(task.id)}
                  className="p-1 hover:bg-slate-200 rounded text-slate-500"
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : (
                <div className="w-6 h-6 flex items-center justify-center">
                  <div className={`w-1.5 h-1.5 rounded-full ${task.color.replace('bg-', 'bg-')}`} />
                </div>
              )}
              
              {task.isMilestone ? (
                <Milestone size={14} className="text-amber-600 flex-shrink-0" />
              ) : null}

              <span className={`text-sm truncate flex-grow ${task.isMilestone ? 'font-bold' : ''}`}>
                {task.title || 'Untitled Task'}
              </span>

              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                <button onClick={() => handleAddTask(task.id)} className="p-1 hover:text-blue-600" title={t('addSubtask')}>
                  <Plus size={14} />
                </button>
                <button onClick={() => handleEditTask(task)} className="p-1 hover:text-amber-600">
                  <Edit2 size={14} />
                </button>
                <button onClick={() => handleCopyTask(task)} className="p-1 hover:text-indigo-600">
                  <Copy size={14} />
                </button>
                <button onClick={() => handleDeleteTask(task.id)} className="p-1 hover:text-rose-600">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Right Area - Gantt Timeline Bar */}
          <div className="flex-grow relative h-10 overflow-hidden flex items-center min-w-max">
            {/* Grid Lines */}
            <div className="absolute inset-0 flex">
              {days.map((day, idx) => (
                <div 
                  key={idx} 
                  className={`flex-shrink-0 border-r border-slate-100 h-full ${isWeekend(day) ? 'bg-slate-50/50' : ''} ${isSameDay(day, new Date()) ? 'bg-indigo-50/30' : ''}`}
                  style={{ width: `${zoomLevel}px` }}
                />
              ))}
            </div>

            {/* Task Bar */}
            {!task.isMilestone && (
              <div 
                className={`absolute h-7 rounded-lg shadow-sm flex items-center justify-center text-[10px] text-white font-bold group/bar cursor-pointer overflow-hidden ${task.color}`}
                style={{
                  left: `${differenceInDays(new Date(task.startDate), timelineInterval.start) * zoomLevel}px`,
                  width: `${(differenceInDays(new Date(task.endDate), new Date(task.startDate)) + 1) * zoomLevel}px`
                }}
                onMouseDown={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const isResize = rect.width - x < 10; // 10px handle on right
                  
                  setInteractingTask({
                    id: task.id,
                    type: isResize ? 'resize' : 'drag',
                    startX: e.clientX,
                    originalStartDate: task.startDate,
                    originalEndDate: task.endDate
                  });
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  // Prevent click if we were just dragging
                  if (interactingTask) return;
                  handleEditTask(task);
                }}
              >
                {/* Resize handle visual hint */}
                <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/20 group-hover/bar:bg-white/40 cursor-ew-resize opacity-0 group-hover/bar:opacity-100" />
                
                {/* Progress Overlay */}
                <div 
                  className="absolute left-0 top-0 bottom-0 bg-black/15 group-hover/bar:bg-black/25 transition-colors"
                  style={{ width: `${task.progress}%` }}
                />

                <span className="relative z-10 px-2 truncate drop-shadow-sm">
                   {task.progress > 0 && `${task.progress}%`}
                   {task.workload && typeof task.workload === 'object' && Object.values(task.workload).some(v => (v as number) > 0) && (
                     <span className="ml-1 opacity-80 decoration-white/30 underline underline-offset-2">
                       {Object.values(task.workload).reduce((a, b) => (a as number) + (b as number), 0)}h
                     </span>
                   )}
                </span>
                
                {/* Avatars INSIDE OR OUTSIDE the bar depending on width */}
                <div className="absolute right-1 flex -space-x-1 z-10">
                   {task.assignedTo?.slice(0, 3).map((uid: string) => {
                     const u = state.users.find(usr => usr.id === uid);
                     return (
                       <div 
                        key={uid} 
                        className="w-5 h-5 rounded-full bg-white flex items-center justify-center text-[8px] font-bold text-slate-800 border border-slate-200/50 shadow-sm transition-transform hover:scale-110 hover:z-20"
                        title={u?.name}
                       >
                         {u?.name.charAt(0)}
                       </div>
                     );
                   })}
                </div>

                {/* Info Tooltip on hover */}
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-[60] bg-slate-900/95 backdrop-blur text-white p-3 rounded-xl shadow-2xl hidden group-hover/bar:block border border-white/10 min-w-40">
                   <div className="flex justify-between items-start gap-4 mb-1">
                      <p className="text-sm font-bold truncate pr-4">{task.title}</p>
                      <div className={`px-1.5 py-0.5 rounded text-[8px] uppercase ${task.color}`}>Task</div>
                   </div>
                   <p className="text-[10px] text-indigo-300 font-mono mb-2">
                      {format(new Date(task.startDate), 'dd MMM')} - {format(new Date(task.endDate), 'dd MMM')}
                    </p>
                   {task.assignedTo.length > 0 && (
                     <div className="pt-2 border-t border-white/10 space-y-1">
                       <p className="text-[8px] uppercase tracking-wider text-slate-400 font-bold">{t('assignedTo')}</p>
                       <div className="flex flex-wrap gap-1">
                          {task.assignedTo.map(uid => (
                            <span key={uid} className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-slate-200">
                              {state.users.find(u => u.id === uid)?.name}
                            </span>
                          ))}
                       </div>
                     </div>
                   )}
                   {task.progress > 0 && (
                     <div className="mt-2">
                        <div className="flex justify-between text-[8px] font-bold uppercase text-slate-400 mb-1">
                          <span>{t('completion')}</span>
                          <span>{task.progress}%</span>
                        </div>
                        <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500" style={{ width: `${task.progress}%` }} />
                        </div>
                     </div>
                   )}
                </div>
              </div>
            )}

            {/* Milestone Diamond */}
            {task.isMilestone && (
              <div 
                className="absolute flex flex-col items-center justify-center z-10 cursor-pointer group/ms px-2 py-1"
                style={{
                  left: `${differenceInDays(new Date(task.startDate), timelineInterval.start) * zoomLevel}px`,
                  transform: 'translateX(-50%)'
                }}
                onClick={() => handleEditTask(task)}
              >
                <div className={`w-4 h-4 bg-amber-600 rotate-45 shadow-lg border-2 border-white transition-transform group-hover/ms:scale-125 group-hover/ms:rotate-90 group-hover/ms:bg-amber-500`} />
                <span className="mt-1 text-[8px] font-bold text-slate-500 whitespace-nowrap bg-white/80 rounded px-1 group-hover/ms:text-amber-600">
                  {task.title}
                </span>
                
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-[60] bg-amber-900/95 backdrop-blur text-white p-3 rounded-xl shadow-2xl hidden group-hover/ms:block border border-amber-500/20 whitespace-nowrap">
                   <div className="flex items-center gap-2">
                      <Milestone size={14} className="text-amber-400" />
                      <p className="text-xs font-bold">{task.title}</p>
                   </div>
                   <p className="text-[10px] text-amber-200 mt-1 font-mono">
                      {format(new Date(task.startDate), 'dd MMMM yyyy', { locale: language === 'pt-BR' ? ptBR : undefined })}
                   </p>
                </div>
              </div>
            )}
          </div>
        </div>


        {/* Render Children Recursively */}
        {hasChildren && isExpanded && (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              {task.children.map((child: any) => renderTaskRow(child, depth + 1))}
            </motion.div>
          </AnimatePresence>
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50/50">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Lock className="text-indigo-600" size={24} />
            {t('ganttNexus')}
          </h2>
          
          <div className="flex items-center bg-slate-200 rounded-lg p-1">
            <button 
              onClick={() => setViewMode('week')}
              className={`px-3 py-1 text-sm rounded ${viewMode === 'week' ? 'bg-white shadow-sm font-medium' : 'text-slate-600 hover:bg-slate-300'}`}
            >
              {t('weekdays')}
            </button>
            <button 
              onClick={() => setViewMode('month')}
              className={`px-3 py-1 text-sm rounded ${viewMode === 'month' ? 'bg-white shadow-sm font-medium' : 'text-slate-600 hover:bg-slate-300'}`}
            >
              {t('thisMonth')}
            </button>
          </div>

          <button 
            onClick={() => setShowOnlyMyTasks(!showOnlyMyTasks)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border font-medium transition-all ${
              showOnlyMyTasks 
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' 
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <User size={14} />
            {t('myTasks')}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-slate-500 font-medium">{t('tasks')}:</span>
              <span className="text-slate-900 font-bold">{state.ganttTasks.length}</span>
            </div>
            <div className="flex items-center gap-1.5 border-l border-slate-200 pl-4">
              <Clock className="text-indigo-500" size={14} />
              <span className="text-slate-500 font-medium">{t('investmentCost')}:</span>
              <span className="text-slate-900 font-bold">
                {state.ganttTasks.reduce((acc, t) => {
                  if (typeof t.workload === 'object' && t.workload !== null) {
                    return acc + Object.values(t.workload).reduce((a: number, b) => a + (b as number), 0);
                  }
                  return acc + ((t.workload as number) || 0);
                }, 0)}h
              </span>
            </div>
          </div>

          <div className="flex items-center bg-white border border-slate-300 rounded-lg shadow-sm">
            <button 
              onClick={() => setCurrentDate(viewMode === 'week' ? subWeeks(currentDate, 2) : subMonths(currentDate, 1))}
              className="p-2 hover:bg-slate-100 text-slate-600"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="px-4 py-1 text-sm font-medium border-x border-slate-200">
              {format(currentDate, viewMode === 'week' ? "MMM yyyy" : "MMMM yyyy", { locale: language === 'pt-BR' ? ptBR : undefined })}
            </div>
            <button 
              onClick={() => setCurrentDate(viewMode === 'week' ? addWeeks(currentDate, 2) : addMonths(currentDate, 1))}
              className="p-2 hover:bg-slate-100 text-slate-600"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <button 
            onClick={() => handleAddTask(null)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-100"
          >
            <Plus size={18} />
            {t('addTask')}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-grow overflow-auto relative">
        {/* Timeline Header Row */}
        <div className="sticky top-0 z-40 bg-white border-b border-slate-300 flex">
          <div className="flex-shrink-0 w-80 border-r border-slate-300 bg-slate-50 p-3 font-bold text-slate-700 text-sm">
            {t('ganttColumns')}
          </div>
          <div className="flex-grow flex overflow-hidden">
            {days.map((day, idx) => (
              <div 
                key={idx} 
                className={`flex-shrink-0 border-r border-slate-200 flex flex-col items-center justify-center transition-colors ${isSameDay(day, new Date()) ? 'bg-indigo-50 border-indigo-200' : isWeekend(day) ? 'bg-slate-50' : ''}`}
                style={{ width: `${zoomLevel}px` }}
              >
                <div className="text-[9px] uppercase font-bold text-slate-400">
                  {format(day, 'EEE', { locale: language === 'pt-BR' ? ptBR : undefined }).substring(0, 1)}
                </div>
                <div className={`text-[10px] font-bold ${isSameDay(day, new Date()) ? 'text-indigo-600' : 'text-slate-600'}`}>
                  {format(day, 'd')}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Task Rows */}
        <div className="relative min-w-max">
          <svg className="absolute inset-0 z-0 pointer-events-none w-full h-full min-h-screen">
             <defs>
               <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                 <path d="M 0 0 L 10 5 L 0 10 z" className="fill-slate-300" />
               </marker>
             </defs>
             {state.ganttTasks.map(task => {
                if (!task.dependencies || task.dependencies.length === 0) return null;
                return task.dependencies.map(depId => {
                  const pred = state.ganttTasks.find(t => t.id === depId);
                  if (!pred) return null;
                  const predIndex = state.ganttTasks.indexOf(pred);
                  const taskIndex = state.ganttTasks.indexOf(task);
                  if (predIndex === -1 || taskIndex === -1) return null;
                  const ROW_HEIGHT = 41;
                  const x1 = (differenceInDays(new Date(pred.endDate), timelineInterval.start) + 1) * zoomLevel;
                  const y1 = predIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
                  const x2 = differenceInDays(new Date(task.startDate), timelineInterval.start) * zoomLevel;
                  const y2 = taskIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
                  const midX = x1 + (x2 - x1) / 2;
                  return (
                    <path key={`${pred.id}-${task.id}`} d={`M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`} className="stroke-slate-300 fill-none stroke-[1.5]" markerEnd="url(#arrow)" />
                  );
                });
             })}
          </svg>
          {/* Today Line */}
          <div 
            className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-[15] shadow-[0_0_8px_rgba(244,63,94,0.5)] pointer-events-none"
            style={{
              left: `${todayLeft}px`
            }}
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-rose-500 text-white text-[8px] font-black px-1 py-0.5 rounded-b uppercase tracking-tighter">
              Today
            </div>
          </div>

          {rootTasks.length > 0 ? (
            rootTasks.map(task => renderTaskRow(task))
          ) : (
            <div className="flex flex-col items-center justify-center p-20 text-slate-400 gap-4">
              <Calendar size={48} className="opacity-20" />
              <p>{t('noData')}</p>
              <button 
                onClick={() => handleAddTask(null)}
                className="text-indigo-600 hover:underline font-medium"
              >
                + {t('addTask')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Task Creation/Editing Modal */}
      <GanttTaskModal 
        isOpen={isModalOpen}
        task={editingTask || {} as GanttTask}
        onClose={() => {
          setIsModalOpen(false);
          setEditingTask(null);
        }}
        onSave={handleSaveTask}
        users={state.users}
        allTasks={state.ganttTasks}
        t={t}
      />
    </div>
  );
};

interface ModalProps {
  isOpen: boolean;
  task: GanttTask;
  onClose: () => void;
  onSave: (task: GanttTask) => void;
  users: AppUser[];
  allTasks: GanttTask[];
  t: (key: string) => string;
}

const GanttTaskModal: React.FC<ModalProps> = ({ isOpen, task, onClose, onSave, users, allTasks, t }) => {
  const [formData, setFormData] = useState<GanttTask>(task);

  useEffect(() => {
    if (isOpen) setFormData({ ...task });
  }, [isOpen, task]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-50/30">
          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            {formData.isMilestone ? <Milestone className="text-amber-600" /> : <Edit2 className="text-indigo-600" />}
            {task.id && allTasks.find(at => at.id === task.id) ? t('edit') : t('addTask')}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <MoreVertical size={20} className="rotate-45" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Title & Description */}
            <div className="md:col-span-2 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">{t('topic')}</label>
                <input 
                  type="text" 
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                  placeholder="Task title..."
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">{t('description')}</label>
                <textarea 
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 transition-all outline-none h-24"
                  placeholder="Details about this task..."
                />
              </div>
            </div>

            {/* Dates */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">{t('start')}</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 text-slate-400" size={16} />
                <input 
                  type="date" 
                  value={formData.startDate}
                  onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">{t('end')}</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 text-slate-400" size={16} />
                <input 
                  type="date" 
                  value={formData.endDate}
                  onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* Color & Milestone */}
            <div className="space-y-4">
               <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">{t('colors')}</label>
                  <div className="flex flex-wrap gap-2">
                    {COLORS.map(c => (
                      <button 
                        key={c}
                        onClick={() => setFormData({ ...formData, color: c })}
                        className={`w-6 h-6 rounded-full ${c} ${formData.color === c ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : ''} transition-all`}
                      />
                    ))}
                  </div>
               </div>
               <label className="flex items-center gap-2 cursor-pointer group">
                 <input 
                  type="checkbox" 
                  checked={formData.isMilestone}
                  onChange={e => setFormData({ ...formData, isMilestone: e.target.checked })}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                 />
                 <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600">{t('milestone')}</span>
               </label>
            </div>

            {/* Progress */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">{t('productivity')}: {formData.progress}%</label>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={formData.progress}
                onChange={e => setFormData({ ...formData, progress: parseInt(e.target.value) })}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
            </div>

            {/* Dependencies */}
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                 <Lock size={16} className="text-indigo-600" />
                 {t('dependencies')} (Predecessors)
              </label>
              <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg min-h-[60px] max-h-40 overflow-y-auto">
                {allTasks.filter(at => at.id !== formData.id).map(at => {
                  const isSelected = formData.dependencies?.includes(at.id);
                  return (
                    <button
                      key={at.id}
                      onClick={() => {
                        const deps = formData.dependencies || [];
                        const nextDeps = isSelected ? deps.filter(id => id !== at.id) : [...deps, at.id];
                        setFormData({ ...formData, dependencies: nextDeps });
                      }}
                      className={`px-3 py-1 text-xs rounded-full border transition-all ${
                        isSelected 
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' 
                          : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'
                      }`}
                    >
                      {at.title || 'Untitled'}
                    </button>
                  );
                })}
                {allTasks.filter(at => at.id !== formData.id).length === 0 && (
                  <p className="text-xs text-slate-400 italic">No other tasks available for dependencies.</p>
                )}
              </div>
            </div>

            {/* Workload */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">{t('investmentCost')} (Horas)</label>
              <div className="relative">
                <Clock className="absolute left-3 top-2.5 text-slate-400" size={16} />
                <input 
                  type="number" 
                  value={formData.workload || 0}
                  onChange={e => setFormData({ ...formData, workload: parseFloat(e.target.value) || 0 })}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ex: 40"
                />
              </div>
            </div>

            {/* Users */}
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-2">{t('dedicatedPeople')}</label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border border-slate-200 rounded-lg bg-slate-50">
                {users.map(u => (
                  <button 
                    key={u.id}
                    onClick={() => {
                      const current = new Set(formData.assignedTo);
                      if (current.has(u.id)) current.delete(u.id);
                      else current.add(u.id);
                      setFormData({ ...formData, assignedTo: Array.from(current) });
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                      formData.assignedTo.includes(u.id)
                        ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-200'
                        : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Workload / Time Allocation */}
            <div className="md:col-span-2 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
               <h4 className="text-sm font-bold text-indigo-900 mb-3 flex items-center gap-2">
                 <Clock size={16} />
                 {t('investmentCost')} (Horas por Colaborador)
               </h4>
               <div className="space-y-3">
                 {formData.assignedTo.length > 0 ? (
                   formData.assignedTo.map(uid => (
                     <div key={uid} className="flex items-center gap-4 bg-white p-2 rounded-lg border border-indigo-100 shadow-sm">
                       <div className="flex items-center gap-2 flex-grow">
                         <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600">
                           {users.find(u => u.id === uid)?.name.charAt(0)}
                         </div>
                         <span className="text-sm text-slate-700 truncate">{users.find(u => u.id === uid)?.name}</span>
                       </div>
                       <div className="flex items-center gap-2">
                         <input 
                           type="number"
                           placeholder="0"
                           className="w-20 px-2 py-1.5 rounded border border-slate-300 text-sm outline-none focus:ring-1 focus:ring-indigo-500 text-center"
                           value={(formData.workload as any)?.[uid] || ''}
                           onChange={e => {
                             const val = parseFloat(e.target.value) || 0;
                             const currentWorkload = typeof formData.workload === 'object' && formData.workload !== null ? formData.workload : {};
                             setFormData({
                               ...formData,
                               workload: {
                                 ...currentWorkload,
                                 [uid]: val
                               } as any
                             });
                           }}
                         />
                         <span className="text-xs text-slate-500 font-medium whitespace-nowrap">h</span>
                       </div>
                     </div>
                   ))
                 ) : (
                   <div className="text-center py-4 border-2 border-dashed border-indigo-100 rounded-lg">
                      <p className="text-xs text-slate-400 italic">{t('noData')} - Selecione colaboradores acima para alocar horas.</p>
                   </div>
                 )}
               </div>
            </div>

            {/* Reports */}
            <div className="md:col-span-2">
               <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                 <FileText size={16} className="text-slate-400" />
                 {t('reports')} / Restrições de Tempo
               </label>
               <textarea 
                  value={formData.reports || ''}
                  onChange={e => setFormData({ ...formData, reports: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 transition-all outline-none h-28 text-sm"
                  placeholder="Descreva o escopo, restrições de tempo ou relatórios de progresso..."
               />
            </div>

            {/* Attachments */}
            <div className="md:col-span-2">
               <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                 <Paperclip size={16} className="text-slate-400" />
                 {t('attachments')}
               </label>
               <div className="space-y-2">
                 <div className="flex flex-wrap gap-2">
                   {formData.attachments?.map(att => (
                     <div key={att.id} className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-lg text-xs group">
                       <span className="max-w-[150px] truncate">{att.name}</span>
                       <button 
                        onClick={() => {
                          setFormData({
                            ...formData,
                            attachments: formData.attachments.filter(a => a.id !== att.id)
                          });
                        }}
                        className="text-slate-400 hover:text-rose-600"
                       >
                        <Trash2 size={12} />
                       </button>
                     </div>
                   ))}
                 </div>
                 <button 
                  onClick={() => {
                    const name = prompt("Enter file name (simulated upload):");
                    if (name) {
                      const newAtt: GanttAttachment = {
                        id: crypto.randomUUID(),
                        name,
                        url: "#",
                        type: "file",
                        uploadedAt: new Date().toISOString()
                      };
                      setFormData({
                        ...formData,
                        attachments: [...(formData.attachments || []), newAtt]
                      });
                    }
                  }}
                  className="text-xs text-indigo-600 hover:underline flex items-center gap-1 font-medium"
                 >
                   <Plus size={14} />
                   {t('addTask')} (Simulated)
                 </button>
               </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            {t('cancel')}
          </button>
          <button 
            onClick={() => onSave(formData)}
            disabled={!formData.title}
            className="bg-indigo-600 text-white px-8 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed font-bold"
          >
            {t('save')}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
