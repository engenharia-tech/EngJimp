import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, Square, Clock, AlertCircle, Timer, Hash, Truck, Maximize2, Briefcase, ChevronRight, Plus, FileCheck, FileX, Trash2, Building, Layers, CheckSquare, Edit, Info, X, Loader2, Search } from 'lucide-react';
import { ProjectType, ProjectSession, PauseRecord, ImplementType, VariationRecord, User, InterruptionRecord, AppSettings, InterruptionStatus, InterruptionArea, ProjectRequest, ProjectRequestStatus, AppState } from '../types';
import { PROJECT_TYPES, IMPLEMENT_TYPES, FLOORING_TYPES, SUSPENSION_TYPES, PRODUCT_CATEGORIES } from '../constants';
import { calcActiveSeconds, isWorkingHour } from '../utils/workdayCalc';
import { fetchUsers } from '../services/storageService';
import { triggerExcelUpdate } from '../services/webhookService';
import { useToast } from './Toast';
import { useLanguage } from '../i18n/LanguageContext';

// SUBSTITUA ISSO PELA SUA URL DO WEBHOOK DO TEAMS
const TEAMS_WEBHOOK_URL = "https://outlook.office.com/webhook/YOUR_WEBHOOK_URL_HERE";

interface EngJimpTrackerProps {
  existingProjects: ProjectSession[];
  allProjects: ProjectSession[];
  interruptions: InterruptionRecord[];
  settings: AppSettings;
  onCreate: (project: ProjectSession) => Promise<AppState | undefined>;
  onUpdate: (project: ProjectSession, isHeartbeat?: boolean) => void;
  onAddInterruption: (interruption: InterruptionRecord) => void;
  onUpdateInterruption: (interruption: InterruptionRecord, isHeartbeat?: boolean) => void;
  projectRequests: ProjectRequest[];
  onAddProjectRequest: (request: ProjectRequest) => void;
  onUpdateProjectRequest: (request: ProjectRequest) => void;
  onDeleteProjectRequest: (id: string) => void;
  isVisible: boolean;
  onNavigateBack: () => void;
  currentUser: User | null;
}

export const EngJimpTracker: React.FC<EngJimpTrackerProps> = ({ 
  existingProjects, 
  allProjects,
  interruptions, 
  settings, 
  onCreate, 
  onUpdate, 
  onAddInterruption,
  onUpdateInterruption,
  projectRequests,
  onAddProjectRequest,
  onUpdateProjectRequest,
  onDeleteProjectRequest,
  isVisible, 
  onNavigateBack, 
  currentUser 
}) => {
  const [activeProject, setActiveProject] = useState<ProjectSession | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedProjectDetails, setSelectedProjectDetails] = useState<ProjectSession | null>(null);
  const { addToast } = useToast();
  const { t } = useLanguage();

  // NS Queue Form Data
  const [showNSForm, setShowNSForm] = useState(false);
  const [nsClient, setNsClient] = useState('');
  const [nsNumber, setNsNumber] = useState('');
  const [nsProductType, setNsProductType] = useState('');
  const [nsDimension, setNsDimension] = useState('');
  const [nsFlooring, setNsFlooring] = useState('');
  const [nsSetup, setNsSetup] = useState('');
  const [nsManagementEstimate, setNsManagementEstimate] = useState('');
  const [nsNeedsBase, setNsNeedsBase] = useState(true);
  const [nsNeedsBox, setNsNeedsBox] = useState(true);
  const [nsChassis, setNsChassis] = useState('');
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<ProjectRequest | null>(null);
  const [nsSearch, setNsSearch] = useState('');
  const [showPickModal, setShowPickModal] = useState(false);
  const [pickPart, setPickPart] = useState<'BASE' | 'BOX' | 'BOTH'>('BASE');
  const [pickDesignerEstHours, setPickDesignerEstHours] = useState('');
  const [pickDesignerEstMinutes, setPickDesignerEstMinutes] = useState('');
  const [pickIsOvertime, setPickIsOvertime] = useState(false);

  // Form Data (Start)
  const [ns, setNs] = useState('');
  const [clientName, setClientName] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [chassis, setChassis] = useState('');
  const [type, setType] = useState<ProjectType>(ProjectType.RELEASE);
  const [implementType, setImplementType] = useState<ImplementType>(ImplementType.BASE);
  const [flooringType, setFlooringType] = useState('');
  const [notes, setNotes] = useState('');
  const [estHours, setEstHours] = useState<string>('');
  const [estMinutes, setEstMinutes] = useState<string>('');
  const [isOvertime, setIsOvertime] = useState(false);

  const aggregatedInfo = useMemo(() => {
    if (!ns.trim()) return null;
    const related = allProjects.filter(p => p.ns === ns.trim());
    if (related.length === 0) return null;

    const totalSeconds = related.reduce((acc, p) => acc + (p.totalActiveSeconds || 0), 0);
    const contributors = new Set(related.map(p => p.userId)).size;
    
    return {
      totalSeconds,
      contributors,
      count: related.length
    };
  }, [ns, allProjects]);

  // Variation Form Data
  const [varOldCode, setVarOldCode] = useState('');
  const [varNewCode, setVarNewCode] = useState('');
  const [varDesc, setVarDesc] = useState('');
  const [varType, setVarType] = useState<'MONTAGEM' | 'PEÇA'>('PEÇA');
  const [varFiles, setVarFiles] = useState(false);

  // Pause Logic
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [pauseReason, setPauseReason] = useState('');
  const [pauseSector, setPauseSector] = useState('');
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [sentEmailProjectIds, setSentEmailProjectIds] = useState<string[]>([]);
  const [lastHeartbeat, setLastHeartbeat] = useState<number>(Date.now());
  const [isSaving, setIsSaving] = useState(false);

  // Sync active project if it's updated in the background (via props or other tabs)
  useEffect(() => {
    if (activeProject && existingProjects) {
      const updated = existingProjects.find(p => p.id === activeProject.id && p.status === 'IN_PROGRESS');
      if (updated) {
        // Only update if there's a significant change to avoid infinite loops
        // comparing core fields (status, ns, startTime, plus pauses/variations length)
        const hasSubstantialChange = 
          updated.status !== activeProject.status || 
          updated.ns !== activeProject.ns ||
          updated.pauses.length !== activeProject.pauses.length ||
          updated.variations.length !== activeProject.variations.length;

        if (hasSubstantialChange) {
          console.log(`[Sync] Syncing active project ${activeProject.ns} from props`);
          setActiveProject(updated);
        }
      } else if (activeProject.status === 'IN_PROGRESS') {
        // If it was in progress but no longer found as in progress in global data
        // (Possibly finished or deleted in another tab)
        console.log(`[Sync] Active project ${activeProject.ns} no longer in progress globally. Clearing local active state.`);
        setActiveProject(null);
      }
    }
  }, [existingProjects, activeProject?.id, activeProject?.status]);

  // Refs for heartbeat values to avoid stale closures in intervals
  const lastHeartbeatRef = useRef<number>(Date.now());
  const elapsedSecondsRef = useRef<number>(0);
  const onUpdateRef = useRef(onUpdate);

  // Auto-detect overtime based on clock when not in a project
  useEffect(() => {
    if (!activeProject && settings) {
      const now = new Date();
      const isNowWorking = isWorkingHour(now, settings, false);
      if (!isNowWorking) {
        setIsOvertime(true);
        setPickIsOvertime(true);
      } else {
        setIsOvertime(false);
        setPickIsOvertime(false);
      }
    }
  }, [settings, activeProject, isVisible]);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    elapsedSecondsRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const filteredRequests = useMemo(() => {
    return projectRequests.filter(request => {
      // Basic status filter
      if (request.status === ProjectRequestStatus.COMPLETED || request.status === ProjectRequestStatus.CANCELLED) return false;
      
      // Availability filter (only show if not both parts are in progress/done)
      const baseInProgress = request.needsBase && request.baseProjectId;
      const boxInProgress = request.needsBox && request.boxProjectId;
      
      let isAvailable = true;
      if (request.needsBase && request.needsBox) isAvailable = !(baseInProgress && boxInProgress);
      else if (request.needsBase) isAvailable = !baseInProgress;
      else if (request.needsBox) isAvailable = !boxInProgress;
      
      if (!isAvailable) return false;

      // Search filter
      if (!nsSearch.trim()) return true;
      const search = nsSearch.toLowerCase();
      return (
        request.ns.toLowerCase().includes(search) ||
        (request.clientName || '').toLowerCase().includes(search) ||
        (request.productType || '').toLowerCase().includes(search) ||
        (request.flooring || '').toLowerCase().includes(search) ||
        (request.setup || '').toLowerCase().includes(search) ||
        (request.chassisNumber || '').toLowerCase().includes(search)
      );
    });
  }, [projectRequests, nsSearch]);

  const pendingProjects = useMemo(() => {
    return existingProjects
      .filter(p => p.status === 'IN_PROGRESS')
      .sort((a, b) => a.ns.localeCompare(b.ns));
  }, [existingProjects]);

  // Helper to check if flooring field should show
  const shouldShowFlooring = [
    ImplementType.BASE, 
    ImplementType.FURGAO_SC, 
    ImplementType.FURGAO_SR, 
    ImplementType.SIDER_SC,
    ImplementType.SIDER_SR,
    ImplementType.GRANELEIRO,
    ImplementType.BASCULANTE,
    ImplementType.CARGA_SECA_SC,
    ImplementType.CARGA_SECA_SR
  ].includes(implementType);

  useEffect(() => {
    fetchUsers().then(list => {
      const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
      setUsers(sorted);
    });
  }, []);

  useEffect(() => {
    const updateTimer = () => {
      if (!activeProject) {
        setElapsedSeconds(0);
        return;
      }

      // Check if currently paused (has an open pause at the end)
      const lastPause = activeProject.pauses.length > 0 ? activeProject.pauses[activeProject.pauses.length - 1] : null;
      const isCurrentlyPaused = lastPause && lastPause.durationSeconds === -1;

      const start = new Date(activeProject.startTime);
      const now = new Date();
      
      // For the VISUAL timer, we'll show the actual elapsed working time
      // to give the user feedback that it's running.
      const totalWorkingSeconds = calcActiveSeconds(start, now, settings, activeProject.isOvertime);

      // Calculate Total Working Time consumed by CLOSED pauses
      let totalPauseWorkingSeconds = 0;
      activeProject.pauses.forEach(p => {
          if (p.durationSeconds > 0) {
              const pStart = new Date(p.timestamp);
              const pEnd = new Date(pStart.getTime() + p.durationSeconds * 1000);
              totalPauseWorkingSeconds += calcActiveSeconds(pStart, pEnd, settings, activeProject.isOvertime);
          } else if (p.durationSeconds === -1) {
              // If currently paused, subtract working time from pause start to now
              const pStart = new Date(p.timestamp);
              totalPauseWorkingSeconds += calcActiveSeconds(pStart, now, settings, activeProject.isOvertime);
          }
      });

      // Also subtract interruption time linked to this project
      const projectInterruptionSeconds = interruptions
        .filter(i => (i.projectId === activeProject.id || i.projectNs === activeProject.ns))
        .reduce((acc, i) => {
          const iStart = new Date(i.startTime);
          const iEnd = i.endTime ? new Date(i.endTime) : now;
          // Only count the part of the interruption that falls within the project's working session (from start to now)
          const effectiveStart = iStart > start ? iStart : start;
          const effectiveEnd = iEnd < now ? iEnd : now;
          
          if (effectiveStart < effectiveEnd) {
            return acc + calcActiveSeconds(effectiveStart, effectiveEnd, settings, activeProject.isOvertime);
          }
          return acc;
        }, 0);

      const netSeconds = Math.max(0, totalWorkingSeconds - totalPauseWorkingSeconds - projectInterruptionSeconds);
      
      // If netSeconds is 0 but the project is NOT paused and we are within working hours,
      // it might be a calculation delay. Let's ensure it shows at least 1 if it just started.
      setElapsedSeconds(netSeconds);
    };

    if (activeProject && !showPauseModal) {
      updateTimer(); // Initial call
      timerRef.current = setInterval(updateTimer, 1000);
      
      // Heartbeat every 60 seconds to update lastActiveAt (updated_at in DB)
      const heartbeatInterval = setInterval(() => {
        const now = Date.now();
        if (now - lastHeartbeatRef.current >= 60000) {
          console.log(`[Heartbeat] Updating project ${activeProject.ns}. Elapsed: ${elapsedSecondsRef.current}s`);
          onUpdateRef.current({
            ...activeProject,
            totalActiveSeconds: elapsedSecondsRef.current
          }, true);
          lastHeartbeatRef.current = now;
          setLastHeartbeat(now);
        }
      }, 10000); // Check every 10s if 60s passed

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
        clearInterval(heartbeatInterval);
      };
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeProject, showPauseModal, settings, interruptions]);


  const handleStartNew = async () => {
    if (!ns.trim()) {
      alert(t('nsRequired'));
      return;
    }

    // MELHORIA 3: Bloqueio de NS duplicada
    const isDuplicate = allProjects.some(p => p.ns === ns.trim() && p.status === 'IN_PROGRESS');
    if (isDuplicate) {
      alert(t('nsDuplicate', { ns: ns.trim() }));
      return;
    }

    // Check Working Hours
    if (!isWorkingHour(new Date(), settings, isOvertime)) {
      alert(t('outsideWorkingHours'));
      return;
    }

    setIsSaving(true);
    try {
      const estimatedSeconds = (parseInt(estHours) || 0) * 3600 + (parseInt(estMinutes) || 0) * 60;

      const projectId = crypto.randomUUID();

      // If we have a selected request or the NS matches a pending request, update it
      const matchingRequest = selectedRequest || projectRequests.find(r => r.ns === ns.trim() && r.status === ProjectRequestStatus.PENDING);

      if (matchingRequest) {
        const isBase = implementType === ImplementType.BASE;
        const isBox = implementType === ImplementType.CAIXA_CARGA;
        const isBoth = implementType === ImplementType.BASE_AND_BOX;

        const updatedRequest = {
          ...matchingRequest,
          status: ProjectRequestStatus.IN_PROGRESS,
          assignedTo: currentUser?.id || '',
        };

        if (isBoth || (!isBase && !isBox)) {
          // Se for "Ambos" ou um tipo unificado (Furgão, Sider, etc), preenchemos os IDs das partes necessárias
          if (updatedRequest.needsBase) updatedRequest.baseProjectId = projectId;
          if (updatedRequest.needsBox) updatedRequest.boxProjectId = projectId;
        } else if (isBase) {
          updatedRequest.baseProjectId = projectId;
        } else if (isBox) {
          updatedRequest.boxProjectId = projectId;
        }

        onUpdateProjectRequest(updatedRequest);
      }

      const newProject: ProjectSession = {
        id: projectId,
        name: clientName || projectCode || ns || 'Sem Nome',
        ns,
        clientName,
        projectCode,
        chassisNumber: chassis,
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
        userId: currentUser?.id,
        isOvertime
      };

      await onCreate(newProject);
      setActiveProject(newProject);
      
      // Reset form fields
      setNs('');
      setClientName('');
      setProjectCode('');
      setChassis('');
      setNotes('');
      setFlooringType('');
      setEstHours('');
      setEstMinutes('');
      setIsOvertime(false);
      setSelectedRequest(null);
    } catch (error) {
      console.error("Error starting project:", error);
      addToast(t('errorStartingProject'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePickRequest = (request: ProjectRequest) => {
    setSelectedRequest(request);
    
    // Default pick part based on what's available
    if (request.needsBase && !request.baseProjectId) {
      setPickPart('BASE');
    } else if (request.needsBox && !request.boxProjectId) {
      setPickPart('BOX');
    }
    
    setPickDesignerEstHours('');
    setPickDesignerEstMinutes('');
    setShowPickModal(true);
  };

  const handleConfirmPick = async () => {
    if (!selectedRequest || isSaving) return;

    // Check Working Hours
    if (!isWorkingHour(new Date(), settings, pickIsOvertime)) {
      alert(t('outsideWorkingHours'));
      return;
    }

    setIsSaving(true);
    try {
      const nsVal = selectedRequest.ns;
      const clientVal = selectedRequest.clientName;
      const notesVal = `${t('productLabel')}: ${selectedRequest.productType}\n${t('dimensionLabel')}: ${selectedRequest.dimension}\n${t('flooringLabel')}: ${selectedRequest.flooring}\n${t('setupLabel')}: ${selectedRequest.setup}`;
      
      // Designer estimate in seconds
      const estSec = (parseInt(pickDesignerEstHours) || 0) * 3600 + (parseInt(pickDesignerEstMinutes) || 0) * 60;

      let currentRequest = { ...selectedRequest };
      let projectToActivate: ProjectSession | null = null;

      const startProject = async (partType: ImplementType) => {
        const newProject: ProjectSession = {
          id: crypto.randomUUID(),
          name: clientVal || selectedRequest.chassisNumber || nsVal || 'Sem Nome',
          ns: nsVal,
          clientName: clientVal,
          chassisNumber: selectedRequest.chassisNumber,
          type: ProjectType.RELEASE,
          implementType: partType,
          startTime: new Date().toISOString(),
          totalActiveSeconds: 0,
          pauses: [],
          variations: [],
          status: 'IN_PROGRESS',
          notes: notesVal,
          userId: currentUser?.id,
          isOvertime: pickIsOvertime,
          // Se for ambos, dividimos a estimativa entre os dois projetos
          estimatedSeconds: pickPart === 'BOTH' ? estSec / 2 : estSec
        };

        const updatedState = await onCreate(newProject);
        if (updatedState) {
          return updatedState.projects.find(p => p.id === newProject.id);
        }
        return null;
      };

      if (pickPart === 'BASE') {
        const p = await startProject(ImplementType.BASE);
        if (p) {
          currentRequest.baseProjectId = p.id;
          projectToActivate = p;
        }
      } else if (pickPart === 'BOX') {
        const p = await startProject(ImplementType.CAIXA_CARGA);
        if (p) {
          currentRequest.boxProjectId = p.id;
          projectToActivate = p;
        }
      } else if (pickPart === 'BOTH') {
        const p1 = await startProject(ImplementType.BASE);
        if (p1) {
          currentRequest.baseProjectId = p1.id;
          projectToActivate = p1; // Ativamos a base primeiro
        }
        
        const p2 = await startProject(ImplementType.CAIXA_CARGA);
        if (p2) {
          currentRequest.boxProjectId = p2.id;
          // O segundo projeto fica na lista de pendentes para ser retomado depois
        }
      }

      // Atualiza a estimativa do projetista no pedido (uma única vez)
      currentRequest.designerEstimate = (currentRequest.designerEstimate || 0) + (estSec / 3600);
      currentRequest.status = ProjectRequestStatus.IN_PROGRESS;
      
      await onUpdateProjectRequest(currentRequest);

      if (projectToActivate) {
        // AUTO-PAUSE previous active project if any
        if (activeProject && activeProject.id !== projectToActivate.id) {
          const currentActive = elapsedSeconds;
          const autoPause: PauseRecord = {
            reason: `${t('autoPauseTitle') || 'Pausa Automática'}: ${t('projectSwitch') || 'Troca de Projeto'}`,
            timestamp: new Date().toISOString(),
            durationSeconds: -1
          };
          await onUpdate({
            ...activeProject,
            totalActiveSeconds: currentActive,
            pauses: [...activeProject.pauses, autoPause]
          });
        }
        
        setActiveProject(projectToActivate);
        setLastHeartbeat(Date.now());
      }

      setShowPickModal(false);
      setSelectedRequest(null);
      setPickIsOvertime(false);
      addToast(t('nsSelected', { ns: nsVal }), 'success');
    } catch (error) {
      console.error("Error picking project:", error);
      addToast(t('errorStartingProject') || 'Erro ao iniciar projeto', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegisterNS = async () => {
    if (isSaving) return;
    if (!nsNumber.trim() || !nsClient.trim()) {
      addToast(t('fillRequiredFields'), 'error');
      return;
    }

    setIsSaving(true);
    try {
      if (editingRequestId) {
        const existingRequest = projectRequests.find(r => r.id === editingRequestId);
        if (existingRequest) {
          const updatedRequest: ProjectRequest = {
            ...existingRequest,
            clientName: nsClient,
            ns: nsNumber,
            productType: nsProductType,
            dimension: nsDimension,
            flooring: nsFlooring,
            setup: nsSetup,
            chassisNumber: nsChassis,
            needsBase: nsNeedsBase,
            needsBox: nsNeedsBox,
            managementEstimate: parseFloat(nsManagementEstimate) || 0,
          };
          await onUpdateProjectRequest(updatedRequest);
          addToast(t('nsUpdatedSuccess') || 'Pedido atualizado com sucesso!', 'success');
        }
        setEditingRequestId(null);
      } else {
        const newRequest: ProjectRequest = {
          id: crypto.randomUUID(),
          clientName: nsClient,
          ns: nsNumber,
          productType: nsProductType,
          dimension: nsDimension,
          flooring: nsFlooring,
          setup: nsSetup,
          chassisNumber: nsChassis,
          needsBase: nsNeedsBase,
          needsBox: nsNeedsBox,
          managementEstimate: parseFloat(nsManagementEstimate) || 0,
          status: ProjectRequestStatus.PENDING,
          createdAt: new Date().toISOString(),
          createdBy: currentUser?.id || ''
        };

        await onAddProjectRequest(newRequest);
        addToast(t('nsRegisteredSuccess') || 'Pedido registrado com sucesso!', 'success');
      }
      
      // Reset form
      setNsClient('');
      setNsNumber('');
      setNsProductType('');
      setNsDimension('');
      setNsFlooring('');
      setNsSetup('');
      setNsChassis('');
      setNsManagementEstimate('');
      setNsNeedsBase(true);
      setNsNeedsBox(true);
      setShowNSForm(false);
    } catch (error) {
      console.error("Error registering NS:", error);
      // If we got here, a toast was likely already shown by App.tsx, but we'll ensure feedback.
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditRequest = (request: ProjectRequest) => {
    setEditingRequestId(request.id);
    setNsClient(request.clientName);
    setNsNumber(request.ns);
    setNsProductType(request.productType || '');
    setNsDimension(request.dimension || '');
    setNsFlooring(request.flooring || '');
    setNsSetup(request.setup || '');
    setNsChassis(request.chassisNumber || '');
    setNsManagementEstimate(request.managementEstimate?.toString() || '');
    setNsNeedsBase(request.needsBase);
    setNsNeedsBox(request.needsBox);
    setShowNSForm(true);
    
    // Scroll to form
    const formElement = document.getElementById('ns-form-container');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleResumeFromList = async (project: ProjectSession) => {
    if (isSaving) return;

    // Check Working Hours - Warn but don't block, so they can toggle overtime if needed
    if (!isWorkingHour(new Date(), settings, project.isOvertime)) {
      addToast(t('outsideWorkingHoursNoOvertime'), 'warning');
    }

    setIsSaving(true);
    try {
      // AUTO-PAUSE previous active project if any
      if (activeProject && activeProject.id !== project.id) {
        const currentActive = elapsedSeconds;
        const autoPause: PauseRecord = {
          reason: `${t('autoPauseTitle') || 'Pausa Automática'}: ${t('projectSwitch') || 'Troca de Projeto'}`,
          timestamp: new Date().toISOString(),
          durationSeconds: -1
        };
        await onUpdate({
          ...activeProject,
          totalActiveSeconds: currentActive,
          pauses: [...activeProject.pauses, autoPause]
        });
      }

      // MELHORIA 1: Pausar tempo fora do expediente
      // Se o projeto estava IN_PROGRESS e o app foi fechado, calculamos o tempo produtivo desde o último save
      let updatedProject = { ...project };
      const now = new Date();
      
      if (project.lastActiveAt) {
        const lastActive = new Date(project.lastActiveAt);
        let productiveSecondsSinceLastSave = calcActiveSeconds(lastActive, now, settings, project.isOvertime);
        
        // Find interruptions that happened between lastActive and now
        const projectHistoryInterruptions = interruptions.filter(i => {
           const iStart = new Date(i.startTime);
           // NS fallback for older or pending projects
           const matchesProject = (i.projectId && i.projectId === project.id) || (i.projectNs === project.ns);
           return matchesProject && iStart >= lastActive;
        });

        const overlapInterruptionSeconds = projectHistoryInterruptions.reduce((acc, i) => {
          const iStart = new Date(i.startTime);
          const iEnd = i.endTime ? new Date(i.endTime) : now;
          // Calculate active seconds specifically for this interruption period
          return acc + calcActiveSeconds(iStart, iEnd, settings, project.isOvertime);
        }, 0);

        productiveSecondsSinceLastSave = Math.max(0, productiveSecondsSinceLastSave - overlapInterruptionSeconds);
        
        // Se passou tempo produtivo desde o último save, adicionamos ao total
        if (productiveSecondsSinceLastSave > 0) {
          updatedProject.totalActiveSeconds += productiveSecondsSinceLastSave;
          console.log(`Resuming project ${project.ns}: adding ${productiveSecondsSinceLastSave}s of productive time since last save (after subtracting interruptions).`);
        }
      }

      // Logic to close open pause if needed
      const lastPauseIndex = updatedProject.pauses.length - 1;
      if (lastPauseIndex >= 0 && updatedProject.pauses[lastPauseIndex].durationSeconds === -1) {
        const pauseStart = new Date(updatedProject.pauses[lastPauseIndex].timestamp);
        
        // Calculate productive duration for the pause record
        const pauseDuration = calcActiveSeconds(pauseStart, now, settings, updatedProject.isOvertime);

        const updatedPauses = [...updatedProject.pauses];
        updatedPauses[lastPauseIndex] = {
          ...updatedPauses[lastPauseIndex],
          durationSeconds: pauseDuration
        };

        updatedProject = { ...updatedProject, pauses: updatedPauses };
        
        // Check if there's an open interruption for this project and close it
        const openInterruption = interruptions.find(i => 
            i.projectNs === updatedProject.ns && 
            i.status === InterruptionStatus.OPEN && 
            i.designerId === currentUser?.id
        );

        if (openInterruption) {
            const interruptionStart = new Date(openInterruption.startTime);
            const interruptionDuration = calcActiveSeconds(interruptionStart, now, settings, updatedProject.isOvertime);
            
            const updatedInterruption: InterruptionRecord = {
                ...openInterruption,
                endTime: now.toISOString(),
                totalTimeSeconds: (openInterruption.totalTimeSeconds || 0) + interruptionDuration,
                status: InterruptionStatus.RESOLVED
            };
            onUpdateInterruption(updatedInterruption);
        }

        onUpdate(updatedProject);
        setActiveProject(updatedProject);
      } else {
        // Se não estava pausado, mas estava IN_PROGRESS, o tempo continuou contando
        // Já atualizamos o totalActiveSeconds acima se havia lastActiveAt
        onUpdate(updatedProject);
        setActiveProject(updatedProject);
      }
      setLastHeartbeat(Date.now());
    } catch (error) {
      console.error("Error resuming project:", error);
      addToast(t('errorResumingProject'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePauseProject = () => setShowPauseModal(true);

  const confirmPauseAndExit = async () => {
    if (!activeProject || isSaving) return;

    const isInterruption = pauseReason.toLowerCase().includes('informação') || 
                          pauseReason.toLowerCase().includes('informacao') ||
                          pauseReason.toLowerCase().includes('incompatibilidade');
    
    if (isInterruption && !pauseSector) {
        alert(t('selectProblemSector'));
        return;
    }

    setIsSaving(true);
    try {
      const newPause: PauseRecord = {
        reason: pauseReason || 'Pausa',
        timestamp: new Date().toISOString(),
        durationSeconds: -1 // Flag for "Open/Ongoing" pause
      };

      // If it's a specific interruption, we could potentially flag it here
      // But for now we just store the reason as requested.
      // We'll append the sector to the reason if applicable
      if (isInterruption && pauseSector) {
          newPause.reason = `${pauseReason} (${pauseSector})`;
      }

      // Calculate current active seconds to update the snapshot
      const currentActive = elapsedSeconds; 

      const updatedProject = {
        ...activeProject,
        totalActiveSeconds: currentActive, // Snapshot
        pauses: [...activeProject.pauses, newPause]
      };

      if (isInterruption) {
          const newInterruption: InterruptionRecord = {
              id: crypto.randomUUID(),
              projectId: activeProject.id,
              projectNs: activeProject.ns,
              clientName: activeProject.clientName || '',
              designerId: currentUser?.id || '',
              startTime: new Date().toISOString(),
              problemType: pauseReason,
              responsibleArea: pauseSector as InterruptionArea,
              responsiblePerson: '',
              description: '',
              status: InterruptionStatus.OPEN,
              totalTimeSeconds: 0
          };
          await onAddInterruption(newInterruption);
      }

      await onUpdate(updatedProject);
      setActiveProject(null);
      setShowPauseModal(false);
      setPauseReason('');
      setPauseSector('');
    } catch (error) {
      console.error("Error pausing project:", error);
      addToast(t('errorPausingProject'), 'error');
    } finally {
      setIsSaving(false);
    }
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
    if (!activeProject || isFinalizing) return;

    // Start finalizing process
    setIsFinalizing(true);
    
    try {
      // Final Calculation using Working Hours
      const start = new Date(activeProject.startTime);
      const now = new Date();
      
      // 1. Total Working Time
      const totalWorkingSeconds = calcActiveSeconds(start, now, settings, activeProject.isOvertime);

      // 2. Subtract Working Time spent in Pauses
      let totalPauseWorkingSeconds = 0;
      activeProject.pauses.forEach(p => {
          if (p.durationSeconds > 0) {
              const pStart = new Date(p.timestamp);
              const pEnd = new Date(pStart.getTime() + p.durationSeconds * 1000);
              totalPauseWorkingSeconds += calcActiveSeconds(pStart, pEnd, settings, activeProject.isOvertime);
          }
      });

      const estimatedSeconds = (parseInt(estHours) || 0) * 3600 + (parseInt(estMinutes) || 0) * 60;

      // --- NEW CALCULATIONS ---
      // Calculate interruption seconds for this project ID (with NS fallback for legacy data)
      const projectInterruptions = interruptions.filter(i => {
        if (i.projectId) return i.projectId === activeProject.id && i.status === InterruptionStatus.RESOLVED;
        return i.projectNs === activeProject.ns && i.status === InterruptionStatus.RESOLVED;
      });

      const interruptionSeconds = projectInterruptions.reduce((acc, curr) => acc + curr.totalTimeSeconds, 0);
      const finalSeconds = Math.max(0, totalWorkingSeconds - totalPauseWorkingSeconds - interruptionSeconds);
      const totalSeconds = finalSeconds + interruptionSeconds;
      
      // Use the hourly rate passed from settings (which is already the effective rate)
      const hourlyRate = settings.hourlyCost;

      const productiveCost = (finalSeconds / 3600) * hourlyRate;
      const interruptionCost = (interruptionSeconds / 3600) * hourlyRate;
      const totalCost = productiveCost + interruptionCost;

      const finishedProject: ProjectSession = {
        ...activeProject,
        endTime: new Date().toISOString(),
        totalActiveSeconds: finalSeconds,
        interruptionSeconds,
        totalSeconds,
        productiveCost,
        interruptionCost,
        totalCost,
        estimatedSeconds: estimatedSeconds > 0 ? estimatedSeconds : activeProject.estimatedSeconds,
        status: 'COMPLETED'
      };

      // Update Project Request status if linked
      const linkedRequest = projectRequests.find(r => r.baseProjectId === activeProject.id || r.boxProjectId === activeProject.id);
      if (linkedRequest) {
        const updatedRequest = { ...linkedRequest };
        
        // Verificamos se todas as partes necessárias estão agora concluídas
        const baseNeeded = updatedRequest.needsBase;
        const boxNeeded = updatedRequest.needsBox;
        
        let baseDone = !baseNeeded;
        if (baseNeeded) {
          // Se este projeto que estamos finalizando é a Base do pedido
          if (updatedRequest.baseProjectId === activeProject.id) {
            baseDone = true;
          } else if (updatedRequest.baseProjectId) {
            // Se for outro projeto, verificamos se já está COMPLETED na lista global
            const p = allProjects.find(px => px.id === updatedRequest.baseProjectId);
            if (p && p.status === 'COMPLETED') baseDone = true;
          }
        }
        
        let boxDone = !boxNeeded;
        if (boxNeeded) {
          // Se este projeto que estamos finalizando é a Caixa do pedido
          if (updatedRequest.boxProjectId === activeProject.id) {
            boxDone = true;
          } else if (updatedRequest.boxProjectId) {
            // Se for outro projeto, verificamos se já está COMPLETED na lista global
            const p = allProjects.find(px => px.id === updatedRequest.boxProjectId);
            if (p && p.status === 'COMPLETED') boxDone = true;
          }
        }

        if (baseDone && boxDone) {
          updatedRequest.status = ProjectRequestStatus.COMPLETED;
        }
        
        await onUpdateProjectRequest(updatedRequest);
      }

      // 1. Update DB
      console.log("Finalizing project in DB:", finishedProject.ns, finishedProject);
      try {
        await onUpdate(finishedProject);
      } catch (dbError) {
        console.error("Database update failed in confirmFinish:", dbError);
        throw dbError; // Propagate to outer try/catch
      }
      console.log("Project updated successfully in DB.");
      
      // Close modal and clear active project immediately after DB success
      setActiveProject(null);
      setShowFinishModal(false);
      
      // 2. Send Notifications (in background, don't block UI)
      console.log("Triggering notifications...");
      sendTeamsNotification(finishedProject);
      
      // Determine if we should send email (only when ALL designers for this NS have finished)
      let shouldSendEmail = false;
      
      if (linkedRequest) {
          // If it's a split project (Base + Box), check if both are finished
          const baseFinished = !linkedRequest.needsBase || 
                               linkedRequest.baseProjectId === finishedProject.id || 
                               (linkedRequest.baseProjectId && allProjects.find(p => p.id === linkedRequest.baseProjectId)?.status === 'COMPLETED');
                               
          const boxFinished = !linkedRequest.needsBox || 
                              linkedRequest.boxProjectId === finishedProject.id || 
                              (linkedRequest.boxProjectId && allProjects.find(p => p.id === linkedRequest.boxProjectId)?.status === 'COMPLETED');
          
          // Also check if ANY other sessions for this NS are still in progress
          const NS_Sessions = allProjects.filter(p => p.ns === finishedProject.ns);
          const anyInProgress = NS_Sessions.some(p => p.status === 'IN_PROGRESS' && p.id !== finishedProject.id);

          if (baseFinished && boxFinished && !anyInProgress) {
              shouldSendEmail = true;
          }
      } else {
          // No linked request (single project), just check if any other sessions for this NS are done
          const NS_Sessions = allProjects.filter(p => p.ns === finishedProject.ns);
          const anyOthersActive = NS_Sessions.some(p => p.status === 'IN_PROGRESS' && p.id !== finishedProject.id);
          
          if (!anyOthersActive) {
              shouldSendEmail = true;
          }
      }
      
      // Only send email if it's entirely done and hasn't been sent for this project triggering it
      if (shouldSendEmail && !sentEmailProjectIds.includes(finishedProject.id)) {
          console.log("Entire NS finished. Sending final email notification for project:", finishedProject.ns);
          sendEmailNotification(finishedProject).then(() => {
              console.log("Email notification process finished.");
              setSentEmailProjectIds(prev => [...prev, finishedProject.id]);
          }).catch(err => {
              console.error("Delayed email error:", err);
          });
      } else {
          console.log("NS not yet fully finished or email already sent. Skipping email trigger.");
      }
      
      // 3. Trigger Excel Integration
      triggerExcelUpdate(finishedProject, currentUser).catch(err => {
          console.error("Excel update error:", err);
      });

      // Reset form
      setEstHours('');
      setEstMinutes('');
    } catch (error) {
      console.error("Error during project finalization:", error);
      addToast(t('errorFinishingProject'), "error");
    } finally {
      setIsFinalizing(false);
    }
  };

  // --- VARIATION HANDLERS ---
  const handleAddVariation = () => {
      if (!activeProject) return;
      if (!varOldCode.trim() && !varNewCode.trim()) {
          alert(t('enterOneCode'));
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

  const handleToggleOvertime = () => {
      if (!activeProject) return;
      const updated = { ...activeProject, isOvertime: !activeProject.isOvertime };
      setActiveProject(updated);
      onUpdate(updated);
      addToast(updated.isOvertime ? t('overtimeModeEnabled') : t('ruleStandard'), 'info');
  };

  const saveProjectCode = () => {
      if (!activeProject) return;
      onUpdate(activeProject);
  };

  const sendTeamsNotification = async (project: ProjectSession) => {
    if (!TEAMS_WEBHOOK_URL || TEAMS_WEBHOOK_URL.includes("YOUR_WEBHOOK_URL_HERE")) return;

    const designerName = currentUser ? `${currentUser.name} ${currentUser.surname || ''}`.trim() : t('unidentified');
    const duration = formatTime(project.totalActiveSeconds);
    const message = {
      "@type": "MessageCard",
      "@context": "http://schema.org/extensions",
      "themeColor": "0076D7",
      "summary": t('projectFinished'),
      "sections": [{
        "activityTitle": `✅ ${t('projectFinished')}`,
        "activitySubtitle": `DesignTrack Pro`,
        "facts": [
          { "name": `${t('ns')}:`, "value": project.ns },
          { "name": `${t('client')}:`, "value": project.clientName || "-" },
          { "name": `${t('designer')}:`, "value": designerName },
          { "name": `${t('type')}:`, "value": t(project.type.toLowerCase()) },
          { "name": `${t('variations')}:`, "value": project.variations.length.toString() },
          { "name": `${t('duration')}:`, "value": duration }
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

  const sendEmailNotification = async (project: ProjectSession) => {
    console.log("sendEmailNotification started for NS:", project.ns);
    
    if (!settings.emailTo) {
      console.warn("No email recipient configured in settings.");
      addToast(t('emailToNotConfigured') || 'Destinatário de e-mail não configurado nas configurações.', 'warning');
      return;
    }

    // Aggregate ALL sessions for this NS to show total time/cost
    const sessions = [
      ...allProjects.filter(p => p.ns === project.ns && p.id !== project.id),
      project
    ];

    const totalActiveSeconds = sessions.reduce((acc, p) => acc + (p.totalActiveSeconds || 0), 0);
    const totalEstimatedSeconds = sessions.reduce((acc, p) => acc + (p.estimatedSeconds || 0), 0);
    const totalCostValue = sessions.reduce((acc, p) => acc + (p.totalCost || 0), 0);
    
    const designers = sessions.map(p => {
        const u = users.find(usr => usr.id === p.userId);
        return u ? `${u.name} ${u.surname || ''}`.trim() : t('unidentified');
    });
    const designersStr = [...new Set(designers)].join(', ');
    const allNotes = sessions.map(p => p.notes).filter(v => v && v.trim()).join('\n---\n');

    const now = new Date();
    const hour = now.getHours();
    let greeting = t('goodMorning');
    if (hour >= 12 && hour < 18) greeting = t('goodAfternoon');
    else if (hour >= 18 || hour < 5) greeting = t('goodNight');

    const lang = settings.language || 'pt-BR';
    const hours = (totalActiveSeconds / 3600).toFixed(2);
    const plannedHours = (totalEstimatedSeconds / 3600).toFixed(2);
    const cost = totalCostValue.toLocaleString(lang, { style: 'currency', currency: 'BRL' });
    
    // Get interruptions for this project NS (aggregated)
    const projectInterruptions = interruptions.filter(i => i.projectNs === project.ns && i.status === InterruptionStatus.RESOLVED);
    const interruptionCount = projectInterruptions.length;
    
    // Calculate interruption time and cost breakdown
    const interruptionSeconds = projectInterruptions.reduce((acc, curr) => acc + curr.totalTimeSeconds, 0);
    const hourlyRate = settings.hourlyCost || 0;
    const interruptionCostValue = (interruptionSeconds / 3600) * hourlyRate;
    const productiveCostValue = Math.max(0, totalCostValue - interruptionCostValue);

    const interruptionReasons = projectInterruptions.map(i => 
      `- ${i.problemType}: ${i.description || t('noDescription')} (${formatTime(i.totalTimeSeconds)})`
    ).join('\n');

    const subject = t('projectConclusionSubject', { ns: project.ns, client: project.clientName || t('noClient') });
    const body = `${greeting},

${t('informConclusion')}:

${t('ns')}: ${project.ns}
${t('client')}: ${project.clientName || t('notInformed')}
${t('projectCode')}: ${project.projectCode || t('notInformed')}
${t('designer')}: ${designersStr}

${t('plannedTime')}: ${plannedHours} ${t('hours')}
${t('executedTime')}: ${hours} ${t('hours')}
${t('interruptionTime')}: ${formatTime(interruptionSeconds)}

${t('productiveCost')}: ${productiveCostValue.toLocaleString(lang, { style: 'currency', currency: 'BRL' })}
${t('interruptionCost')}: ${interruptionCostValue.toLocaleString(lang, { style: 'currency', currency: 'BRL' })}
${t('totalProjectCost')}: ${cost}

${t('interruptionCount')}: ${interruptionCount}

${t('interruptionDetail')}:
${interruptionReasons || t('noInterruptions')}

${t('notes')}: 
${allNotes || t('none')}

${t('sincerely')}.
JIMPNEXUS
`;

    try {
      if (!settings.emailTo) {
        console.warn("Email notification skipped: No recipient configured in settings.");
        addToast(t('checkSettings'), 'warning');
        return;
      }

      if (!body || body.trim().length < 10) {
        console.error("Email body is too short or empty. Aborting send.");
        return;
      }

      console.log("Email Payload Debug:", {
        to: settings.emailTo,
        subject: subject,
        bodyLength: body.length
      });
      
      console.log("Fetching /api/send-email with recipient:", settings.emailTo);
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          subject, 
          body,
          to: settings.emailTo
        })
      });

      console.log("Email API HTTP Status:", response.status);
      const responseText = await response.text();
      console.log("Email API raw response:", responseText);
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (e) {
        console.error("Server response was not JSON:", responseText);
        throw new Error(`Resposta do servidor inválida (não JSON): ${responseText.substring(0, 100)}...`);
      }
      
      console.log("Email API response:", result);
      
      if (response.ok && result.success) {
        addToast(t('emailSentTo', { email: settings.emailTo }), 'success');
      } else {
        console.error("Email API returned failure:", result.error, "Code:", result.code);
        addToast(`${t('emailError')}: ${result.error || t('checkSettings')}`, 'error');
      }
    } catch (error: any) {
      console.error("Erro ao enviar e-mail (catch block):", error);
      addToast(`${t('connectionErrorEmail')}: ${error.message || error}`, 'error');
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
          
          {/* NS Queue Section */}
          <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-orange-100 dark:border-orange-900/30">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <h3 className="text-lg font-bold text-black dark:text-white flex items-center">
                <Layers className="w-5 h-5 mr-2 text-orange-600 dark:text-orange-400" />
                {t('nsQueueTitle')}
              </h3>
              
              <div className="flex flex-1 w-full md:w-auto max-w-md gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input 
                    type="text"
                    value={nsSearch}
                    onChange={e => setNsSearch(e.target.value)}
                    placeholder={t('searchPlaceholder')}
                    className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-slate-900 border border-orange-100 dark:border-orange-900/30 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none dark:text-white"
                  />
                </div>
                <button 
                  onClick={() => {
                    if (showNSForm) {
                      setEditingRequestId(null);
                      setNsClient('');
                      setNsNumber('');
                      setNsProductType('');
                      setNsDimension('');
                      setNsFlooring('');
                      setNsSetup('');
                      setNsChassis('');
                      setNsManagementEstimate('');
                      setNsNeedsBase(true);
                      setNsNeedsBox(true);
                    }
                    setShowNSForm(!showNSForm);
                  }}
                  className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg transition-colors text-sm font-bold whitespace-nowrap"
                >
                  {showNSForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {showNSForm ? t('cancel') : t('registerNs')}
                </button>
              </div>
            </div>

            {showNSForm && (
              <div id="ns-form-container" className="mb-6 p-4 border border-orange-200 dark:border-orange-800 rounded-lg bg-orange-50 dark:bg-orange-900/10 animate-in slide-in-from-top duration-200">
                <h4 className="font-bold text-orange-800 dark:text-orange-300 mb-4 uppercase">
                  {editingRequestId ? t('editOrderInQueue') : t('newOrderForQueue')}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-bold text-orange-800 dark:text-orange-300 mb-1">{t('client')}</label>
                    <input 
                      type="text" 
                      value={nsClient}
                      onChange={e => setNsClient(e.target.value)}
                      className="w-full p-2 border border-orange-200 dark:border-orange-800 rounded bg-white dark:bg-black text-sm"
                      placeholder={t('clientNamePlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-orange-800 dark:text-orange-300 mb-1">{t('nsNumber')}</label>
                    <input 
                      type="text" 
                      value={nsNumber}
                      onChange={e => setNsNumber(e.target.value)}
                      className="w-full p-2 border border-orange-200 dark:border-orange-800 rounded bg-white dark:bg-black text-sm"
                      placeholder={t('nsNumberPlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-orange-800 dark:text-orange-300 mb-1">{t('productType')}</label>
                    <select 
                      value={nsProductType}
                      onChange={e => setNsProductType(e.target.value)}
                      className="w-full p-2 border border-orange-200 dark:border-orange-800 rounded bg-white dark:bg-black text-sm"
                    >
                      <option value="">{t('select')}</option>
                      {PRODUCT_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-orange-800 dark:text-orange-300 mb-1">{t('dimension')}</label>
                    <input 
                      type="text" 
                      value={nsDimension}
                      onChange={e => setNsDimension(e.target.value)}
                      className="w-full p-2 border border-orange-200 dark:border-orange-800 rounded bg-white dark:bg-black text-sm"
                      placeholder={t('dimensionPlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-orange-800 dark:text-orange-300 mb-1">{t('flooring')}</label>
                    <select 
                      value={nsFlooring}
                      onChange={e => setNsFlooring(e.target.value)}
                      className="w-full p-2 border border-orange-200 dark:border-orange-800 rounded bg-white dark:bg-black text-sm"
                    >
                      <option value="">{t('select')}</option>
                      {FLOORING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-orange-800 dark:text-orange-300 mb-1">{t('setup')}</label>
                    <select 
                      value={nsSetup}
                      onChange={e => setNsSetup(e.target.value)}
                      className="w-full p-2 border border-orange-200 dark:border-orange-800 rounded bg-white dark:bg-black text-sm"
                    >
                      <option value="">{t('select')}</option>
                      {SUSPENSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-orange-800 dark:text-orange-300 mb-1">{t('bastidor')}</label>
                    <input 
                      type="text" 
                      value={nsChassis}
                      onChange={e => setNsChassis(e.target.value)}
                      className="w-full p-2 border border-orange-200 dark:border-orange-800 rounded bg-white dark:bg-black text-sm"
                      placeholder={t('chassisNumberPlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-orange-800 dark:text-orange-300 mb-1">{t('managementEstimate')}</label>
                    <input 
                      type="number" 
                      step="0.5"
                      value={nsManagementEstimate}
                      onChange={e => setNsManagementEstimate(e.target.value)}
                      className="w-full p-2 border border-orange-200 dark:border-orange-800 rounded bg-white dark:bg-black text-sm"
                      placeholder={t('managementEstimatePlaceholder')}
                    />
                  </div>
                  <div className="flex items-end gap-4 pb-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={nsNeedsBase}
                        onChange={e => setNsNeedsBase(e.target.checked)}
                        className="w-4 h-4 text-orange-600 rounded"
                      />
                      <span className="text-sm font-bold text-orange-800 dark:text-orange-300">{t('needsBase')}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={nsNeedsBox}
                        onChange={e => setNsNeedsBox(e.target.checked)}
                        className="w-4 h-4 text-orange-600 rounded"
                      />
                      <span className="text-sm font-bold text-orange-800 dark:text-orange-300">{t('needsBox')}</span>
                    </label>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button 
                    onClick={handleRegisterNS}
                    disabled={isSaving}
                    className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-6 rounded-lg transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  >
                    {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {editingRequestId ? t('updateOrder') : t('saveOrder')}
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRequests.length === 0 ? (
                <div className="col-span-full py-12 text-center text-gray-400 dark:text-slate-500 italic">
                  {nsSearch ? t('noResultsFound') : t('noPendingNs')}
                </div>
              ) : (
                filteredRequests.map(request => (
                  <div key={request.id} className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest block mb-0.5">NS {request.ns}</span>
                          <h4 className="font-bold text-gray-900 dark:text-white truncate max-w-[150px]" title={request.clientName}>{request.clientName}</h4>
                        </div>
                        <div className="flex gap-1">
                          <button 
                            onClick={() => handlePickRequest(request)}
                            disabled={isSaving}
                            className="p-1.5 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded hover:bg-orange-600 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            title={t('designThisOrder')}
                          >
                            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                          </button>
                          <button 
                            onClick={() => handleEditRequest(request)}
                            className="p-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-600 hover:text-white transition-all"
                            title={t('editOrder')}
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={async () => {
                              if (isSaving) return;
                              setIsSaving(true);
                              try {
                                await onDeleteProjectRequest(request.id);
                              } finally {
                                setIsSaving(false);
                              }
                            }}
                            disabled={isSaving}
                            className="p-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded hover:bg-red-600 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            title={t('deleteOrder')}
                          >
                            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-gray-500 dark:text-slate-400 mb-3">
                        <span className="truncate" title={request.productType}>{t('prodAbbr')}: {request.productType}</span>
                        <span className="truncate" title={request.dimension}>{t('dimAbbr')}: {request.dimension}</span>
                        <span className="truncate" title={request.flooring}>{t('assAbbr')}: {request.flooring}</span>
                        <span className="truncate" title={request.setup}>{t('setAbbr')}: {request.setup}</span>
                        <span className="truncate col-span-2" title={request.chassisNumber}>{t('basAbbr')}: {request.chassisNumber || '-'}</span>
                        <div className="col-span-2 pt-1 border-t border-gray-50 dark:border-slate-800 mt-1 flex justify-between">
                          <span className="font-bold text-orange-600 dark:text-orange-400">{t('estGerAbbr')}: {request.managementEstimate}h</span>
                          <span className="font-bold text-blue-600 dark:text-blue-400">{t('estProjAbbr')}: {(request.designerEstimate || 0).toFixed(1)}h</span>
                        </div>
                        <span className="font-bold text-green-600 dark:text-green-400 col-span-2">
                          {t('effectiveTime')}: {(allProjects.filter(p => p.ns === request.ns).reduce((acc, p) => acc + (p.totalActiveSeconds || 0), 0) / 3600).toFixed(1)}h
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {request.needsBase && (
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${request.baseProjectId ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                            {t('base')} {request.baseProjectId ? `(${t('ok')})` : ''}
                          </span>
                        )}
                        {request.needsBox && (
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${request.boxProjectId ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                            {t('box')} {request.boxProjectId ? `(${t('ok')})` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Pending Projects */}
          {pendingProjects.length > 0 && (
            <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-blue-100 dark:border-blue-900/30">
               <h3 className="text-lg font-bold text-black dark:text-white mb-4 flex items-center">
                 <Briefcase className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
                 {t('projectsInProgressPaused')}
               </h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {pendingProjects.map(p => {
                    const isPaused = p.pauses.length > 0 && p.pauses[p.pauses.length - 1].durationSeconds === -1;
                    const pUser = users.find(u => u.id === p.userId);
                    return (
                     <div key={p.id} className="border border-gray-200 dark:border-slate-700 rounded-lg p-4 hover:border-blue-300 dark:hover:border-blue-500 transition-all bg-gray-50 dark:bg-black group">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="font-bold text-black dark:text-white text-lg">{p.ns}</div>
                            <div className="text-sm text-gray-600 dark:text-slate-400">{p.clientName}</div>
                            <div className="text-xs text-gray-500 dark:text-slate-500 mt-1">{t(p.type.toLowerCase())} • {t(p.implementType.toLowerCase())}</div>
                            <div className="text-xs text-gray-600 dark:text-slate-400 mt-2 flex items-center">
                                <span className="font-semibold mr-1 text-black dark:text-white">{t('responsible')}:</span>
                                {pUser ? pUser.name : t('notAssigned')}
                            </div>
                          </div>
                          <span className={`px-2 py-1 rounded text-xs font-bold ${isPaused ? 'bg-yellow-100 text-yellow-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                             {isPaused ? t('paused') : t('open').toUpperCase()}
                          </span>
                        </div>
                        
                        <div className="flex gap-2 mt-3">
                            {['GESTOR', 'CEO', 'COORDENADOR', 'PROJETISTA'].includes(currentUser?.role || '') && (
                                <button 
                                  onClick={() => handleResumeFromList(p)}
                                  disabled={isSaving}
                                  className="flex-1 bg-white dark:bg-black border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 font-bold py-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center justify-center group-hover:bg-blue-600 dark:group-hover:bg-blue-500 group-hover:text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isSaving ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  ) : (
                                    <Play className="w-4 h-4 mr-2" />
                                  )}
                                  {isPaused ? t('resume') : t('continue')}
                                </button>
                            )}

                            {['CEO', 'COORDENADOR'].includes(currentUser?.role || '') && (
                                <button 
                                    onClick={() => setSelectedProjectDetails(p)}
                                    className="px-3 bg-white dark:bg-black border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 font-bold py-2 rounded hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors flex items-center justify-center shadow-sm"
                                    title={t('viewDetails')}
                                >
                                    <Info className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                     </div>
                   );
                 })}
               </div>
            </div>
          )}

          {/* New Project Form - GESTOR, CEO, COORDENADOR, PROJETISTA */}
          {['GESTOR', 'CEO', 'COORDENADOR', 'PROJETISTA'].includes(currentUser?.role || '') ? (
              <div className="bg-white dark:bg-black p-6 rounded-xl shadow-md border border-gray-100 dark:border-slate-700">
                <h2 className="text-xl font-bold mb-4 flex items-center text-black dark:text-white">
                  <Clock className="w-6 h-6 mr-2 text-blue-600 dark:text-blue-400" />
                  {t('startProject')}
                </h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-1">{t('productNs')}</label>
                      <input 
                        type="text" 
                        value={ns}
                        onChange={e => setNs(e.target.value)}
                        className="w-full p-2.5 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white text-sm"
                        placeholder={t('nsPlaceholder')}
                      />
                      {aggregatedInfo && (
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg border border-amber-100 dark:border-amber-900/30">
                          <Info className="w-3 h-3 flex-shrink-0" />
                          <span>
                            {aggregatedInfo.totalSeconds > 0 
                              ? t('accumulated', { time: formatTime(aggregatedInfo.totalSeconds), count: aggregatedInfo.contributors })
                              : t('nsAlreadyRegistered')}
                          </span>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-1">{t('client')}</label>
                      <div className="relative">
                        <Building className="absolute left-3 top-3 w-4 h-4 text-gray-400 dark:text-slate-500" />
                        <input 
                          type="text" 
                          value={clientName}
                          onChange={e => setClientName(e.target.value)}
                          className="w-full pl-10 p-2.5 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white text-sm"
                          placeholder={t('clientName')}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-1">{t('projectCodeOptional')}</label>
                      <div className="relative">
                        <Hash className="absolute left-3 top-3 w-4 h-4 text-gray-400 dark:text-slate-500" />
                        <input 
                          type="text" 
                          value={projectCode}
                          onChange={e => setProjectCode(e.target.value)}
                          className="w-full pl-10 p-2.5 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white text-sm"
                          placeholder={t('projectCodePlaceholder')}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-1">{t('bastidor')}</label>
                      <div className="relative">
                        <Hash className="absolute left-3 top-3 w-4 h-4 text-gray-400 dark:text-slate-500" />
                        <input 
                          type="text" 
                          value={chassis}
                          onChange={e => setChassis(e.target.value)}
                          className="w-full pl-10 p-2.5 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white text-sm"
                          placeholder={t('chassisNumberPlaceholder')}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-1">{t('projectType')}</label>
                      <select 
                        value={type}
                        onChange={e => setType(e.target.value as ProjectType)}
                        className="w-full p-2.5 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white text-sm appearance-none"
                      >
                        {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-1">{t('implementationType')}</label>
                      <div className="relative">
                        <Truck className="absolute left-3 top-3 w-4 h-4 text-gray-400 dark:text-slate-500" />
                        <select 
                          value={implementType}
                          onChange={e => setImplementType(e.target.value as ImplementType)}
                          className="w-full pl-10 p-2.5 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white text-sm appearance-none"
                        >
                          {IMPLEMENT_TYPES.map(type => <option key={type} value={type}>{t(type.toLowerCase())}</option>)}
                        </select>
                      </div>
                    </div>

                    {shouldShowFlooring && (
                        <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-1">{t('flooringType')}</label>
                        <div className="relative">
                            <Layers className="absolute left-3 top-3 w-4 h-4 text-gray-400 dark:text-slate-500" />
                            <select 
                            value={flooringType}
                            onChange={e => setFlooringType(e.target.value)}
                            className="w-full pl-10 p-2.5 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white text-sm appearance-none"
                            >
                                <option value="">{t('select')}</option>
                                {FLOORING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        </div>
                    )}

                    <div className="sm:col-span-2 lg:col-span-1">
                      <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-1">{t('estimatedTime')}</label>
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <input 
                            type="number" 
                            value={estHours}
                            onChange={e => setEstHours(e.target.value)}
                            className="w-full p-2.5 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white text-sm"
                            placeholder={t('hours')}
                            min="0"
                          />
                          <span className="absolute right-2 top-2.5 text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase">{t('hoursAbbr')}</span>
                        </div>
                        <div className="flex-1 relative">
                          <input 
                            type="number" 
                            value={estMinutes}
                            onChange={e => setEstMinutes(e.target.value)}
                            className="w-full p-2.5 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white text-sm"
                            placeholder={t('minutes')}
                            min="0"
                            max="59"
                          />
                          <span className="absolute right-2 top-2.5 text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase">{t('minutesAbbr')}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-end pb-1">
                      <label className="flex items-center space-x-3 cursor-pointer bg-amber-50 dark:bg-amber-900/10 px-4 py-2.5 rounded-xl border border-amber-100 dark:border-amber-900/20 w-full">
                        <input 
                          type="checkbox" 
                          checked={isOvertime}
                          onChange={e => setIsOvertime(e.target.checked)}
                          className="w-5 h-5 text-amber-600 rounded-lg focus:ring-amber-500 border-amber-300"
                        />
                        <span className="text-sm font-black text-amber-700 dark:text-amber-400 uppercase tracking-wider">{t('overtime')}</span>
                      </label>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button 
                      onClick={handleStartNew}
                      disabled={isSaving}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl flex items-center justify-center transition-all shadow-lg shadow-blue-500/20 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed uppercase tracking-widest"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          {t('saving') || 'SALVANDO...'}
                        </>
                      ) : (
                        <>
                          <Play className="w-5 h-5 mr-2" />
                          {t('startProject')}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
          ) : (
            <div className="bg-white dark:bg-black p-8 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-black mb-4">
                    <Clock className="w-8 h-8 text-gray-400 dark:text-slate-500" />
                </div>
                <h3 className="text-lg font-bold text-black dark:text-white mb-2">{t('viewMode')}</h3>
                <p className="text-black dark:text-white max-w-md mx-auto">
                    {t('viewModeDesc', { role: currentUser?.role })}
                </p>
            </div>
          )}
        </div>
      )}

      {activeProject && (
        <div className="space-y-6">
            {/* Main Tracker Card */}
            <div className="bg-white dark:bg-black p-6 rounded-xl shadow-md border border-gray-100 dark:border-slate-700 relative">
                <div className="flex justify-between items-start mb-6">
                    <h2 className="text-xl font-bold flex items-center text-black dark:text-white">
                        <Clock className="w-6 h-6 mr-2 text-blue-600 dark:text-blue-400" />
                        {t('activeTracker')}
                    </h2>
                    <div className="text-right">
                        <div className="font-bold text-lg text-black dark:text-white">{activeProject.ns}</div>
                        <div className="text-xs text-gray-600 dark:text-slate-400 font-semibold">{activeProject.clientName}</div>
                        <div className="flex flex-col items-end gap-2 mt-1">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <div className="relative inline-flex items-center">
                                    <input 
                                        type="checkbox" 
                                        className="sr-only peer"
                                        checked={activeProject.isOvertime}
                                        onChange={handleToggleOvertime}
                                    />
                                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 dark:peer-focus:ring-amber-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-amber-500"></div>
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${activeProject.isOvertime ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-slate-500'}`}>
                                    {t('overtime')}
                                </span>
                            </label>
                            {activeProject.estimatedSeconds && (
                                <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full inline-block">
                                    {t('estimated')}: {formatTime(activeProject.estimatedSeconds)}
                                </div>
                            )}
                        </div>
                        <div className="text-xs text-gray-400 dark:text-slate-500 flex flex-col items-end mt-1">
                            <span>{t(activeProject.type.toLowerCase())} {activeProject.flooringType ? `• ${activeProject.flooringType}` : ''}</span>
                            <div className="mt-1 flex items-center">
                                <span className="mr-1 text-gray-500 dark:text-slate-400">{t('code')}:</span>
                                <input 
                                    type="text" 
                                    value={activeProject.projectCode || ''}
                                    onChange={(e) => handleUpdateActiveProjectCode(e.target.value)}
                                    onBlur={saveProjectCode}
                                    placeholder={t('insertCode')}
                                    className="border-b border-gray-300 dark:border-slate-600 text-right text-xs focus:border-blue-500 focus:outline-none w-24 bg-transparent dark:text-white"
                                />
                                <Edit className="w-3 h-3 ml-1 text-gray-400 dark:text-slate-500" />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col items-center justify-center bg-gray-50 dark:bg-black p-8 rounded-xl border border-gray-200 dark:border-slate-700 mb-6">
                    <span className="text-sm text-gray-500 dark:text-slate-400 font-medium tracking-wider uppercase mb-2 flex items-center animate-pulse">
                        <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
                        {t('running')}
                    </span>
                    <div className="text-7xl font-mono font-bold text-blue-600 dark:text-blue-400 tracking-tight">
                        {formatTime(elapsedSeconds)}
                    </div>
                    {!isWorkingHour(new Date(), settings, activeProject.isOvertime) && (
                        <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-900/20 px-3 py-1 rounded-full border border-amber-100 dark:border-amber-900/30 flex items-center">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-2 animate-pulse"></span>
                            {t('outsideWorkingHoursPaused')}
                        </div>
                    )}
                    <div className="mt-4 flex gap-4 text-sm text-gray-500 dark:text-slate-400">
                        <span>{t('start')}: {new Date(activeProject.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
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
                                {t('pauseSwitchProject')}
                            </button>

                            <button 
                                onClick={handleFinish}
                                className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg flex items-center justify-center transition-colors shadow-sm"
                            >
                                <Square className="w-5 h-5 mr-2 fill-current" />
                                {t('finishProject')}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* VARIATION MANAGEMENT SECTION */}
            <div className="bg-white dark:bg-black p-6 rounded-xl shadow-md border border-gray-100 dark:border-slate-700">
                 <h3 className="text-lg font-bold text-black dark:text-white mb-4 flex items-center border-b dark:border-slate-700 pb-2">
                    <Layers className="w-5 h-5 mr-2 text-purple-600 dark:text-purple-400" />
                    {t('variationList')}
                 </h3>
                 
                 {/* Input Row */}
                 <div className="grid grid-cols-1 md:grid-cols-12 gap-2 mb-4 bg-gray-50 dark:bg-black p-3 rounded-lg items-end">
                     <div className="md:col-span-2">
                        <label className="text-xs font-semibold text-gray-500 dark:text-slate-400">{t('oldCode')}</label>
                        <input 
                            type="text" 
                            value={varOldCode}
                            onChange={e => setVarOldCode(e.target.value)}
                            className="w-full p-2 text-sm border border-gray-200 dark:border-slate-600 rounded focus:ring-1 focus:ring-purple-500 dark:bg-black dark:text-white"
                        />
                     </div>
                     <div className="md:col-span-4">
                        <label className="text-xs font-semibold text-gray-500 dark:text-slate-400">{t('description')}</label>
                        <input 
                            type="text" 
                            value={varDesc}
                            onChange={e => setVarDesc(e.target.value)}
                            className="w-full p-2 text-sm border border-gray-200 dark:border-slate-600 rounded focus:ring-1 focus:ring-purple-500 dark:bg-black dark:text-white"
                        />
                     </div>
                     <div className="md:col-span-2">
                        <label className="text-xs font-semibold text-gray-500 dark:text-slate-400">{t('newCode')}</label>
                        <input 
                            type="text" 
                            value={varNewCode}
                            onChange={e => setVarNewCode(e.target.value)}
                            className="w-full p-2 text-sm border border-gray-200 dark:border-slate-600 rounded focus:ring-1 focus:ring-purple-500 dark:bg-black dark:text-white"
                        />
                     </div>
                     <div className="md:col-span-2">
                        <label className="text-xs font-semibold text-gray-500 dark:text-slate-400">{t('type')}</label>
                        <select 
                            value={varType}
                            onChange={e => setVarType(e.target.value as any)}
                            className="w-full p-2 text-sm border border-gray-200 dark:border-slate-600 rounded focus:ring-1 focus:ring-purple-500 dark:bg-black dark:text-white"
                        >
                            <option value="PEÇA">{t('part')}</option>
                            <option value="MONTAGEM">{t('assembly')}</option>
                        </select>
                     </div>
                     <div className="md:col-span-1 flex items-center justify-center pb-2">
                         <label className="flex items-center cursor-pointer" title={t('markAsDone')}>
                             <input 
                                type="checkbox" 
                                checked={varFiles}
                                onChange={e => setVarFiles(e.target.checked)}
                                className="w-4 h-4 text-purple-600 dark:text-purple-400 rounded mr-1 dark:bg-black dark:border-slate-600"
                             />
                             <span className="text-xs font-bold text-gray-600 dark:text-slate-400">{t('ok')}</span>
                         </label>
                     </div>
                     <div className="md:col-span-1">
                         {['GESTOR', 'CEO', 'COORDENADOR', 'PROJETISTA'].includes(currentUser?.role || '') && (
                             <button 
                                onClick={handleAddVariation}
                                className="w-full bg-purple-600 hover:bg-purple-700 text-white p-2 rounded flex items-center justify-center shadow-sm"
                             >
                                 <Plus className="w-5 h-5" />
                             </button>
                         )}
                     </div>
                 </div>
                                 {/* Table */}
                 <div className="overflow-x-auto">
                     <table className="w-full text-sm text-left">
                         <thead className="bg-gray-100 dark:bg-black text-black dark:text-white font-semibold">
                             <tr>
                                 <th className="p-3 rounded-tl-lg">{t('oldCode')}</th>
                                 <th className="p-3">{t('description')}</th>
                                 <th className="p-3">{t('newCode')}</th>
                                 <th className="p-3">{t('type')}</th>
                                 <th className="p-3 text-center">DXF/PDF</th>
                                 <th className="p-3 rounded-tr-lg"></th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                             {activeProject.variations.map((v) => (
                                 <tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                                     <td className="p-3 font-mono text-black dark:text-white">{v.oldCode || '-'}</td>
                                     <td className="p-3 text-black dark:text-white font-medium">{v.description}</td>
                                     <td className="p-3 font-mono text-blue-600 dark:text-blue-400 font-bold">{v.newCode || '-'}</td>
                                     <td className="p-3">
                                         <span className={`px-2 py-0.5 rounded text-xs ${v.type === 'Montagem' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-gray-200 text-gray-700 dark:bg-black dark:text-slate-300'}`}>
                                             {v.type}
                                         </span>
                                     </td>
                                     <td className="p-3 text-center">
                                         <button 
                                            onClick={() => handleToggleVariationFiles(v.id)}
                                            title={v.filesGenerated ? t('filesGenerated') : t('markAsGenerated')}
                                            className={`flex items-center justify-center p-2 rounded mx-auto transition-colors ${
                                                v.filesGenerated 
                                                ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 shadow-sm' 
                                                : 'bg-gray-100 text-gray-400 dark:bg-black dark:text-slate-500 hover:bg-gray-200 dark:hover:bg-slate-600'
                                            }`}
                                         >
                                            {v.filesGenerated ? <FileCheck className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                            <span className="ml-1 text-xs font-bold">{v.filesGenerated ? t('ok') : t('pendingAbbr')}</span>
                                         </button>
                                     </td>
                                     <td className="p-3 text-right">
                                         <button 
                                            onClick={() => handleDeleteVariation(v.id)}
                                            className="text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                         >
                                             <Trash2 className="w-4 h-4" />
                                         </button>
                                     </td>
                                 </tr>
                             ))}
                             {activeProject.variations.length === 0 && (
                                 <tr>
                                     <td colSpan={6} className="p-6 text-center text-gray-400 dark:text-slate-500 italic">
                                         {t('noVariationsYet')}
                                     </td>
                                 </tr>
                             )}
                         </tbody>
                     </table>
                 </div>
            </div>
        </div>
      )}

      {/* Project Details Modal (CEO/COORDENADOR) */}
      {selectedProjectDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-black rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col border border-gray-100 dark:border-slate-700">
                <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center sticky top-0 bg-white dark:bg-black z-10">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-slate-100 flex items-center">
                        <Info className="w-6 h-6 mr-2 text-blue-600 dark:text-blue-400" />
                        {t('projectDetails')}
                    </h3>
                    <button 
                        onClick={() => setSelectedProjectDetails(null)}
                        className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="p-6 space-y-6">
                    {/* Header Info */}
                    <div className="grid grid-cols-2 gap-4 bg-gray-50 dark:bg-black p-4 rounded-lg border border-gray-200 dark:border-slate-700">
                        <div>
                            <span className="text-xs text-gray-500 dark:text-slate-400 uppercase font-bold block">NS</span>
                            <span className="text-lg font-mono font-bold text-gray-800 dark:text-slate-100">{selectedProjectDetails.ns}</span>
                        </div>
                        <div>
                            <span className="text-xs text-gray-500 dark:text-slate-400 uppercase font-bold block">{t('client')}</span>
                            <span className="text-lg font-medium text-gray-800 dark:text-slate-100">{selectedProjectDetails.clientName}</span>
                        </div>
                        <div>
                            <span className="text-xs text-gray-500 dark:text-slate-400 uppercase font-bold block">{t('responsible')}</span>
                            <span className="text-sm font-medium text-gray-800 dark:text-slate-200">
                                {users.find(u => u.id === selectedProjectDetails.userId)?.name || t('notAssigned')}
                            </span>
                        </div>
                        <div>
                            <span className="text-xs text-gray-500 dark:text-slate-400 uppercase font-bold block">{t('status')}</span>
                            <span className={`text-sm font-bold ${selectedProjectDetails.status === 'IN_PROGRESS' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>
                                {selectedProjectDetails.status === 'IN_PROGRESS' ? t('inProgress') : t('finished')}
                            </span>
                        </div>
                    </div>

                    {/* Estimates */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-orange-50 dark:bg-orange-900/10 p-3 rounded-lg border border-orange-100 dark:border-orange-900/30">
                            <span className="text-[10px] text-orange-800 dark:text-orange-300 uppercase font-bold block">{t('managementEstimateAbbr')}</span>
                            <span className="text-lg font-bold text-orange-900 dark:text-orange-200">
                                {projectRequests.find(r => r.ns === selectedProjectDetails.ns)?.managementEstimate || 0}H
                            </span>
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-900/10 p-3 rounded-lg border border-blue-100 dark:border-blue-900/30">
                            <span className="text-[10px] text-blue-800 dark:text-blue-300 uppercase font-bold block">{t('designerEstimateAbbr')}</span>
                            <span className="text-lg font-bold text-blue-900 dark:text-blue-200">
                                {selectedProjectDetails.estimatedSeconds ? (selectedProjectDetails.estimatedSeconds / 3600).toFixed(1) : '0.0'}H
                            </span>
                        </div>
                        <div className="bg-green-50 dark:bg-green-900/10 p-3 rounded-lg border border-green-100 dark:border-green-900/30">
                            <span className="text-[10px] text-green-800 dark:text-green-300 uppercase font-bold block">{t('effectiveTime')}</span>
                            <span className="text-lg font-bold text-green-900 dark:text-green-200">
                                {(selectedProjectDetails.totalActiveSeconds / 3600).toFixed(1)}H
                            </span>
                        </div>
                    </div>

                    {/* Context (Para que) */}
                    <div>
                        <h4 className="text-sm font-bold text-gray-700 dark:text-slate-300 mb-2 flex items-center">
                            <Briefcase className="w-4 h-4 mr-2 text-gray-500 dark:text-slate-400" />
                            {t('contextObservations')}
                        </h4>
                        <div className="bg-yellow-50 dark:bg-amber-900/20 p-4 rounded-lg border border-yellow-100 dark:border-amber-900/30 text-gray-700 dark:text-slate-300 text-sm whitespace-pre-wrap">
                            {selectedProjectDetails.notes || t('noObservations')}
                        </div>
                    </div>

                    {/* History (O que) */}
                    <div>
                        <h4 className="text-sm font-bold text-gray-700 dark:text-slate-300 mb-2 flex items-center">
                            <Layers className="w-4 h-4 mr-2 text-gray-500 dark:text-slate-400" />
                            {t('variationHistory')}
                        </h4>
                        {selectedProjectDetails.variations.length > 0 ? (
                            <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-100 dark:bg-black text-gray-600 dark:text-slate-400 font-semibold">
                                        <tr>
                                            <th className="p-3">{t('fromOld')}</th>
                                            <th className="p-3">{t('toNew')}</th>
                                            <th className="p-3">{t('description').toUpperCase()}</th>
                                            <th className="p-3">{t('type').toUpperCase()}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                                        {selectedProjectDetails.variations.map(v => (
                                            <tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                                                <td className="p-3 font-mono text-gray-500 dark:text-slate-400">{v.oldCode || '-'}</td>
                                                <td className="p-3 font-mono text-blue-600 dark:text-blue-400 font-bold">{v.newCode || '-'}</td>
                                                <td className="p-3 text-gray-800 dark:text-slate-200">{v.description}</td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-0.5 rounded text-xs ${v.type === 'Montagem' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-gray-200 text-gray-700 dark:bg-black dark:text-slate-300'}`}>
                                                        {v.type}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="text-center p-6 bg-gray-50 dark:bg-black rounded-lg border border-gray-200 dark:border-slate-700 text-gray-400 dark:text-slate-500 italic">
                                {t('noVariations')}
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="p-6 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-black rounded-b-xl flex justify-end">
                    <button 
                        onClick={() => setSelectedProjectDetails(null)}
                        className="px-6 py-2 bg-gray-200 dark:bg-black hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-800 dark:text-slate-200 font-bold rounded-lg transition-colors"
                    >
                        {t('close')}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Pick NS Modal */}
      {showPickModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-black p-6 rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200 border border-orange-100 dark:border-orange-900/50">
            <h3 className="text-lg font-bold mb-4 flex items-center text-orange-600 dark:text-orange-400">
              <Play className="w-5 h-5 mr-2" />
              {t('startProjectNs', { ns: selectedRequest.ns })}
            </h3>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-2">{t('whatWillYouDesign')}</label>
                <div className="grid grid-cols-1 gap-2">
                  {selectedRequest.needsBase && !selectedRequest.baseProjectId && (
                    <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${pickPart === 'BASE' ? 'bg-orange-50 border-orange-500 text-orange-700' : 'border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800'}`}>
                      <input type="radio" name="pickPart" value="BASE" checked={pickPart === 'BASE'} onChange={() => setPickPart('BASE')} className="hidden" />
                      <div className="flex-1 font-bold">{t('onlyBase')}</div>
                      {pickPart === 'BASE' && <CheckSquare className="w-4 h-4" />}
                    </label>
                  )}
                  {selectedRequest.needsBox && !selectedRequest.boxProjectId && (
                    <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${pickPart === 'BOX' ? 'bg-orange-50 border-orange-500 text-orange-700' : 'border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800'}`}>
                      <input type="radio" name="pickPart" value="BOX" checked={pickPart === 'BOX'} onChange={() => setPickPart('BOX')} className="hidden" />
                      <div className="flex-1 font-bold">{t('onlyBox')}</div>
                      {pickPart === 'BOX' && <CheckSquare className="w-4 h-4" />}
                    </label>
                  )}
                  {selectedRequest.needsBase && !selectedRequest.baseProjectId && selectedRequest.needsBox && !selectedRequest.boxProjectId && (
                    <label className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${pickPart === 'BOTH' ? 'bg-orange-50 border-orange-500 text-orange-700' : 'border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800'}`}>
                      <input type="radio" name="pickPart" value="BOTH" checked={pickPart === 'BOTH'} onChange={() => setPickPart('BOTH')} className="hidden" />
                      <div className="flex-1 font-bold">{t('baseAndBox')}</div>
                      {pickPart === 'BOTH' && <CheckSquare className="w-4 h-4" />}
                    </label>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-slate-300 mb-1">{t('yourEstimateDesigner')}</label>
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex-1">
                    <input 
                      type="number" 
                      placeholder={t('hours')}
                      value={pickDesignerEstHours}
                      onChange={e => setPickDesignerEstHours(e.target.value)}
                      className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded bg-white dark:bg-black text-sm"
                    />
                  </div>
                  <span className="font-bold">:</span>
                  <div className="flex-1">
                    <input 
                      type="number" 
                      placeholder={t('minutes')}
                      value={pickDesignerEstMinutes}
                      onChange={e => setPickDesignerEstMinutes(e.target.value)}
                      className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded bg-white dark:bg-black text-sm"
                    />
                  </div>
                </div>

                <label className="flex items-center space-x-2 cursor-pointer bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg border border-amber-100 dark:border-amber-900/30 w-full">
                  <input 
                    type="checkbox" 
                    checked={pickIsOvertime}
                    onChange={e => setPickIsOvertime(e.target.checked)}
                    className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                  />
                  <span className="text-sm font-bold text-amber-700 dark:text-amber-400">{t('overtime')}</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button 
                onClick={() => {
                  setShowPickModal(false);
                  setSelectedRequest(null);
                }}
                className="text-gray-500 dark:text-slate-400 px-4 py-2 rounded-lg font-medium hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              >
                {t('cancel')}
              </button>
              <button 
                onClick={handleConfirmPick}
                disabled={!pickPart || isSaving}
                className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-bold shadow-sm transition-colors flex items-center"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t('starting')}
                  </>
                ) : (
                  t('startNow')
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pause Modal */}
      {showPauseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-black p-6 rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200 border border-gray-100 dark:border-slate-700">
            <h3 className="text-lg font-bold mb-4 flex items-center text-yellow-600 dark:text-amber-400">
              <Pause className="w-5 h-5 mr-2" />
              {t('pauseProject')}
            </h3>
            <p className="text-gray-600 dark:text-slate-400 text-sm mb-4">
              {t('pauseProjectDesc')}
            </p>
            
            <div className="space-y-4 mb-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">{t('pauseReasonLabel')}</label>
                    <select 
                        value={pauseReason}
                        onChange={e => setPauseReason(e.target.value)}
                        className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none dark:bg-black dark:text-white"
                    >
                        <option value="">{t('selectReason')}</option>
                        <option value="Almoço / Intervalo">{t('lunchBreak')}</option>
                        <option value="Fim do Expediente">{t('endOfShift')}</option>
                        <option value="Reunião">{t('meeting')}</option>
                        <option value="Troca de Projeto">{t('switchProject')}</option>
                        <option value="Falta de Informações">{t('lackOfInfo')}</option>
                        <option value="Incompatibilidade de Informações">{t('infoIncompatibility')}</option>
                        <option value="Outros">{t('others')}</option>
                    </select>
                </div>

                {(pauseReason === 'Falta de Informações' || pauseReason === 'Incompatibilidade de Informações') && (
                    <div className="animate-in slide-in-from-top-2 duration-200">
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">{t('causingSector')}</label>
                        <select 
                            value={pauseSector}
                            onChange={e => setPauseSector(e.target.value)}
                            className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 outline-none dark:bg-black dark:text-white"
                        >
                            <option value="">{t('selectSector')}</option>
                            <option value="Comercial">{t('comercial')}</option>
                            <option value="Engenharia">{t('engineering')}</option>
                            <option value="PCP">{t('pcp')}</option>
                            <option value="Produção">{t('production')}</option>
                            <option value="Cliente">{t('client')}</option>
                            <option value="Vendas">{t('sales')}</option>
                            <option value="Outros">{t('others')}</option>
                        </select>
                    </div>
                )}

                {pauseReason === 'Outros' && (
                    <div className="animate-in slide-in-from-top-2 duration-200">
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">{t('specifyReason')}</label>
                        <input 
                            type="text" 
                            value={pauseSector} // Reuse pauseSector for other reason text
                            onChange={e => setPauseSector(e.target.value)}
                            placeholder={t('reasonPlaceholder')}
                            className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none dark:bg-black dark:text-white"
                        />
                    </div>
                )}
            </div>

            <div className="flex justify-end gap-2">
              <button 
                onClick={() => {
                    setShowPauseModal(false);
                    setPauseReason('');
                    setPauseSector('');
                }}
                disabled={isSaving}
                className="text-gray-500 dark:text-slate-400 px-4 py-2 rounded-lg font-medium hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                {t('cancel')}
              </button>
              <button 
                onClick={confirmPauseAndExit}
                disabled={!pauseReason || ((pauseReason === 'Falta de Informações' || pauseReason === 'Incompatibilidade de Informações' || pauseReason === 'Outros') && !pauseSector) || isSaving}
                className="bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center"
              >
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('confirmPause')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Finish Confirmation Modal */}
      {showFinishModal && activeProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-black p-6 rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200 border border-gray-100 dark:border-slate-700">
            <h3 className="text-lg font-bold mb-2 flex items-center text-red-600 dark:text-red-400">
              <CheckSquare className="w-5 h-5 mr-2" />
              {t('finishRelease')}
            </h3>
            <p className="text-gray-600 dark:text-slate-400 text-sm mb-6">
              {t('reviewEstimatedTime')}
            </p>
            
            <div className="space-y-4 mb-6">
                <div className="p-4 bg-gray-50 dark:bg-black rounded-lg border border-gray-100 dark:border-slate-700">
                    <div className="text-xs text-gray-500 dark:text-slate-400 uppercase font-bold mb-1">{t('realizedTimeStopwatch')}</div>
                    <div className="text-2xl font-mono font-bold text-gray-800 dark:text-slate-100">{formatTime(elapsedSeconds)}</div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">{t('estimatedTimePlanned')}</label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input 
                        type="number" 
                        value={estHours}
                        onChange={e => setEstHours(e.target.value)}
                        className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
                        placeholder={t('hours')}
                        min="0"
                      />
                      <span className="absolute right-3 top-3.5 text-xs text-gray-400 dark:text-slate-500 font-bold">{t('hoursAbbr')}</span>
                    </div>
                    <div className="flex-1 relative">
                      <input 
                        type="number" 
                        value={estMinutes}
                        onChange={e => setEstMinutes(e.target.value)}
                        className="w-full p-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white"
                        placeholder={t('minAbbr')}
                        min="0"
                        max="59"
                      />
                      <span className="absolute right-3 top-3.5 text-xs text-gray-400 dark:text-slate-500 font-bold">{t('minutesAbbr')}</span>
                    </div>
                  </div>
                </div>
            </div>

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowFinishModal(false)}
                className="flex-1 text-gray-500 dark:text-slate-400 px-4 py-3 rounded-lg font-medium hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-600 transition-colors"
              >
                {t('back')}
              </button>
              <button 
                onClick={confirmFinish}
                disabled={isFinalizing}
                className={`flex-1 px-4 py-3 rounded-lg font-bold text-white transition-all shadow-md flex items-center justify-center ${
                  isFinalizing 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {isFinalizing ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    {t('processing')}
                  </>
                ) : (
                  t('finishAndSave')
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Timer Pop-up */}
      {!isVisible && activeProject && (
        <div 
          onClick={onNavigateBack}
          className="fixed bottom-6 right-6 z-50 bg-black text-white p-4 rounded-xl shadow-2xl cursor-pointer hover:bg-slate-900 transition-all transform hover:scale-105 group border border-slate-700 ring-2 ring-blue-500/50"
        >
          <div className="flex items-center justify-between mb-2 gap-4">
            <div className="flex items-center text-green-400 text-xs font-bold uppercase tracking-wider animate-pulse">
              <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
              {t('inProgress')}
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
            {t('clickToReturn')}
          </div>
        </div>
      )}
    </>
  );
};
