import React, { useState } from 'react';
import { 
  Folder, 
  Star, 
  ChevronDown, 
  Clock, 
  Settings, 
  MoreHorizontal, 
  History,
  LayoutDashboard,
  Kanban,
  List as ListIcon,
  Calendar as CalendarIcon,
  Users2,
  BarChart3,
  LayoutList as GanttIcon
} from 'lucide-react';
import { AppState, GanttTask } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';
import { GanttView } from './GanttView';
import { KanbanView } from './KanbanView';
import { ListView } from './ListView';
import { CalendarView } from './CalendarView';
import { WorkloadView } from './WorkloadView';
import { PeopleView } from './PeopleView';
import { ProjectListView } from './ProjectListView';
import { DashboardView } from './DashboardView';

interface ProjectNexusProps {
  state: AppState;
  onUpdateState: (newState: AppState) => void;
  onRefresh?: () => void;
}

export type NexusTab = 'gantt' | 'kanban' | 'list' | 'calendar' | 'workload' | 'people' | 'dashboard';

export const ProjectNexus: React.FC<ProjectNexusProps> = ({ state, onUpdateState, onRefresh }) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<NexusTab>('gantt');
  const [showProjectList, setShowProjectList] = useState(false);
  const [selectedProject, setSelectedProject] = useState(state.projects[0]);

  if (showProjectList) {
    return (
      <ProjectListView 
        state={state} 
        onProjectClick={(p) => { setSelectedProject(p); setShowProjectList(false); }}
        onCreateProject={() => {}} 
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Top Breadcrumb / Header Matches Image 1 and context */}
      <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between bg-white">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowProjectList(true)}
            className="p-1.5 text-blue-600 hover:bg-slate-50 rounded transition-colors"
          >
            <ChevronDown size={24} className="rotate-90 stroke-[3]" />
          </button>
          <div className="p-1.5 bg-slate-100 rounded text-slate-600">
            <Folder size={18} />
          </div>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight">{selectedProject?.name || 'JIMP'}</h1>
          <button className="p-1 hover:bg-slate-100 rounded text-slate-400">
            <Star size={16} />
          </button>
          <div className="ml-4 flex items-center gap-2 bg-slate-100 px-2 py-1 rounded text-xs font-medium text-slate-600 cursor-pointer hover:bg-slate-200 transition-colors">
            <span>Sem status</span>
            <ChevronDown size={14} />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button className="px-3 py-1.5 border border-slate-300 rounded text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            Dono do projeto
          </button>
          <div className="flex items-center gap-1">
            <button onClick={onRefresh} className="p-2 hover:bg-slate-100 rounded text-slate-500" title="Atualizar dados"><History size={18} /></button>
            <button onClick={() => setActiveTab('dashboard')} className="p-2 hover:bg-slate-100 rounded text-slate-500" title="Configurações"><Settings size={18} /></button>
            <button className="p-2 hover:bg-slate-100 rounded text-slate-500"><MoreHorizontal size={18} /></button>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="px-4 border-b border-slate-200 bg-white flex items-center overflow-x-auto no-scrollbar">
        <nav className="flex gap-1">
          <TabButton 
            active={activeTab === 'gantt'} 
            onClick={() => setActiveTab('gantt')}
            icon={<GanttIcon size={16} />}
            label="Diagrama de Gantt"
          />
          <TabButton 
            active={activeTab === 'kanban'} 
            onClick={() => setActiveTab('kanban')}
            icon={<Kanban size={16} />}
            label="Painel"
          />
          <TabButton 
            active={activeTab === 'list'} 
            onClick={() => setActiveTab('list')}
            icon={<ListIcon size={16} />}
            label="Lista"
          />
          <TabButton 
            active={activeTab === 'calendar'} 
            onClick={() => setActiveTab('calendar')}
            icon={<CalendarIcon size={16} />}
            label="Calendário"
          />
          <TabButton 
            active={activeTab === 'workload'} 
            onClick={() => setActiveTab('workload')}
            icon={<BarChart3 size={16} />}
            label="Carga de trabalho"
          />
          <TabButton 
            active={activeTab === 'people'} 
            onClick={() => setActiveTab('people')}
            icon={<Users2 size={16} />}
            label="Pessoas"
          />
          <TabButton 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')}
            icon={<LayoutDashboard size={16} />}
            label="Dashboard"
          />
        </nav>
      </div>

      {/* View Content */}
      <div className="flex-grow overflow-hidden relative">
        {activeTab === 'gantt' && <GanttView state={state} onUpdateState={onUpdateState} />}
        {activeTab === 'kanban' && <KanbanView state={state} onUpdateState={onUpdateState} />}
        {activeTab === 'list' && <ListView state={state} onUpdateState={onUpdateState} />}
        {activeTab === 'calendar' && <CalendarView state={state} onUpdateState={onUpdateState} />}
        {activeTab === 'workload' && <WorkloadView state={state} onUpdateState={onUpdateState} />}
        {activeTab === 'people' && <PeopleView state={state} onUpdateState={onUpdateState} />}
        {activeTab === 'dashboard' && <DashboardView state={state} onUpdateState={onUpdateState} />}
      </div>
    </div>
  );
};

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

const TabButton: React.FC<TabButtonProps> = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all relative whitespace-nowrap ${
      active 
        ? 'text-blue-600' 
        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
    }`}
  >
    {icon}
    {label}
    {active && (
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
    )}
  </button>
);
