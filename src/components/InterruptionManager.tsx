import React, { useState, useMemo, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { 
  PauseCircle, Plus, Search, Filter, Calendar, User as UserIcon, 
  Clock, AlertCircle, CheckCircle2, XCircle, Trash2, Edit, 
  ChevronDown, ChevronUp, Download, BarChart3, Info, PlayCircle,
  AlertTriangle, Settings
} from 'lucide-react';
import { 
  AppState, User, InterruptionRecord, InterruptionStatus, 
  InterruptionArea, InterruptionType 
} from '../types';
import { INTERRUPTION_AREAS } from '../constants';
import { 
  addInterruption, updateInterruption, deleteInterruption,
  addInterruptionType, updateInterruptionType, deleteInterruptionType
} from '../services/storageService';

interface InterruptionManagerProps {
  data: AppState;
  currentUser: User;
  onUpdate: (newState: AppState) => void;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const InterruptionManager: React.FC<InterruptionManagerProps> = ({ 
  data, currentUser, onUpdate, addToast 
}) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isTypeManagerOpen, setIsTypeManagerOpen] = useState(false);
  const [editingInterruption, setEditingInterruption] = useState<InterruptionRecord | null>(null);
  const [viewingInterruption, setViewingInterruption] = useState<InterruptionRecord | null>(null);
  
  // Form State
  const [ns, setNs] = useState('');
  const [client, setClient] = useState('');
  const [problemType, setProblemType] = useState('');
  const [area, setArea] = useState<InterruptionArea>(InterruptionArea.COMERCIAL);
  const [responsible, setResponsible] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<InterruptionStatus>(InterruptionStatus.OPEN);

  // Filter State
  const [filterNs, setFilterNs] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterArea, setFilterArea] = useState<string>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Type Manager State
  const [newTypeName, setNewTypeName] = useState('');

  const canManage = currentUser.role === 'GESTOR';
  const isCEO = currentUser.role === 'CEO';

  // Real-time timer update
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const costPerSecond = useMemo(() => {
    const designers = data.users.filter(u => u.role === 'PROJETISTA');
    if (designers.length === 0) {
      const avgSalary = data.users.reduce((acc, u) => acc + (u.salary || 0), 0) / (data.users.length || 1);
      return (avgSalary / 220) / 3600;
    }
    const avgDesignerSalary = designers.reduce((acc, u) => acc + (u.salary || 0), 0) / designers.length;
    return (avgDesignerSalary / 220) / 3600;
  }, [data.users]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const filteredInterruptions = useMemo(() => {
    return data.interruptions.filter(i => {
      // Permission check: Designers only see their own
      if (currentUser.role === 'PROJETISTA' && i.designerId !== currentUser.id) {
        return false;
      }

      const matchNs = i.projectNs.toLowerCase().includes(filterNs.toLowerCase());
      const matchStatus = filterStatus === 'ALL' ? true : i.status === filterStatus;
      const matchArea = filterArea === 'ALL' ? true : i.responsibleArea === filterArea;
      
      let matchDate = true;
      if (startDate || endDate) {
        const iDate = new Date(i.startTime).getTime();
        const start = startDate ? new Date(startDate).getTime() : 0;
        const end = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : Infinity;
        matchDate = iDate >= start && iDate <= end;
      }

      return matchNs && matchStatus && matchArea && matchDate;
    });
  }, [data.interruptions, filterNs, filterStatus, filterArea, startDate, endDate, currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ns || !problemType || !description) {
      addToast('Preencha todos os campos obrigatórios', 'error');
      return;
    }

    try {
      if (editingInterruption) {
        const updated: InterruptionRecord = {
          ...editingInterruption,
          projectNs: ns,
          clientName: client,
          problemType,
          responsibleArea: area,
          responsiblePerson: responsible,
          description,
          status,
          // If moving to Resolved, calculate total time
          endTime: status === InterruptionStatus.RESOLVED && !editingInterruption.endTime 
            ? new Date().toISOString() 
            : editingInterruption.endTime,
          totalTimeSeconds: (status === InterruptionStatus.RESOLVED && !editingInterruption.endTime)
            ? Math.floor((new Date().getTime() - new Date(editingInterruption.startTime).getTime()) / 1000)
            : editingInterruption.totalTimeSeconds
        };
        const newState = await updateInterruption(updated);
        onUpdate(newState);
        addToast('Interrupção atualizada com sucesso', 'success');
      } else {
        const newItem: InterruptionRecord = {
          id: crypto.randomUUID(),
          projectNs: ns,
          clientName: client,
          designerId: currentUser.id,
          startTime: new Date().toISOString(),
          problemType,
          responsibleArea: area,
          responsiblePerson: responsible,
          description,
          status: InterruptionStatus.OPEN,
          totalTimeSeconds: 0
        };
        const newState = await addInterruption(newItem);
        onUpdate(newState);
        addToast('Interrupção registrada e cronômetro iniciado', 'success');
      }
      resetForm();
    } catch (err) {
      addToast('Erro ao salvar interrupção', 'error');
    }
  };

  const resetForm = () => {
    setNs('');
    setClient('');
    setProblemType('');
    setArea(InterruptionArea.COMERCIAL);
    setResponsible('');
    setDescription('');
    setStatus(InterruptionStatus.OPEN);
    setEditingInterruption(null);
    setIsFormOpen(false);
  };

  const handleEdit = (i: InterruptionRecord) => {
    setEditingInterruption(i);
    setNs(i.projectNs);
    setClient(i.clientName);
    setProblemType(i.problemType);
    setArea(i.responsibleArea);
    setResponsible(i.responsiblePerson);
    setDescription(i.description);
    setStatus(i.status);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este registro?')) return;
    try {
      const newState = await deleteInterruption(id);
      onUpdate(newState);
      addToast('Registro excluído', 'success');
    } catch (err) {
      addToast('Erro ao excluir', 'error');
    }
  };

  const handleAddType = async () => {
    if (!newTypeName.trim()) return;
    try {
      const newState = await addInterruptionType({
        id: crypto.randomUUID(),
        name: newTypeName.trim(),
        isActive: true
      });
      onUpdate(newState);
      setNewTypeName('');
      addToast('Tipo de problema adicionado', 'success');
    } catch (err) {
      addToast('Erro ao adicionar tipo', 'error');
    }
  };

  const toggleTypeStatus = async (type: InterruptionType) => {
    try {
      const newState = await updateInterruptionType({
        ...type,
        isActive: !type.isActive
      });
      onUpdate(newState);
    } catch (err) {
      addToast('Erro ao atualizar status', 'error');
    }
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
  };

  const getElapsedTime = (startTime: string, endTime?: string | null) => {
    const start = new Date(startTime).getTime();
    const end = endTime ? new Date(endTime).getTime() : now.getTime();
    return Math.floor((end - start) / 1000);
  };

  const getAlertLevel = (startTime: string, status: InterruptionStatus) => {
    if (status === InterruptionStatus.RESOLVED || status === InterruptionStatus.CANCELLED) return null;
    const hours = (now.getTime() - new Date(startTime).getTime()) / (1000 * 3600);
    if (hours >= 48) return 'red';
    if (hours >= 24) return 'yellow';
    return null;
  };

  const exportData = (format: 'CSV' | 'PDF' | 'EXCEL') => {
    const headers = ['NS', 'Cliente', 'Projetista', 'Início', 'Fim', 'Tipo', 'Área', 'Responsável', 'Status', 'Tempo Total(s)'];
    const data = filteredInterruptions.map(i => [
      i.projectNs,
      i.clientName,
      i.designerId, // Ideally map to name
      i.startTime,
      i.endTime || '',
      i.problemType,
      i.responsibleArea,
      i.responsiblePerson,
      i.status,
      i.totalTimeSeconds
    ]);

    if (format === 'CSV') {
      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...data.map(r => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `interrupcoes_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (format === 'PDF') {
      const doc = new jsPDF();
      doc.text(`Relatório de Paradas - ${new Date().toLocaleDateString()}`, 14, 15);
      (doc as any).autoTable({
        head: [headers],
        body: data,
        startY: 20,
        styles: { fontSize: 8 }
      });
      doc.save(`interrupcoes_${new Date().toISOString().slice(0,10)}.pdf`);
    } else if (format === 'EXCEL') {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Paradas");
      XLSX.writeFile(wb, `interrupcoes_${new Date().toISOString().slice(0,10)}.xlsx`);
    }
    
    addToast(`Exportando em ${format}...`, 'info');
  };

  return (
    <div className="space-y-6">
      {/* Header & Stats */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-black dark:text-white flex items-center">
            <PauseCircle className="w-8 h-8 mr-3 text-amber-500" />
            Paradas de Projeto
          </h1>
          <p className="text-gray-600 dark:text-slate-400">Gerencie e monitore gargalos no desenvolvimento</p>
        </div>
        <div className="flex gap-3">
          {!isCEO && (
            <button 
              onClick={() => setIsFormOpen(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-bold flex items-center transition-colors shadow-lg shadow-amber-900/20"
            >
              <Plus className="w-5 h-5 mr-2" />
              Nova Interrupção
            </button>
          )}
          {canManage && (
            <button 
              onClick={() => setIsTypeManagerOpen(true)}
              className="bg-slate-100 dark:bg-black text-slate-600 dark:text-slate-300 px-4 py-2 rounded-lg font-bold flex items-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700"
            >
              <Settings className="w-5 h-5 mr-2" />
              Categorias
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-black p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por NS..."
            value={filterNs}
            onChange={(e) => setFilterNs(e.target.value)}
            className="w-full pl-10 p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white dark:bg-black dark:text-white"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white dark:bg-black dark:text-white"
        >
          <option value="ALL">Todos os Status</option>
          {Object.values(InterruptionStatus).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={filterArea}
          onChange={(e) => setFilterArea(e.target.value)}
          className="p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white dark:bg-black dark:text-white"
        >
          <option value="ALL">Todas as Áreas</option>
          {Object.values(InterruptionArea).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm bg-white dark:bg-black dark:text-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm bg-white dark:bg-black dark:text-white"
          />
        </div>
      </div>

      {/* Export Bar */}
      <div className="flex justify-end gap-2">
        <button onClick={() => exportData('CSV')} className="text-xs flex items-center gap-1 text-gray-500 hover:text-gray-800 dark:hover:text-white">
          <Download className="w-3 h-3" /> CSV
        </button>
        <button onClick={() => exportData('PDF')} className="text-xs flex items-center gap-1 text-gray-500 hover:text-gray-800 dark:hover:text-white">
          <Download className="w-3 h-3" /> PDF
        </button>
        <button onClick={() => exportData('EXCEL')} className="text-xs flex items-center gap-1 text-gray-500 hover:text-gray-800 dark:hover:text-white">
          <Download className="w-3 h-3" /> Excel
        </button>
      </div>

      {/* List */}
      <div className="grid grid-cols-1 gap-4">
        {filteredInterruptions.length > 0 ? (
          filteredInterruptions.map((i) => {
            const alert = getAlertLevel(i.startTime, i.status);
            const elapsed = getElapsedTime(i.startTime, i.endTime);
            
            return (
              <div key={i.id} className={`bg-white dark:bg-black p-5 rounded-xl shadow-sm border ${alert === 'red' ? 'border-red-500' : alert === 'yellow' ? 'border-amber-500' : 'border-gray-100 dark:border-slate-700'} hover:shadow-md transition-all relative group`}>
                {/* Designer Name Badge */}
                <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2 py-1 bg-gray-100 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
                  <UserIcon className="w-3 h-3 text-gray-500" />
                  <span className="text-[10px] font-bold text-gray-600 dark:text-slate-300">
                    {(() => {
                      const designer = data.users.find(u => u.id === i.designerId);
                      return designer ? `${designer.name} ${designer.surname || ''}`.trim() : 'Desconhecido';
                    })()}
                  </span>
                </div>

                {alert && (
                  <div className={`absolute -top-2 -right-2 px-2 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-sm ${alert === 'red' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}`}>
                    <AlertTriangle className="w-3 h-3" />
                    {alert === 'red' ? '+48h' : '+24h'}
                  </div>
                )}
                
                <div className="flex flex-col md:flex-row justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                        i.status === InterruptionStatus.OPEN ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                        i.status === InterruptionStatus.WAITING ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                        i.status === InterruptionStatus.RESOLVED ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                        'bg-gray-50 text-gray-700 dark:bg-black dark:text-slate-400'
                      }`}>
                        {i.status}
                      </span>
                      <span className="font-mono font-bold text-black dark:text-white">NS: {i.projectNs}</span>
                      <span className="text-gray-400 dark:text-slate-500 text-sm">|</span>
                      <span className="text-gray-900 dark:text-white font-medium">{i.clientName || 'Cliente não informado'}</span>
                    </div>
                    
                    <h3 className="text-lg font-bold text-black dark:text-white mb-1">{i.problemType}</h3>
                    <p className="text-gray-600 dark:text-slate-400 text-sm line-clamp-2 mb-3">{i.description}</p>
                    
                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      <div className="flex items-center text-gray-500 dark:text-slate-400">
                        <UserIcon className="w-3 h-3 mr-1" />
                        Resp: <span className="ml-1 font-semibold text-black dark:text-white">{i.responsiblePerson}</span>
                        <span className="ml-1 px-1.5 py-0.5 bg-slate-100 dark:bg-black rounded text-[10px] uppercase">{i.responsibleArea}</span>
                      </div>
                      <div className="flex items-center text-gray-400 dark:text-slate-500">
                        <Calendar className="w-3 h-3 mr-1" />
                        Início: {new Date(i.startTime).toLocaleString('pt-BR')}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end justify-between min-w-[150px]">
                    <div className="text-right">
                      <div className={`text-xl font-mono font-bold ${i.status === InterruptionStatus.RESOLVED ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400 animate-pulse'}`}>
                        {formatDuration(i.status === InterruptionStatus.RESOLVED ? i.totalTimeSeconds : elapsed)}
                      </div>
                      <div className="text-[10px] text-gray-400 dark:text-slate-500 uppercase font-bold tracking-widest mb-1">Tempo Decorrido</div>
                      
                      <div className="text-sm font-bold text-red-600 dark:text-red-400">
                        {formatCurrency((i.status === InterruptionStatus.RESOLVED ? i.totalTimeSeconds : elapsed) * costPerSecond)}
                      </div>
                      <div className="text-[10px] text-gray-400 dark:text-slate-500 uppercase font-bold tracking-widest">Custo Estimado</div>
                    </div>

                    <div className="flex gap-2 mt-4">
                      <button 
                        onClick={() => setViewingInterruption(i)}
                        className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition"
                        title="Ver Detalhes"
                      >
                        <Info className="w-4 h-4" />
                      </button>
                      {!isCEO && (canManage || i.designerId === currentUser.id) && (
                        <>
                          <button 
                            onClick={() => handleEdit(i)}
                            className="p-2 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition"
                            title="Editar"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(i.id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-20 bg-white dark:bg-black rounded-2xl border border-dashed border-gray-200 dark:border-slate-700">
            <PauseCircle className="w-12 h-12 mx-auto text-gray-200 dark:text-slate-700 mb-4" />
            <h3 className="text-lg font-bold text-gray-400 dark:text-slate-500">Nenhuma interrupção encontrada</h3>
            <p className="text-gray-400 dark:text-slate-600 text-sm">Use os filtros acima ou registre uma nova interrupção.</p>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-black rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border dark:border-slate-700">
            <div className="p-6 border-b dark:border-slate-700 flex justify-between items-center bg-gray-50 dark:bg-black">
              <h2 className="text-xl font-bold text-black dark:text-white flex items-center">
                {editingInterruption ? <Edit className="w-6 h-6 mr-2 text-amber-500" /> : <Plus className="w-6 h-6 mr-2 text-amber-500" />}
                {editingInterruption ? 'Editar Interrupção' : 'Registrar Nova Interrupção'}
              </h2>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-black dark:text-white mb-1">NS do Projeto *</label>
                  <input 
                    type="text" 
                    value={ns}
                    onChange={e => setNs(e.target.value)}
                    className="w-full p-2.5 border dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none dark:bg-black dark:text-white"
                    placeholder="Ex: 12345"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-black dark:text-white mb-1">Cliente</label>
                  <input 
                    type="text" 
                    value={client}
                    onChange={e => setClient(e.target.value)}
                    className="w-full p-2.5 border dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none dark:bg-black dark:text-white"
                    placeholder="Nome do cliente"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-black dark:text-white mb-1">Tipo de Problema *</label>
                  <select 
                    value={problemType}
                    onChange={e => setProblemType(e.target.value)}
                    className="w-full p-2.5 border dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none dark:bg-black dark:text-white"
                    required
                  >
                    <option value="">Selecione o tipo...</option>
                    {data.interruptionTypes.filter(t => t.isActive).map(t => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-black dark:text-white mb-1">Área Responsável *</label>
                  <select 
                    value={area}
                    onChange={e => setArea(e.target.value as InterruptionArea)}
                    className="w-full p-2.5 border dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none dark:bg-black dark:text-white"
                    required
                  >
                    {Object.values(InterruptionArea).map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-black dark:text-white mb-1">Responsável pela Resposta</label>
                <input 
                  type="text" 
                  value={responsible}
                  onChange={e => setResponsible(e.target.value)}
                  className="w-full p-2.5 border dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none dark:bg-black dark:text-white"
                  placeholder="Nome da pessoa que deve responder"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-black dark:text-white mb-1">Descrição do Problema *</label>
                <textarea 
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={4}
                  className="w-full p-2.5 border dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none dark:bg-black dark:text-white resize-none"
                  placeholder="Descreva detalhadamente o que está impedindo o projeto..."
                  required
                />
              </div>

              {editingInterruption && (
                <div>
                  <label className="block text-sm font-bold text-black dark:text-white mb-1">Status</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {Object.values(InterruptionStatus).map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        className={`p-2 text-xs font-bold rounded-lg border transition-all ${
                          status === s 
                            ? 'bg-amber-600 border-amber-600 text-white shadow-md' 
                            : 'bg-white dark:bg-black border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:border-amber-300'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  {status === InterruptionStatus.RESOLVED && (
                    <div className="mt-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-lg text-emerald-700 dark:text-emerald-400 text-xs flex items-center">
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Ao salvar como "Resolvido", o cronômetro será encerrado e o tempo total será registrado.
                    </div>
                  )}
                </div>
              )}
            </form>

            <div className="p-6 bg-gray-50 dark:bg-black border-t dark:border-slate-700 flex justify-end gap-3">
              <button 
                onClick={resetForm}
                className="px-6 py-2.5 text-gray-600 dark:text-slate-300 font-bold hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSubmit}
                className="px-8 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-amber-900/20 flex items-center"
              >
                {editingInterruption ? <CheckCircle2 className="w-5 h-5 mr-2" /> : <PlayCircle className="w-5 h-5 mr-2" />}
                {editingInterruption ? 'Salvar Alterações' : 'Iniciar Interrupção'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Type Manager Modal */}
      {isTypeManagerOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-black rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border dark:border-slate-700">
            <div className="p-6 border-b dark:border-slate-700 flex justify-between items-center bg-gray-50 dark:bg-black">
              <h2 className="text-xl font-bold text-black dark:text-white flex items-center">
                <Settings className="w-6 h-6 mr-2 text-slate-500" />
                Categorias de Problemas
              </h2>
              <button onClick={() => setIsTypeManagerOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newTypeName}
                  onChange={e => setNewTypeName(e.target.value)}
                  className="flex-1 p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none dark:bg-black dark:text-white text-sm"
                  placeholder="Nova categoria..."
                />
                <button 
                  onClick={handleAddType}
                  className="bg-amber-600 text-white p-2 rounded-lg hover:bg-amber-700 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-2">
                {data.interruptionTypes.map(t => (
                  <div key={t.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-black rounded-lg border dark:border-slate-700">
                    <span className={`text-sm font-medium ${t.isActive ? 'text-gray-700 dark:text-slate-200' : 'text-gray-400 line-through'}`}>
                      {t.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => toggleTypeStatus(t)}
                        className={`p-1.5 rounded transition ${t.isActive ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700'}`}
                        title={t.isActive ? 'Desativar' : 'Ativar'}
                      >
                        {t.isActive ? <CheckCircle2 className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                      </button>
                      <button 
                        onClick={async () => {
                          if (window.confirm('Excluir categoria?')) {
                            const newState = await deleteInterruptionType(t.id);
                            onUpdate(newState);
                            addToast('Categoria excluída', 'success');
                          }
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {viewingInterruption && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-black rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border dark:border-slate-700">
            <div className="p-6 border-b dark:border-slate-700 flex justify-between items-center bg-gray-50 dark:bg-black">
              <h2 className="text-xl font-bold text-black dark:text-white flex items-center">
                <Info className="w-6 h-6 mr-2 text-blue-500" />
                Detalhes da Interrupção
              </h2>
              <button onClick={() => setViewingInterruption(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-widest">Projeto</label>
                  <p className="font-bold text-black dark:text-white">NS: {viewingInterruption.projectNs}</p>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-widest">Cliente</label>
                  <p className="font-bold text-black dark:text-white">{viewingInterruption.clientName || '-'}</p>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-widest">Problema</label>
                <p className="text-lg font-bold text-black dark:text-white">{viewingInterruption.problemType}</p>
                <span className="px-2 py-0.5 bg-slate-100 dark:bg-black rounded text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase">
                  Área: {viewingInterruption.responsibleArea}
                </span>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-widest">Descrição</label>
                <div className="mt-1 p-4 bg-gray-50 dark:bg-black rounded-xl border dark:border-slate-700 text-black dark:text-white text-sm leading-relaxed">
                  {viewingInterruption.description}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t dark:border-slate-700">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-widest">Início</label>
                  <p className="text-xs text-gray-900 dark:text-white">{new Date(viewingInterruption.startTime).toLocaleString('pt-BR')}</p>
                </div>
                {viewingInterruption.endTime && (
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-widest">Conclusão</label>
                    <p className="text-xs text-gray-900 dark:text-white">{new Date(viewingInterruption.endTime).toLocaleString('pt-BR')}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 bg-gray-50 dark:bg-black border-t dark:border-slate-700 flex justify-end">
              <button 
                onClick={() => setViewingInterruption(null)}
                className="px-6 py-2.5 bg-gray-800 dark:bg-black text-white font-bold rounded-xl hover:bg-gray-900 dark:hover:bg-slate-600 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
