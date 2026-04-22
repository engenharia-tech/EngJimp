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
  Group
} from 'lucide-react';
import { AppState, GanttTask, GanttTaskStatus, TaskPriority } from '../../types';
import { format, addDays } from 'date-fns';
import { addGanttTask } from '../../services/storageService';

interface ListViewProps {
  state: AppState;
  onUpdateState: (newState: AppState) => void;
}

export const ListView: React.FC<ListViewProps> = ({ state, onUpdateState }) => {
  const [inlineAdding, setInlineAdding] = React.useState<boolean>(false);
  const [newTitle, setNewTitle] = React.useState('');

  const handleAddTask = async () => {
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
      status: GanttTaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      order: state.ganttTasks.length
    };
    try {
      const newState = await addGanttTask(newTask);
      onUpdateState(newState);
      setInlineAdding(false);
      setNewTitle('');
    } catch (error) { console.error(error); }
  };

  const getStatusLabel = (status: GanttTaskStatus) => {
    switch (status) {
      case GanttTaskStatus.TODO: return 'Aberto';
      case GanttTaskStatus.IN_PROGRESS: return 'Em progresso';
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
    <div className="h-full bg-white flex flex-col overflow-hidden">
      {/* List Toolbar */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-white">
        <div className="flex items-center gap-2">
           <button 
            onClick={() => setInlineAdding(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-bold shadow-md hover:bg-blue-700 transition-all"
           >
             <Plus size={16} /> Adicionar
           </button>
           <button className="p-2 hover:bg-slate-100 rounded text-slate-500 transition-colors">
              <ChevronDown size={18} />
           </button>
        </div>

        <div className="flex items-center gap-6">
           <div className="flex items-center gap-2 text-slate-500 hover:text-slate-700 cursor-pointer transition-colors">
              <Group size={16} />
              <span className="text-xs font-bold">Campos</span>
           </div>
           <div className="flex items-center gap-2 text-slate-500 hover:text-slate-700 cursor-pointer transition-colors">
              <Filter size={16} />
              <span className="text-xs font-bold">Filtro</span>
           </div>
           <div className="flex items-center gap-2 text-slate-500 hover:text-slate-700 cursor-pointer transition-colors">
              <Download size={16} />
              <span className="text-xs font-bold">Exportar</span>
           </div>
           <div className="flex items-center gap-2 text-slate-500 hover:text-slate-700 cursor-pointer transition-colors border border-slate-300 rounded px-2 py-1">
              <span className="text-xs font-bold">Visualização</span>
              <ChevronDown size={14} />
           </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-grow overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px] font-black tracking-widest bg-slate-50">
              <th className="px-6 py-3 font-black">#</th>
              <th className="px-6 py-3 font-black">Nome de tarefa</th>
              <th className="px-6 py-3 font-black">Data de início</th>
              <th className="px-6 py-3 font-black">Atribuído</th>
              <th className="px-6 py-3 font-black">Estado</th>
              <th className="px-6 py-3 font-black text-right">Registro de tempo</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
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
              <tr key={task.id} className="hover:bg-slate-50/80 transition-colors group">
                <td className="px-6 py-3 text-xs text-slate-400">{idx + 1}</td>
                <td className="px-6 py-3 text-sm text-slate-700 font-bold">{task.title}</td>
                <td className="px-6 py-3 text-sm text-slate-600">
                  {format(new Date(task.startDate), 'dd/MM/yyyy')}
                </td>
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2">
                    {task.assignedTo.map(uid => {
                      const u = state.users.find(usr => usr.id === uid);
                      return (
                        <div key={uid} className="flex items-center gap-2 text-xs text-slate-600 font-bold">
                           <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] text-slate-700 border border-white uppercase">
                             {u?.name.charAt(0)}
                           </div>
                           <span className="truncate max-w-[100px]">{u?.name}</span>
                        </div>
                      )
                    })}
                  </div>
                </td>
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${getStatusColor(task.status)}`} />
                    <span className="text-xs text-slate-600 font-bold">{getStatusLabel(task.status)}</span>
                  </div>
                </td>
                <td className="px-6 py-3 text-sm text-slate-700 text-right font-mono">
                  {Object.values(task.workload || {}).reduce((a: any, b: any) => (a as number) + (b as number), 0)}
                </td>
                <td className="px-4 py-3">
                   <button className="p-1 hover:bg-slate-100 rounded text-slate-300 hover:text-slate-600">
                      <MoreVertical size={16} />
                   </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer Add buttons */}
        <div className="p-6 border-t border-slate-100 flex items-center gap-4">
           <button 
            onClick={() => setInlineAdding(true)}
            className="flex items-center gap-2 text-blue-600 font-bold text-xs hover:underline"
           >
              <Plus size={14} /> Adicionar uma tarefa
           </button>
           <div className="w-px h-4 bg-slate-200" />
           <button className="flex items-center gap-2 text-blue-600 font-bold text-xs hover:underline">
              Adicionar um marco
           </button>
        </div>
      </div>
    </div>
  );
};

const ChevronDown = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
);
