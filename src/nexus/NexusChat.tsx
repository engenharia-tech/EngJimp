import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Send, Cpu, User as UserIcon, Loader2, Trash2, Maximize2, Minimize2, 
  Database, ShieldCheck, BarChart3, TrendingUp, PieChart as PieIcon, Activity,
  Plus, Search, Edit3, Check, ClipboardCopy, FileDown, Menu, PanelLeftClose, PanelLeft, X,
  MessageSquare
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area 
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { processNexusQuery } from './nexusEngine';
import { AppState, User } from '../types';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { useToast } from '../components/Toast';

interface ChatThread {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  chartData?: any;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const ChartRenderer: React.FC<{ data: any, theme: 'light' | 'dark' }> = ({ data, theme }) => {
  if (!data || !data.type || !data.series) return null;

  const textColor = theme === 'dark' ? '#94a3b8' : '#64748b';
  const gridColor = theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

  const renderChart = () => {
    switch (data.type.toLowerCase()) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.series}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="name" fontSize={10} tick={{ fill: textColor }} axisLine={false} tickLine={false} />
              <YAxis fontSize={10} tick={{ fill: textColor }} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: theme === 'dark' ? '#0f172a' : '#fff', 
                  border: `1px solid ${theme === 'dark' ? '#1e293b' : '#e2e8f0'}`, 
                  borderRadius: '12px',
                  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
                }}
                itemStyle={{ color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
              />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              {data.keys.map((key: string, index: number) => (
                <Bar key={key} dataKey={key} fill={COLORS[index % COLORS.length]} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data.series}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="name" fontSize={10} tick={{ fill: textColor }} axisLine={false} tickLine={false} />
              <YAxis fontSize={10} tick={{ fill: textColor }} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: theme === 'dark' ? '#0f172a' : '#fff', 
                  border: `1px solid ${theme === 'dark' ? '#1e293b' : '#e2e8f0'}`, 
                  borderRadius: '12px',
                  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
                }}
                itemStyle={{ color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
              />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              {data.keys.map((key: string, index: number) => (
                <Line key={key} type="monotone" dataKey={key} stroke={COLORS[index % COLORS.length]} strokeWidth={2} dot={{ r: 4 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={data.series}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {data.series.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: theme === 'dark' ? '#0f172a' : '#fff', 
                  border: `1px solid ${theme === 'dark' ? '#1e293b' : '#e2e8f0'}`, 
                  borderRadius: '12px',
                }}
                itemStyle={{ color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );
      case 'area':
        return (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={data.series}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="name" fontSize={10} tick={{ fill: textColor }} axisLine={false} tickLine={false} />
              <YAxis fontSize={10} tick={{ fill: textColor }} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: theme === 'dark' ? '#0f172a' : '#fff', 
                  border: `1px solid ${theme === 'dark' ? '#1e293b' : '#e2e8f0'}`, 
                  borderRadius: '12px',
                }}
                itemStyle={{ color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
              />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              {data.keys.map((key: string, index: number) => (
                <Area key={key} type="monotone" dataKey={key} fill={COLORS[index % COLORS.length]} stroke={COLORS[index % COLORS.length]} fillOpacity={0.3} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`mt-4 p-4 ${theme === 'dark' ? 'bg-slate-800/20 border-slate-800' : 'bg-gray-50 border-gray-100'} rounded-xl border`}>
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-blue-500" />
        <h4 className={`text-xs font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>{data.title || 'Análise Nexus'}</h4>
      </div>
      {renderChart()}
      {data.description && (
        <p className={`mt-3 text-[10px] ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'} italic`}>
          {data.description}
        </p>
      )}
    </div>
  );
};

interface NexusChatProps {
  appState: AppState;
  currentUser: User;
  theme: 'light' | 'dark';
}

export const NexusChat: React.FC<NexusChatProps> = ({ appState, currentUser, theme }) => {
  const { addToast } = useToast();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>('');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editTitleInput, setEditTitleInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Retrieve active thread
  const activeThread = useMemo(() => {
    return threads.find(t => t.id === activeThreadId) || null;
  }, [threads, activeThreadId]);

  // Derived messages for active thread
  const messages = useMemo(() => {
    return activeThread ? activeThread.messages : [];
  }, [activeThread]);

  // Handle localstorage saving
  const saveThreadsToLocalStorage = (newThreads: ChatThread[]) => {
    const localStorageKey = `jimp_nexus_chats_${currentUser.id}`;
    localStorage.setItem(localStorageKey, JSON.stringify(newThreads));
  };

  // Helper to construct starting state
  const createFirstThread = () => {
    const initialThread: ChatThread = {
      id: Math.random().toString(36).substring(2, 9),
      title: 'Análise Inicial ERP',
      messages: [{
        role: 'assistant',
        content: "Olá! Sou o Nexus IA, assistente interno do JimpNexus ERP. Agora também posso gerar gráficos de desempenho baseados nos seus dados. Como posso ajudar?",
        timestamp: new Date()
      }],
      createdAt: new Date()
    };
    setThreads([initialThread]);
    setActiveThreadId(initialThread.id);
    saveThreadsToLocalStorage([initialThread]);
  };

  // Initial Load from Storage
  useEffect(() => {
    const localStorageKey = `jimp_nexus_chats_${currentUser.id}`;
    const saved = localStorage.getItem(localStorageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const mapped = parsed.map((t: any) => ({
          ...t,
          createdAt: new Date(t.createdAt),
          messages: t.messages.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp)
          }))
        }));
        setThreads(mapped);
        if (mapped.length > 0) {
          setActiveThreadId(mapped[0].id);
        } else {
          createFirstThread();
        }
      } catch (e) {
        console.error("Failed to parse saved chats", e);
        createFirstThread();
      }
    } else {
      createFirstThread();
    }
  }, [currentUser.id]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Thread actions
  const createNewChat = () => {
    const newChat: ChatThread = {
      id: Math.random().toString(36).substring(2, 9),
      title: 'Nova Conversa',
      messages: [{
        role: 'assistant',
        content: `Olá, ${currentUser.name}! Sou o Nexus IA. Iniciamos uma nova análise de desempenho. Como posso ser útil nos seus diagnósticos de projetos e produtividade?`,
        timestamp: new Date()
      }],
      createdAt: new Date()
    };
    const updated = [newChat, ...threads];
    setThreads(updated);
    setActiveThreadId(newChat.id);
    saveThreadsToLocalStorage(updated);
    addToast("Nova conversa criada!", "success");
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = threads.filter(t => t.id !== id);
    setThreads(filtered);
    saveThreadsToLocalStorage(filtered);
    if (activeThreadId === id) {
      if (filtered.length > 0) {
        setActiveThreadId(filtered[0].id);
      } else {
        const initialThread: ChatThread = {
          id: Math.random().toString(36).substring(2, 9),
          title: 'Análise Inicial ERP',
          messages: [{
            role: 'assistant',
            content: "Olá! Sou o Nexus IA, assistente interno do JimpNexus ERP. Agora também posso gerar gráficos de desempenho baseados nos seus dados. Como posso ajudar?",
            timestamp: new Date()
          }],
          createdAt: new Date()
        };
        setThreads([initialThread]);
        setActiveThreadId(initialThread.id);
        saveThreadsToLocalStorage([initialThread]);
      }
    }
    addToast("Conversa removida", "warning");
  };

  const startEditing = (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingThreadId(id);
    setEditTitleInput(title);
  };

  const saveRename = (id: string) => {
    if (!editTitleInput.trim()) return;
    const updated = threads.map(t => {
      if (t.id === id) {
        return { ...t, title: editTitleInput.trim() };
      }
      return t;
    });
    setThreads(updated);
    saveThreadsToLocalStorage(updated);
    setEditingThreadId(null);
    addToast("Conversa renomeada com sucesso!", "success");
  };

  const handlePresetSend = async (queryText: string) => {
    if (isLoading) return;
    const userMessage: Message = {
      role: 'user',
      content: queryText,
      timestamp: new Date()
    };

    setIsLoading(true);

    let targetId = activeThreadId;
    let currentThreads = [...threads];
    let targetThread = currentThreads.find(t => t.id === targetId);

    if (!targetThread) {
      const freshThread: ChatThread = {
        id: Math.random().toString(36).substring(2, 9),
        title: queryText.substring(0, 30) + (queryText.length > 30 ? '...' : ''),
        messages: [userMessage],
        createdAt: new Date()
      };
      currentThreads.unshift(freshThread);
      setThreads(currentThreads);
      setActiveThreadId(freshThread.id);
      targetId = freshThread.id;
      targetThread = freshThread;
    } else {
      targetThread.messages = [...targetThread.messages, userMessage];
      if (targetThread.title === 'Análise Inicial ERP' && targetThread.messages.filter(m => m.role === 'user').length === 1) {
        targetThread.title = queryText.substring(0, 30) + (queryText.length > 30 ? '...' : '');
      }
      setThreads(currentThreads);
      saveThreadsToLocalStorage(currentThreads);
    }

    try {
      const response = await processNexusQuery(queryText, appState, currentUser);
      
      let cleanContent = response;
      let chartData = null;
      
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        try {
          chartData = JSON.parse(jsonMatch[1]);
          cleanContent = response.replace(jsonMatch[0], '').trim();
        } catch (e) {
          console.error("Failed to parse Nexus chart JSON", e);
        }
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: cleanContent,
        timestamp: new Date(),
        chartData
      };
      
      const updatedThreads = currentThreads.map(t => {
        if (t.id === targetId) {
          return {
            ...t,
            messages: [...t.messages, assistantMessage]
          };
        }
        return t;
      });

      setThreads(updatedThreads);
      saveThreadsToLocalStorage(updatedThreads);
    } catch (error: any) {
      console.error("Nexus IA Error:", error);
      const updatedThreads = currentThreads.map(t => {
        if (t.id === targetId) {
          return {
            ...t,
            messages: [...t.messages, {
              role: 'assistant',
              content: `⚠️ Falha crítica no núcleo Nexus. Reinicializando sistemas...`,
              timestamp: new Date()
            }]
          };
        }
        return t;
      });
      setThreads(updatedThreads);
      saveThreadsToLocalStorage(updatedThreads);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const currentTerm = input.trim();
    const userMessage: Message = {
      role: 'user',
      content: currentTerm,
      timestamp: new Date()
    };

    setInput('');
    setIsLoading(true);

    let targetId = activeThreadId;
    let currentThreads = [...threads];
    let targetThread = currentThreads.find(t => t.id === targetId);

    if (!targetThread) {
      const freshThread: ChatThread = {
        id: Math.random().toString(36).substring(2, 9),
        title: currentTerm.substring(0, 30) + (currentTerm.length > 30 ? '...' : ''),
        messages: [userMessage],
        createdAt: new Date()
      };
      currentThreads.unshift(freshThread);
      setThreads(currentThreads);
      setActiveThreadId(freshThread.id);
      targetId = freshThread.id;
      targetThread = freshThread;
    } else {
      targetThread.messages = [...targetThread.messages, userMessage];
      if (targetThread.title === 'Análise Inicial ERP' && targetThread.messages.filter(m => m.role === 'user').length === 1) {
        targetThread.title = currentTerm.substring(0, 30) + (currentTerm.length > 30 ? '...' : '');
      }
      setThreads(currentThreads);
      saveThreadsToLocalStorage(currentThreads);
    }

    try {
      const response = await processNexusQuery(currentTerm, appState, currentUser);
      
      let cleanContent = response;
      let chartData = null;
      
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        try {
          chartData = JSON.parse(jsonMatch[1]);
          cleanContent = response.replace(jsonMatch[0], '').trim();
        } catch (e) {
          console.error("Failed to parse Nexus chart JSON", e);
        }
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: cleanContent,
        timestamp: new Date(),
        chartData
      };
      
      const updatedThreads = currentThreads.map(t => {
        if (t.id === targetId) {
          return {
            ...t,
            messages: [...t.messages, assistantMessage]
          };
        }
        return t;
      });

      setThreads(updatedThreads);
      saveThreadsToLocalStorage(updatedThreads);
    } catch (error: any) {
      console.error("Nexus IA Error:", error);
      const updatedThreads = currentThreads.map(t => {
        if (t.id === targetId) {
          return {
            ...t,
            messages: [...t.messages, {
              role: 'assistant',
              content: `⚠️ Falha crítica no núcleo Nexus. Reinicializando sistemas...`,
              timestamp: new Date()
            }]
          };
        }
        return t;
      });
      setThreads(updatedThreads);
      saveThreadsToLocalStorage(updatedThreads);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    if (activeThreadId) {
      const updated = threads.map(t => {
        if (t.id === activeThreadId) {
          return {
            ...t,
            messages: [{
              role: 'assistant' as const,
              content: `Olá, ${currentUser.name}! Histórico limpo para esta conversa. O que deseja analisar agora?`,
              timestamp: new Date()
            }]
          };
        }
        return t;
      });
      setThreads(updated);
      saveThreadsToLocalStorage(updated);
      addToast("Histórico do chat limpo!", "info");
    }
  };

  // Export functions
  const copyToClipboardMd = () => {
    if (!activeThread) return;
    const mdContent = activeThread.messages.map(m => {
      const roleEmoji = m.role === 'user' ? '👤 Usuário' : '🤖 Nexus IA';
      const timestampStr = m.timestamp.toLocaleString('pt-BR');
      return `### ${roleEmoji} (${timestampStr})\n\n${m.content}\n\n---\n`;
    }).join('\n');
    
    navigator.clipboard.writeText(mdContent)
      .then(() => {
        addToast("Histórico copiado como Markdown!", "success");
      })
      .catch(err => {
        console.error("Erro ao copiar", err);
        addToast("Erro ao copiar para a área de transferência", "error");
      });
  };

  const exportChatAsTxt = () => {
    if (!activeThread) return;
    const titleLine = `=== RELATÓRIO DO NEXUS IA - JIMP_NEXUS ERP ===\nTítulo da Conversa: ${activeThread.title}\nExportado em: ${new Date().toLocaleString('pt-BR')}\n============================================\n\n`;
    
    const body = activeThread.messages.map((m) => {
      const roleLabel = m.role === 'user' ? 'USUÁRIO' : 'NEXUS IA';
      const time = m.timestamp.toLocaleString('pt-BR');
      return `[${time}] ${roleLabel}:\n------------------------------------\n${m.content}\n\n`;
    }).join('\n');

    const blob = new Blob([titleLine + body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Relatorio_NexusIA_${activeThread.title.replace(/\s+/g, '_').substring(0, 20)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    addToast("Exportação concluída! Verifique seus downloads.", "success");
  };

  // Search filtered threads list
  const filteredThreads = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return threads;
    return threads.filter(t => t.title.toLowerCase().includes(query));
  }, [threads, searchQuery]);

  return (
    <div className={`flex h-full ${theme === 'dark' ? 'bg-black border-slate-800 text-slate-100' : 'bg-white border-gray-200 text-slate-800'} border rounded-xl shadow-lg overflow-hidden transition-all duration-300 ${isExpanded ? 'fixed inset-4 z-50' : 'relative'}`}>
      
      {/* Left Sidebar (Thread Management) */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className={`flex flex-col h-full border-r shrink-0 overflow-hidden ${
              theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-gray-200'
            }`}
          >
            {/* Sidebar Header */}
            <div className="p-3 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-blue-500 flex items-center gap-1">
                <Database className="w-3.5 h-3.5" />
                Histórico de Chats
              </span>
              <button
                onClick={createNewChat}
                className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-sm flex items-center justify-center"
                title="Nova conversa"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                <span className="text-[10px] font-bold">Novo</span>
              </button>
            </div>

            {/* Sidebar Search */}
            <div className="p-2 border-b border-black/5 dark:border-white/5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filtrar conversas..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full pl-8 pr-2 py-1.5 text-xs rounded-lg border outline-none ${
                    theme === 'dark' 
                      ? 'bg-slate-900 border-slate-800 text-white placeholder:text-slate-600 focus:border-slate-700' 
                      : 'bg-white border-gray-250 text-gray-900 placeholder:text-gray-400 focus:border-gray-300'
                  }`}
                />
              </div>
            </div>

            {/* Sidebar Chats List */}
            <div className="flex-1 overflow-y-auto p-1.5 space-y-1 scrollbar-thin">
              {filteredThreads.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Nenhuma conversa encontrada</p>
                </div>
              ) : (
                filteredThreads.map((thread) => {
                  const isActive = thread.id === activeThreadId;
                  const isEditing = thread.id === editingThreadId;

                  return (
                    <div
                      key={thread.id}
                      onClick={() => {
                        if (!isEditing) {
                          setActiveThreadId(thread.id);
                        }
                      }}
                      className={`group relative p-2.5 rounded-lg cursor-pointer transition-all flex items-center justify-between border ${
                        isActive
                          ? theme === 'dark'
                            ? 'bg-blue-600/10 border-blue-500/20 text-blue-400'
                            : 'bg-blue-50 border-blue-100 text-blue-600'
                          : theme === 'dark'
                            ? 'bg-transparent border-transparent text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                            : 'bg-transparent border-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-blue-500 animate-pulse' : 'text-slate-400 group-hover:text-slate-200'}`} />
                        {isEditing ? (
                          <input
                            type="text"
                            value={editTitleInput}
                            onChange={(e) => setEditTitleInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveRename(thread.id);
                              if (e.key === 'Escape') setEditingThreadId(null);
                            }}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            className={`w-full text-xs px-1.5 py-0.5 rounded outline-none border ${
                              theme === 'dark' 
                                ? 'bg-slate-800 border-slate-700 text-white' 
                                : 'bg-white border-gray-300 text-gray-950'
                            }`}
                          />
                        ) : (
                          <span className="text-xs font-medium truncate pr-6">{thread.title}</span>
                        )}
                      </div>

                      {/* Tool Actions for Thread Row */}
                      <div className="absolute right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isEditing ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); saveRename(thread.id); }}
                            className="p-1 rounded bg-slate-200 dark:bg-slate-800 hover:text-green-500"
                            title="Salvar"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={(e) => startEditing(thread.id, thread.title, e)}
                              className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 hover:text-blue-400"
                              title="Renomear"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => deleteChat(thread.id, e)}
                              className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 hover:text-red-400"
                              title="Excluir"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Sidebar Summary Info */}
            <div className="p-3 border-t border-black/15 dark:border-white/10 text-center bg-black/10 dark:bg-black/40">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                {threads.length} {threads.length === 1 ? 'Conversa Ativa' : 'Conversas Salvas'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Core Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-gray-100 text-gray-900'} border-b p-4 flex justify-between items-center transition-colors duration-300`}>
          <div className="flex items-center gap-2.5">
            {/* Collapse/Expand Sidebar Trigger Icon */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`p-2 rounded-lg transition-colors ${
                theme === 'dark' ? 'hover:bg-white/5 text-slate-400 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'
              }`}
              title={sidebarOpen ? "Ocultar Histórico" : "Exibir Histórico"}
            >
              {sidebarOpen ? <PanelLeftClose className="w-4.5 h-4.5" /> : <PanelLeft className="w-4.5 h-4.5 text-blue-500" />}
            </button>

            <div className={`w-10 h-10 ${theme === 'dark' ? 'bg-blue-600 shadow-blue-500/20' : 'bg-blue-50 border border-blue-100'} rounded-lg flex items-center justify-center shadow-lg transition-all`}>
              <Cpu className={`w-6 h-6 ${theme === 'dark' ? 'text-white' : 'text-blue-600'}`} />
            </div>
            <div>
              <h3 className="font-black text-sm tracking-tight flex items-center gap-2">
                NEXUS IA 
                <span className={`text-[8px] px-1.5 py-0.5 rounded border uppercase tracking-widest font-black ${
                  theme === 'dark' 
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' 
                    : 'bg-blue-50 text-blue-600 border-blue-100'
                }`}>Core</span>
              </h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 ${theme === 'dark' ? 'bg-emerald-500' : 'bg-emerald-600'} rounded-full animate-pulse`} />
                <span className={`text-[10px] ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'} font-bold uppercase tracking-wider`}>
                  {activeThread ? activeThread.title : 'Análise de Desempenho'}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5">
            {/* Quick Export Actions */}
            <button 
              onClick={copyToClipboardMd}
              className={`p-2 rounded-lg transition-colors flex items-center justify-center ${
                theme === 'dark' ? 'hover:bg-white/5 text-slate-400 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'
              }`}
              title="Copiar como Markdown"
            >
              <ClipboardCopy className="w-4 h-4" />
            </button>
            <button 
              onClick={exportChatAsTxt}
              className={`p-2 rounded-lg transition-colors flex items-center justify-center ${
                theme === 'dark' ? 'hover:bg-white/5 text-slate-400 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'
              }`}
              title="Baixar Relatório (.txt)"
            >
              <FileDown className="w-4 h-4" />
            </button>

            <div className="w-[1px] h-6 bg-black/10 dark:bg-white/10 mx-1" />

            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-white/5 text-slate-400 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'}`}
              title={isExpanded ? "Minimizar" : "Maximizar"}
            >
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button 
              onClick={clearChat}
              className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-white/5 text-slate-400 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-900'}`}
              title="Limpar Histórico Desta Conversa"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className={`flex-1 overflow-y-auto p-4 space-y-6 ${theme === 'dark' ? 'bg-zinc-950' : 'bg-slate-50'} scrollbar-thin ${theme === 'dark' ? 'scrollbar-thumb-slate-800' : 'scrollbar-thumb-slate-200'}`}>
          <div className="flex justify-center mb-4">
            <div className={`px-3 py-1 ${theme === 'dark' ? 'bg-blue-500/10 border-blue-500/20' : 'bg-blue-50 border-blue-100'} border rounded-full flex items-center gap-2`}>
              <ShieldCheck className="w-3 h-3 text-blue-500" />
              <span className={`text-[9px] font-black ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'} uppercase tracking-widest`}>Conexão Segura E2E</span>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex gap-3 max-w-[95%] md:max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-1 ${
                    msg.role === 'user' 
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
                      : theme === 'dark'
                        ? 'bg-slate-900 border border-slate-700 text-blue-400 shadow-xl'
                        : 'bg-blue-50 border border-blue-200 text-blue-600 shadow-sm shadow-blue-100'
                  }`}>
                    {msg.role === 'user' ? <UserIcon className="w-4 h-4" /> : <Cpu className="w-4 h-4" />}
                  </div>
                  <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-tr-none shadow-md shadow-blue-500/10' 
                      : `${theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-gray-200 text-gray-800'} rounded-tl-none border shadow-sm`
                  }`}>
                    <div className={`prose prose-sm ${theme === 'dark' ? 'prose-invert' : ''} max-w-none`}>
                      {msg.role === 'user' ? (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <MarkdownRenderer content={msg.content} theme={theme} />
                      )}
                    </div>

                    {msg.chartData && <ChartRenderer data={msg.chartData} theme={theme} />}

                    <div className={`flex items-center gap-2 mt-3 pt-2 border-t border-black/5 dark:border-white/5 text-[9px] font-black uppercase tracking-widest opacity-40 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <span>
                        {msg.timestamp instanceof Date 
                          ? msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        }
                      </span>
                      <span>•</span>
                      <span>{msg.role === 'user' ? 'Usuário Autenticado' : 'Nexus Resposta'}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {messages.length === 1 && !isLoading && (
            <div className="pl-11 grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 animate-in fade-in duration-300">
              <button
                type="button"
                onClick={() => handlePresetSend("Gere um gráfico de pizza para mostrar a distribuição de projetos por tipo de implemento.")}
                className={`p-3 text-left rounded-xl border text-xs flex flex-col gap-1 transition-all hover:scale-[1.02] cursor-pointer ${
                  theme === 'dark' 
                    ? 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300' 
                    : 'bg-white border-gray-100 hover:border-gray-200 text-gray-700 shadow-sm'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-blue-500">
                  <PieIcon className="w-4 h-4" />
                  <span>Projetos por Implemento</span>
                </div>
                <p className="opacity-70">Gera um gráfico do tipo pizza com a porcentagem por categoria de implemento.</p>
              </button>
              
              <button
                type="button"
                onClick={() => handlePresetSend("Gere um gráfico de linha mostrando a evolução comparativa de projetos concluídos nos últimos meses.")}
                className={`p-3 text-left rounded-xl border text-xs flex flex-col gap-1 transition-all hover:scale-[1.02] cursor-pointer ${
                  theme === 'dark' 
                    ? 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300' 
                    : 'bg-white border-gray-100 hover:border-gray-200 text-gray-700 shadow-sm'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-emerald-500">
                  <TrendingUp className="w-4 h-4" />
                  <span>Evolução de Projetos</span>
                </div>
                <p className="opacity-70">Gera um gráfico de linha histórico do progresso de projetos concluídos.</p>
              </button>

              <button
                type="button"
                onClick={() => handlePresetSend("Gere um gráfico de barras com a média de horas por projetista nos últimos meses.")}
                className={`p-3 text-left rounded-xl border text-xs flex flex-col gap-1 transition-all hover:scale-[1.02] cursor-pointer ${
                  theme === 'dark' 
                    ? 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300' 
                    : 'bg-white border-gray-100 hover:border-gray-200 text-gray-700 shadow-sm'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-amber-500">
                  <BarChart3 className="w-4 h-4" />
                  <span>Horas por Projetista</span>
                </div>
                <p className="opacity-70">Compara a média mensal de horas (Rastreador + Operacional) por projetista.</p>
              </button>

              <button
                type="button"
                onClick={() => handlePresetSend("Gere um gráfico de área com o desempenho detalhado de projetos concluídos no Rastreador e no Nexus Gantt por projetista.")}
                className={`p-3 text-left rounded-xl border text-xs flex flex-col gap-1 transition-all hover:scale-[1.02] cursor-pointer ${
                  theme === 'dark' 
                    ? 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300' 
                    : 'bg-white border-gray-100 hover:border-gray-200 text-gray-700 shadow-sm'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-purple-500">
                  <Activity className="w-4 h-4" />
                  <span>Desempenho Geral da Equipe</span>
                </div>
                <p className="opacity-70">Gera um gráfico comparativo das entregas do Rastreador vs Nexus Gantt por membro.</p>
              </button>
            </div>
          )}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-3 max-w-[80%]">
                <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center mt-1">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                </div>
                <div className={`p-4 ${theme === 'dark' ? 'bg-slate-900 border-slate-800 text-blue-400' : 'bg-white border-gray-200 text-blue-600'} rounded-2xl rounded-tl-none border flex items-center gap-2 shadow-sm`}>
                  <span className="text-[10px] font-black uppercase tracking-widest animate-pulse">Sincronizando Dados ERP...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className={`p-4 ${theme === 'dark' ? 'bg-black border-slate-800' : 'bg-white border-gray-200'} border-t animate-in slide-in-from-bottom-2`}>
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex gap-2"
          >
            <div className="relative flex-1 group">
              <Database className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors ${theme === 'dark' ? 'text-slate-600 group-focus-within:text-blue-500' : 'text-slate-400 group-focus-within:text-blue-600'}`} />
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ex: Mostre um gráfico da evolução de projetos..."
                className={`w-full pl-10 pr-4 py-3 ${theme === 'dark' ? 'bg-slate-900 border-slate-800 text-white placeholder:text-slate-600' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400'} border rounded-xl outline-none focus:ring-2 focus:ring-blue-500/50 text-sm transition-all`}
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white rounded-xl transition-all shadow-lg active:scale-95"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
          <div className="flex items-center justify-center gap-3 mt-3">
            <div className="h-[1px] flex-1 bg-gray-100 dark:bg-slate-800" />
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Nexus Intelligence Analytics System
            </p>
            <div className="h-[1px] flex-1 bg-gray-150 dark:bg-slate-800" />
          </div>
        </div>
      </div>
    </div>
  );
};
