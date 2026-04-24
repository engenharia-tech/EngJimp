import React, { useState } from 'react';
import { 
  Settings, 
  MoreHorizontal, 
  History,
  LayoutDashboard,
  Kanban,
  List as ListIcon,
  Calendar as CalendarIcon,
  Users2,
  BarChart3,
  LayoutList as GanttIcon,
  Plus
} from 'lucide-react';
import { AppState, GanttTask, GanttTaskStatus, TaskPriority } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';
import { GanttView } from './GanttView';
import { KanbanView } from './KanbanView';
import { ListView } from './ListView';
import { CalendarView } from './CalendarView';
import { WorkloadView } from './WorkloadView';
import { PeopleView } from './PeopleView';
import { DashboardView } from './DashboardView';
import { addGanttTask } from '../../services/storageService';

interface ProjectNexusProps {
  state: AppState;
  onUpdateState: (newState: AppState) => void;
  onRefresh?: () => void;
}

const generateId = () => crypto.randomUUID();

export type NexusTab = 'gantt' | 'kanban' | 'list' | 'calendar' | 'workload' | 'people' | 'dashboard';

export const ProjectNexus: React.FC<ProjectNexusProps> = ({ state, onUpdateState, onRefresh }) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<NexusTab>('gantt');

  const handleAddWorkspace = async () => {
    const name = window.prompt("Nome do novo fluxo/projeto paralelo:");
    if (!name) return;

    const newTask: GanttTask = {
      id: generateId(),
      title: name,
      parentId: null,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      color: 'bg-blue-600',
      isMilestone: false,
      assignedTo: [],
      progress: 0,
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      order: state.ganttTasks.length,
      status: GanttTaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      dependencies: []
    };

    try {
      const newState = await addGanttTask(newTask);
      onUpdateState(newState);
    } catch (error) {
      console.error("Error adding workspace:", error);
      alert("Erro ao criar fluxo. Verifique o banco de dados.");
    }
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Top Header - Independent from Projects */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-white shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 text-white rounded-lg shadow-blue-200 shadow-lg">
            <GanttIcon size={20} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight leading-none mb-1">Nexus Flow</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Acompanhamento de Tarefas Paralelas</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={handleAddWorkspace}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-all shadow-md active:scale-95"
          >
            <Plus size={16} />
            <span>NOVO FLUXO</span>
          </button>
          
          <div className="h-8 w-px bg-slate-200 mx-1" />
          
          <div className="flex items-center gap-1">
            <button onClick={onRefresh} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors" title="Atualizar dados"><History size={18} /></button>
            <button onClick={() => setActiveTab('dashboard')} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors" title="Configurações"><Settings size={18} /></button>
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
        {activeTab === 'gantt' && <GanttView state={state} onUpdateState={onUpdateState} onRefresh={onRefresh} />}
        {activeTab === 'kanban' && <KanbanView state={state} onUpdateState={onUpdateState} onRefresh={onRefresh} />}
        {activeTab === 'list' && <ListView state={state} onUpdateState={onUpdateState} onRefresh={onRefresh} />}
        {activeTab === 'calendar' && <CalendarView state={state} onUpdateState={onUpdateState} onRefresh={onRefresh} />}
        {activeTab === 'workload' && <WorkloadView state={state} onUpdateState={onUpdateState} onRefresh={onRefresh} />}
        {activeTab === 'people' && <PeopleView state={state} onUpdateState={onUpdateState} onRefresh={onRefresh} />}
        {activeTab === 'dashboard' && <DashboardView state={state} onUpdateState={onUpdateState} onRefresh={onRefresh} />}
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
