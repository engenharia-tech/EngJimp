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
import { useToast } from '../Toast';
import { GanttView, TaskEditorModal } from './GanttView';
import { KanbanView } from './KanbanView';
import { ListView } from './ListView';
import { CalendarView } from './CalendarView';
import { WorkloadView } from './WorkloadView';
import { PeopleView } from './PeopleView';
import { DashboardView } from './DashboardView';
import { addGanttTask, updateGanttTask, deleteGanttTask, addAuditLog } from '../../services/storageService';
import { User } from '../../types';

interface ProjectNexusProps {
  state: AppState;
  onUpdateState: (newState: AppState) => void;
  onRefresh?: () => void;
  onOpenSettings?: () => void;
  currentUser: User;
}

const generateId = () => crypto.randomUUID();

export type NexusTab = 'gantt' | 'kanban' | 'list' | 'calendar' | 'workload' | 'people' | 'dashboard';

export const ProjectNexus: React.FC<ProjectNexusProps> = ({ state, onUpdateState, onRefresh, onOpenSettings, currentUser }) => {
  const { t } = useLanguage();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<NexusTab>('gantt');
  const [isAddingWorkspace, setIsAddingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<GanttTask | null>(null);

  const handleEditTask = (task: GanttTask) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm("Tem certeza que deseja excluir esta tarefa?")) return;
    
    try {
      setIsModalOpen(false);
      const newState = await deleteGanttTask(taskId);
      onUpdateState(newState);
      
      // Audit Log
      addAuditLog({
          userId: currentUser.id,
          userName: currentUser.name,
          action: 'DELETE',
          entityType: 'GANTT_TASK',
          entityId: taskId,
          entityName: editingTask?.title || taskId,
          details: `Tarefa de Gantt "${editingTask?.title || taskId}" excluída por ${currentUser.name}`
      });

      setEditingTask(null);
      addToast("Tarefa removida com sucesso!", "success");
    } catch (error) {
      console.error(error);
      addToast("Erro ao excluir tarefa.", "error");
    }
  };

  const handleSaveTask = async (task: GanttTask) => {
    try {
      const isNew = !state.ganttTasks.find(t => t.id === task.id);
      setIsModalOpen(false);
      const newState = isNew ? await addGanttTask(task) : await updateGanttTask(task);
      onUpdateState(newState);

      // Audit Log
      addAuditLog({
          userId: currentUser.id,
          userName: currentUser.name,
          action: isNew ? 'CREATE' : 'UPDATE',
          entityType: 'GANTT_TASK',
          entityId: task.id,
          entityName: task.title,
          details: `Tarefa de Gantt "${task.title}" ${isNew ? 'criada' : 'editada'} por ${currentUser.name}`
      });

      setEditingTask(null);
      addToast(isNew ? "Fluxo criado com sucesso!" : "Tarefa atualizada!", "success");
    } catch (error) {
      console.error(error);
      addToast("Erro ao salvar.", "error");
      setIsModalOpen(true);
    }
  };

  const handleAddWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;

    const newTask: GanttTask = {
      id: generateId(),
      title: newWorkspaceName.trim(),
      parentId: null,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      color: '#3b82f6',
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
      setIsAddingWorkspace(false);
      setNewWorkspaceName('');
      addToast("Novo fluxo criado com sucesso!", "success");
    } catch (error) {
      console.error("Error adding workspace:", error);
      addToast("Erro ao criar fluxo. Verifique o banco de dados.", "error");
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-black overflow-hidden">
      {/* Top Header - Independent from Projects */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-black shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 text-white rounded-lg shadow-blue-200 shadow-lg">
            <GanttIcon size={20} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800 dark:text-white tracking-tight leading-none mb-1">Nexus Flow</h1>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Acompanhamento de Tarefas Paralelas</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsAddingWorkspace(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-slate-100 dark:text-slate-900 hover:bg-black dark:hover:bg-white text-white rounded-lg text-xs font-bold transition-all shadow-md active:scale-95"
          >
            <Plus size={16} />
            <span>NOVO FLUXO</span>
          </button>
          
          <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-1" />
          
          <div className="flex items-center gap-1">
            <button onClick={onRefresh} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 transition-colors" title="Atualizar dados"><History size={18} /></button>
            <button 
              onClick={onOpenSettings} 
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 transition-colors" 
              title="Configurações do Sistema"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-black flex items-center overflow-x-auto no-scrollbar">
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
        {activeTab === 'kanban' && <KanbanView state={state} onUpdateState={onUpdateState} onEditTask={handleEditTask} onRefresh={onRefresh} />}
        {activeTab === 'list' && <ListView state={state} onUpdateState={onUpdateState} onEditTask={handleEditTask} onRefresh={onRefresh} />}
        {activeTab === 'calendar' && <CalendarView state={state} onUpdateState={onUpdateState} onRefresh={onRefresh} />}
        {activeTab === 'workload' && <WorkloadView state={state} onUpdateState={onUpdateState} onRefresh={onRefresh} />}
        {activeTab === 'people' && <PeopleView state={state} onUpdateState={onUpdateState} onRefresh={onRefresh} />}
        {activeTab === 'dashboard' && <DashboardView state={state} onUpdateState={onUpdateState} onRefresh={onRefresh} />}
      </div>

      {/* New Workspace Modal */}
      {isAddingWorkspace && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <h2 className="text-xl font-black text-slate-800 dark:text-white mb-1">Novo Fluxo</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Dê um nome para o seu novo projeto ou fluxo de trabalho paralelo.</p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Nome do Fluxo</label>
                  <input 
                    autoFocus
                    type="text" 
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddWorkspace()}
                    placeholder="Ex: Lançamento Campanha 2024"
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white outline-none focus:border-blue-500 transition-all font-bold"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
              <button 
                onClick={() => { setIsAddingWorkspace(false); setNewWorkspaceName(''); }}
                className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleAddWorkspace}
                disabled={!newWorkspaceName.trim()}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-black shadow-lg transition-all active:scale-95"
              >
                Criar Fluxo
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Global Task Editor Modal */}
      {isModalOpen && editingTask && (
        <TaskEditorModal 
          isOpen={isModalOpen}
          task={editingTask}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveTask}
          onDelete={handleDeleteTask}
          users={state.users}
          tasks={state.ganttTasks}
        />
      )}
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
        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
    }`}
  >
    {icon}
    {label}
    {active && (
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
    )}
  </button>
);
