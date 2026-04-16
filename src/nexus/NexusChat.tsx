import React, { useState, useRef, useEffect } from 'react';
import { Send, Cpu, User as UserIcon, Loader2, Trash2, Maximize2, Minimize2, Database, ShieldCheck, BarChart3 } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area 
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { processNexusQuery } from './nexusEngine';
import { AppState, User } from '../types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  chartData?: any;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const ChartRenderer: React.FC<{ data: any }> = ({ data }) => {
  if (!data || !data.type || !data.series) return null;

  const renderChart = () => {
    switch (data.type.toLowerCase()) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.series}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis dataKey="name" fontSize={10} tick={{ fill: 'currentColor' }} />
              <YAxis fontSize={10} tick={{ fill: 'currentColor' }} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '8px', color: '#fff' }}
                itemStyle={{ color: '#fff' }}
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
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis dataKey="name" fontSize={10} tick={{ fill: 'currentColor' }} />
              <YAxis fontSize={10} tick={{ fill: 'currentColor' }} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '8px', color: '#fff' }}
                itemStyle={{ color: '#fff' }}
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
                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '8px', color: '#fff' }}
                itemStyle={{ color: '#fff' }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );
      case 'area':
        return (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={data.series}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis dataKey="name" fontSize={10} tick={{ fill: 'currentColor' }} />
              <YAxis fontSize={10} tick={{ fill: 'currentColor' }} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '8px', color: '#fff' }}
                itemStyle={{ color: '#fff' }}
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
    <div className="mt-4 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-blue-500" />
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{data.title || 'Análise Nexus'}</h4>
      </div>
      {renderChart()}
      {data.description && (
        <p className="mt-3 text-[10px] text-gray-500 dark:text-gray-400 italic">
          {data.description}
        </p>
      )}
    </div>
  );
};

interface NexusChatProps {
  appState: AppState;
  currentUser: User;
}

export const NexusChat: React.FC<NexusChatProps> = ({ appState, currentUser }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initial Greeting
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: "Olá! Sou o Nexus IA, assistente interno do JimpNexus ERP. Agora também posso gerar gráficos de desempenho baseados nos seus dados. Como posso ajudar?",
        timestamp: new Date()
      }]);
    }
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Chama o núcleo de processamento interno do Nexus que cuida de tudo
      const response = await processNexusQuery(input, appState, currentUser);
      
      // Extract JSON if present
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
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error("Nexus IA Error:", error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ Falha crítica no núcleo Nexus. Reinicializando sistemas...`,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([{
        role: 'assistant',
        content: "Olá! Sou o Nexus IA, assistente interno do JimpNexus ERP. Como posso ajudar hoje?",
        timestamp: new Date()
    }]);
  };

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-black border border-gray-200 dark:border-slate-800 rounded-xl shadow-lg overflow-hidden transition-all duration-300 ${isExpanded ? 'fixed inset-4 z-50' : 'relative'}`}>
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-700 p-4 flex justify-between items-center text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Cpu className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-black text-sm tracking-tight flex items-center gap-2">
              NEXUS IA 
              <span className="bg-blue-500/10 text-blue-400 text-[8px] px-1.5 py-0.5 rounded border border-blue-500/30 uppercase tracking-widest font-black">Core</span>
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Análise de Desempenho Ativa</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-400 hover:text-white"
            title={isExpanded ? "Minimizar" : "Maximizar"}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button 
            onClick={clearChat}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-400 hover:text-white"
            title="Reinicializar Assistant"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50 dark:bg-zinc-950 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
        <div className="flex justify-center mb-4">
             <div className="px-3 py-1 bg-blue-500/5 border border-blue-500/10 rounded-full flex items-center gap-2">
                <ShieldCheck className="w-3 h-3 text-blue-500" />
                <span className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">Conexão Segura E2E</span>
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
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-1 ${msg.role === 'user' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-900 border border-slate-700 text-blue-500 shadow-xl'}`}>
                  {msg.role === 'user' ? <UserIcon className="w-4 h-4" /> : <Cpu className="w-4 h-4" />}
                </div>
                <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none' 
                    : 'bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-gray-800 dark:text-slate-200 rounded-tl-none'
                }`}>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                     <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>

                  {msg.chartData && <ChartRenderer data={msg.chartData} />}

                  <div className={`flex items-center gap-2 mt-3 pt-2 border-t border-black/5 dark:border-white/5 text-[9px] font-black uppercase tracking-widest opacity-40 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <span>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span>•</span>
                    <span>{msg.role === 'user' ? 'Usuário Autenticado' : 'Nexus Resposta'}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex gap-3 max-w-[80%]">
              <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center mt-1">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              </div>
              <div className="p-4 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl rounded-tl-none flex items-center gap-2">
                <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest animate-pulse">Sincronizando Dados ERP...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white dark:bg-black border-t border-gray-200 dark:border-slate-800">
        <form 
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Database className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ex: Mostre um gráfico da evolução de projetos..."
              className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white text-sm transition-all"
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
             <div className="h-[1px] flex-1 bg-gray-100 dark:bg-slate-800" />
        </div>
      </div>
    </div>
  );
};
