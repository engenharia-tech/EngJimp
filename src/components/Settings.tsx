import React, { useState, useEffect, useMemo } from 'react';
import { Settings as SettingsIcon, Save, Mail, Server, Shield, User as UserIcon, DollarSign, Globe, Send, CheckCircle2, AlertCircle, Eye, EyeOff, Clock, Database, Activity, HardDrive } from 'lucide-react';
import { AppSettings, User } from '../types';
import { useToast } from './Toast';
import { useLanguage } from '../i18n/LanguageContext';
import { recalculateAllInterruptionTimes, recalculateAllProjectTimes, getDatabaseStats, addAuditLog } from '../services/storageService';

interface SettingsProps {
  settings: AppSettings;
  users: User[];
  onUpdate: (settings: AppSettings) => void;
  currentUser: User;
}

export const Settings: React.FC<SettingsProps> = ({ settings, users, onUpdate, currentUser }) => {
  const [formData, setFormData] = useState<AppSettings>({ ...settings });
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [dbStats, setDbStats] = useState<{
    totalRecords: number;
    limit: number;
    usage: number;
    isHealthy: boolean;
    counts: any;
  } | null>(null);
  const { addToast } = useToast();
  const { t } = useLanguage();

  useEffect(() => {
    const fetchDbStats = async () => {
      const stats = await getDatabaseStats();
      if (stats) setDbStats(stats);
    };
    fetchDbStats();
  }, []);

  const calculatedRate = useMemo(() => {
    const relevantUsers = users.filter(u => u.role !== 'CEO' && u.role !== 'PROCESSOS' && (u.salary || 0) > 0);
    const totalSalary = relevantUsers.reduce((acc, u) => acc + (u.salary || 0), 0);
    const numUsers = relevantUsers.length || 1;
    return (totalSalary / numUsers) / 220;
  }, [users]);

  // Sync formData when settings prop changes (e.g. after initial load or save)
  useEffect(() => {
    setFormData({ ...settings });
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onUpdate(formData);
      setIsEditing(false);
      addToast(t('settingsSavedSuccess'), 'success');
    } catch (error) {
      addToast(t('errorUpdatingSettings'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!formData.emailTo) {
      addToast(t('errorFillingRequired'), 'error');
      return;
    }

    setIsTesting(true);
    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: t('testEmailSubject'),
          body: t('testEmailBody'),
          to: formData.emailTo
        })
      });

      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (e) {
        console.error("Server response was not JSON:", responseText);
        addToast(`Erro crítico do servidor (não JSON): ${responseText.substring(0, 50)}...`, 'error');
        return;
      }

      if (result.success) {
        addToast(t('testEmailSent'), 'success');
      } else {
        addToast(t('emailError') + `: ${result.error || t('checkSettings')}`, 'error');
        if (result.details) console.error("Detalhes do erro:", result.details);
      }
    } catch (error: any) {
      addToast(t('connectionError', { message: error.message || t('errorGeneric') }), 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleRecalculateTimes = async () => {
    if (!window.confirm(t('confirmRecalculateDesc'))) return;
    
    setIsRecalculating(true);
    try {
      const resInt = await recalculateAllInterruptionTimes();
      const resProj = await recalculateAllProjectTimes();
      
      if (resInt.success && resProj.success) {
        addToast(t('recalculationSuccess'), 'success');
        
        // Audit Log
        addAuditLog({
            userId: currentUser.id,
            userName: currentUser.name,
            action: 'ADMIN_RECALCULATE',
            entityType: 'SETTINGS',
            entityId: 'SYSTEM',
            entityName: 'Recálculo Geral',
            details: `Recálculo geral de tempos de projetos e interrupções executado por ${currentUser.name}`
        });
      } else {
        addToast(t('recalculationPartialSuccess'), 'warning');
      }
    } catch (error) {
      addToast(t('recalculationError'), 'error');
    } finally {
      setIsRecalculating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-2xl font-bold text-black dark:text-white flex items-center">
            <SettingsIcon className="w-6 h-6 mr-2 text-blue-600 dark:text-blue-400" />
            {t('systemSettings')}
          </h2>
          <p className="text-gray-600 dark:text-slate-400 mt-1">{t('adjustGlobalPreferences')}</p>
        </div>
        {!isEditing && (
          <button
            onClick={() => {
              setIsEditing(true);
              setShowPassword(true);
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg flex items-center transition-all shadow-md"
          >
            {t('editSettings')}
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* General Settings */}
        <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
          <h3 className="text-lg font-bold text-black dark:text-white mb-4 flex items-center">
            <Globe className="w-5 h-5 mr-2 text-blue-500" />
            {t('general')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">{t('systemLanguage')}</label>
              <select
                disabled={!isEditing}
                value={formData.language || 'pt-BR'}
                onChange={e => setFormData({ ...formData, language: e.target.value as any })}
                className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white disabled:opacity-60 disabled:bg-gray-50 dark:disabled:bg-slate-900"
              >
                <option value="pt-BR">{t('portuguese')}</option>
                <option value="en-US">{t('english')}</option>
                <option value="es-ES">{t('spanish')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Custo Hora (R$)</label>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-4">
                  <label className="flex items-center cursor-pointer">
                    <div className="relative">
                      <input
                        type="checkbox"
                        disabled={!isEditing}
                        className="sr-only"
                        checked={formData.useAutomaticCost || false}
                        onChange={() => {
                          const newValue = !formData.useAutomaticCost;
                          setFormData({ ...formData, useAutomaticCost: newValue });
                        }}
                      />
                      <div className={`block w-10 h-6 rounded-full transition-colors ${formData.useAutomaticCost ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-700'}`}></div>
                      <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${formData.useAutomaticCost ? 'transform translate-x-4' : ''}`}></div>
                    </div>
                    <span className="ml-3 text-sm font-medium text-gray-700 dark:text-slate-300">{t('automaticCostCalculation')}</span>
                  </label>
                </div>

                {!formData.useAutomaticCost ? (
                  <div className="relative">
                    <DollarSign className="absolute left-2 top-2.5 w-4 h-4 text-gray-400 dark:text-slate-500" />
                    <input
                      type="number"
                      disabled={!isEditing}
                      value={formData.hourlyCost}
                      onChange={e => setFormData({ ...formData, hourlyCost: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-8 p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white disabled:opacity-60 disabled:bg-gray-50 dark:disabled:bg-slate-900"
                      placeholder="150.00"
                    />
                  </div>
                ) : (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                    <p className="text-xs text-blue-700 dark:text-blue-300 font-bold mb-1">
                      {t('hourlyCostCalculated')} {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculatedRate)}
                    </p>
                    <p className="text-[10px] text-blue-600 dark:text-blue-400">
                      {t('automaticCostCalculationDesc')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Workday Settings */}
        <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
          <h3 className="text-lg font-bold text-black dark:text-white mb-4 flex items-center">
            <Clock className="w-5 h-5 mr-2 text-amber-500" />
            {t('workdayConfig')}
          </h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
            {t('workdayConfigDesc')}
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">{t('workdayStart')}</label>
              <input
                type="time"
                disabled={!isEditing}
                value={formData.workdayStart || '07:30'}
                onChange={e => setFormData({ ...formData, workdayStart: e.target.value })}
                className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white disabled:opacity-80 disabled:bg-gray-50 dark:disabled:bg-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">{t('workdayEnd')}</label>
              <input
                type="time"
                disabled={!isEditing}
                value={formData.workdayEnd || '17:30'}
                onChange={e => setFormData({ ...formData, workdayEnd: e.target.value })}
                className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white disabled:opacity-80 disabled:bg-gray-50 dark:disabled:bg-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">{t('lunchStart')}</label>
              <input
                type="time"
                disabled={!isEditing}
                value={formData.lunchStart || '12:00'}
                onChange={e => setFormData({ ...formData, lunchStart: e.target.value })}
                className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white disabled:opacity-80 disabled:bg-gray-50 dark:disabled:bg-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">{t('lunchEnd')}</label>
              <input
                type="time"
                disabled={!isEditing}
                value={formData.lunchEnd || '13:00'}
                onChange={e => setFormData({ ...formData, lunchEnd: e.target.value })}
                className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white disabled:opacity-80 disabled:bg-gray-50 dark:disabled:bg-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">{t('workDays')}</label>
            <div className="flex flex-wrap gap-2">
              {(t('daysShort') || 'Dom,Seg,Ter,Qua,Qui,Sex,Sáb').split(',').map((day: string, index: number) => {
                const isSelected = (formData.workdays || [1, 2, 3, 4, 5]).includes(index);
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={!isEditing}
                    onClick={() => {
                      const current = formData.workdays || [1, 2, 3, 4, 5];
                      const next = isSelected 
                        ? current.filter(d => d !== index)
                        : [...current, index].sort();
                      setFormData({ ...formData, workdays: next });
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      isSelected 
                        ? 'bg-amber-100 border-amber-300 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-400' 
                        : 'bg-gray-50 border-gray-200 text-gray-400 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-500'
                    } ${!isEditing ? 'opacity-60 cursor-not-allowed' : 'hover:border-amber-400'}`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Email Settings */}
        <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
          <h3 className="text-lg font-bold text-black dark:text-white mb-4 flex items-center">
            <Mail className="w-5 h-5 mr-2 text-emerald-500" />
            {t('emailConfig')}
          </h3>
          
          <div className="grid grid-cols-1 gap-6">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">{t('defaultRecipients')}</label>
                {isEditing && (
                  <button 
                    type="button"
                    onClick={() => {
                      const email = window.prompt(t('enterEmailToAdd' as any) || 'Digite o e-mail:');
                      if (email && email.includes('@')) {
                        const current = formData.emailTo ? formData.emailTo.split(',').map(e => e.trim()) : [];
                        if (!current.includes(email)) {
                          setFormData({ ...formData, emailTo: [...current, email].join(', ') });
                        }
                      }
                    }}
                    className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center"
                  >
                    <Mail className="w-3 h-3 mr-1" />
                    {t('addEmail')}
                  </button>
                )}
              </div>
              <input
                type="text"
                disabled={!isEditing}
                value={formData.emailTo || ''}
                onChange={e => setFormData({ ...formData, emailTo: e.target.value })}
                className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white disabled:opacity-80 disabled:bg-gray-50 dark:disabled:bg-slate-900"
                placeholder="email1@exemplo.com, email2@exemplo.com"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(formData.emailTo || '').split(',').filter(e => e.trim()).map((email, i) => (
                  <span key={i} className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[10px] font-medium rounded-full border border-blue-100 dark:border-blue-800 flex items-center">
                    <Mail className="w-2.5 h-2.5 mr-1" />
                    {email.trim()}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 mt-1">{t('emailNotificationDesc')}</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">{t('recipientsForInterruptions')}</label>
                {isEditing && (
                  <button 
                    type="button"
                    onClick={() => {
                      const email = window.prompt(t('enterEmailToAdd' as any) || 'Digite o e-mail:');
                      if (email && email.includes('@')) {
                        const current = formData.interruptionEmailTo ? formData.interruptionEmailTo.split(',').map(e => e.trim()) : [];
                        if (!current.includes(email)) {
                          setFormData({ ...formData, interruptionEmailTo: [...current, email].join(', ') });
                        }
                      }
                    }}
                    className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center"
                  >
                    <Mail className="w-3 h-3 mr-1" />
                    {t('addEmail')}
                  </button>
                )}
              </div>
              <input
                type="text"
                disabled={!isEditing}
                value={formData.interruptionEmailTo || ''}
                onChange={e => setFormData({ ...formData, interruptionEmailTo: e.target.value })}
                className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white disabled:opacity-80 disabled:bg-gray-50 dark:disabled:bg-slate-900"
                placeholder="email-interrupcao@exemplo.com"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(formData.interruptionEmailTo || '').split(',').filter(e => e.trim()).map((email, i) => (
                  <span key={i} className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-medium rounded-full border border-emerald-100 dark:border-emerald-800 flex items-center">
                    <Mail className="w-2.5 h-2.5 mr-1" />
                    {email.trim()}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 mt-1">{t('emailInterruptionDesc')}</p>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-slate-800">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">{t('interruptionEmailTemplateLabel')}</label>
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800 mb-3">
              <p className="text-[10px] text-blue-700 dark:text-blue-300 font-bold uppercase mb-1">{t('availableTags')}:</p>
              <div className="flex flex-wrap gap-2">
                <span className="text-[10px] font-mono bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400">[NS_PARADA]</span>
                <span className="text-[10px] font-mono bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400">[CLIENTE]</span>
                <span className="text-[10px] font-mono bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400">[TIPO_PROBLEMA]</span>
                <span className="text-[10px] font-mono bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400">[AREA_RESPONSAVEL]</span>
                <span className="text-[10px] font-mono bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400">[RESPONSAVEL_RESPOSTA]</span>
                <span className="text-[10px] font-mono bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400">[DATA_HORA]</span>
                <span className="text-[10px] font-mono bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400">[MOTIVO]</span>
                <span className="text-[10px] font-mono bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400">[OUTRAS_PERDAS]</span>
              </div>
            </div>
            <textarea
              disabled={!isEditing}
              value={formData.interruptionEmailTemplate || ''}
              onChange={e => setFormData({ ...formData, interruptionEmailTemplate: e.target.value })}
              className="w-full p-3 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white disabled:opacity-80 h-48 font-mono text-sm resize-none"
              placeholder={`“E-mail automático, não responda este e-mail”\n\nOlá,\n\n Informamos que a [NS_PARADA] está interrompida no departamento de engenharia, \nTipo de Problema: [TIPO_PROBLEMA]\nArea Responsável: [AREA_RESPONSAVEL]\nResponsável da resposta: [RESPONSAVEL_RESPOSTA]\nData e hora da parada: [DATA_HORA]\nMotivo: [MOTIVO]\n\nOutras perdas: [OUTRAS_PERDAS]\n\naguardamos as informações para retornarmos o projeto, enquanto isso estará com um put andou o tempo de projeto parado`}
            />
            <div className="mt-3 p-3 bg-gray-50 dark:bg-slate-900 rounded-lg border border-gray-100 dark:border-slate-800">
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">{t('standardFooter')}:</p>
              <p className="text-xs text-gray-500 dark:text-slate-400 italic">
                {t('footerContactInfo')}
              </p>
            </div>
          </div>
        </div>

        {/* Database Health Section */}
        <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
          <h3 className="text-lg font-bold text-black dark:text-white mb-4 flex items-center">
            <Database className="w-5 h-5 mr-2 text-indigo-500" />
            {t('databaseLimit')}
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-slate-400">{t('databaseUsage')}</p>
                  <p className="text-2xl font-black text-black dark:text-white">
                    {dbStats?.usage.toFixed(2) || '0.00'}%
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-500 dark:text-slate-400">{t('totalRecords')}</p>
                  <p className="text-xl font-bold text-black dark:text-white">
                    {dbStats?.totalRecords.toLocaleString() || '0'} / {dbStats?.limit.toLocaleString() || '100.000'}
                  </p>
                </div>
              </div>
              
              <div className="h-4 w-full bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden border border-gray-200 dark:border-slate-700">
                <div 
                  className={`h-full transition-all duration-1000 ${
                    (dbStats?.usage || 0) > 90 ? 'bg-red-500' : (dbStats?.usage || 0) > 70 ? 'bg-amber-500' : 'bg-indigo-500'
                  }`}
                  style={{ width: `${Math.min(100, dbStats?.usage || 0)}%` }}
                />
              </div>

              <div className="flex items-center gap-2 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800">
                {dbStats?.isHealthy ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <p className="text-xs text-indigo-700 dark:text-indigo-300 font-bold uppercase tracking-wide">
                      {t('databaseHealthy')}
                    </p>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    <p className="text-xs text-amber-700 dark:text-amber-300 font-bold uppercase tracking-wide">
                      {t('databaseWarning')}
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-slate-900/50 p-4 rounded-xl border border-gray-100 dark:border-slate-800 space-y-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t('details')}</p>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 dark:text-slate-400 flex items-center">
                    <HardDrive className="w-3 h-3 mr-1.5" />
                    {t('projects')}
                  </span>
                  <span className="font-bold text-black dark:text-white">{dbStats?.counts.projects || 0}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 dark:text-slate-400 flex items-center">
                    <Activity className="w-3 h-3 mr-1.5" />
                    {t('interruptions')}
                  </span>
                  <span className="font-bold text-black dark:text-white">{dbStats?.counts.interruptions || 0}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 dark:text-slate-400 flex items-center">
                    <Server className="w-3 h-3 mr-1.5" />
                    {t('auditLog')}
                  </span>
                  <span className="font-bold text-black dark:text-white">{dbStats?.counts.audit_logs || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {isEditing && (
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setFormData({ ...settings });
              }}
              className="px-6 py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 font-bold rounded-lg transition-all"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={isSaving || isTesting}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg flex items-center transition-all shadow-md disabled:opacity-50"
            >
              {isSaving ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
              ) : (
                <Save className="w-5 h-5 mr-2" />
              )}
              {t('saveConfigurations')}
            </button>
          </div>
        )}
        
        {!isEditing && (
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={handleRecalculateTimes}
              disabled={isRecalculating}
              className="px-6 py-3 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-400 font-bold rounded-lg flex items-center transition-all disabled:opacity-50"
            >
              {isRecalculating ? (
                <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mr-2"></div>
              ) : (
                <Clock className="w-5 h-5 mr-2" />
              )}
              {t('recalculateHistoricTimes')}
            </button>
            <button
              type="button"
              onClick={handleTestEmail}
              disabled={isTesting}
              className="px-6 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-lg flex items-center transition-all disabled:opacity-50"
            >
              {isTesting ? (
                <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin mr-2"></div>
              ) : (
                <Send className="w-5 h-5 mr-2" />
              )}
              {t('testConnection')}
            </button>
          </div>
        )}
      </form>
    </div>
  );
};
