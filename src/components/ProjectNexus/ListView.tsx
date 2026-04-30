import React from 'react';
import { 
  Plus, 
  MoreVertical, 
  User, 
  ArrowUpDown,
  Search,
  Filter,
  Download,
  LayoutGrid,
  Group,
  AlignLeft
} from 'lucide-react';
import { AppState, GanttTask, GanttTaskStatus, TaskPriority } from '../../types';
import { format, addDays, isValid } from 'date-fns';
import { addGanttTask, updateGanttTask, deleteGanttTask } from '../../services/storageService';

interface ListViewProps {
  state: AppState;
  onUpdateState: (newState: AppState) => void;
  onRefresh?: () => void;
  onEditTask?: (task: GanttTask) => void;
}

export const ListView: React.FC<ListViewProps> = ({ state, onUpdateState, onRefresh, onEditTask }) => {
  const [inlineAdding, setInlineAdding] = React.useState<boolean>(false);
  const [newTitle, setNewTitle] = React.useState('');
  const [menuTaskId, setMenuTaskId] = React.useState<string | null>(null);
  const [statusPickerOpenId, setStatusPickerOpenId] = React.useState<string | null>(null);

  const safeFormat = (dateStr: string, formatStr: string) => {
    try {
      const d = new Date(dateStr);
      if (!isValid(d)) return '--/--/----';
      return format(d, formatStr);
    } catch(e) {
      return '--/--/----';
    }
  };

  const handleAddTask = async () => {
    if (!newTitle.trim()) return;
    const newTask: GanttTask = {
      id: crypto.randomUUID(),
      title: newTitle,
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
      color: '#3b82f6',
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
    try {
      const newState = await addGanttTask(newTask);
      onUpdateState(newState);
      setInlineAdding(false);
      setNewTitle('');
    } catch (error) { console.error(error); alert("Erro ao salvar tarefa."); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta tarefa?")) return;
    try {
      const newState = await deleteGanttTask(id);
      onUpdateState(newState);
      setMenuTaskId(null);
    } catch (error) { console.error(error); alert("Erro ao excluir."); }
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

  const getStatusColor = (status: GanttTaskStatus) => {
    switch (status) {
      case GanttTaskStatus.TODO: return 'bg-slate-400';
      case GanttTaskStatus.IN_PROGRESS: return 'bg-amber-500';
      case GanttTaskStatus.DONE: return 'bg-cyan-500';
      case GanttTaskStatus.CLOSED: return 'bg-emerald-500';
      default: return 'bg-slate-400';
    }
  };

  return (
    <div className="h-full bg-white dark:bg-black flex flex-col overflow-hidden">
      {/* List Toolbar */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-black">
        <div className="flex items-center gap-2">
           <button 
            onClick={() => setInlineAdding(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-bold shadow-md hover:bg-blue-700 transition-all"
           >
             <Plus size={16} /> Adicionar
           </button>
           <button className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500 dark:text-slate-400 transition-colors">
              <ChevronDown size={18} />
           </button>
        </div>

        <div className="flex items-center gap-6">
           <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer transition-colors">
              <Group size={16} />
              <span className="text-xs font-bold">Campos</span>
           </div>
           <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer transition-colors">
              <Filter size={16} />
              <span className="text-xs font-bold">Filtro</span>
           </div>
           <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer transition-colors">
              <Download size={16} />
              <span className="text-xs font-bold">Exportar</span>
           </div>
           <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer transition-colors border border-slate-300 dark:border-slate-700 rounded px-2 py-1">
              <span className="text-xs font-bold">Visualização</span>
              <ChevronDown size={14} />
           </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-grow overflow-auto lg:overflow-visible">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-10">
            <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-black tracking-widest bg-slate-50 dark:bg-slate-900">
              <th className="px-6 py-3 font-black">#</th>
              <th className="px-6 py-3 font-black">Nome de tarefa</th>
              <th className="px-6 py-3 font-black">Data de início</th>
              <th className="px-6 py-3 font-black">Atribuído</th>
              <th className="px-6 py-3 font-black">Estado</th>
              <th className="px-6 py-3 font-black text-right">Registro de tempo</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium bg-white dark:bg-black">
            {inlineAdding && (
              <tr className="bg-blue-50/30">
                <td className="px-6 py-3 text-xs text-slate-400">*</td>
                <td className="px-6 py-3" colSpan={5}>
                  <div className="flex items-center gap-2">
                    <input 
                      autoFocus
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddTask();
                        if (e.key === 'Escape') setInlineAdding(false);
                      }}
                      placeholder="Nome da tarefa..."
                      className="w-full text-sm font-bold text-slate-700 outline-none bg-transparent"
                    />
                    <button onClick={handleAddTask} className="px-3 py-1 bg-blue-600 text-white rounded text-[10px] font-bold uppercase shadow-sm">Salvar</button>
                    <button onClick={() => setInlineAdding(false)} className="px-3 py-1 text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase">Cancelar</button>
                  </div>
                </td>
                <td className="px-4 py-3"></td>
              </tr>
            )}
            {state.ganttTasks.map((task, idx) => (
              <tr 
                key={task.id} 
                className={`hover:bg-slate-50/80 dark:hover:bg-slate-800 transition-colors group bg-white dark:bg-black relative cursor-pointer ${(statusPickerOpenId === task.id || menuTaskId === task.id) ? 'z-[50]' : 'z-0'}`}
                onClick={() => onEditTask?.(task)}
                style={{ zIndex: (statusPickerOpenId === task.id || menuTaskId === task.id) ? 50 : (idx === state.ganttTasks.length - 1 ? 1 : 0) }}
              >
                <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-600">{idx + 1}</td>
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-700 dark:text-slate-100 font-bold">{task.title}</span>
                    {task.reports && (
                      <AlignLeft size={12} className="text-blue-500 flex-shrink-0" title="Possui anotações" />
                    )}
                  </div>
                </td>
                <td className="px-6 py-3 text-sm text-slate-600 dark:text-slate-400">
                  {safeFormat(task.startDate, 'dd/MM/yyyy')}
                </td>
                <td className="px-6 py-3">
                  <div className="flex items-center -space-x-2">
                    {task.assignedTo.length > 0 ? task.assignedTo.map(uid => {
                      const u = state.users.find(usr => usr.id === uid);
                      return (
                        <div key={uid} className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 border border-white dark:border-slate-700 flex items-center justify-center text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase" title={u?.name || uid}>
                          {(u?.name || uid).charAt(0)}
                        </div>
                      )
                    }) : <div className="text-slate-300 dark:text-slate-700 text-[10px]">Não atribuído</div>}
                  </div>
                </td>
                <td className="px-6 py-3">
                  <div 
                    onClick={(e) => e.stopPropagation()}
                    className="relative"
                  >
                    <StatusPicker 
                      status={task.status} 
                      onUpdate={async (s) => {
                        const updatedTask = { ...task, status: s, updatedAt: new Date().toISOString() };
                        const newState = await updateGanttTask(updatedTask);
                        onUpdateState(newState);
                      }}
                      onOpenChange={(open) => setStatusPickerOpenId(open ? task.id : null)}
                    />
                  </div>
                </td>
                <td className="px-6 py-3 text-sm text-slate-700 dark:text-slate-300 text-right font-mono">
                  {Object.values(task.workload || {}).reduce((a: any, b: any) => (a as number) + (b as number), 0)}
                </td>
                <td className="px-4 py-3 relative">
                   <button 
                    onClick={(e) => { 
                      e.stopPropagation();
                      setMenuTaskId(menuTaskId === task.id ? null : task.id);
                    }}
                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-300 dark:text-slate-700 hover:text-slate-600 dark:hover:text-slate-400 transition-colors"
                   >
                      <MoreVertical size={16} />
                   </button>
                   {menuTaskId === task.id && (
                     <div 
                       onClick={(e) => e.stopPropagation()}
                       className="absolute right-full mr-2 top-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded shadow-xl z-50 w-32 py-1 overflow-hidden animate-in fade-in zoom-in duration-200"
                     >
                        <button 
                          onClick={() => { onEditTask?.(task); setMenuTaskId(null); }}
                          className="w-full text-left px-3 py-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-800"
                        >
                          EDITAR
                        </button>
                        <button 
                          onClick={() => handleDelete(task.id)}
                          className="w-full text-left px-3 py-1.5 text-[10px] font-bold text-red-600 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          EXCLUIR
                        </button>
                     </div>
                   )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer Add buttons */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex items-center gap-4 bg-white dark:bg-black">
           <button 
            onClick={() => setInlineAdding(true)}
            className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-xs hover:underline"
           >
              <Plus size={14} /> Adicionar uma tarefa
           </button>
           <div className="w-px h-4 bg-slate-200 dark:bg-slate-800" />
           <button className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-xs hover:underline">
              Adicionar um marco
           </button>
        </div>
      </div>
    </div>
  );
};

const StatusPicker = ({ status, onUpdate, onOpenChange }: { status: GanttTaskStatus, onUpdate: (s: GanttTaskStatus) => void, onOpenChange?: (open: boolean) => void }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
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

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-32 bg-white dark:bg-slate-900 rounded shadow-xl border border-slate-200 dark:border-slate-800 py-1 z-50 overflow-hidden">
          {options.map(opt => (
            <button 
              key={opt.id}
              onClick={() => { onUpdate(opt.id); setIsOpen(false); onOpenChange?.(false); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <div className={`w-2 h-2 rounded-full ${opt.color}`} />
              <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const ChevronDown = ({ size, className = "" }: { size: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m6 9 6 6 6-6"/></svg>
);
