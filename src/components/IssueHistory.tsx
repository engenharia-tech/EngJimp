import React, { useState, useMemo, useEffect } from 'react';
import { Search, AlertTriangle, Calendar, User as UserIcon, Trash2 } from 'lucide-react';
import { AppState, IssueType, User } from '../types';
import { ISSUE_TYPES } from '../constants';
import { fetchUsers } from '../services/storageService';

interface IssueHistoryProps {
  data: AppState;
  currentUser: User;
  onDelete?: (id: string) => void;
}

export const IssueHistory: React.FC<IssueHistoryProps> = ({ data, currentUser, onDelete }) => {
  const [filterNs, setFilterNs] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const load = async () => {
      const users = await fetchUsers();
      const map = users.reduce((acc, u) => ({ ...acc, [u.id]: u.name }), {} as Record<string, string>);
      setUsersMap(map);
    };
    load();
  }, []);

  const filteredIssues = useMemo(() => {
    return data.issues.filter(issue => {
      const matchNs = issue.projectNs.toLowerCase().includes(filterNs.toLowerCase());
      const matchType = filterType ? issue.type === filterType : true;
      return matchNs && matchType;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [data.issues, filterNs, filterType]);

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isGestor = currentUser.role === 'GESTOR';

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar erro por NS..."
            value={filterNs}
            onChange={(e) => setFilterNs(e.target.value)}
            className="w-full pl-10 p-2 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="flex-1 p-2 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
        >
          <option value="">Todos os Tipos de Erro</option>
          {ISSUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* List */}
      <div className="space-y-4">
        {filteredIssues.length > 0 ? (
          filteredIssues.map((issue) => (
            <div key={issue.id} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow relative group">
              {isGestor && onDelete && (
                <button 
                  onClick={() => onDelete(issue.id)}
                  className="absolute top-4 right-4 text-gray-300 hover:text-red-500 hover:bg-red-50 p-2 rounded transition"
                  title="Excluir"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <div className="flex justify-between items-start mb-2 pr-10">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 rounded text-xs font-bold bg-red-50 text-red-700 border border-red-100`}>
                    {issue.type}
                  </span>
                  <span className="font-mono font-bold text-gray-800">NS: {issue.projectNs}</span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center text-xs text-gray-400">
                    <Calendar className="w-3 h-3 mr-1" />
                    {formatDate(issue.date)}
                  </div>
                  {isGestor && issue.reportedBy && (
                    <div className="flex items-center text-xs text-gray-500 font-medium">
                      <UserIcon className="w-3 h-3 mr-1" />
                      Reportado por: {usersMap[issue.reportedBy] || 'Desconhecido'}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">O que aconteceu:</h4>
                <p className="text-gray-700 text-sm leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100">
                  {issue.description}
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-200">
            <AlertTriangle className="w-8 h-8 mx-auto text-gray-300 mb-2" />
            <p className="text-gray-500">Nenhum problema encontrado com os filtros atuais.</p>
          </div>
        )}
      </div>
    </div>
  );
};
