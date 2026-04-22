import React from 'react';
import { 
  Plus, 
  MoreHorizontal, 
  ChevronUp,
  User, 
  User as UserIcon,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Lock,
  ArrowRight,
  MoreVertical,
  Clock,
  ChevronDown,
  Tag
} from 'lucide-react';
import { 
  DndContext, 
  DragOverlay, 
  closestCorners, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AppState, GanttTask, GanttTaskStatus, TaskPriority } from '../../types';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { updateGanttTask, addGanttTask } from '../../services/storageService';

interface KanbanViewProps {
  state: AppState;
  onUpdateState: (newState: AppState) => void;
}

const STATUS_COLUMNS = [
  { id: GanttTaskStatus.TODO, label: 'ABERTO', color: 'bg-slate-100 text-slate-500' },
  { id: GanttTaskStatus.IN_PROGRESS, label: 'EM PROJETO', color: 'bg-amber-100 text-amber-600' },
  { id: GanttTaskStatus.DONE, label: 'FEITO', color: 'bg-blue-100 text-blue-600' },
  { id: GanttTaskStatus.CLOSED, label: 'FECHADO', color: 'bg-emerald-100 text-emerald-600' }
];

export const KanbanView: React.FC<KanbanViewProps> = ({ state, onUpdateState }) => {
  const [activeTask, setActiveTask] = React.useState<GanttTask | null>(null);
  const [inlineAdding, setInlineAdding] = React.useState<GanttTaskStatus | null>(null);
  const [newTitle, setNewTitle] = React.useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleAddTask = async (status: GanttTaskStatus) => {
    if (!newTitle.trim()) return;
    const newTask: GanttTask = {
      id: crypto.randomUUID(),
      title: newTitle,
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
      color: 'bg-blue-500',
      isMilestone: false,
      assignedTo: [],
      progress: 0,
      status: status,
      priority: TaskPriority.MEDIUM,
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      order: state.ganttTasks.length
    };
    try {
      const newState = await addGanttTask(newTask);
      onUpdateState(newState);
      setInlineAdding(null);
      setNewTitle('');
    } catch (error) { console.error(error); }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = state.ganttTasks.find(t => t.id === active.id);
    if (task) setActiveTask(task);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    // Find if we are hovering over a column or a task
    const isOverColumn = STATUS_COLUMNS.some(c => c.id === overId);
    
    if (isOverColumn) {
       const task = state.ganttTasks.find(t => t.id === activeId);
       if (task && task.status !== overId) {
          moveTask(task.id, overId as GanttTaskStatus);
       }
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    const task = state.ganttTasks.find(t => t.id === activeId);
    if (!task) return;

    const newStatus = STATUS_COLUMNS.find(c => c.id === overId) 
      ? (overId as GanttTaskStatus)
      : (state.ganttTasks.find(t => t.id === overId)?.status as GanttTaskStatus);

    if (task.status !== newStatus) {
       // Optimistic update
       const updatedTask = { ...task, status: newStatus, updatedAt: new Date().toISOString() };
       const optimisticTasks = state.ganttTasks.map(t => t.id === activeId ? updatedTask : t);
       onUpdateState({ ...state, ganttTasks: optimisticTasks });

       try {
         const newState = await updateGanttTask(updatedTask);
         onUpdateState(newState);
       } catch (error) {
         console.error(error);
         // Rollback on error
         onUpdateState(state);
       }
    }
  };

  const moveTask = (taskId: string, newStatus: GanttTaskStatus) => {
     // Optimistic local update before server call if needed, 
     // but here we just rely on handleDragEnd for the final persistence
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full bg-[#f8fafc] overflow-x-auto p-6 flex gap-6 select-none">
        {STATUS_COLUMNS.map(col => {
          const columnTasks = state.ganttTasks.filter(t => t.status === col.id);
          
          return (
            <KanbanColumn 
              key={col.id} 
              column={col} 
              tasks={columnTasks} 
              onAddInline={() => setInlineAdding(col.id)}
              isAdding={inlineAdding === col.id}
              newTitle={newTitle}
              setNewTitle={setNewTitle}
              onSaveAdd={() => handleAddTask(col.id)}
              onCancelAdd={() => setInlineAdding(null)}
              users={state.users}
            />
          );
        })}
      </div>

      <DragOverlay>
        {activeTask ? (
          <KanbanCard task={activeTask} users={state.users} isOverlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

const KanbanColumn = ({ column, tasks, onAddInline, isAdding, newTitle, setNewTitle, onSaveAdd, onCancelAdd, users }: any) => {
  return (
    <div className="flex-shrink-0 w-80 flex flex-col gap-4">
      {/* Column Header */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <h3 className={`text-[11px] font-black px-2 py-1 rounded shadow-sm tracking-wider ${column.color}`}>
            {column.label}
          </h3>
          <span className="text-slate-400 text-xs font-bold">{tasks.length}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          <ChevronUp size={16} />
          <Plus size={16} className="cursor-pointer hover:text-slate-600" onClick={onAddInline} />
          <MoreHorizontal size={16} />
        </div>
      </div>

      <SortableContext 
        id={column.id}
        items={tasks.map((t: any) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex-grow space-y-4 overflow-y-auto no-scrollbar min-h-[100px]">
          {isAdding && (
            <div className="bg-white rounded-lg border-2 border-blue-400 p-4 shadow-md transition-all">
              <input 
                autoFocus
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') onSaveAdd();
                  if (e.key === 'Escape') onCancelAdd();
                }}
                placeholder="Nome da tarefa..."
                className="w-full text-sm font-bold text-slate-700 outline-none mb-3"
              />
              <div className="flex justify-end gap-2">
                <button onClick={onCancelAdd} className="px-3 py-1 text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase">Cancelar</button>
                <button onClick={onSaveAdd} className="px-3 py-1 bg-blue-600 text-white rounded text-[10px] font-bold uppercase shadow-sm">Adicionar</button>
              </div>
            </div>
          )}

          {tasks.map((task: any) => (
            <KanbanCard key={task.id} task={task} users={users} />
          ))}
          
          <button 
            onClick={onAddInline}
            className="w-full py-4 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 flex items-center justify-center gap-2 hover:border-slate-300 hover:text-slate-500 transition-all text-sm font-medium"
          >
            <Plus size={16} /> Adicionar uma tarefa
          </button>
        </div>
      </SortableContext>
    </div>
  );
};

const KanbanCard = ({ task, users, isOverlay = false }: { task: GanttTask, users: any[], isOverlay?: boolean, key?: any }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const getPriorityLabel = (p: TaskPriority) => {
    switch(p) {
      case TaskPriority.LOW: return 'BAIXA';
      case TaskPriority.MEDIUM: return 'MÉDIO';
      case TaskPriority.HIGH: return 'ALTA';
      case TaskPriority.URGENT: return 'URGENTE';
      default: return p;
    }
  };

  const getPriorityColor = (p: TaskPriority) => {
    switch(p) {
      case TaskPriority.LOW: return 'text-slate-400';
      case TaskPriority.MEDIUM: return 'text-slate-500';
      case TaskPriority.HIGH: return 'text-amber-500';
      case TaskPriority.URGENT: return 'text-rose-500';
      default: return 'text-slate-400';
    }
  };

  return (
    <div 
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-lg transition-all group relative cursor-grab active:cursor-grabbing border-b-4 ${isOverlay ? 'shadow-2xl ring-2 ring-blue-500 rotate-2' : ''}`}
      style={{ ...style, borderBottomColor: task.color || '#3b82f6' }}
    >
      {/* Category and more icon */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-400 border border-slate-100">
          <Tag size={10} className="text-slate-300" />
          {task.category || 'Nexus'}
        </div>
        <MoreVertical size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Title */}
      <h4 className="text-sm font-bold text-slate-800 leading-snug mb-4 group-hover:text-blue-600 transition-colors">
        {task.title}
      </h4>

      {/* Bottom section */}
      <div className="flex items-center justify-between mt-auto">
        <div className="flex flex-col gap-1.5">
            <div className={`flex items-center gap-1 text-[9px] font-black tracking-widest ${getPriorityColor(task.priority)}`}>
                <ChevronUp size={10} className="stroke-[3]" />
                {getPriorityLabel(task.priority)}
            </div>
            <div className="text-[10px] font-bold text-slate-400 flex items-center gap-2">
                <Calendar size={12} className="text-slate-300" />
                {task.endDate ? format(new Date(task.endDate), 'dd MMM', { locale: ptBR }) : '-- ---'}
            </div>
        </div>

        <div className="flex -space-x-2">
          {task.assignedTo?.length > 0 ? (
            task.assignedTo?.map((uid: string) => {
              const u = users.find(usr => usr.id === uid);
              return (
                 <div 
                  key={uid} 
                  className="w-7 h-7 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-black text-slate-600 shadow-sm overflow-hidden"
                  title={u?.name}
                 >
                    {u?.avatar ? <img src={u.avatar} className="w-full h-full object-cover" /> : u?.name.charAt(0)}
                 </div>
              );
            })
          ) : (
            <div className="w-7 h-7 rounded-full bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300">
               <UserIcon size={12} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
