import React, { useState, useMemo, useEffect } from 'react';
import { Lightbulb, Plus, TrendingDown, TrendingUp, DollarSign, Calendar, User as UserIcon, Check, X, PlayCircle, Trash2, Calculator, ArrowRight, Eye, Edit, Info, MinusCircle, PlusCircle, Settings, ArrowUpDown, ArrowUp, ArrowDown, Search } from 'lucide-react';
import { InnovationType, InnovationRecord, User, AppState, CalculationType, InnovationMaterial, InnovationMachine } from '../types';
import { fetchUsers } from '../services/storageService';
import { useLanguage } from '../i18n/LanguageContext';

interface InnovationManagerProps {
  innovations: InnovationRecord[];
  onAdd: (innovation: InnovationRecord) => void;
  onUpdate: (innovation: InnovationRecord) => void;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  currentUser: User;
  settings?: any;
}

export const InnovationManager: React.FC<InnovationManagerProps> = ({ innovations, onAdd, onUpdate, onStatusChange, onDelete, currentUser, settings }) => {
  const { t } = useLanguage();
  const [showForm, setShowForm] = useState(false);
  const [editingInnovation, setEditingInnovation] = useState<InnovationRecord | null>(null);
  const [viewingInnovation, setViewingInnovation] = useState<InnovationRecord | null>(null);
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);

  // Filter State
  const [filterText, setFilterText] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Sorting State
  const [sortKey, setSortKey] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<InnovationType>(InnovationType.PRODUCT_IMPROVEMENT);
  const [calculationType, setCalculationType] = useState<CalculationType>(CalculationType.RECURRING_MONTHLY);
  const [unitSavings, setUnitSavings] = useState<string>(''); // R$ value
  const [quantity, setQuantity] = useState<string>(''); // Qty
  const [investmentCost, setInvestmentCost] = useState<string>(''); // R$ Investment
  const [productivityBefore, setProductivityBefore] = useState<string>('');
  const [productivityAfter, setProductivityAfter] = useState<string>('');
  const [unitProductCost, setUnitProductCost] = useState<string>('');
  const [unitProductValue, setUnitProductValue] = useState<string>('');

  // New Form State
  const [materials, setMaterials] = useState<InnovationMaterial[]>([]);
  const [machine, setMachine] = useState<InnovationMachine | null>(null);

  // Material Input State
  const [matName, setMatName] = useState('');
  const [matCost, setMatCost] = useState('');
  const [matType, setMatType] = useState<'ADD' | 'REMOVE'>('ADD');

  // Machine Input State
  const [macName, setMacName] = useState('');
  const [macCost, setMacCost] = useState('');
  const [macDepYears, setMacDepYears] = useState('');

  const canManage = ['GESTOR', 'COORDENADOR', 'PROCESSOS'].includes(currentUser.role);
  const canDelete = ['GESTOR', 'COORDENADOR'].includes(currentUser.role);

  useEffect(() => {
    if (editingInnovation) {
        setTitle(editingInnovation.title);
        setDescription(editingInnovation.description);
        setType(editingInnovation.type);
        setCalculationType(editingInnovation.calculationType);
        setUnitSavings(editingInnovation.unitSavings.toString());
        setQuantity(editingInnovation.quantity.toString());
        setInvestmentCost((editingInnovation.investmentCost || 0).toString());
        setMaterials(editingInnovation.materials || []);
        setMachine(editingInnovation.machine || null);
        setProductivityBefore(editingInnovation.productivityBefore?.toString() || '');
        setProductivityAfter(editingInnovation.productivityAfter?.toString() || '');
        setUnitProductCost(editingInnovation.unitProductCost?.toString() || '');
        setUnitProductValue(editingInnovation.unitProductValue?.toString() || '');
        setShowForm(true);
    } else {
        setTitle('');
        setDescription('');
        setType(InnovationType.PRODUCT_IMPROVEMENT);
        setCalculationType(CalculationType.RECURRING_MONTHLY);
        setUnitSavings('');
        setQuantity('');
        setInvestmentCost('');
        setMaterials([]);
        setMachine(null);
        setProductivityBefore('');
        setProductivityAfter('');
        setUnitProductCost('');
        setUnitProductValue('');
    }
  }, [editingInnovation]);

  useEffect(() => {
    const load = async () => {
      const users = await fetchUsers();
      const nonProcessUsers = users.filter(u => u.role !== 'PROCESSOS');
      const map = nonProcessUsers.reduce((acc, u) => ({ ...acc, [u.id]: u.name }), {} as Record<string, string>);
      setUsersMap(map);
    };
    load();
  }, []);

  // Sort innovations
  const sortedInnovations = useMemo(() => {
    const filtered = innovations.filter(inv => {
      // Exclude data from 'PROCESSOS' users
      const isProcessAuthor = inv.authorId && usersMap[inv.authorId] === undefined && Object.keys(usersMap).length > 0;
      if (isProcessAuthor) return false;

      const matchText = inv.title.toLowerCase().includes(filterText.toLowerCase()) || 
                        inv.description.toLowerCase().includes(filterText.toLowerCase());
      const matchType = filterType ? inv.type === filterType : true;
      
      let matchDate = true;
      if (startDate || endDate) {
        const iDate = new Date(inv.createdAt).getTime();
        const start = startDate ? new Date(startDate).getTime() : 0;
        const end = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : Infinity;
        matchDate = iDate >= start && iDate <= end;
      }

      return matchText && matchType && matchDate;
    });

    return filtered.sort((a, b) => {
      let valA: any;
      let valB: any;

      switch (sortKey) {
        case 'createdAt':
          valA = new Date(a.createdAt).getTime();
          valB = new Date(b.createdAt).getTime();
          break;
        case 'title':
          valA = a.title.toLowerCase();
          valB = b.title.toLowerCase();
          break;
        case 'status':
          valA = a.status;
          valB = b.status;
          break;
        case 'totalAnnualSavings':
          valA = a.totalAnnualSavings;
          valB = b.totalAnnualSavings;
          break;
        default:
          valA = 0;
          valB = 0;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [innovations, sortKey, sortDirection]);

  // Calculate totals - ONLY APPROVED or IMPLEMENTED
  const totalStats = useMemo(() => {
    const processUserIds = new Set(Object.keys(usersMap).length === 0 ? [] : []); // This is tricky since usersMap is async
    // Better to just filter by role if we had it, but we only have IDs here.
    // However, innovations already has authorId.
    
    return innovations.reduce((acc, curr) => {
      // If we don't know the author or they are in the map (which only has non-process users), we count them.
      // If authorId is missing, we assume it's okay for now or legacy.
      const isProcessAuthor = curr.authorId && usersMap[curr.authorId] === undefined && Object.keys(usersMap).length > 0;
      if (isProcessAuthor) return acc;

      if (curr.status === 'APPROVED' || curr.status === 'IMPLEMENTED' || curr.status === 'PENDING') {
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
    
    let base = 0;
    if (calculationType === CalculationType.ONE_TIME) {
        base = unit;
    } else if (calculationType === CalculationType.ADD_EXPENSE) {
        base = -unit;
    } else {
        base = unit * qty;
    }

    // Material Impact
    const materialImpact = materials.reduce((acc, m) => {
        const mCost = m.cost * (calculationType === CalculationType.ONE_TIME ? 1 : qty);
        if (m.type === 'REMOVE') return acc + mCost;
        return acc - mCost;
    }, 0);

    // Machine Impact (Depreciation is annual)
    const machineImpact = machine ? -machine.annualDepreciation : 0;

    // Productivity Impact
    let productivityImpact = 0;
    const hourlyCost = settings?.hourlyCost || 0;
    const prodBefore = parseFloat(productivityBefore);
    const prodAfter = parseFloat(productivityAfter);
    const prodCost = parseFloat(unitProductCost) || 0;
    const prodValue = parseFloat(unitProductValue) || 0;

    if (prodBefore > 0 && prodAfter > 0 && qty > 0) {
        // Labor Saving per unit = (Time Before - Time After) * Hourly Cost
        const timeBefore = 1 / prodBefore;
        const timeAfter = 1 / prodAfter;
        const laborSaving = (timeBefore - timeAfter) * (settings?.hourlyCost || 0) * qty;

        // Profit from Extra Capacity
        // Extra Units = qty * (prodAfter / prodBefore - 1)
        const extraUnits = qty * (prodAfter / prodBefore - 1);
        const profitFromExtraUnits = extraUnits * (prodValue - prodCost);

        // If product value is provided, we assume the goal is increasing capacity/profit
        productivityImpact = prodValue > 0 ? profitFromExtraUnits : laborSaving;
    }

    return base + materialImpact + machineImpact + productivityImpact;
  }, [unitSavings, quantity, calculationType, materials, machine, productivityBefore, productivityAfter, unitProductCost, unitProductValue, settings]);

  const addMaterial = () => {
    if (matName.trim() === '' || matCost === '') return;
    const newMat: InnovationMaterial = {
        id: crypto.randomUUID(),
        name: matName.trim(),
        cost: parseFloat(matCost) || 0,
        type: matType
    };
    setMaterials([...materials, newMat]);
    setMatName('');
    setMatCost('');
  };

  const removeMaterial = (id: string) => {
    setMaterials(materials.filter(m => m.id !== id));
  };

  const updateMachine = () => {
    if (!macName || !macCost || !macDepYears) {
        setMachine(null);
        return;
    }
    const cost = parseFloat(macCost) || 0;
    const years = parseFloat(macDepYears) || 1;
    setMachine({
        name: macName,
        cost,
        depreciationYears: years,
        annualDepreciation: cost / years
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const total = previewAnnualSavings;
    const invest = parseFloat(investmentCost) || 0;
    const prodBefore = parseFloat(productivityBefore) || undefined;
    const prodAfter = parseFloat(productivityAfter) || undefined;
    const prodCost = parseFloat(unitProductCost) || undefined;
    const prodValue = parseFloat(unitProductValue) || undefined;

    if (editingInnovation) {
        const updatedRecord: InnovationRecord = {
            ...editingInnovation,
            title,
            description,
            type,
            calculationType,
            unitSavings: parseFloat(unitSavings) || 0,
            quantity: calculationType === CalculationType.ONE_TIME ? 1 : (parseFloat(quantity) || 0),
            totalAnnualSavings: total,
            investmentCost: invest,
            materials,
            machine: machine || undefined,
            productivityBefore: prodBefore,
            productivityAfter: prodAfter,
            unitProductCost: prodCost,
            unitProductValue: prodValue
        };
        onUpdate(updatedRecord);
        setEditingInnovation(null);
    } else {
        const newRecord: InnovationRecord = {
            id: crypto.randomUUID(),
            title,
            description,
            type,
            
            calculationType,
            unitSavings: parseFloat(unitSavings) || 0,
            quantity: calculationType === CalculationType.ONE_TIME ? 1 : (parseFloat(quantity) || 0),
            totalAnnualSavings: total,
            investmentCost: invest,
            materials,
            machine: machine || undefined,
            productivityBefore: prodBefore,
            productivityAfter: prodAfter,
            unitProductCost: prodCost,
            unitProductValue: prodValue,

            status: 'PENDING',
            authorId: currentUser.id,
            createdAt: new Date().toISOString()
        };
        onAdd(newRecord);
    }
    
    // Reset form
    setShowForm(false);
  };

  const { language } = useLanguage();

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat(language, { style: 'currency', currency: 'BRL' }).format(val);
  };

  const getStatusColor = (status: string) => {
      switch(status) {
          case 'APPROVED': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-black dark:text-blue-400 dark:border-blue-800';
          case 'IMPLEMENTED': return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-black dark:text-emerald-400 dark:border-emerald-800';
          case 'REJECTED': return 'bg-red-50 text-red-600 border-red-100 dark:bg-black dark:text-red-400 dark:border-red-900';
          default: return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-black dark:text-slate-400 dark:border-slate-700';
      }
  }

  const getStatusLabel = (status: string) => {
      switch(status) {
          case 'APPROVED': return t('approved');
          case 'IMPLEMENTED': return t('implemented');
          case 'REJECTED': return t('rejected');
          default: return t('pending');
      }
  }

  const getInnovationTypeLabel = (type: InnovationType) => {
    switch (type) {
      case InnovationType.PRODUCT_IMPROVEMENT: return t('productImprovement');
      case InnovationType.PROCESS_OPTIMIZATION: return t('processOptimization');
      case InnovationType.NEW_PROJECT: return t('newProject');
      default: return type;
    }
  };

  const getCalculationLabel = (type: CalculationType) => {
      switch(type) {
          case CalculationType.PER_UNIT: 
          case CalculationType.RECURRING_MONTHLY: 
              return t('unitsYear');
          default: return '';
      }
  }

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortKey !== columnKey) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
    return sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 text-blue-600" /> : <ArrowDown className="w-3 h-3 ml-1 text-blue-600" />;
  };

  return (
    <div className="space-y-6">
      {/* Header & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-2xl font-bold text-black dark:text-white flex items-center">
            <Lightbulb className="w-6 h-6 mr-2 text-yellow-500" />
            {t('innovationsTitle')}
          </h2>
          <p className="text-gray-600 dark:text-slate-400 mt-1">{t('innovationsSubtitle')}</p>
        </div>
        
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 dark:from-black dark:to-black rounded-xl p-6 text-white shadow-lg relative overflow-hidden border dark:border-slate-700">
          <div className="relative z-10">
              <div className="text-emerald-100 text-sm font-medium mb-1 uppercase tracking-wider">{t('predictedAnnualSavings')}</div>
              <div className="text-4xl font-bold font-mono">{formatCurrency(totalStats.savings)}</div>
              <div className="text-emerald-100 text-xs mt-2 flex items-center">
                <Check className="w-4 h-4 mr-1" />
                {t('innovationsCounted', { count: totalStats.count })}
              </div>
          </div>
          <TrendingDown className="absolute right-4 bottom-4 w-24 h-24 text-white/30 dark:text-emerald-500/30" />
        </div>
      </div>

      {/* Action Bar & Filters */}
      <div className="flex flex-col space-y-4">
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div className="flex flex-1 gap-4">
              <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <input 
                      type="text"
                      placeholder={t('searchInnovations')}
                      value={filterText}
                      onChange={e => setFilterText(e.target.value)}
                      className="w-full pl-10 p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-black dark:text-slate-200 shadow-sm"
                  />
              </div>
              <select 
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                  className="p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-black dark:text-slate-200 shadow-sm text-sm"
              >
                  <option value="">{t('allTypes')}</option>
                  <option value={InnovationType.PRODUCT_IMPROVEMENT}>{t('productImprovement')}</option>
                  <option value={InnovationType.PROCESS_OPTIMIZATION}>{t('processOptimization')}</option>
                  <option value={InnovationType.NEW_PROJECT}>{t('newProject')}</option>
              </select>
          </div>

          {canManage && (
              <button 
                onClick={() => {
                    setEditingInnovation(null);
                    setShowForm(!showForm);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg flex items-center transition-colors shadow-md"
              >
                <Plus className="w-5 h-5 mr-2" />
                {t('newIdea')}
              </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 bg-white dark:bg-black p-3 rounded-lg border border-gray-100 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                <span className="text-xs font-medium text-black dark:text-white uppercase tracking-wider">{t('filterByDate')}</span>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 dark:text-slate-500">{t('from')}</span>
                <input 
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="p-1.5 border dark:border-slate-700 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-black dark:text-slate-200"
                />
            </div>
            <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 dark:text-slate-500">{t('to')}</span>
                <input 
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="p-1.5 border dark:border-slate-700 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-black dark:text-slate-200"
                />
            </div>
            {(startDate || endDate || filterText || filterType) && (
                <button 
                    onClick={() => {
                        setStartDate('');
                        setEndDate('');
                        setFilterText('');
                        setFilterType('');
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium ml-auto flex items-center"
                >
                    <X className="w-3 h-3 mr-1" /> {t('clearFilters')}
                </button>
            )}
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white dark:bg-black p-6 rounded-xl shadow-lg border border-blue-100 dark:border-blue-900/30 animate-in fade-in slide-in-from-top-4 duration-300">
          <h3 className="font-bold text-lg mb-6 text-black dark:text-white flex items-center border-b dark:border-slate-700 pb-4">
            <Calculator className="w-5 h-5 mr-2 text-blue-600" />
            {editingInnovation ? t('editInnovation') : t('savingsCalculator')}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-black dark:text-white mb-1">{t('improvementTitle')}</label>
                <input 
                  type="text" 
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full p-3 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-black dark:text-slate-200"
                  placeholder={t('improvementTitlePlaceholder')}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-black dark:text-white mb-1">{t('innovationType')}</label>
                <select 
                  value={type}
                  onChange={e => setType(e.target.value as InnovationType)}
                  className="w-full p-3 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-black dark:text-slate-200"
                >
                  <option value={InnovationType.PRODUCT_IMPROVEMENT}>{t('productImprovement')}</option>
                  <option value={InnovationType.PROCESS_OPTIMIZATION}>{t('processOptimization')}</option>
                  <option value={InnovationType.NEW_PROJECT}>{t('newProject')}</option>
                </select>
              </div>

              <div>
                 <label className="block text-sm font-medium text-black dark:text-white mb-1">{t('investmentCost')}</label>
                 <div className="relative">
                   <span className="absolute left-3 top-3 text-gray-400 dark:text-slate-500">{t('currencySymbol')}</span>
                   <input 
                    type="number" 
                    step="0.01"
                    value={investmentCost}
                    onChange={e => setInvestmentCost(e.target.value)}
                    className="w-full pl-10 p-3 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-black dark:text-slate-200"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            {/* Calculation Logic */}
            <div className="bg-gray-50 dark:bg-black p-6 rounded-lg border border-gray-200 dark:border-slate-700">
                <h4 className="text-sm font-bold text-black dark:text-white mb-4 uppercase tracking-wider">{t('financialImpactMethod')}</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-black dark:text-white mb-1">{t('calculationMethod')}</label>
                        <select 
                            value={calculationType}
                            onChange={e => setCalculationType(e.target.value as CalculationType)}
                            className="w-full p-3 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-black dark:text-slate-200"
                        >
                            <option value={CalculationType.RECURRING_MONTHLY}>{t('recurringMonthly')}</option>
                            <option value={CalculationType.PER_UNIT}>{t('perUnit')}</option>
                            <option value={CalculationType.ONE_TIME}>{t('oneTime')}</option>
                            <option value={CalculationType.ADD_EXPENSE}>{t('addExpense')}</option>
                        </select>
                    </div>

                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-black dark:text-white mb-1">
                             {calculationType === CalculationType.PER_UNIT ? t('savingsPerUnit') : 
                              calculationType === CalculationType.RECURRING_MONTHLY ? t('savingsPerMonth') : 
                              calculationType === CalculationType.ADD_EXPENSE ? t('expenseValue') :
                              t('savingsValue')}
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-3 text-gray-500 dark:text-slate-400 font-bold">{t('currencySymbol')}</span>
                            <input 
                                type="number" 
                                step="0.01"
                                value={unitSavings}
                                onChange={e => setUnitSavings(e.target.value)}
                                className="w-full pl-10 p-3 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-black dark:text-slate-200"
                                placeholder="0.00"
                                required
                            />
                        </div>
                    </div>

                    <div className="md:col-span-1">
                        {calculationType !== CalculationType.ONE_TIME && calculationType !== CalculationType.ADD_EXPENSE ? (
                            <>
                                <label className="block text-sm font-medium text-black dark:text-white mb-1">
                                    {t('producedQuantityYear')}
                                </label>
                                <input 
                                    type="number" 
                                    value={quantity}
                                    onChange={e => setQuantity(e.target.value)}
                                    className="w-full p-3 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-black dark:text-slate-200"
                                    placeholder={t('quantityPlaceholder')}
                                    required
                                />
                            </>
                        ) : (
                             <div className="flex items-center h-full pt-6 text-gray-400 dark:text-slate-500 text-sm italic">
                                {calculationType === CalculationType.ADD_EXPENSE ? t('oneTimeExpenseCalculation') : t('oneTimeCalculation')}
                             </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Materials Section */}
            <div className="bg-white dark:bg-black p-6 rounded-lg border border-gray-200 dark:border-slate-700">
                <h4 className="text-sm font-bold text-black dark:text-white mb-4 uppercase tracking-wider flex items-center">
                    <PlusCircle className="w-4 h-4 mr-2 text-emerald-500" />
                    {t('materialsSection')}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <div className="md:col-span-1">
                        <input 
                            type="text" 
                            placeholder={t('materialName')}
                            value={matName}
                            onChange={e => setMatName(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    addMaterial();
                                }
                            }}
                            className="w-full p-2 border dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-black dark:text-slate-200"
                        />
                    </div>
                    <div className="md:col-span-1">
                        <div className="relative">
                            <span className="absolute left-2 top-2 text-gray-400 dark:text-slate-500 text-xs">{t('currencySymbol')}</span>
                            <input 
                                type="number" 
                                placeholder={t('investmentCost')}
                                value={matCost}
                                onChange={e => setMatCost(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addMaterial();
                                    }
                                }}
                                className="w-full pl-7 p-2 border dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-black dark:text-slate-200"
                            />
                        </div>
                    </div>
                    <div className="md:col-span-1">
                        <select 
                            value={matType}
                            onChange={e => setMatType(e.target.value as 'ADD' | 'REMOVE')}
                            className="w-full p-2 border dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-black dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                        >
                            <option value="REMOVE">{t('removeGain')}</option>
                            <option value="ADD">{t('addSpend')}</option>
                        </select>
                    </div>
                    <div className="md:col-span-1">
                        <button 
                            type="button"
                            onClick={addMaterial}
                            disabled={!matName.trim() || matCost === ''}
                            className={`w-full p-2 rounded-lg flex items-center justify-center font-bold transition-all shadow-sm ${
                                !matName.trim() || matCost === '' 
                                ? 'bg-gray-200 dark:bg-black text-gray-400 dark:text-slate-500 cursor-not-allowed' 
                                : matType === 'ADD' 
                                    ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-200' 
                                    : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-200'
                            }`}
                        >
                            <Plus className="w-4 h-4 mr-1" /> 
                            {matType === 'ADD' ? t('addExpenseAction') : t('addGainAction')}
                        </button>
                    </div>
                </div>

                {materials.length > 0 && (
                    <div className="space-y-2">
                        {materials.map(m => (
                            <div key={m.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-black rounded-lg border border-gray-100 dark:border-slate-700 text-sm">
                                <div className="flex items-center">
                                    {m.type === 'REMOVE' ? <TrendingUp className="w-4 h-4 mr-2 text-emerald-500" /> : <TrendingDown className="w-4 h-4 mr-2 text-red-500" />}
                                    <span className="font-medium dark:text-slate-300">{m.name}</span>
                                    <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${m.type === 'REMOVE' ? 'bg-emerald-100 text-emerald-700 dark:bg-black dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-black dark:text-red-400'}`}>
                                        {m.type === 'REMOVE' ? t('removed') : t('added')}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <div className="font-mono font-bold dark:text-slate-200">
                                            {m.type === 'REMOVE' ? '+' : '-'}{formatCurrency(m.cost * (calculationType === CalculationType.ONE_TIME || calculationType === CalculationType.ADD_EXPENSE ? 1 : (parseFloat(quantity) || 0)))}
                                        </div>
                                        {calculationType !== CalculationType.ONE_TIME && calculationType !== CalculationType.ADD_EXPENSE && (
                                            <div className="text-[10px] text-gray-400 dark:text-slate-500">
                                                {formatCurrency(m.cost)} x {quantity || 0} {t('unitsAbbr')}
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={() => removeMaterial(m.id)} className="text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Machine Section */}
            <div className="bg-white dark:bg-black p-6 rounded-lg border border-gray-200 dark:border-slate-700">
                <h4 className="text-sm font-bold text-black dark:text-white mb-4 uppercase tracking-wider flex items-center">
                    <Settings className="w-4 h-4 mr-2 text-blue-500" />
                    {t('machineSection')}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-1">
                        <input 
                            type="text" 
                            placeholder={t('machineName')}
                            value={macName}
                            onChange={e => {
                                setMacName(e.target.value);
                                // Update machine object on change
                            }}
                            onBlur={updateMachine}
                            className="w-full p-2 border dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-black dark:text-slate-200"
                        />
                    </div>
                    <div className="md:col-span-1">
                        <div className="relative">
                            <span className="absolute left-2 top-2 text-gray-400 dark:text-slate-500 text-xs">{t('currencySymbol')}</span>
                            <input 
                                type="number" 
                                placeholder={t('machineCost')}
                                value={macCost}
                                onChange={e => setMacCost(e.target.value)}
                                onBlur={updateMachine}
                                className="w-full pl-7 p-2 border dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-black dark:text-slate-200"
                            />
                        </div>
                    </div>
                    <div className="md:col-span-1">
                        <input 
                            type="number" 
                            placeholder={t('depreciationYears')}
                            value={macDepYears}
                            onChange={e => setMacDepYears(e.target.value)}
                            onBlur={updateMachine}
                            className="w-full p-2 border dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-black dark:text-slate-200"
                        />
                    </div>
                    <div className="md:col-span-1 flex items-center">
                        {machine && (
                            <div className="text-xs text-blue-600 dark:text-blue-400 font-bold">
                                {t('depreciationPerYear', { value: formatCurrency(machine.annualDepreciation) })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Productivity Yield Section */}
            <div className="bg-white dark:bg-black p-6 rounded-lg border border-gray-200 dark:border-slate-700">
                <h4 className="text-sm font-bold text-black dark:text-white mb-4 uppercase tracking-wider flex items-center">
                    <TrendingUp className="w-4 h-4 mr-2 text-blue-500" />
                    {t('productivityYield')}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">{t('productivityBefore')}</label>
                        <input 
                            type="number" 
                            value={productivityBefore}
                            onChange={e => setProductivityBefore(e.target.value)}
                            className="w-full p-2 border dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-black dark:text-slate-200"
                            placeholder={t('exampleValue5')}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">{t('productivityAfter')}</label>
                        <input 
                            type="number" 
                            value={productivityAfter}
                            onChange={e => setProductivityAfter(e.target.value)}
                            className="w-full p-2 border dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-black dark:text-slate-200"
                            placeholder={t('exampleValue7')}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">{t('unitProductCost')}</label>
                        <div className="relative">
                            <span className="absolute left-2 top-2 text-gray-400 dark:text-slate-500 text-xs">{t('currencySymbol')}</span>
                            <input 
                                type="number" 
                                value={unitProductCost}
                                onChange={e => setUnitProductCost(e.target.value)}
                                className="w-full pl-7 p-2 border dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-black dark:text-slate-200"
                                placeholder={t('exampleValue15')}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">{t('unitProductValue')}</label>
                        <div className="relative">
                            <span className="absolute left-2 top-2 text-gray-400 dark:text-slate-500 text-xs">{t('currencySymbol')}</span>
                            <input 
                                type="number" 
                                value={unitProductValue}
                                onChange={e => setUnitProductValue(e.target.value)}
                                className="w-full pl-7 p-2 border dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-black dark:text-slate-200"
                                placeholder={t('exampleValue')}
                            />
                        </div>
                    </div>
                    <div className="md:col-span-4">
                        {parseFloat(productivityBefore) > 0 && parseFloat(productivityAfter) > 0 && (
                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg flex flex-wrap gap-8 items-center">
                                <div>
                                    <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase">{t('productivityGain')}</div>
                                    <div className="text-2xl font-black text-blue-700 dark:text-blue-300">
                                        +{((parseFloat(productivityAfter) - parseFloat(productivityBefore)) / parseFloat(productivityBefore) * 100).toFixed(1)}%
                                    </div>
                                </div>
                                
                                {parseFloat(unitProductValue) > 0 && parseFloat(unitProductCost) > 0 && (
                                    <div className="border-l border-blue-200 dark:border-blue-800 pl-8">
                                        <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase">{t('profitFromCapacity')}</div>
                                        <div className="text-2xl font-black text-emerald-600">
                                            {formatCurrency(parseFloat(quantity) * (parseFloat(productivityAfter) / parseFloat(productivityBefore) - 1) * (parseFloat(unitProductValue) - parseFloat(unitProductCost)))}
                                        </div>
                                        <div className="text-[10px] text-gray-400">
                                            ({(parseFloat(quantity) * (parseFloat(productivityAfter) / parseFloat(productivityBefore) - 1)).toFixed(0)} {t('extraUnits')} / {t('year')})
                                        </div>
                                    </div>
                                )}

                                {parseFloat(unitProductCost) > 0 && (
                                    <div className="border-l border-blue-200 dark:border-blue-800 pl-8 grid grid-cols-2 gap-x-8 gap-y-1">
                                        <div className="col-span-2 mb-1">
                                            <div className="text-[10px] text-gray-400 uppercase font-bold">{t('costPerUnit')}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-gray-400 uppercase">{t('current')}</div>
                                            <div className="text-xs font-bold text-gray-600 dark:text-slate-400">
                                                {formatCurrency(((settings?.hourlyCost || 0) / parseFloat(productivityBefore)) + parseFloat(unitProductCost))}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-blue-600 dark:text-blue-400 uppercase">{t('improved')}</div>
                                            <div className="text-xs font-bold text-blue-700 dark:text-blue-300">
                                                {formatCurrency(((settings?.hourlyCost || 0) / parseFloat(productivityAfter)) + parseFloat(unitProductCost))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Final Preview Banner */}
            <div className={`mt-6 border rounded-lg p-6 flex items-center justify-between shadow-sm ${previewAnnualSavings < 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/30' : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-900/30'}`}>
                <div>
                    <div className={`text-xs font-bold uppercase tracking-widest ${previewAnnualSavings < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {previewAnnualSavings < 0 ? t('finalAnnualImpactCost') : t('finalAnnualImpactNet')}
                    </div>
                    <div className={`text-sm mt-1 ${previewAnnualSavings < 0 ? 'text-red-800 dark:text-red-300' : 'text-emerald-800 dark:text-emerald-300'}`}>
                        {t('consideringBaseMaterials')}
                    </div>
                </div>
                <div className={`flex items-center text-3xl font-bold ${previewAnnualSavings < 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                    <ArrowRight className={`w-6 h-6 mr-2 ${previewAnnualSavings < 0 ? 'text-red-400 dark:text-red-500' : 'text-emerald-400 dark:text-emerald-500'}`} />
                    {formatCurrency(previewAnnualSavings)}
                </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-black dark:text-white mb-1">{t('technicalDetails')}</label>
              <textarea 
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                className="w-full p-3 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-black dark:text-slate-200"
                placeholder={t('technicalDetailsPlaceholder')}
                required
              />
            </div>
            
            <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
               <button 
                  type="button"
                  onClick={() => {
                      setShowForm(false);
                      setEditingInnovation(null);
                  }}
                  className="px-6 py-2 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors font-medium"
                >
                  {t('cancel')}
                </button>
                <button 
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-8 rounded-lg transition-colors shadow-lg shadow-blue-500/30"
                >
                  {editingInnovation ? t('saveChanges') : t('registerInnovation')}
                </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      <div className="bg-white dark:bg-black rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 dark:bg-black text-black dark:text-white font-medium border-b border-gray-100 dark:border-slate-700">
            <tr>
              <th className="p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-black transition-colors" onClick={() => handleSort('title')}>
                <div className="flex items-center">{t('improvementCol')} <SortIcon columnKey="title" /></div>
              </th>
              <th className="p-4">{t('calculationCol')}</th>
              <th className="p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-black transition-colors" onClick={() => handleSort('status')}>
                <div className="flex items-center">{t('statusCol')} <SortIcon columnKey="status" /></div>
              </th>
              <th className="p-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-black transition-colors" onClick={() => handleSort('totalAnnualSavings')}>
                <div className="flex items-center justify-end">{t('annualImpactCol')} <SortIcon columnKey="totalAnnualSavings" /></div>
              </th>
              <th className="p-4 text-right">{t('actionsCol')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
            {sortedInnovations.map((inv) => (
              <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-black transition-colors group">
                <td className="p-4 max-w-[250px] dark:text-white">
                  <div className="font-bold text-black dark:text-white truncate" title={inv.title}>{inv.title}</div>
                  <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        inv.type === InnovationType.NEW_PROJECT ? 'bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800' : 
                        inv.type === InnovationType.PROCESS_OPTIMIZATION ? 'bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800' :
                        'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800'
                      }`}>
                        {getInnovationTypeLabel(inv.type)}
                      </span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 dark:text-slate-500">
                    <span className="flex items-center"><Calendar className="w-3 h-3 mr-1"/> {new Date(inv.createdAt).toLocaleDateString()}</span>
                    {inv.authorId && (
                      <span className="flex items-center"><UserIcon className="w-3 h-3 mr-1"/> {usersMap[inv.authorId] || '...'}</span>
                    )}
                  </div>
                </td>
                <td className="p-4 text-gray-600 dark:text-slate-400">
                   {inv.calculationType === CalculationType.ONE_TIME || inv.calculationType === CalculationType.ADD_EXPENSE ? (
                       <span className={`text-xs px-2 py-1 rounded ${inv.calculationType === CalculationType.ADD_EXPENSE ? 'bg-red-50 text-red-600 border border-red-100 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800' : 'bg-gray-100 text-gray-600 dark:bg-black dark:text-slate-300'}`}>
                           {inv.calculationType === CalculationType.ADD_EXPENSE ? t('expenseAbbr') : t('oneTimeAbbr')}
                       </span>
                   ) : (
                       <div className="flex flex-col text-xs">
                           <span className="font-medium text-gray-700 dark:text-slate-300">{formatCurrency(inv.unitSavings)}</span>
                           <span className="text-gray-400 dark:text-slate-500">X {inv.quantity} {t('unitsAbbr')}</span>
                       </div>
                   )}
                </td>
                <td className="p-4 dark:text-white">
                   <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${getStatusColor(inv.status)}`}>
                       {getStatusLabel(inv.status)}
                   </span>
                </td>
                <td className="p-4 text-right">
                  <div className={`font-mono font-bold text-lg ${
                     inv.status === 'REJECTED' ? 'text-gray-400 dark:text-slate-600 line-through decoration-2' : 
                     inv.status === 'PENDING' ? 'text-gray-500 dark:text-slate-500' :
                     'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {formatCurrency(inv.totalAnnualSavings)}
                  </div>
                  {inv.investmentCost && inv.investmentCost > 0 && (
                      <div className="text-xs text-red-400 dark:text-red-500 mt-1">{t('investmentAbbr')} -{formatCurrency(inv.investmentCost)}</div>
                  )}
                </td>
                <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                        <button 
                            onClick={() => setViewingInnovation(inv)}
                            title={t('viewDetails')}
                            className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-black rounded transition"
                        >
                            <Eye className="w-4 h-4" />
                        </button>

                        {canManage && (
                            <>
                                <button 
                                    onClick={() => setEditingInnovation(inv)}
                                    title={t('editInnovation')}
                                    className="p-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-black rounded transition"
                                >
                                    <Edit className="w-4 h-4" />
                                </button>

                                {inv.status === 'PENDING' && (
                                    <>
                                        <button 
                                            onClick={() => onStatusChange(inv.id, 'APPROVED')}
                                            title={t('approve')}
                                            className="p-1.5 bg-green-50 dark:bg-black text-green-600 dark:text-green-400 rounded-md border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-black hover:border-green-300 dark:hover:border-green-700 transition shadow-sm"
                                        >
                                            <Check className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => onStatusChange(inv.id, 'REJECTED')}
                                            title={t('reject')}
                                            className="p-1.5 bg-red-50 dark:bg-black text-red-600 dark:text-red-400 rounded-md border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-black hover:border-red-300 dark:hover:border-red-700 transition shadow-sm"
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
                                        {t('implement')}
                                    </button>
                                )}
                                {canDelete && (
                                    <button 
                                        onClick={() => setDeleteConfirmationId(inv.id)}
                                        title={t('delete')}
                                        className="p-1.5 text-gray-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-black rounded transition ml-2"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </td>
              </tr>
            ))}
            {sortedInnovations.length === 0 && (
              <tr>
                <td colSpan={5} className="p-12 text-center text-gray-400 dark:text-slate-500 border border-dashed border-gray-200 dark:border-slate-700 rounded-lg m-4">
                  <div className="flex flex-col items-center justify-center">
                    <Lightbulb className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-slate-600" />
                    <span>{t('noInnovations')}</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* View Details Modal */}
      {viewingInnovation && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white dark:bg-black rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border dark:border-slate-700">
                  <div className="p-6 border-b dark:border-slate-700 flex justify-between items-center bg-gray-50 dark:bg-black">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100 flex items-center">
                          <Info className="w-6 h-6 mr-2 text-blue-600" />
                          {t('innovationDetails')}
                      </h3>
                      <button onClick={() => setViewingInnovation(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300">
                          <X className="w-6 h-6" />
                      </button>
                  </div>
                  <div className="p-6 space-y-6">
                      <div>
                          <h4 className="text-sm font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1">{t('improvementTitle')}</h4>
                          <p className="text-lg font-bold text-gray-800 dark:text-slate-200">{viewingInnovation.title}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <h4 className="text-sm font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1">{t('innovationType')}</h4>
                              <span className="px-2 py-1 bg-blue-50 text-blue-700 dark:bg-black dark:text-blue-400 rounded text-xs font-bold border border-blue-100 dark:border-blue-800">
                                  {getInnovationTypeLabel(viewingInnovation.type)}
                              </span>
                          </div>
                          <div>
                              <h4 className="text-sm font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1">{t('annualImpactCol')}</h4>
                              <p className="text-lg font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(viewingInnovation.totalAnnualSavings)}</p>
                          </div>
                      </div>
                      <div>
                          <h4 className="text-sm font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">{t('descriptionTechnical')}</h4>
                          <div className="bg-gray-50 dark:bg-black p-4 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                              {viewingInnovation.description}
                          </div>
                      </div>

                      {/* Materials & Machine Details */}
                      {(viewingInnovation.materials?.length || viewingInnovation.machine) && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t dark:border-slate-700">
                              {viewingInnovation.materials && viewingInnovation.materials.length > 0 && (
                                  <div>
                                      <h4 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase mb-2">{t('impactedMaterials')}</h4>
                                      <div className="space-y-1">
                                          {viewingInnovation.materials.map(m => (
                                              <div key={m.id} className="flex justify-between items-center text-xs p-1.5 bg-gray-50 dark:bg-black rounded border border-gray-100 dark:border-slate-700">
                                                  <div className="flex flex-col">
                                                      <span className="flex items-center font-medium dark:text-slate-300">
                                                          {m.type === 'REMOVE' ? <TrendingUp className="w-3 h-3 mr-1 text-emerald-500" /> : <TrendingDown className="w-3 h-3 mr-1 text-red-500" />}
                                                          {m.name}
                                                      </span>
                                                      {viewingInnovation.calculationType !== CalculationType.ONE_TIME && viewingInnovation.calculationType !== CalculationType.ADD_EXPENSE && (
                                                          <span className="text-[10px] text-gray-400 dark:text-slate-500 ml-4">
                                                              {formatCurrency(m.cost)} x {viewingInnovation.quantity} {t('unitsAbbr')}
                                                          </span>
                                                      )}
                                                  </div>
                                                  <span className={`font-bold ${m.type === 'REMOVE' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                                      {m.type === 'REMOVE' ? '+' : '-'}{formatCurrency(m.cost * (viewingInnovation.calculationType === CalculationType.ONE_TIME || viewingInnovation.calculationType === CalculationType.ADD_EXPENSE ? 1 : viewingInnovation.quantity))}
                                                  </span>
                                              </div>
                                          ))}
                                      </div>
                                  </div>
                              )}
                              {viewingInnovation.machine && (
                                  <div>
                                      <h4 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase mb-2">{t('machineEquipment')}</h4>
                                      <div className="p-2 bg-blue-50 dark:bg-black rounded border border-blue-100 dark:border-blue-800 text-xs">
                                          <div className="font-bold text-blue-800 dark:text-blue-300">{viewingInnovation.machine.name}</div>
                                          <div className="flex justify-between mt-1 text-blue-600 dark:text-blue-400">
                                              <span>{t('machineCost')}: {formatCurrency(viewingInnovation.machine.cost)}</span>
                                              <span>{viewingInnovation.machine.depreciationYears} {t('years')}</span>
                                          </div>
                                          <div className="mt-1 font-bold text-blue-700 dark:text-blue-200 border-t border-blue-200 dark:border-blue-800 pt-1">
                                              {t('depreciationPerYear', { value: formatCurrency(viewingInnovation.machine.annualDepreciation) })}
                                          </div>
                                      </div>
                                  </div>
                              )}
                          </div>
                      )}

                      {/* Productivity Yield Details */}
                      {(viewingInnovation.productivityBefore || viewingInnovation.productivityAfter) && (
                          <div className="pt-4 border-t dark:border-slate-700">
                              <h4 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase mb-3 flex items-center">
                                  <TrendingUp className="w-3 h-3 mr-1 text-blue-500" />
                                  {t('productivityYield')}
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  <div className="bg-gray-50 dark:bg-black p-3 rounded-lg border border-gray-100 dark:border-slate-800">
                                      <div className="text-[10px] text-gray-400 dark:text-slate-500 uppercase font-bold">{t('productivityBefore')}</div>
                                      <div className="text-lg font-bold dark:text-slate-200">{viewingInnovation.productivityBefore || 0} {t('unitsAbbr')}</div>
                                  </div>
                                  <div className="bg-gray-50 dark:bg-black p-3 rounded-lg border border-gray-100 dark:border-slate-800">
                                      <div className="text-[10px] text-gray-400 dark:text-slate-500 uppercase font-bold">{t('productivityAfter')}</div>
                                      <div className="text-lg font-bold dark:text-slate-200">{viewingInnovation.productivityAfter || 0} {t('unitsAbbr')}</div>
                                  </div>
                                  <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
                                      <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase">{t('productivityGain')}</div>
                                      <div className="text-lg font-bold text-blue-700 dark:text-blue-300">
                                          {viewingInnovation.productivityBefore && viewingInnovation.productivityAfter ? 
                                            `+${((viewingInnovation.productivityAfter - viewingInnovation.productivityBefore) / viewingInnovation.productivityBefore * 100).toFixed(1)}%` : 
                                            '0%'}
                                      </div>
                                  </div>
                              </div>

                              {viewingInnovation.unitProductValue && viewingInnovation.unitProductValue > 0 && viewingInnovation.unitProductCost && viewingInnovation.unitProductCost > 0 && (
                                  <div className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 rounded-lg">
                                      <div className="flex justify-between items-center">
                                          <div>
                                              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase">{t('profitFromCapacity')}</div>
                                              <div className="text-xs text-gray-500 dark:text-slate-400">
                                                  {t('unitProductValue')}: {formatCurrency(viewingInnovation.unitProductValue)}
                                              </div>
                                          </div>
                                          <div className="text-right">
                                              <div className="text-2xl font-black text-emerald-600">
                                                  {formatCurrency(viewingInnovation.quantity * ((viewingInnovation.productivityAfter || 1) / (viewingInnovation.productivityBefore || 1) - 1) * (viewingInnovation.unitProductValue - viewingInnovation.unitProductCost))}
                                              </div>
                                              <div className="text-[10px] text-gray-400">
                                                  {(viewingInnovation.quantity * ((viewingInnovation.productivityAfter || 1) / (viewingInnovation.productivityBefore || 1) - 1)).toFixed(0)} {t('extraUnits')} / {t('year')}
                                              </div>
                                          </div>
                                      </div>
                                  </div>
                              )}

                              {viewingInnovation.unitProductCost && viewingInnovation.unitProductCost > 0 && (
                                  <div className="mt-4 p-4 bg-gray-50 dark:bg-black border border-gray-100 dark:border-slate-800 rounded-lg">
                                      <div className="grid grid-cols-2 gap-4">
                                          <div>
                                              <div className="text-[10px] text-gray-400 uppercase font-bold">{t('costPerUnit')} ({t('current')})</div>
                                              <div className="text-lg font-bold text-gray-600 dark:text-slate-400">
                                                  {formatCurrency(((settings?.hourlyCost || 0) / (viewingInnovation.productivityBefore || 1)) + viewingInnovation.unitProductCost)}
                                              </div>
                                          </div>
                                          <div>
                                              <div className="text-[10px] text-blue-600 dark:text-blue-400 uppercase font-bold">{t('costPerUnit')} ({t('improved')})</div>
                                              <div className="text-lg font-bold text-blue-700 dark:text-blue-300">
                                                  {formatCurrency(((settings?.hourlyCost || 0) / (viewingInnovation.productivityAfter || 1)) + viewingInnovation.unitProductCost)}
                                              </div>
                                          </div>
                                          <div className="col-span-2 pt-2 border-t border-gray-200 dark:border-slate-800 flex justify-between items-center">
                                              <span className="text-xs font-bold text-emerald-600 uppercase">{t('savingPerUnit')}</span>
                                              <span className="text-xl font-black text-emerald-600">
                                                  {formatCurrency(((settings?.hourlyCost || 0) / (viewingInnovation.productivityBefore || 1)) - ((settings?.hourlyCost || 0) / (viewingInnovation.productivityAfter || 1)))}
                                              </span>
                                          </div>
                                      </div>
                                  </div>
                              )}
                          </div>
                      )}

                      <div className="flex items-center justify-between text-xs text-gray-400 dark:text-slate-500 pt-4 border-t dark:border-slate-700">
                          <span>{t('registeredAt', { date: new Date(viewingInnovation.createdAt).toLocaleString() })}</span>
                          <span>{t('author', { name: usersMap[viewingInnovation.authorId || ''] || '...' })}</span>
                      </div>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-black border-t dark:border-slate-700 flex justify-end">
                      <button 
                        onClick={() => setViewingInnovation(null)}
                        className="px-6 py-2 bg-gray-800 dark:bg-black text-white rounded-lg font-bold hover:bg-gray-900 dark:hover:bg-slate-600 transition-colors"
                      >
                          {t('close')}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmationId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-black rounded-xl shadow-2xl w-full max-w-md p-6 border dark:border-slate-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-2">{t('confirmDeletion')}</h3>
                <p className="text-gray-600 dark:text-slate-400 mb-6">
                    {t('confirmDeleteInnovation')}
                </p>
                <div className="flex justify-end gap-3">
                    <button 
                        onClick={() => setDeleteConfirmationId(null)}
                        className="px-4 py-2 text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-black hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg font-medium transition-colors border dark:border-slate-700"
                    >
                        {t('cancel')}
                    </button>
                    <button 
                        onClick={() => {
                            onDelete(deleteConfirmationId);
                            setDeleteConfirmationId(null);
                        }}
                        className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors shadow-sm"
                    >
                        {t('yesDelete')}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
