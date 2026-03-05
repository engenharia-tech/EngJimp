import React, { useState, useMemo, useEffect } from 'react';
import { Lightbulb, Plus, TrendingDown, TrendingUp, DollarSign, Calendar, User as UserIcon, Check, X, PlayCircle, Trash2, Calculator, ArrowRight } from 'lucide-react';
import { InnovationType, InnovationRecord, User, AppState, CalculationType } from '../types';
import { fetchUsers } from '../services/storageService';

interface InnovationManagerProps {
  innovations: InnovationRecord[];
  onAdd: (innovation: InnovationRecord) => void;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  currentUser: User;
}

export const InnovationManager: React.FC<InnovationManagerProps> = ({ innovations, onAdd, onStatusChange, onDelete, currentUser }) => {
  const [showForm, setShowForm] = useState(false);
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<InnovationType>(InnovationType.PRODUCT_IMPROVEMENT);
  const [calculationType, setCalculationType] = useState<CalculationType>(CalculationType.RECURRING_MONTHLY);
  const [unitSavings, setUnitSavings] = useState<string>(''); // R$ value
  const [quantity, setQuantity] = useState<string>(''); // Qty
  const [investmentCost, setInvestmentCost] = useState<string>(''); // R$ Investment

  useEffect(() => {
    const load = async () => {
      const users = await fetchUsers();
      const map = users.reduce((acc, u) => ({ ...acc, [u.id]: u.name }), {} as Record<string, string>);
      setUsersMap(map);
    };
    load();
  }, []);

  // Sort innovations by date descending
  const sortedInnovations = useMemo(() => {
    return [...innovations].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [innovations]);

  // Calculate totals - ONLY APPROVED or IMPLEMENTED
  const totalStats = useMemo(() => {
    return innovations.reduce((acc, curr) => {
      if (curr.status === 'APPROVED' || curr.status === 'IMPLEMENTED') {
         return {
            savings: acc.savings + (curr.totalAnnualSavings || 0),
            count: acc.count + 1
         };
      }
      return acc;
    }, { savings: 0, count: 0 });
  }, [innovations]);

  // Preview Calculation for Form
  const previewAnnualSavings = useMemo(() => {
    const unit = parseFloat(unitSavings) || 0;
    const qty = parseFloat(quantity) || 0;
    
    if (calculationType === CalculationType.ONE_TIME) return unit;
    return unit * qty;
  }, [unitSavings, quantity, calculationType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const unit = parseFloat(unitSavings) || 0;
    const qty = parseFloat(quantity) || 0;
    const invest = parseFloat(investmentCost) || 0;
    let total = 0;

    if (calculationType === CalculationType.ONE_TIME) {
        total = unit;
    } else {
        total = unit * qty;
    }

    const newRecord: InnovationRecord = {
      id: crypto.randomUUID(),
      title,
      description,
      type,
      
      calculationType,
      unitSavings: unit,
      quantity: calculationType === CalculationType.ONE_TIME ? 1 : qty,
      totalAnnualSavings: total,
      investmentCost: invest,

      status: 'PENDING',
      authorId: currentUser.id,
      createdAt: new Date().toISOString()
    };

    onAdd(newRecord);
    
    // Reset form
    setTitle('');
    setDescription('');
    setUnitSavings('');
    setQuantity('');
    setInvestmentCost('');
    setShowForm(false);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const getStatusColor = (status: string) => {
      switch(status) {
          case 'APPROVED': return 'bg-blue-100 text-blue-700 border-blue-200';
          case 'IMPLEMENTED': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
          case 'REJECTED': return 'bg-red-50 text-red-600 border-red-100';
          default: return 'bg-gray-100 text-gray-700 border-gray-200';
      }
  }

  const getStatusLabel = (status: string) => {
      switch(status) {
          case 'APPROVED': return 'Aprovado';
          case 'IMPLEMENTED': return 'Implementado';
          case 'REJECTED': return 'Rejeitado';
          default: return 'Pendente';
      }
  }

  const getCalculationLabel = (type: CalculationType) => {
      switch(type) {
          case CalculationType.PER_UNIT: return 'unidades/ano';
          case CalculationType.RECURRING_MONTHLY: return 'meses/ano';
          default: return '';
      }
  }

  return (
    <div className="space-y-6">
      {/* Header & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center">
            <Lightbulb className="w-6 h-6 mr-2 text-yellow-500" />
            Inovações e Melhorias
          </h2>
          <p className="text-gray-500 mt-1">Gerencie ideias e acompanhe o impacto financeiro real.</p>
        </div>
        
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl p-6 text-white shadow-lg relative overflow-hidden">
          <div className="relative z-10">
              <div className="text-emerald-100 text-sm font-medium mb-1 uppercase tracking-wider">Economia Anual (Aprovada)</div>
              <div className="text-4xl font-bold font-mono">{formatCurrency(totalStats.savings)}</div>
              <div className="text-emerald-100 text-xs mt-2 flex items-center">
                <Check className="w-4 h-4 mr-1" />
                {totalStats.count} inovações contabilizadas
              </div>
          </div>
          <TrendingDown className="absolute right-4 bottom-4 w-24 h-24 text-white/10" />
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex justify-end">
        {currentUser.role === 'GESTOR' && (
            <button 
              onClick={() => setShowForm(!showForm)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center transition-colors shadow-sm"
            >
              <Plus className="w-5 h-5 mr-2" />
              Nova Ideia / Melhoria
            </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white p-6 rounded-xl shadow-lg border border-blue-100 animate-in fade-in slide-in-from-top-4 duration-300">
          <h3 className="font-bold text-lg mb-6 text-gray-800 flex items-center border-b pb-4">
            <Calculator className="w-5 h-5 mr-2 text-blue-600" />
            Calculadora de Economia
          </h3>
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Título da Melhoria</label>
                <input 
                  type="text" 
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Ex: Otimização de corte de chapa..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Inovação</label>
                <select 
                  value={type}
                  onChange={e => setType(e.target.value as InnovationType)}
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                >
                  <option value={InnovationType.PRODUCT_IMPROVEMENT}>Melhoria de Produto</option>
                  <option value={InnovationType.PROCESS_OPTIMIZATION}>Otimização de Processo</option>
                  <option value={InnovationType.NEW_PROJECT}>Novo Projeto</option>
                </select>
              </div>

              <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Custo de Investimento (Opcional)</label>
                 <div className="relative">
                   <span className="absolute left-3 top-3 text-gray-400">R$</span>
                   <input 
                    type="number" 
                    step="0.01"
                    value={investmentCost}
                    onChange={e => setInvestmentCost(e.target.value)}
                    className="w-full pl-10 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            {/* Calculation Logic */}
            <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                <h4 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wider">Cálculo de Impacto Financeiro</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Método de Cálculo</label>
                        <select 
                            value={calculationType}
                            onChange={e => setCalculationType(e.target.value as CalculationType)}
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        >
                            <option value={CalculationType.RECURRING_MONTHLY}>Recorrente (Mensal)</option>
                            <option value={CalculationType.PER_UNIT}>Por Unidade Produzida</option>
                            <option value={CalculationType.ONE_TIME}>Valor Único / Fixo</option>
                        </select>
                    </div>

                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                             {calculationType === CalculationType.PER_UNIT ? 'Economia por Unidade' : 
                              calculationType === CalculationType.RECURRING_MONTHLY ? 'Economia por Mês' : 
                              'Valor da Economia'}
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-3 text-gray-500 font-bold">R$</span>
                            <input 
                                type="number" 
                                step="0.01"
                                value={unitSavings}
                                onChange={e => setUnitSavings(e.target.value)}
                                className="w-full pl-10 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="0.00"
                                required
                            />
                        </div>
                    </div>

                    <div className="md:col-span-1">
                        {calculationType !== CalculationType.ONE_TIME ? (
                            <>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {calculationType === CalculationType.PER_UNIT ? 'Qtd. Produzida/Ano' : 'Meses Ativos/Ano'}
                                </label>
                                <input 
                                    type="number" 
                                    value={quantity}
                                    onChange={e => setQuantity(e.target.value)}
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder={calculationType === CalculationType.PER_UNIT ? "Ex: 500" : "Ex: 12"}
                                    required
                                />
                            </>
                        ) : (
                             <div className="flex items-center h-full pt-6 text-gray-400 text-sm italic">
                                Cálculo de valor único.
                             </div>
                        )}
                    </div>
                </div>

                {/* Preview Banner */}
                <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
                    <div>
                        <div className="text-xs text-blue-600 font-bold uppercase">Impacto Anual Estimado</div>
                        <div className="text-sm text-blue-800 mt-1">
                            {calculationType === CalculationType.ONE_TIME 
                                ? "Valor Fixo Único"
                                : `${formatCurrency(parseFloat(unitSavings) || 0)} x ${parseFloat(quantity) || 0} ${getCalculationLabel(calculationType)}`
                            }
                        </div>
                    </div>
                    <div className="flex items-center text-2xl font-bold text-blue-700">
                        <ArrowRight className="w-5 h-5 mr-2 text-blue-400" />
                        {formatCurrency(previewAnnualSavings)}
                    </div>
                </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Detalhes Técnicos</label>
              <textarea 
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Descreva como essa economia será alcançada..."
                required
              />
            </div>
            
            <div className="flex justify-end gap-3 pt-4 border-t">
               <button 
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-6 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-8 rounded-lg transition-colors shadow-lg shadow-blue-500/30"
                >
                  Registrar Inovação
                </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
            <tr>
              <th className="p-4">Melhoria</th>
              <th className="p-4">Cálculo</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Impacto Anual</th>
              {currentUser.role === 'GESTOR' && <th className="p-4 text-right">Gestão</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedInnovations.map((inv) => (
              <tr key={inv.id} className="hover:bg-gray-50 transition-colors group">
                <td className="p-4 max-w-[250px]">
                  <div className="font-bold text-gray-800 truncate" title={inv.title}>{inv.title}</div>
                  <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        inv.type === InnovationType.NEW_PROJECT ? 'bg-purple-50 text-purple-700 border-purple-100' : 
                        inv.type === InnovationType.PROCESS_OPTIMIZATION ? 'bg-orange-50 text-orange-700 border-orange-100' :
                        'bg-blue-50 text-blue-700 border-blue-100'
                      }`}>
                        {inv.type}
                      </span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                    <span className="flex items-center"><Calendar className="w-3 h-3 mr-1"/> {new Date(inv.createdAt).toLocaleDateString()}</span>
                    {inv.authorId && (
                      <span className="flex items-center"><UserIcon className="w-3 h-3 mr-1"/> {usersMap[inv.authorId] || '...'}</span>
                    )}
                  </div>
                </td>
                <td className="p-4 text-gray-600">
                   {inv.calculationType === CalculationType.ONE_TIME ? (
                       <span className="text-xs bg-gray-100 px-2 py-1 rounded">Fixo</span>
                   ) : (
                       <div className="flex flex-col text-xs">
                           <span className="font-medium text-gray-700">{formatCurrency(inv.unitSavings)}</span>
                           <span className="text-gray-400">x {inv.quantity} {inv.calculationType === CalculationType.PER_UNIT ? 'un' : 'meses'}</span>
                       </div>
                   )}
                </td>
                <td className="p-4">
                   <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${getStatusColor(inv.status)}`}>
                       {getStatusLabel(inv.status)}
                   </span>
                </td>
                <td className="p-4 text-right">
                  <div className={`font-mono font-bold text-lg ${
                     inv.status === 'REJECTED' ? 'text-gray-400 line-through decoration-2' : 
                     inv.status === 'PENDING' ? 'text-gray-500' :
                     'text-emerald-600'
                  }`}>
                    {formatCurrency(inv.totalAnnualSavings)}
                  </div>
                  {inv.investmentCost && inv.investmentCost > 0 && (
                      <div className="text-xs text-red-400 mt-1">Inv: -{formatCurrency(inv.investmentCost)}</div>
                  )}
                </td>
                {currentUser.role === 'GESTOR' && (
                    <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                            {inv.status === 'PENDING' && (
                                <>
                                    <button 
                                        onClick={() => onStatusChange(inv.id, 'APPROVED')}
                                        title="Aprovar"
                                        className="p-1.5 bg-green-50 text-green-600 rounded-md border border-green-200 hover:bg-green-100 hover:border-green-300 transition shadow-sm"
                                    >
                                        <Check className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => onStatusChange(inv.id, 'REJECTED')}
                                        title="Rejeitar"
                                        className="p-1.5 bg-red-50 text-red-600 rounded-md border border-red-200 hover:bg-red-100 hover:border-red-300 transition shadow-sm"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </>
                            )}
                            {inv.status === 'APPROVED' && (
                                 <button 
                                    onClick={() => onStatusChange(inv.id, 'IMPLEMENTED')}
                                    className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition flex items-center shadow-sm"
                                >
                                    <PlayCircle className="w-3 h-3 mr-1" />
                                    Implementar
                                </button>
                            )}
                            <button 
                                onClick={() => setDeleteConfirmationId(inv.id)}
                                title="Excluir"
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition ml-2"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </td>
                )}
              </tr>
            ))}
            {sortedInnovations.length === 0 && (
              <tr>
                <td colSpan={5} className="p-12 text-center text-gray-400 border border-dashed border-gray-200 rounded-lg m-4">
                  <div className="flex flex-col items-center justify-center">
                    <Lightbulb className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <span>Nenhuma inovação registrada ainda.</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmationId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-2">Confirmar Exclusão</h3>
                <p className="text-gray-600 mb-6">
                    Tem certeza que deseja excluir esta inovação? Esta ação não pode ser desfeita.
                </p>
                <div className="flex justify-end gap-3">
                    <button 
                        onClick={() => setDeleteConfirmationId(null)}
                        className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={() => {
                            onDelete(deleteConfirmationId);
                            setDeleteConfirmationId(null);
                        }}
                        className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors shadow-sm"
                    >
                        Sim, Excluir
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
