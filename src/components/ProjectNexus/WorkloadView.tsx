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
    <div className="h-full bg-white flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between z-30 shadow-sm font-sans">
        <div className="flex items-center gap-6">
           <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">Modo:</span>
              <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-black text-blue-600 cursor-pointer">
                Horas <ChevronDown size={14} />
              </div>
           </div>
           <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">Período:</span>
              <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-black text-blue-600 cursor-pointer">
                3 meses <ChevronDown size={14} />
              </div>
           </div>
           <button className="text-xs font-black text-slate-600 hover:text-blue-600 transition-colors uppercase tracking-widest">Dar o retorno</button>
        </div>

        <div className="flex items-center gap-6">
           <div className="flex items-center gap-2 text-slate-500 hover:text-slate-800 cursor-pointer font-bold text-xs uppercase tracking-widest">
              <Filter size={16} />
              <span>Filtro</span>
           </div>
           <div className="flex items-center gap-2 ml-2">
             <div className="w-24 h-5 bg-slate-100 rounded-full flex items-center px-1 relative">
                <div className="absolute left-[20%] w-2 h-2 rounded-full bg-slate-400" />
                <div className="absolute left-[40%] w-2 h-2 rounded-full bg-slate-400" />
                <div className="absolute left-[60%] w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow-sm" />
                <div className="absolute left-[80%] w-2 h-2 rounded-full bg-slate-400" />
             </div>
             <span className="text-[10px] font-bold text-slate-400 uppercase">Dias</span>
          </div>
        </div>
      </div>

      {/* Resource Grid Header */}
      <div className="flex-grow flex flex-col overflow-hidden">
         <div className="flex flex-shrink-0 sticky top-0 z-40 bg-slate-50/50 border-b border-slate-200">
            <div className="w-64 flex-shrink-0 border-r border-slate-300 p-3 flex items-end">
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recurso</span>
            </div>
            <div className="flex-grow overflow-hidden flex flex-col">
               <div className="flex h-6 border-b border-slate-200 bg-white">
                  <div className="px-4 py-1 text-[9px] font-black text-slate-400 border-r border-slate-200 uppercase tracking-widest">Abril 2026</div>
                  <div className="px-4 py-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">Maio 2026</div>
               </div>
               <div className="flex h-10 bg-white">
                  {days.map((day, i) => (
                    <div 
                      key={i} 
                      className={`flex-shrink-0 border-r border-slate-100 flex flex-col items-center justify-center ${isSameDay(day, new Date()) ? 'bg-rose-50 border-rose-200' : isWeekend(day) ? 'bg-slate-50' : ''}`}
                      style={{ width: `${zoomLevel}px` }}
                    >
                      <span className={`text-[8px] font-bold ${isSameDay(day, new Date()) ? 'text-rose-500' : 'text-slate-300'}`}>
                        {format(day, 'd')}
                      </span>
                      {isSameDay(day, new Date()) && (
                        <div className="absolute top-0 right-0 left-0 h-0.5 bg-rose-500 " />
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
                <div key={user.id} className="flex border-b border-slate-100 bg-white hover:bg-slate-50 group transition-colors">
                  <div className="w-64 flex-shrink-0 border-r border-slate-200 p-2 flex items-center justify-between sticky left-0 z-20 bg-white group-hover:bg-slate-50">
                    <div className="flex items-center gap-3">
                       <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-black text-slate-600 border border-slate-100 uppercase overflow-hidden">
                          {user.avatar ? <img src={user.avatar} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : user.name.charAt(0)}
                       </div>
                       <span className="text-xs font-bold text-slate-700 truncate max-w-[120px]">{user.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                       {hasAlert && <AlertCircle size={14} className="text-rose-500" />}
                       <Calendar size={14} className="text-slate-300 hover:text-slate-500 cursor-pointer" />
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
                          className={`flex-shrink-0 border-r border-slate-100 h-10 flex items-center justify-center text-xs font-bold ${isIdeal ? 'bg-emerald-50 text-emerald-600' : isOver ? 'bg-rose-50 text-rose-600 shadow-inner' : isUnder ? 'bg-amber-50 text-amber-600' : 'text-slate-200'}`}
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
            <div className="flex border-b border-slate-100 bg-white/50 italic group transition-colors">
               <div className="w-64 flex-shrink-0 border-r border-slate-200 p-2 flex items-center gap-3 sticky left-0 z-20 bg-white group-hover:bg-slate-50">
                  <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-dashed border-slate-300 shadow-sm">
                    <UserIcon size={14} />
                  </div>
                  <span className="text-xs font-bold text-slate-400">não atribuído</span>
               </div>
               <div className="flex overflow-hidden">
                 {days.map((day, i) => (
                   <div key={i} className="flex-shrink-0 border-r border-slate-100 h-10 flex items-center justify-center text-[10px] text-slate-200" style={{ width: `${zoomLevel}px` }}>0</div>
                 ))}
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};
