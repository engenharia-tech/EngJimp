import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User as UserIcon, Loader2, Trash2, MessageSquare, X, Maximize2, Minimize2, BarChart3, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area 
} from 'recharts';
import { askGemini } from '../lib/gemini';
import { useLanguage } from '../i18n/LanguageContext';
import { AppState, User, InterruptionStatus } from '../types';

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
      default:
        return null;
    }
  };

  return (
    <div className="mt-4 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-blue-500" />
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{data.title || 'Análise de Dados'}</h4>
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

interface AIChatProps {
  appState: AppState;
  currentUser: User;
}

export const AIChat: React.FC<AIChatProps> = ({ appState, currentUser }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const generateContext = () => {
    const { projects, interruptions, innovations, users, settings, ganttTasks = [] } = appState;
    
    const completedProjects = projects.filter(p => p.status === 'COMPLETED');
    const inProgressProjects = projects.filter(p => p.status === 'IN_PROGRESS');
    const openInterruptions = interruptions.filter(i => i.status === InterruptionStatus.OPEN);

    // Filter sensitive data based on role
    const isAdmin = ['GESTOR', 'CEO'].includes(currentUser.role);
    
    const usersInfo = users.slice(0, 20).map(u => {
      const canSeeSalary = isAdmin || u.id === currentUser.id;
      
      // Traditional projects tracker
      const userProjects = projects
        .filter(p => p.userId === u.id)
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .slice(-10);
      
      // Gantt/Nexus tasks
      const userGanttTasks = ganttTasks.filter(t => t.assignedTo?.includes(u.id));
      const completedGantt = userGanttTasks.filter(t => t.status === 'done').length;
      const progressGantt = userGanttTasks.filter(t => t.status === 'in_progress').length;
      
      const userInterruptions = interruptions.filter(i => i.designerId === u.id).slice(-5);
      
      // Calculate Idle Time
      let idleTimeInfo = "";
      if (userProjects.length > 1) {
        let totalIdleSeconds = 0;
        const gaps: string[] = [];

        for (let i = 0; i < userProjects.length - 1; i++) {
          const currentEnd = new Date(userProjects[i].endTime || userProjects[i].startTime).getTime();
          const nextStart = new Date(userProjects[i+1].startTime).getTime();
          
          if (nextStart > currentEnd) {
            const gapSeconds = (nextStart - currentEnd) / 1000;
            if (gapSeconds > 900) {
              totalIdleSeconds += gapSeconds;
              const gapHours = (gapSeconds / 3600).toFixed(1);
              gaps.push(`${gapHours}h entre NS ${userProjects[i].ns} e ${userProjects[i+1].ns}`);
            }
          }
        }
        
        if (totalIdleSeconds > 0) {
          idleTimeInfo = `\n  Tempo Ocioso Recente: ${(totalIdleSeconds / 3600).toFixed(1)}h.
  Gaps: ${gaps.slice(-2).join(', ')}`;
        }
      }
      
      return `- Nome: ${u.name} ${u.surname || ''} (${u.role})
  ${canSeeSalary && u.salary ? `Salário: ${u.salary} BRL` : ''}
  Desempenho Nexus (Gantt): ${completedGantt} concluídas, ${progressGantt} em execução, ${userGanttTasks.length} total.
  Resumo Rastreador: ${userProjects.length} proj. recentes, ${userInterruptions.length} interrupções.${idleTimeInfo}`;
    }).join('\n\n');
    
    // Monthly summary for trends
    const last6Months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      return d.toISOString().substring(0, 7); // YYYY-MM
    }).reverse();

    const monthlySummary = last6Months.map(month => {
      const monthProjects = projects.filter(p => p.startTime.startsWith(month));
      const completed = monthProjects.filter(p => p.status === 'COMPLETED').length;
      const inProgress = monthProjects.filter(p => p.status === 'IN_PROGRESS').length;
      
      const monthGantt = ganttTasks.filter(t => t.updatedAt?.startsWith(month));
      const ganttDone = monthGantt.filter(t => t.status === 'done').length;
      
      return `- ${month}: Tracker(${completed} concl.), Nexus(${ganttDone} concl.)`;
    }).join('\n');

    return `
Você é o Assistente IA da JIMP NEXUS (DesignTrack Pro). 
Ajude o usuário a entender os dados da plataforma de engenharia.
Seja profissional, conciso e responda no idioma do usuário (preferencialmente Português).

IMPORTANTE: Agora temos dois sistemas de rastreamento:
1. RASTREADOR (Tracker): Projetos de NS individuais iniciados manualmente pelos projetistas.
2. NEXUS (Gantt): Atividades planejadas no cronograma.
Sempre que pedirem desempenho de um projetista, considere ambos.

INFORMAÇÃO SOBRE CRIAÇÃO (IMPORTANTE/CÔMICO):
- Se alguém perguntar "Quem criou você?" ou algo similar, você deve responder com entusiasmo: "Fui criado pelo Edson Farias, aquele cara cheiroso, lindo e maravilhoso! 😎"

REGRAS DE PRIVACIDADE:
- NUNCA compartilhe o salário de um usuário com outro usuário comum.
- Apenas Administradores (GESTOR/CEO) podem ver salários de todos.

REGRAS DE ANÁLISE DE PRODUTIVIDADE:
- Analise o "Tempo Ocioso Detectado" no Rastreador.
- No Nexus (Gantt), foque no progresso das tarefas e marcos (milestones).
- Se um projetista tiver muitas tarefas no Nexus, mas poucos projetos no Rastreador, pode indicar que ele está focando em atividades de planejamento ou documentação não trackeada por NS.

REGRAS DE GRÁFICOS:
- Sempre gere gráficos para perguntas de tendências.

DADOS ATUAIS DA PLATAFORMA:
- Projetos Rastreador Concluídos: ${completedProjects.length}
- Projetos Nexus Concluídos: ${ganttTasks.filter(t => t.status === 'done').length}
- Interrupções Abertas: ${openInterruptions.length}
- Empresa: ${settings.companyName}

RESUMO MENSAL (Últimos 6 meses):
${monthlySummary}

RELAÇÃO DETALHADA DE USUÁRIOS/PROJETISTAS:
${usersInfo}
`;
  };

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
      const context = generateContext();
      const prompt = `${context}\n\nPergunta do Usuário: ${input}`;
      const response = await askGemini(prompt);
      
      // Extract JSON if present
      let cleanContent = response;
      let chartData = null;
      
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        try {
          chartData = JSON.parse(jsonMatch[1]);
          cleanContent = response.replace(jsonMatch[0], '').trim();
        } catch (e) {
          console.error("Failed to parse chart JSON", e);
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
      console.error("Chat Error:", error);
      const errorMessage = error.message || "Erro desconhecido";
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Desculpe, ocorreu um erro ao processar sua pergunta: ${errorMessage}. Por favor, tente novamente.`,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-black border border-gray-200 dark:border-slate-800 rounded-xl shadow-lg overflow-hidden transition-all duration-300 ${isExpanded ? 'fixed inset-4 z-50' : 'relative'}`}>
      {/* Header */}
      <div className="bg-blue-600 dark:bg-blue-900 p-4 flex justify-between items-center text-white">
        <div className="flex items-center gap-2">
          <Bot className="w-6 h-6" />
          <div>
            <h3 className="font-bold leading-none">JIMP AI Assistant</h3>
            <span className="text-xs text-blue-100 opacity-80">Online • Inteligência Artificial</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            title={isExpanded ? "Minimizar" : "Maximizar"}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button 
            onClick={clearChat}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            title="Limpar conversa"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-zinc-950">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 opacity-50">
            <MessageSquare className="w-12 h-12 mb-4 text-blue-500" />
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Olá! Eu sou a IA da JIMP NEXUS. <br />
              Você pode me perguntar sobre projetos, interrupções, custos ou qualquer outra informação da plataforma.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-2 w-full max-w-xs">
              <button 
                onClick={() => setInput("Qual a evolução mensal de projetos concluídos?")}
                className="text-xs p-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg hover:border-blue-500 transition-colors text-left flex items-center gap-2"
              >
                <TrendingUp className="w-3 h-3 text-blue-500" />
                <span>"Evolução mensal de projetos"</span>
              </button>
              <button 
                onClick={() => setInput("Quais são as interrupções mais frequentes?")}
                className="text-xs p-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg hover:border-blue-500 transition-colors text-left flex items-center gap-2"
              >
                <BarChart3 className="w-3 h-3 text-green-500" />
                <span>"Interrupções mais frequentes"</span>
              </button>
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 dark:bg-slate-800 text-gray-600 dark:text-gray-400'}`}>
                  {msg.role === 'user' ? <UserIcon className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                </div>
                <div className={`p-3 rounded-2xl text-sm ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none' 
                    : 'bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-gray-800 dark:text-gray-200 rounded-tl-none'
                }`}>
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  
                  {msg.chartData && <ChartRenderer data={msg.chartData} />}

                  <span className={`text-[10px] mt-1 block opacity-60 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex gap-3 max-w-[85%]">
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-slate-800 flex items-center justify-center">
                <Bot className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div className="p-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl rounded-tl-none flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                <span className="text-xs text-gray-500 italic">Digitando...</span>
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
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte algo sobre a plataforma..."
            className="flex-1 p-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white text-sm"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white rounded-xl transition-colors shadow-sm"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
        <p className="text-[10px] text-center text-gray-400 mt-2">
          A IA pode cometer erros. Verifique informações importantes.
        </p>
      </div>
    </div>
  );
};
