import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Clock, AlertCircle, Timer, Hash, Truck, Maximize2, Briefcase, ChevronRight, Plus, FileCheck, FileX, Trash2, Building, Layers, CheckSquare, Edit } from 'lucide-react';
import { ProjectType, ProjectSession, PauseRecord, ImplementType, VariationRecord, User } from '../types';
import { PROJECT_TYPES, IMPLEMENT_TYPES, FLOORING_TYPES } from '../constants';

// SUBSTITUA ISSO PELA SUA URL DO WEBHOOK DO TEAMS
const TEAMS_WEBHOOK_URL = "https://outlook.office.com/webhook/YOUR_WEBHOOK_URL_HERE";

interface EngJimpTrackerProps {
  existingProjects: ProjectSession[];
  onCreate: (project: ProjectSession) => void;
  onUpdate: (project: ProjectSession) => void;
  isVisible: boolean;
  onNavigateBack: () => void;
  currentUser: User | null;
}

export const EngJimpTracker: React.FC<EngJimpTrackerProps> = ({ existingProjects, onCreate, onUpdate, isVisible, onNavigateBack, currentUser }) => {
  const [activeProject, setActiveProject] = useState<ProjectSession | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Form Data (Start)
  const [ns, setNs] = useState('');
  const [clientName, setClientName] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [type, setType] = useState<ProjectType>(ProjectType.RELEASE);
  const [implementType, setImplementType] = useState<ImplementType>(ImplementType.BASE);
  const [flooringType, setFlooringType] = useState('');
  const [notes, setNotes] = useState('');
  const [estHours, setEstHours] = useState<string>('');
  const [estMinutes, setEstMinutes] = useState<string>('');

  // Variation Form Data
  const [varOldCode, setVarOldCode] = useState('');
  const [varNewCode, setVarNewCode] = useState('');
  const [varDesc, setVarDesc] = useState('');
  const [varType, setVarType] = useState<'Montagem' | 'Peça'>('Peça');
  const [varFiles, setVarFiles] = useState(false);

  // Pause Logic
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [pauseReason, setPauseReason] = useState('');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingProjects = existingProjects.filter(p => p.status === 'IN_PROGRESS');

  // Helper to check if flooring field should show
  const shouldShowFlooring = [
    ImplementType.BASE, 
    ImplementType.FURGAO, 
    ImplementType.SIDER,
    ImplementType.SOBRE_CHASSI_FURGAO,
    ImplementType.SOBRE_CHASSI_LONADO
  ].includes(implementType);

  useEffect(() => {
    const updateTimer = () => {
      if (!activeProject) {
        setElapsedSeconds(0);
        return;
      }

      // Check if currently paused (has an open pause at the end)
      const lastPause = activeProject.pauses.length > 0 ? activeProject.pauses[activeProject.pauses.length - 1] : null;
      const isCurrentlyPaused = lastPause && lastPause.durationSeconds === -1;

      const start = new Date(activeProject.startTime).getTime();
      
      // Calculate total duration of PREVIOUS closed pauses only
      const totalClosedPauses = activeProject.pauses.reduce((acc, p) => {
        return acc + (p.durationSeconds > 0 ? p.durationSeconds : 0);
      }, 0);

      if (isCurrentlyPaused) {
        // If paused, time shouldn't move. It stays fixed at (PauseStart - ProjectStart - ClosedPauses)
        const pauseStart = new Date(lastPause.timestamp).getTime();
        const fixedDiff = Math.floor((pauseStart - start) / 1000);
        setElapsedSeconds(Math.max(0, fixedDiff - totalClosedPauses));
      } else {
        // If running, calculate based on Now
        const now = Date.now();
        const diffTotal = Math.floor((now - start) / 1000);
        setElapsedSeconds(Math.max(0, diffTotal - totalClosedPauses));
      }
    };

    if (activeProject && !showPauseModal) {
      updateTimer(); // Initial call
      timerRef.current = setInterval(updateTimer, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeProject, showPauseModal]);


  const handleStartNew = () => {
    if (!ns.trim()) {
      alert("Por favor, informe o NS do projeto antes de começar.");
      return;
    }

    const estimatedSeconds = (parseInt(estHours) || 0) * 3600 + (parseInt(estMinutes) || 0) * 60;

    const newProject: ProjectSession = {
      id: crypto.randomUUID(),
      ns,
      clientName,
      projectCode,
      type,
      implementType,
      flooringType: shouldShowFlooring ? flooringType : undefined,
      startTime: new Date().toISOString(),
      estimatedSeconds: estimatedSeconds > 0 ? estimatedSeconds : undefined,
      totalActiveSeconds: 0,
      pauses: [],
      variations: [], // Start empty
      status: 'IN_PROGRESS',
      notes,
      userId: currentUser?.id
    };

    onCreate(newProject);
    setActiveProject(newProject);
    
    // Reset form fields
    setNs('');
    setClientName('');
    setProjectCode('');
    setNotes('');
    setFlooringType('');
    setEstHours('');
    setEstMinutes('');
  };

  const handleResumeFromList = (project: ProjectSession) => {
    // Logic to close open pause if needed
    const lastPauseIndex = project.pauses.length - 1;
    if (lastPauseIndex >= 0 && project.pauses[lastPauseIndex].durationSeconds === -1) {
       const pauseStart = new Date(project.pauses[lastPauseIndex].timestamp).getTime();
       const now = Date.now();
       const duration = Math.floor((now - pauseStart) / 1000);

       const updatedPauses = [...project.pauses];
       updatedPauses[lastPauseIndex] = {
         ...updatedPauses[lastPauseIndex],
         durationSeconds: duration
       };

       const updatedProject = { ...project, pauses: updatedPauses };
       onUpdate(updatedProject);
       setActiveProject(updatedProject);
    } else {
       setActiveProject(project);
    }
  };

  const handlePauseProject = () => setShowPauseModal(true);

  const confirmPauseAndExit = () => {
    if (!activeProject) return;

    const newPause: PauseRecord = {
      reason: pauseReason || 'Pausa',
      timestamp: new Date().toISOString(),
      durationSeconds: -1 // Flag for "Open/Ongoing" pause
    };

    const updatedProject = {
      ...activeProject,
      pauses: [...activeProject.pauses, newPause]
    };

    onUpdate(updatedProject);
    setActiveProject(null);
    setShowPauseModal(false);
    setPauseReason('');
  };

  const handleFinish = () => {
    if (!activeProject) return;
    
    // Pre-fill finish modal with current estimate if it exists
    if (activeProject.estimatedSeconds) {
        setEstHours(Math.floor(activeProject.estimatedSeconds / 3600).toString());
        setEstMinutes(Math.floor((activeProject.estimatedSeconds % 3600) / 60).toString());
    } else {
        setEstHours('');
        setEstMinutes('');
    }
    
    setShowFinishModal(true);
  };

  const confirmFinish = async () => {
    if (!activeProject) return;

    const now = Date.now();
    const start = new Date(activeProject.startTime).getTime();
    const totalClosedPauses = activeProject.pauses.reduce((acc, p) => acc + (p.durationSeconds > 0 ? p.durationSeconds : 0), 0);
    const finalSeconds = Math.floor((now - start) / 1000) - totalClosedPauses;

    const estimatedSeconds = (parseInt(estHours) || 0) * 3600 + (parseInt(estMinutes) || 0) * 60;

    const finishedProject: ProjectSession = {
      ...activeProject,
      endTime: new Date().toISOString(),
      totalActiveSeconds: finalSeconds,
      estimatedSeconds: estimatedSeconds > 0 ? estimatedSeconds : activeProject.estimatedSeconds,
      status: 'COMPLETED'
    };

    onUpdate(finishedProject);
    sendTeamsNotification(finishedProject);
    setActiveProject(null);
    setShowFinishModal(false);
    
    // Reset form
    setEstHours('');
    setEstMinutes('');
  };

  // --- VARIATION HANDLERS ---
  const handleAddVariation = () => {
      if (!activeProject) return;
      if (!varOldCode.trim() && !varNewCode.trim()) {
          alert("Insira pelo menos um código (antigo ou novo).");
          return;
      }

      const newVar: VariationRecord = {
          id: crypto.randomUUID(),
          oldCode: varOldCode,
          newCode: varNewCode,
          description: varDesc,
          type: varType,
          filesGenerated: varFiles
      };

      const updatedProject = {
          ...activeProject,
          variations: [...activeProject.variations, newVar]
      };

      // Optimistic update local
      setActiveProject(updatedProject);
      // Save to DB
      onUpdate(updatedProject);

      // Clear small form
      setVarOldCode('');
      setVarNewCode('');
      setVarDesc('');
      setVarFiles(false);
  };

  const handleToggleVariationFiles = (id: string) => {
      if (!activeProject) return;
      
      const updatedVariations = activeProject.variations.map(v => 
        v.id === id ? { ...v, filesGenerated: !v.filesGenerated } : v
      );

      const updatedProject = {
          ...activeProject,
          variations: updatedVariations
      };

      setActiveProject(updatedProject);
      onUpdate(updatedProject);
  };

  const handleDeleteVariation = (id: string) => {
      if (!activeProject) return;
      const updatedProject = {
          ...activeProject,
          variations: activeProject.variations.filter(v => v.id !== id)
      };
      setActiveProject(updatedProject);
      onUpdate(updatedProject);
  };

  const handleUpdateActiveProjectCode = (newCode: string) => {
      if (!activeProject) return;
      const updated = { ...activeProject, projectCode: newCode };
      setActiveProject(updated);
  };

  const saveProjectCode = () => {
      if (!activeProject) return;
      onUpdate(activeProject);
  };

  const sendTeamsNotification = async (project: ProjectSession) => {
    if (!TEAMS_WEBHOOK_URL || TEAMS_WEBHOOK_URL.includes("YOUR_WEBHOOK_URL_HERE")) return;

    const duration = formatTime(project.totalActiveSeconds);
    const message = {
      "@type": "MessageCard",
      "@context": "http://schema.org/extensions",
      "themeColor": "0076D7",
      "summary": "Projeto Finalizado",
      "sections": [{
        "activityTitle": "✅ Projeto Finalizado",
        "activitySubtitle": `DesignTrack Pro`,
        "facts": [
          { "name": "NS:", "value": project.ns },
          { "name": "Cliente:", "value": project.clientName || "-" },
          { "name": "Tipo:", "value": project.type },
          { "name": "Variações:", "value": project.variations.length.toString() },
          { "name": "Duração:", "value": duration }
        ],
        "markdown": true
      }]
    };

    try {
      await fetch(TEAMS_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      });
    } catch (error) {
      console.error("Erro Teams", error);
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <>
      {!activeProject && (
        <div className="space-y-8">
          
          {/* Pending Projects */}
          {pendingProjects.length > 0 && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-blue-100">
               <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                 <Briefcase className="w-5 h-5 mr-2 text-blue-600" />
                 Projetos em Andamento / Pausados
               </h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {pendingProjects.map(p => {
                    const isPaused = p.pauses.length > 0 && p.pauses[p.pauses.length - 1].durationSeconds === -1;
                    return (
                     <div key={p.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-all bg-gray-50 group">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="font-bold text-gray-800 text-lg">{p.ns}</div>
                            <div className="text-sm text-gray-500">{p.clientName}</div>
                            <div className="text-xs text-gray-400 mt-1">{p.type} • {p.implementType}</div>
                          </div>
                          <span className={`px-2 py-1 rounded text-xs font-bold ${isPaused ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                             {isPaused ? 'PAUSADO' : 'ABERTO'}
                          </span>
                        </div>
                        {['GESTOR', 'CEO', 'COORDENADOR', 'PROJETISTA'].includes(currentUser?.role || '') && (
                            <button 
                              onClick={() => handleResumeFromList(p)}
                              className="w-full bg-white border border-blue-200 text-blue-600 font-bold py-2 rounded hover:bg-blue-50 transition-colors flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white shadow-sm mt-2"
                            >
                              <Play className="w-4 h-4 mr-2" />
                              {isPaused ? 'Retomar Timer' : 'Continuar'}
                            </button>
                        )}
                     </div>
                   );
                 })}
               </div>
            </div>
          )}

          {/* New Project Form - GESTOR, CEO, COORDENADOR, PROJETISTA */}
          {['GESTOR', 'CEO', 'COORDENADOR', 'PROJETISTA'].includes(currentUser?.role || '') ? (
              <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
                <h2 className="text-xl font-bold mb-4 flex items-center text-gray-800">
                  <Clock className="w-6 h-6 mr-2 text-blue-600" />
                  Iniciar Novo Projeto
                </h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">NS do Produto</label>
                      <input 
                        type="text" 
                        value={ns}
                        onChange={e => setNs(e.target.value)}
                        className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="Ex: 123456"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                      <div className="relative">
                        <Building className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
                        <input 
                          type="text" 
                          value={clientName}
                          onChange={e => setClientName(e.target.value)}
                          className="w-full pl-8 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="Nome do Cliente"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cód. Projeto (Opcional)</label>
                      <div className="relative">
                        <Hash className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
                        <input 
                          type="text" 
                          value={projectCode}
                          onChange={e => setProjectCode(e.target.value)}
                          className="w-full pl-8 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="Ex: PRJ-001"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Projeto</label>
                      <select 
                        value={type}
                        onChange={e => setType(e.target.value as ProjectType)}
                        className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Implemento</label>
                      <div className="relative">
                        <Truck className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
                        <select 
                          value={implementType}
                          onChange={e => setImplementType(e.target.value as ImplementType)}
                          className="w-full pl-8 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                          {IMPLEMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>

                    {shouldShowFlooring && (
                        <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Assoalho</label>
                        <div className="relative">
                            <Layers className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
                            <select 
                            value={flooringType}
                            onChange={e => setFlooringType(e.target.value)}
                            className="w-full pl-8 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                                <option value="">Selecione...</option>
                                {FLOORING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        </div>
                    )}

                    <div className="md:col-span-2 lg:col-span-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tempo Estimado</label>
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <input 
                            type="number" 
                            value={estHours}
                            onChange={e => setEstHours(e.target.value)}
                            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Horas"
                            min="0"
                          />
                          <span className="absolute right-2 top-2 text-[10px] text-gray-400 font-bold uppercase">H</span>
                        </div>
                        <div className="flex-1 relative">
                          <input 
                            type="number" 
                            value={estMinutes}
                            onChange={e => setEstMinutes(e.target.value)}
                            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Min"
                            min="0"
                            max="59"
                          />
                          <span className="absolute right-2 top-2 text-[10px] text-gray-400 font-bold uppercase">M</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={handleStartNew}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg flex items-center justify-center transition-colors"
                  >
                    <Play className="w-5 h-5 mr-2" />
                    Começar Cronômetro
                  </button>
                </div>
              </div>
          ) : (
            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                    <Clock className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">Modo Visualização</h3>
                <p className="text-gray-500 max-w-md mx-auto">
                    Você está logado como <strong>{currentUser?.role}</strong>. Você não tem permissão para iniciar, pausar ou finalizar projetos.
                </p>
            </div>
          )}
        </div>
      )}

      {activeProject && (
        <div className="space-y-6">
            {/* Main Tracker Card */}
            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 relative">
                <div className="flex justify-between items-start mb-6">
                    <h2 className="text-xl font-bold flex items-center text-gray-800">
                        <Clock className="w-6 h-6 mr-2 text-blue-600" />
                        Rastreador Ativo
                    </h2>
                    <div className="text-right">
                        <div className="font-bold text-lg text-gray-700">{activeProject.ns}</div>
                        <div className="text-xs text-gray-500 font-semibold">{activeProject.clientName}</div>
                        {activeProject.estimatedSeconds && (
                            <div className="text-[10px] text-blue-600 font-bold mt-1 bg-blue-50 px-2 py-0.5 rounded-full inline-block">
                                Estimado: {formatTime(activeProject.estimatedSeconds)}
                            </div>
                        )}
                        <div className="text-xs text-gray-400 flex flex-col items-end mt-1">
                            <span>{activeProject.implementType} {activeProject.flooringType ? `• ${activeProject.flooringType}` : ''}</span>
                            <div className="mt-1 flex items-center">
                                <span className="mr-1 text-gray-500">Cod:</span>
                                <input 
                                    type="text" 
                                    value={activeProject.projectCode || ''}
                                    onChange={(e) => handleUpdateActiveProjectCode(e.target.value)}
                                    onBlur={saveProjectCode}
                                    placeholder="Inserir Código"
                                    className="border-b border-gray-300 text-right text-xs focus:border-blue-500 focus:outline-none w-24 bg-transparent"
                                />
                                <Edit className="w-3 h-3 ml-1 text-gray-400" />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col items-center justify-center bg-gray-50 p-8 rounded-xl border border-gray-200 mb-6">
                    <span className="text-sm text-gray-500 font-medium tracking-wider uppercase mb-2 flex items-center animate-pulse">
                        <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
                        Executando
                    </span>
                    <div className="text-7xl font-mono font-bold text-blue-600 tracking-tight">
                        {formatTime(elapsedSeconds)}
                    </div>
                    <div className="mt-4 flex gap-4 text-sm text-gray-500">
                        <span>Início: {new Date(activeProject.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {['GESTOR', 'CEO', 'COORDENADOR', 'PROJETISTA'].includes(currentUser?.role || '') && (
                        <>
                            <button 
                                onClick={handlePauseProject}
                                className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 rounded-lg flex items-center justify-center transition-colors shadow-sm"
                            >
                                <Pause className="w-5 h-5 mr-2" />
                                Pausar / Trocar Projeto
                            </button>

                            <button 
                                onClick={handleFinish}
                                className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg flex items-center justify-center transition-colors shadow-sm"
                            >
                                <Square className="w-5 h-5 mr-2 fill-current" />
                                Finalizar Projeto
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* VARIATION MANAGEMENT SECTION */}
            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
                 <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center border-b pb-2">
                    <Layers className="w-5 h-5 mr-2 text-purple-600" />
                    Lista de Variações de Projeto
                 </h3>
                 
                 {/* Input Row */}
                 <div className="grid grid-cols-1 md:grid-cols-12 gap-2 mb-4 bg-gray-50 p-3 rounded-lg items-end">
                     <div className="md:col-span-2">
                        <label className="text-xs font-semibold text-gray-500">Cód. Antigo</label>
                        <input 
                            type="text" 
                            value={varOldCode}
                            onChange={e => setVarOldCode(e.target.value)}
                            className="w-full p-2 text-sm border rounded focus:ring-1 focus:ring-purple-500"
                        />
                     </div>
                     <div className="md:col-span-4">
                        <label className="text-xs font-semibold text-gray-500">Descrição / Nome</label>
                        <input 
                            type="text" 
                            value={varDesc}
                            onChange={e => setVarDesc(e.target.value)}
                            className="w-full p-2 text-sm border rounded focus:ring-1 focus:ring-purple-500"
                        />
                     </div>
                     <div className="md:col-span-2">
                        <label className="text-xs font-semibold text-gray-500">Cód. Novo</label>
                        <input 
                            type="text" 
                            value={varNewCode}
                            onChange={e => setVarNewCode(e.target.value)}
                            className="w-full p-2 text-sm border rounded focus:ring-1 focus:ring-purple-500"
                        />
                     </div>
                     <div className="md:col-span-2">
                        <label className="text-xs font-semibold text-gray-500">Tipo</label>
                        <select 
                            value={varType}
                            onChange={e => setVarType(e.target.value as any)}
                            className="w-full p-2 text-sm border rounded focus:ring-1 focus:ring-purple-500"
                        >
                            <option value="Peça">Peça</option>
                            <option value="Montagem">Montagem</option>
                        </select>
                     </div>
                     <div className="md:col-span-1 flex items-center justify-center pb-2">
                         <label className="flex items-center cursor-pointer" title="Marcar como já feito?">
                             <input 
                                type="checkbox" 
                                checked={varFiles}
                                onChange={e => setVarFiles(e.target.checked)}
                                className="w-4 h-4 text-purple-600 rounded mr-1"
                             />
                             <span className="text-xs font-bold text-gray-600">Ok</span>
                         </label>
                     </div>
                     <div className="md:col-span-1">
                         {['GESTOR', 'CEO', 'COORDENADOR', 'PROJETISTA'].includes(currentUser?.role || '') && (
                             <button 
                                onClick={handleAddVariation}
                                className="w-full bg-purple-600 hover:bg-purple-700 text-white p-2 rounded flex items-center justify-center"
                             >
                                 <Plus className="w-5 h-5" />
                             </button>
                         )}
                     </div>
                 </div>

                 {/* Table */}
                 <div className="overflow-x-auto">
                     <table className="w-full text-sm text-left">
                         <thead className="bg-gray-100 text-gray-600 font-semibold">
                             <tr>
                                 <th className="p-3 rounded-tl-lg">Código Antigo</th>
                                 <th className="p-3">Descrição</th>
                                 <th className="p-3">Código Novo</th>
                                 <th className="p-3">Tipo</th>
                                 <th className="p-3 text-center">DXF/PDF</th>
                                 <th className="p-3 rounded-tr-lg"></th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-gray-100">
                             {activeProject.variations.map((v) => (
                                 <tr key={v.id} className="hover:bg-gray-50">
                                     <td className="p-3 font-mono text-gray-600">{v.oldCode || '-'}</td>
                                     <td className="p-3 text-gray-800 font-medium">{v.description}</td>
                                     <td className="p-3 font-mono text-blue-600 font-bold">{v.newCode || '-'}</td>
                                     <td className="p-3">
                                         <span className={`px-2 py-0.5 rounded text-xs ${v.type === 'Montagem' ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-700'}`}>
                                             {v.type}
                                         </span>
                                     </td>
                                     <td className="p-3 text-center">
                                         <button 
                                            onClick={() => handleToggleVariationFiles(v.id)}
                                            title={v.filesGenerated ? "Arquivos Gerados (Clique para desfazer)" : "Marcar arquivos como gerados"}
                                            className={`flex items-center justify-center p-2 rounded mx-auto transition-colors ${
                                                v.filesGenerated 
                                                ? 'bg-green-100 text-green-600 hover:bg-green-200 shadow-sm' 
                                                : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                            }`}
                                         >
                                            {v.filesGenerated ? <FileCheck className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                            <span className="ml-1 text-xs font-bold">{v.filesGenerated ? 'OK' : 'Pendente'}</span>
                                         </button>
                                     </td>
                                     <td className="p-3 text-right">
                                         <button 
                                            onClick={() => handleDeleteVariation(v.id)}
                                            className="text-gray-400 hover:text-red-500"
                                         >
                                             <Trash2 className="w-4 h-4" />
                                         </button>
                                     </td>
                                 </tr>
                             ))}
                             {activeProject.variations.length === 0 && (
                                 <tr>
                                     <td colSpan={6} className="p-6 text-center text-gray-400 italic">
                                         Nenhuma variação registrada para este projeto ainda.
                                     </td>
                                 </tr>
                             )}
                         </tbody>
                     </table>
                 </div>
            </div>
        </div>
      )}

      {/* Pause Modal */}
      {showPauseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-bold mb-4 flex items-center text-yellow-600">
              <Pause className="w-5 h-5 mr-2" />
              Pausar Projeto
            </h3>
            <p className="text-gray-600 text-sm mb-4">
              Isso irá parar o cronômetro. O projeto ficará salvo na lista para retorno posterior.
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo da Pausa</label>
            <input 
              type="text" 
              autoFocus
              value={pauseReason}
              onChange={e => setPauseReason(e.target.value)}
              placeholder="Ex: Almoço..."
              className="w-full p-3 border rounded-lg mb-6 focus:ring-2 focus:ring-yellow-500 outline-none"
            />
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => setShowPauseModal(false)}
                className="text-gray-500 px-4 py-2 rounded-lg font-medium hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmPauseAndExit}
                className="bg-yellow-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-yellow-600"
              >
                Confirmar Pausa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Finish Confirmation Modal */}
      {showFinishModal && activeProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-bold mb-2 flex items-center text-red-600">
              <CheckSquare className="w-5 h-5 mr-2" />
              Finalizar Liberação
            </h3>
            <p className="text-gray-600 text-sm mb-6">
              Revise o tempo estimado para este projeto antes de concluir.
            </p>
            
            <div className="space-y-4 mb-6">
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="text-xs text-gray-500 uppercase font-bold mb-1">Tempo Realizado (Cronômetro)</div>
                    <div className="text-2xl font-mono font-bold text-gray-800">{formatTime(elapsedSeconds)}</div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tempo Estimado (Planejado)</label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input 
                        type="number" 
                        value={estHours}
                        onChange={e => setEstHours(e.target.value)}
                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="Horas"
                        min="0"
                      />
                      <span className="absolute right-3 top-3.5 text-xs text-gray-400 font-bold">H</span>
                    </div>
                    <div className="flex-1 relative">
                      <input 
                        type="number" 
                        value={estMinutes}
                        onChange={e => setEstMinutes(e.target.value)}
                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="Min"
                        min="0"
                        max="59"
                      />
                      <span className="absolute right-3 top-3.5 text-xs text-gray-400 font-bold">M</span>
                    </div>
                  </div>
                </div>
            </div>

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowFinishModal(false)}
                className="flex-1 text-gray-500 px-4 py-3 rounded-lg font-medium hover:bg-gray-100 border border-gray-200"
              >
                Voltar
              </button>
              <button 
                onClick={confirmFinish}
                className="flex-1 bg-red-600 text-white px-4 py-3 rounded-lg font-bold hover:bg-red-700 shadow-md transition-all"
              >
                Concluir e Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Timer Pop-up */}
      {!isVisible && activeProject && (
        <div 
          onClick={onNavigateBack}
          className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white p-4 rounded-xl shadow-2xl cursor-pointer hover:bg-slate-800 transition-all transform hover:scale-105 group border border-slate-700 ring-2 ring-blue-500/50"
        >
          <div className="flex items-center justify-between mb-2 gap-4">
            <div className="flex items-center text-green-400 text-xs font-bold uppercase tracking-wider animate-pulse">
              <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
              Em Andamento
            </div>
            <Maximize2 className="w-4 h-4 text-gray-400 group-hover:text-white" />
          </div>
          <div className="font-mono text-3xl font-bold mb-1">
            {formatTime(elapsedSeconds)}
          </div>
          <div className="text-xs text-gray-400 mb-1">
            NS: {activeProject.ns}
          </div>
          <div className="text-xs text-blue-400 font-medium mt-2 border-t border-slate-700 pt-2">
            Clique para retornar
          </div>
        </div>
      )}
    </>
  );
};
