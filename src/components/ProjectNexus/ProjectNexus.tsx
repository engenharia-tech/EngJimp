import React, { useState, useMemo } from 'react';
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
  Plus,
  Eye,
  EyeOff,
  X
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

const ROLE_LABEL: Record<string, string> = {
  GESTOR: 'Gestor',
  PROJETISTA: 'Projetista',
  CEO: 'CEO',
  COORDENADOR: 'Coordenador',
  PROCESSOS: 'Processos',
  QUALIDADE: 'Qualidade',
};

const HIDDEN_USERS_KEY = 'nexus_hidden_user_ids';

export type NexusTab = 'gantt' | 'kanban' | 'list' | 'calendar' | 'workload' | 'people' | 'dashboard';

export const ProjectNexus: React.FC<ProjectNexusProps> = ({ state, onUpdateState, onRefresh, onOpenSettings, currentUser }) => {
  const { t } = useLanguage();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<NexusTab>('gantt');
  const [isAddingWorkspace, setIsAddingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<GanttTask | null>(null);

  // Configurações do Nexus (engrenagem): pessoas ocultas nas visualizações.
  // Persistido no navegador (localStorage) — não altera o banco.
  const [showNexusSettings, setShowNexusSettings] = useState(false);
  const [hiddenUserIds, setHiddenUserIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_USERS_KEY);
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
    } catch { return new Set<string>(); }
  });

  const persistHidden = (next: Set<string>) => {
    setHiddenUserIds(next);
    try { localStorage.setItem(HIDDEN_USERS_KEY, JSON.stringify([...next])); } catch { /* ignora */ }
  };
  const toggleUserHidden = (id: string) => {
    const next = new Set(hiddenUserIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    persistHidden(next);
  };

  // Estado com as pessoas ocultas removidas — usado só nas visões que listam
  // pessoas (Carga de trabalho e Pessoas). As demais telas veem todos os
  // usuários (ex.: para atribuir tarefas).
  const visibleState = useMemo(
    () => ({ ...state, users: state.users.filter(u => !hiddenUserIds.has(u.id)) }),
    [state, hiddenUserIds]
  );

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
      
      // Audit Log
      addAuditLog({
          userId: currentUser.id,
          userName: currentUser.name,
          action: 'CREATE',
          entityType: 'GANTT_WORKSPACE',
          entityId: newTask.id,
          entityName: newTask.title,
          details: `Novo Fluxo (Gantt) "${newTask.title}" criado por ${currentUser.name}`
      });

      addToast("Novo fluxo criado com sucesso!", "success");
    } catch (error) {
      console.error("Error adding workspace:", error);
      addToast("Erro ao criar fluxo. Verifique o banco de dados.", "error");
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 overflow-hidden">
      {/* Top Header - Independent from Projects */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shadow-sm">
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
              onClick={() => setShowNexusSettings(true)}
              className="relative p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 transition-colors"
              title="Configurações do Nexus (pessoas na visualização)"
            >
              <Settings size={18} />
              {hiddenUserIds.size > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-blue-600 text-white text-[9px] font-bold grid place-items-center">{hiddenUserIds.size}</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center overflow-x-auto no-scrollbar">
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
        {activeTab === 'gantt' && <GanttView state={state} onUpdateState={onUpdateState} onRefresh={onRefresh} currentUser={currentUser} />}
        {activeTab === 'kanban' && <KanbanView state={state} onUpdateState={onUpdateState} onEditTask={handleEditTask} onRefresh={onRefresh} currentUser={currentUser} />}
        {activeTab === 'list' && <ListView state={state} onUpdateState={onUpdateState} onEditTask={handleEditTask} onRefresh={onRefresh} currentUser={currentUser} />}
        {activeTab === 'calendar' && <CalendarView state={state} onUpdateState={onUpdateState} onRefresh={onRefresh} currentUser={currentUser} />}
        {activeTab === 'workload' && <WorkloadView state={visibleState} onUpdateState={onUpdateState} onRefresh={onRefresh} />}
        {activeTab === 'people' && <PeopleView state={visibleState} onUpdateState={onUpdateState} onRefresh={onRefresh} />}
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

      {/* Configurações do Nexus (engrenagem) — pessoas exibidas nas visualizações */}
      {showNexusSettings && (
        <div
          className="fixed inset-0 z-[200] flex justify-end bg-slate-900/40 backdrop-blur-sm"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowNexusSettings(false); }}
        >
          <div className="w-full max-w-sm h-full bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col animate-in slide-in-from-right duration-300">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-600 text-white shadow-sm"><Settings size={16} /></div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 leading-tight">Configurações do Nexus</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Preferências de visualização</p>
              </div>
              <button onClick={() => setShowNexusSettings(false)} className="ml-auto p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors" aria-label="Fechar"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Pessoas nas visualizações</h3>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => persistHidden(new Set())} className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline">Mostrar todas</button>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <button onClick={() => persistHidden(new Set(state.users.map(u => u.id)))} className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:underline">Ocultar todas</button>
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Desmarque quem não deve aparecer na <b className="font-semibold text-slate-600 dark:text-slate-300">Carga de trabalho</b> e em <b className="font-semibold text-slate-600 dark:text-slate-300">Pessoas</b>.</p>

              <div className="space-y-1.5">
                {state.users.map(u => {
                  const hidden = hiddenUserIds.has(u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={() => toggleUserHidden(u.id)}
                      className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg border transition-colors text-left ${hidden ? 'border-slate-100 dark:border-slate-800 bg-transparent' : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30'}`}
                    >
                      <div className={`w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold uppercase shrink-0 ${hidden ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500' : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300'}`}>{(u.name || '?').charAt(0)}</div>
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-medium truncate ${hidden ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-700 dark:text-slate-200'}`}>{u.name}{u.surname ? ` ${u.surname}` : ''}</div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500">{ROLE_LABEL[u.role] || u.role}</div>
                      </div>
                      {hidden
                        ? <EyeOff size={16} className="text-slate-400 dark:text-slate-500 shrink-0" />
                        : <Eye size={16} className="text-blue-500 shrink-0" />}
                    </button>
                  );
                })}
                {state.users.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-6">Nenhum usuário cadastrado.</p>
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                {hiddenUserIds.size > 0 ? `${hiddenUserIds.size} oculta(s) · salvo neste navegador` : 'Todas visíveis · salvo neste navegador'}
              </span>
              {onOpenSettings && (
                <button onClick={() => { setShowNexusSettings(false); onOpenSettings(); }} className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors shrink-0">Config. do sistema →</button>
              )}
            </div>
          </div>
        </div>
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
