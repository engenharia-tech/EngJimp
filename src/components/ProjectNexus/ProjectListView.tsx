import React, { useState } from 'react';
import { 
  ChevronLeft, 
  Plus, 
  Search, 
  ChevronDown, 
  Star, 
  Info, 
  MoreHorizontal,
  ArrowDown
} from 'lucide-react';
import { AppState, ProjectSession } from '../../types';
import { format } from 'date-fns';

interface ProjectListViewProps {
  state: AppState;
  onProjectClick: (project: ProjectSession) => void;
  onCreateProject: () => void;
}

export const ProjectListView: React.FC<ProjectListViewProps> = ({ state, onProjectClick, onCreateProject }) => {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="flex flex-col h-full bg-white select-none">
      {/* Header Image 1 style */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200">
         <div className="flex items-center gap-10">
            <button className="flex items-center gap-3 text-blue-600 font-bold text-xl group transition-all">
               <ChevronLeft size={24} className="stroke-[3] group-hover:-translate-x-1 transition-transform" />
               <span className="text-slate-800 tracking-tight">Todos os projetos</span>
            </button>
         </div>

         <button 
           onClick={onCreateProject}
           className="flex items-center gap-2 border border-blue-600 text-blue-600 px-6 py-2 rounded font-bold text-sm hover:bg-blue-50 transition-all shadow-sm"
         >
           <Plus size={20} className="stroke-[3]" />
           Criar novo projeto
         </button>
      </div>

      {/* Search and Table Image 1 style */}
      <div className="px-6 py-4 border-b border-slate-100 bg-white sticky top-0 z-10">
         <div className="relative max-w-lg mb-6">
            <Search className="absolute left-3 top-2.5 text-slate-300" size={18} />
            <input 
              type="text" 
              placeholder="Buscar" 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border-none rounded text-lg focus:ring-0 placeholder:text-slate-300 font-medium text-slate-400"
            />
         </div>

         <div className="flex items-center text-[13px] font-bold text-slate-500 uppercase tracking-tight pb-2">
            <div className="w-[40%] flex items-center gap-2 cursor-pointer hover:text-slate-800 border-b-2 border-slate-800 pb-2">
               Última alteração <ArrowDown size={14} />
            </div>
            <div className="w-[15%] text-center">Nome</div>
            <div className="w-[15%] text-center">Atrasado</div>
            <div className="w-[15%] text-center">Progresso</div>
            <div className="w-[15%] text-center">Não atribuído</div>
         </div>
      </div>

      <div className="flex-grow overflow-auto">
         {state.projects.map(project => (
           <div 
             key={project.id} 
             onClick={() => onProjectClick(project)}
             className="flex items-center px-6 py-4 border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer group"
           >
              <div className="w-[40%] flex items-center gap-4">
                 <button className="p-1 text-slate-300 hover:text-amber-400 transition-colors">
                    <Star size={18} />
                 </button>
                 <div className="flex flex-col">
                    <span className="text-lg font-bold text-slate-700 tracking-tight group-hover:text-blue-600 transition-colors">{project.name}</span>
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Última alteração: 21/04/2026</span>
                 </div>
              </div>

              <div className="w-[15%] flex justify-center">
                 {/* Empty as per image */}
              </div>

              <div className="w-[15%] flex justify-center">
                 <div className="bg-slate-200 text-slate-500 text-xs font-bold px-3 py-1.5 rounded flex items-center gap-2 cursor-pointer hover:bg-slate-300 transition-all select-none">
                    Sem status <ChevronDown size={14} />
                 </div>
              </div>

              <div className="w-[15%] flex justify-center">
                 <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                    <Info size={18} className="text-slate-300 hover:text-slate-500" />
                    <MoreHorizontal size={18} className="text-slate-300 hover:text-slate-500" />
                 </div>
              </div>

              <div className="w-[15%] flex justify-center">
                 {/* Empty as per image */}
              </div>
           </div>
         ))}
      </div>
    </div>
  );
};
