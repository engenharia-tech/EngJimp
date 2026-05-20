import React, { useState, useMemo } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Filter, 
  Download,
  Calendar,
  AlertCircle,
  Clock,
  User as UserIcon,
  Search,
  ChevronDown
} from 'lucide-react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  isWithinInterval,
  parseISO,
  isWeekend,
  addDays,
  differenceInDays
} from 'date-fns';
import { AppState, GanttTask } from '../../types';
import { ptBR } from 'date-fns/locale';

interface WorkloadViewProps {
  state: AppState;
  onUpdateState: (newState: AppState) => void;
}

export const WorkloadView: React.FC<WorkloadViewProps> = ({ state, onUpdateState }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [zoomLevel, setZoomLevel] = useState(40); // px per day

  const timelineInterval = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = addMonths(start, 3);
    return { start, end };
  }, [currentDate]);

  const days = useMemo(() => {
    return eachDayOfInterval({ start: timelineInterval.start, end: timelineInterval.end });
  }, [timelineInterval]);

  const getUserWorkloadForDay = (userId: string, day: Date) => {
    let total = 0;
    state.ganttTasks.forEach(task => {
      const start = parseISO(task.startDate);
      const end = parseISO(task.endDate);
      if (isWithinInterval(day, { start, end }) && task.assignedTo.includes(userId)) {
        if (task.workload && task.workload[userId]) {
           // If workload is defined as total hours for the task, we might divide it by days?
           // For simplicity in this view, let's assume the user assigned a "daily hours" or we divide.
           // Looking at the image, it shows "8" consistently.
           total += (task.workload[userId] as number);
        } else {
           // Default if not specified? Let's say 8h if active.
           total += 8; 
        }
      }
    });
    return total;
  };

  return (
    <div className="h-full bg-white dark:bg-black flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between z-30 shadow-sm font-sans">
        <div className="flex items-center gap-6">
           <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Modo:</span>
              <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs font-black text-blue-600 dark:text-blue-400 cursor-pointer">
                Horas <ChevronDown size={14} />
              </div>
           </div>
           <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Período:</span>
              <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs font-black text-blue-600 dark:text-blue-400 cursor-pointer">
                3 meses <ChevronDown size={14} />
              </div>
           </div>
           <button className="text-xs font-black text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors uppercase tracking-widest">Dar o retorno</button>
        </div>

        <div className="flex items-center gap-6">
           <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer font-bold text-xs uppercase tracking-widest">
              <Filter size={16} />
              <span>Filtro</span>
           </div>
           <div className="flex items-center gap-2 ml-2">
              <div className="w-24 h-5 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center px-1 relative">
                 <div className="absolute left-[20%] w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-600" />
                 <div className="absolute left-[40%] w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-600" />
                 <div className="absolute left-[60%] w-3 h-3 rounded-full bg-blue-500 border-2 border-white dark:border-slate-900 shadow-sm" />
                 <div className="absolute left-[80%] w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-600" />
              </div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Dias</span>
           </div>
        </div>
      </div>

      {/* Resource Grid Header */}
      <div className="flex-grow flex flex-col overflow-hidden">
         <div className="flex flex-shrink-0 sticky top-0 z-40 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
            <div className="w-64 flex-shrink-0 border-r border-slate-300 dark:border-slate-800 p-3 flex items-end">
               <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Recurso</span>
            </div>
            <div className="flex-grow overflow-hidden flex flex-col">
               <div className="flex h-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <div className="px-4 py-1 text-[9px] font-black text-slate-400 dark:text-slate-500 border-r border-slate-200 dark:border-slate-800 uppercase tracking-widest">Abril 2026</div>
                  <div className="px-4 py-1 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Maio 2026</div>
               </div>
               <div className="flex h-10 bg-white dark:bg-slate-900">
                  {days.map((day, i) => (
                    <div 
                      key={i} 
                      className={`flex-shrink-0 border-r border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center ${isSameDay(day, new Date()) ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-900/40' : isWeekend(day) ? 'bg-slate-50 dark:bg-slate-900/40' : ''}`}
                      style={{ width: `${zoomLevel}px` }}
                    >
                      <span className={`text-[8px] font-bold ${isSameDay(day, new Date()) ? 'text-rose-500' : 'text-slate-300 dark:text-slate-600'}`}>
                        {format(day, 'd')}
                      </span>
                      {isSameDay(day, new Date()) && (
                        <div className="absolute top-0 right-0 left-0 h-0.5 bg-rose-500" />
                      )}
                    </div>
                  ))}
               </div>
            </div>
         </div>

         {/* Grid Content */}
         <div className="flex-grow overflow-auto flex flex-col relative no-scrollbar">
            {/* Legend for "Today" line */}
            <div 
               className="absolute top-0 bottom-0 w-px bg-rose-400 z-10 pointer-events-none" 
               style={{ left: `calc(16rem + ${differenceInDays(new Date(), timelineInterval.start) * zoomLevel}px)` }}
            >
               <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full bg-rose-400 text-white text-[8px] font-black px-1 py-0.5 rounded-t tracking-tighter uppercase whitespace-nowrap">Hoje</div>
            </div>

            {state.users.map(user => {
              const hasAlert = user.name === 'Edson Farias'; // Hardcoded matches Image 5 icons for visual parity

              return (
                <div key={user.id} className="flex border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 group transition-colors">
                  <div className="w-64 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 p-2 flex items-center justify-between sticky left-0 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80">
                    <div className="flex items-center gap-3">
                       <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-700 uppercase overflow-hidden">
                          {user.avatar ? <img src={user.avatar} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : user.name.charAt(0)}
                       </div>
                       <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate max-w-[120px]">{user.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                       {hasAlert && <AlertCircle size={14} className="text-rose-500" />}
                       <Calendar size={14} className="text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 cursor-pointer" />
                    </div>
                  </div>
                  
                  <div className="flex overflow-hidden">
                    {days.map((day, i) => {
                      const hours = getUserWorkloadForDay(user.id, day);
                      const isIdeal = hours === 8;
                      const isOver = hours > 8;
                      const isUnder = hours > 0 && hours < 8;

                      return (
                        <div 
                          key={i} 
                          className={`flex-shrink-0 border-r border-slate-100 dark:border-slate-800 h-10 flex items-center justify-center text-xs font-bold ${isIdeal ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : isOver ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 shadow-inner' : isUnder ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' : 'text-slate-200 dark:text-slate-800'}`}
                          style={{ width: `${zoomLevel}px` }}
                        >
                          {hours > 0 ? hours : '0'}
                        </div>
                      )
                    })}
                  </div>
                </div>
              );
            })}

            {/* "não atribuído" row */}
            <div className="flex border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 italic group transition-colors">
               <div className="w-64 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 p-2 flex items-center gap-3 sticky left-0 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80">
                  <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-600 border border-dashed border-slate-300 dark:border-slate-700 shadow-sm">
                    <UserIcon size={14} />
                  </div>
                  <span className="text-xs font-bold text-slate-400 dark:text-slate-500">não atribuído</span>
               </div>
               <div className="flex overflow-hidden">
                 {days.map((day, i) => (
                   <div key={i} className="flex-shrink-0 border-r border-slate-100 dark:border-slate-800 h-10 flex items-center justify-center text-[10px] text-slate-200 dark:text-slate-800" style={{ width: `${zoomLevel}px` }}>0</div>
                 ))}
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};
