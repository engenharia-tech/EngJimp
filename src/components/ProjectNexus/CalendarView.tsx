import React, { useState, useMemo } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Filter, 
  Plus,
  Maximize2
} from 'lucide-react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  isWithinInterval,
  parseISO,
  addDays
} from 'date-fns';
import { AppState, GanttTask, GanttTaskStatus, TaskPriority } from '../../types';
import { ptBR } from 'date-fns/locale';
import { addGanttTask, addAuditLog } from '../../services/storageService';
import { User } from '../../types';

interface CalendarViewProps {
  state: AppState;
  onUpdateState: (newState: AppState) => void;
  currentUser: User;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ state, onUpdateState, currentUser }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isAdding, setIsAdding] = useState<Date | null>(null);
  const [newTitle, setNewTitle] = useState('');

  const handleAddTask = async (date: Date) => {
    if (!newTitle.trim()) return;
    const newTask: GanttTask = {
      id: crypto.randomUUID(),
      title: newTitle,
      startDate: format(date, 'yyyy-MM-dd'),
      endDate: format(addDays(date, 1), 'yyyy-MM-dd'),
      color: 'bg-indigo-500',
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
      setIsAdding(null);
      setNewTitle('');

      // Audit Log
      addAuditLog({
          userId: currentUser.id,
          userName: currentUser.name,
          action: 'CREATE',
          entityType: 'GANTT_TASK',
          entityId: newTask.id,
          entityName: newTask.title,
          details: `Tarefa de Gantt "${newTask.title}" criada (Calendário) por ${currentUser.name}`
      });
    } catch (error) { console.error(error); }
  };

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const weeks = useMemo(() => {
    const w = [];
    for (let i = 0; i < days.length; i += 7) {
      w.push(days.slice(i, i + 7));
    }
    return w;
  }, [days]);

  return (
    <div className="h-full bg-slate-50 flex flex-col overflow-hidden">
      {/* Calendar Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
           <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
             <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 px-2 hover:bg-white rounded transition-all"><ChevronLeft size={16} /></button>
             <h3 className="px-4 py-1 text-sm font-black text-slate-700 uppercase tracking-widest min-w-[150px] text-center">
               {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
             </h3>
             <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 px-2 hover:bg-white rounded transition-all"><ChevronRight size={16} /></button>
           </div>
           <button onClick={() => setCurrentMonth(new Date())} className="px-4 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded transition-all">Hoje</button>
           <button className="px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded transition-all flex items-center gap-2">Dar o retorno</button>
        </div>

        <div className="flex items-center gap-4">
           <div className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 cursor-pointer transition-colors font-bold text-xs uppercase tracking-widest">
              <Filter size={16} />
              <span>Filtro</span>
           </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-grow flex flex-col overflow-hidden">
        {/* Days of Week Header */}
        <div className="grid grid-cols-7 bg-white border-b border-slate-200">
          {['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].map(day => (
            <div key={day} className="py-2 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest border-r border-slate-100 last:border-r-0">
              {day}
            </div>
          ))}
        </div>

        {/* Rows */}
        <div className="flex-grow flex flex-col overflow-y-auto no-scrollbar bg-slate-200 gap-[1px] border-l border-r border-slate-200">
           {weeks.map((week, weekIdx) => (
             <div key={weekIdx} className="min-h-[140px] flex-grow grid grid-cols-7 gap-[1px]">
                {week.map((day, dayIdx) => {
                  const dayTasks = state.ganttTasks.filter(task => {
                    const start = parseISO(task.startDate);
                    const end = parseISO(task.endDate);
                    return isWithinInterval(day, { start, end });
                  });

                  return (
                    <div 
                      key={dayIdx} 
                      className={`bg-white p-2 flex flex-col gap-1 relative overflow-hidden transition-colors cursor-pointer hover:bg-slate-50/50 ${!isSameMonth(day, currentMonth) ? 'bg-slate-50 opacity-40' : ''}`}
                      onClick={() => setIsAdding(day)}
                    >
                       <span className={`text-[11px] font-bold ${isSameDay(day, new Date()) ? 'text-blue-600 bg-blue-50 w-6 h-6 flex items-center justify-center rounded-full border border-blue-200 shadow-sm mb-1' : 'text-slate-400 mb-1'}`}>
                          {format(day, 'd')}
                          {format(day, 'd') === '1' && (
                            <span className="ml-1 text-[8px] font-black uppercase text-slate-300">
                              {format(day, 'MMMM', { locale: ptBR })}
                            </span>
                          )}
                       </span>

                       {isAdding && isSameDay(day, isAdding) && (
                         <div className="absolute inset-0 bg-white/95 z-40 p-2 flex flex-col gap-2 shadow-2xl border-2 border-blue-400" onClick={e => e.stopPropagation()}>
                            <input 
                              autoFocus
                              value={newTitle}
                              onChange={e => setNewTitle(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleAddTask(day);
                                if (e.key === 'Escape') setIsAdding(null);
                              }}
                              placeholder="Nova tarefa..."
                              className="w-full text-[10px] font-bold border-b border-blue-200 outline-none p-1"
                            />
                            <div className="flex justify-end gap-1">
                               <button onClick={() => setIsAdding(null)} className="p-1 text-[8px] font-bold text-slate-400">ESC</button>
                               <button onClick={() => handleAddTask(day)} className="px-2 py-0.5 bg-blue-600 text-white rounded text-[8px] font-bold">OK</button>
                            </div>
                         </div>
                       )}

                       {/* Task Bars in Day */}
                       <div className="flex flex-col gap-0.5 z-10">
                          {dayTasks.slice(0, 4).map(task => {
                             const isStart = isSameDay(day, parseISO(task.startDate));
                             const isEnd = isSameDay(day, parseISO(task.endDate));
                             const u = state.users.find(usr => task.assignedTo.includes(usr.id));

                             return (
                               <div 
                                 key={task.id} 
                                 className={`h-5 text-[9px] font-bold text-white flex items-center px-1.5 gap-1.5 shadow-sm relative overflow-hidden ${task.color} ${isStart ? 'rounded-l sm:ml-1' : ''} ${isEnd ? 'rounded-r sm:mr-1' : ''}`}
                                 style={{ 
                                   width: 'calc(100% + 2px)',
                                   marginLeft: isStart ? '0' : '-2px',
                                   marginRight: isEnd ? '0' : '-2px'
                                 }}
                               >
                                  <div className="w-4 h-4 rounded-full bg-white/20 border border-white/30 flex items-center justify-center text-[7px] flex-shrink-0">
                                    {u?.name.charAt(0) || '?'}
                                  </div>
                                  <span className="truncate drop-shadow-sm select-none">{task.title}</span>

                                  {/* Milestone icon if relevant? Not in image bars really, but good to have */}
                               </div>
                             );
                          })}
                          
                          {dayTasks.length > 4 && (
                            <div className="flex items-center justify-between px-2 py-1 bg-slate-900 border border-slate-700/50 rounded-md shadow-lg shadow-black/20 cursor-pointer hover:bg-slate-800 transition-all mt-1 group">
                               <div className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400 group-hover:bg-blue-400 transition-colors" />
                                  <span className="text-[8px] font-black text-slate-100 uppercase tracking-widest leading-none">
                                    {dayTasks.length - 4} MAIS TAREFAS
                                  </span>
                               </div>
                               <Maximize2 size={8} className="text-slate-500 group-hover:text-blue-400" />
                            </div>
                          )}
                       </div>
                    </div>
                  );
                })}
             </div>
           ))}
        </div>
      </div>
    </div>
  );
};
