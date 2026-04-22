import React from 'react';
import { 
  Plus, 
  Search, 
  ChevronDown, 
  MoreVertical, 
  RefreshCw,
  Mail,
  Shield,
  UserPlus
} from 'lucide-react';
import { AppState, User } from '../../types';

interface PeopleViewProps {
  state: AppState;
  onUpdateState: (newState: AppState) => void;
}

export const PeopleView: React.FC<PeopleViewProps> = ({ state, onUpdateState }) => {
  return (
    <div className="h-full bg-white flex flex-col overflow-hidden">
      {/* People Header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white">
         <div className="flex items-center gap-4 mb-4">
            <button className="px-6 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs font-black text-slate-800 uppercase tracking-widest shadow-sm">Pessoas</button>
            <button className="px-6 py-2 hover:bg-slate-50 text-xs font-black text-slate-400 uppercase tracking-widest transition-all">Recursos virtuais</button>
         </div>

         <div className="max-w-2xl text-[10px] sm:text-xs text-slate-500 leading-relaxed font-medium">
           Aqui pode gerir todos os membros do seu projeto. Pode convidar novos participantes por correio eletrónico ou escolher entre os membros da equipa já convidados. Dependendo dos direitos de projeto concedidos, os membros da equipa podem ter diferentes funcionalidades nos projetos.
         </div>
      </div>

      {/* People Toolbar */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 bg-white sticky top-0 z-10 font-sans">
         <div className="relative w-80">
            <Search className="absolute left-3 top-2.5 text-slate-300" size={16} />
            <input 
              type="text" 
              placeholder="Pesquisar por nome ou e-mail" 
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-100 rounded text-xs focus:ring-1 focus:ring-blue-400 focus:bg-white outline-none transition-all placeholder:text-slate-300 font-medium"
            />
         </div>

         <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded text-[11px] font-black uppercase tracking-widest shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all">
           <UserPlus size={16} /> Convidar utilizadores
         </button>
      </div>

      {/* People Table */}
      <div className="flex-grow overflow-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">
               <th className="px-6 py-4 font-black">Usuário</th>
               <th className="px-6 py-4 font-black">Direitos do projeto</th>
               <th className="px-6 py-4 font-black">Tipo</th>
               <th className="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 selection:bg-blue-50">
            {state.users.map(user => {
              const isOwner = user.name === 'Edson Farias';
              const role = isOwner ? 'Dono do projeto' : 'Administrador do...';

              return (
                <tr key={user.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                       <div className="w-10 h-10 rounded-full bg-slate-200 flex flex-shrink-0 items-center justify-center border-2 border-white shadow-sm overflow-hidden transition-transform group-hover:scale-105">
                          {user.avatar ? <img src={user.avatar} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : user.name.charAt(0)}
                       </div>
                       <div className="flex flex-col">
                          <span className="text-[13px] font-black text-slate-700 tracking-tight">{user.name}</span>
                          <span className="text-[10px] text-slate-400 font-medium">{user.email || `${user.username}@gmail.com`}</span>
                       </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 group/role">
                       <span className={`text-[11px] font-black uppercase tracking-widest ${isOwner ? 'text-slate-800' : 'text-slate-500'}`}>{role}</span>
                       {!isOwner && <ChevronDown size={14} className="text-slate-300 group-hover/role:text-slate-500 transition-colors" />}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 group/type">
                       <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">por hora</span>
                       <ChevronDown size={14} className="text-slate-300 group-hover/type:text-slate-500 transition-colors" />
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {isOwner ? (
                       <button className="flex items-center gap-2 text-[11px] font-black text-blue-600 hover:text-blue-800 transition-colors uppercase tracking-widest group/owner">
                          <RefreshCw size={14} className="group-hover/owner:rotate-180 transition-transform duration-500" />
                          Alterar proprietário do projeto
                       </button>
                    ) : (
                       <button className="p-2 hover:bg-slate-100 rounded text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical size={16} />
                       </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
