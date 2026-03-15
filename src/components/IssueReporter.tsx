import React, { useState } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import { IssueType, IssueRecord, User } from '../types';
import { ISSUE_TYPES } from '../constants';

interface IssueReporterProps {
  onReport: (issue: IssueRecord) => void;
  currentUser: User;
}

export const IssueReporter: React.FC<IssueReporterProps> = ({ onReport, currentUser }) => {
  const [ns, setNs] = useState('');
  // Set default to Engenharia or the first item in the list
  const [type, setType] = useState<IssueType>(IssueType.ENGENHARIA);
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ns.trim() || !description.trim()) return;

    const newIssue: IssueRecord = {
      id: crypto.randomUUID(),
      projectNs: ns,
      type,
      description,
      date: new Date().toISOString()
    };

    onReport(newIssue);
    setNs('');
    setDescription('');
  };

  if (currentUser.role !== 'GESTOR') {
    return (
      <div className="bg-white dark:bg-black p-6 rounded-xl shadow-md border border-gray-100 dark:border-slate-700 text-center">
         <AlertTriangle className="w-8 h-8 mx-auto text-gray-300 dark:text-slate-600 mb-2" />
         <h3 className="text-lg font-bold text-black dark:text-white mb-2">Acesso Restrito</h3>
         <p className="text-black dark:text-white">Apenas Gestores podem reportar novos problemas.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-black p-6 rounded-xl shadow-md border border-gray-100 dark:border-slate-700">
      <h2 className="text-xl font-bold mb-4 flex items-center text-red-600 dark:text-red-400">
        <AlertTriangle className="w-6 h-6 mr-2" />
        Reportar Problema
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-black dark:text-white mb-1">NS do Produto Afetado</label>
          <input 
            type="text" 
            value={ns}
            onChange={e => setNs(e.target.value)}
            className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 outline-none dark:bg-black dark:text-white"
            placeholder="Ex: 123456"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-black dark:text-white mb-1">Setor / Origem da Falha</label>
          <select 
            value={type}
            onChange={e => setType(e.target.value as IssueType)}
            className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 outline-none bg-white dark:bg-black dark:text-white"
          >
            {ISSUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-black dark:text-white mb-1">Descrição Detalhada</label>
          <textarea 
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 outline-none dark:bg-black dark:text-white"
            placeholder="Descreva o que aconteceu..."
            required
          />
        </div>

        <button 
          type="submit"
          className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg flex items-center justify-center transition-colors shadow-md"
        >
          <Plus className="w-5 h-5 mr-2" />
          Registrar Problema
        </button>
      </form>
    </div>
  );
};
