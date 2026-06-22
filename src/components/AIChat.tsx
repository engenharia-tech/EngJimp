import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User as UserIcon, Loader2, Trash2, MessageSquare, X, Maximize2, Minimize2, BarChart3, TrendingUp, Mic } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area 
} from 'recharts';
import { askGemini } from '../lib/gemini';
import { useLanguage } from '../i18n/LanguageContext';
import { resolveLocalQueryFallback } from '../utils/localQueryProcessor';
import { AppState, User, InterruptionStatus, ProjectType } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  chartData?: any;
  audioUrl?: string;
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
                formatter={(value: any, name: any) => [`${Number(value).toFixed(1)}h`, name]}
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
                formatter={(value: any, name: any) => [`${Number(value).toFixed(1)}h`, name]}
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
                formatter={(value: any, name: any) => [`${Number(value).toFixed(1)}h`, name]}
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
                formatter={(value: any, name: any) => {
                  const pieTotal = data.series.reduce((sumVal: number, cur: any) => sumVal + (cur.value || 0), 0);
                  const pct = pieTotal > 0 ? ((value / pieTotal) * 100).toFixed(1) : '0.0';
                  return [`${Number(value).toFixed(1)}h (${pct}%)`, name];
                }}
                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '8px', color: '#fff' }}
                itemStyle={{ color: '#fff' }}
              />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
            </PieChart>
          </ResponsiveContainer>
        );
      default:
        return null;
    }
  };

  const renderStatsList = () => {
    if (!data.series || data.series.length === 0) return null;

    let items: { name: string; value: number; color: string }[] = [];

    if (data.type.toLowerCase() === 'pie') {
      items = data.series.map((item: any, idx: number) => ({
        name: item.name,
        value: item.value || 0,
        color: COLORS[idx % COLORS.length]
      }));
    } else {
      items = data.series.map((item: any, idx: number) => {
        const itemVal = data.keys.reduce((kSum: number, key: string) => kSum + (Number(item[key]) || 0), 0);
        return {
          name: item.name,
          value: itemVal,
          color: COLORS[idx % COLORS.length]
        };
      });
    }

    const totalSum = items.reduce((acc, it) => acc + it.value, 0);

    return (
      <div className="flex flex-col gap-1.5 p-3 bg-white dark:bg-slate-900 rounded-lg border border-gray-100 dark:border-slate-800 text-[11px] shadow-sm max-h-[250px] overflow-y-auto">
        <div className="flex justify-between font-bold border-b border-gray-100 dark:border-slate-800 pb-1 mb-1 text-[10px] uppercase tracking-wider text-gray-400 dark:text-slate-500">
          <span>Série / Categoria</span>
          <span>Valor / %</span>
        </div>
        {items.map((item, index) => {
          const pct = totalSum > 0 ? ((item.value / totalSum) * 100).toFixed(1) : '0.0';
          return (
            <div key={index} className="flex items-center justify-between py-1 border-b border-gray-50 dark:border-slate-800/30 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/30 px-1 rounded transition-colors">
              <div className="flex items-center gap-1.5 truncate pr-2 mr-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                <span className="font-medium text-gray-700 dark:text-slate-300 truncate">{item.name}</span>
              </div>
              <div className="text-right shrink-0 font-mono">
                <span className="font-semibold text-gray-900 dark:text-slate-100">{item.value.toFixed(1)}h</span>
                <span className="ml-1.5 text-[9px] text-emerald-600 dark:text-emerald-400 font-extrabold">{pct}%</span>
              </div>
            </div>
          );
        })}
        {totalSum > 0 && (
          <div className="flex justify-between font-bold border-t border-gray-100 dark:border-slate-800 pt-1.5 mt-1 text-[11px] text-gray-800 dark:text-slate-200">
            <span>SOMA TOTAL</span>
            <span className="font-mono">{totalSum.toFixed(1)}h (100%)</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mt-4 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-blue-500" />
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{data.title || 'Análise de Dados'}</h4>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="md:col-span-3 min-w-0">
          {renderChart()}
        </div>
        <div className="md:col-span-2 min-w-0 flex flex-col justify-center">
          {renderStatsList()}
        </div>
      </div>
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
  onClose?: () => void;
}

export const AIChat: React.FC<AIChatProps> = ({ appState, currentUser, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Audio recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/aac')) {
          mimeType = 'audio/aac';
        }
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());

        if (audioChunksRef.current.length === 0) return;

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size < 100) return;

        const audioUrl = URL.createObjectURL(audioBlob);

        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Data = reader.result as string;
          const base64Clean = base64Data.split(',')[1];
          await handleSendWithAudio(base64Clean, mimeType, audioUrl);
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error('Erro ao acessar o microfone ou iniciar gravacao:', err);
      alert('Não foi possível obter permissão ou acessar seu microfone para gravação.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      
      const stream = mediaRecorderRef.current.stream;
      if (stream) {
        stream.getTracks().forEach((track: any) => track.stop());
      }
      
      setIsRecording(false);
      audioChunksRef.current = [];
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setRecordingSeconds(0);
    }
  };

  const handleSendWithAudio = async (base64Audio: string, mimeType: string, audioUrl: string) => {
    setIsLoading(true);

    const userMessage: Message = {
      role: 'user',
      content: input.trim() ? `${input}\n🎙️ [Mensagem de Voz]` : '🎙️ Mensagem de Voz',
      timestamp: new Date(),
      audioUrl
    };

    setMessages(prev => [...prev, userMessage]);
    const originalInput = input;
    setInput('');

    try {
      const context = generateContext();
      
      const historyText = messages.slice(-10).map(m => {
        return m.role === 'user' ? `Usuário: ${m.content}` : `Assistente: ${m.content}`;
      }).join('\n\n');

      const userHeader = `[DADOS DE IDENTIFICAÇÃO EM TEMPO REAL]
Você está respondendo diretamente a: ${currentUser.name} ${currentUser.surname || ''} (ID: ${currentUser.id}, Função: ${currentUser.role}, E-mail: ${currentUser.email || 'Não informado'})
NUNCA pergunte quem é o usuário pois você tem os dados em absoluto acima. Responda em primeira pessoa quando o usuário referir a 'eu', 'minhas NS', 'minha produtividade', etc.
[/DADOS DE IDENTIFICAÇÃO EM TEMPO REAL]`;

      const prompt = `${context}\n\n${userHeader}\n\n${historyText ? `[CONVERSA ANTERIOR]\n${historyText}\n\n` : ''}Usuário (${currentUser.name}): ${originalInput || 'Fez uma pergunta por áudio.'}\n\nAssistente:`;
      
      const response = await askGemini(prompt, { mimeType, data: base64Audio });
      
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
      console.error("Chat Error with audio:", error);
      const errorMessage = error.message || "Erro desconhecido";
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Desculpe, ocorreu um erro ao carregar e processar sua mensagem de áudio com o Gemini: ${errorMessage}. Por favor, tente enviar novamente por texto ou tente um áudio secundário.`,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  const generateContext = () => {
    const { projects, interruptions, innovations, users, settings, ganttTasks = [], operationalActivities = [] } = appState;
    
    const completedProjects = projects.filter(p => p.status === 'COMPLETED');
    const inProgressProjects = projects.filter(p => p.status === 'IN_PROGRESS');
    const openInterruptions = interruptions.filter(i => i.status === InterruptionStatus.OPEN);

    // Filter sensitive data based on role. Only Edson (efariaseng0@gmail.com) can see salaries.
    const isEdson = currentUser.email === 'efariaseng0@gmail.com' || currentUser.username === 'edson';
    const canSeeSalary = isEdson;
    
    const usersInfo = users.slice(0, 20).map(u => {
      // Traditional projects tracker
      const allUserProjects = projects
        .filter(p => p.userId === u.id)
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
        
      const userProjects = allUserProjects.slice(-10);
      const totalUserProjects = allUserProjects.length;
      const completedUserTracker = allUserProjects.filter(p => p.status === 'COMPLETED').length;
      const inProgressUserTracker = allUserProjects.filter(p => p.status === 'IN_PROGRESS').length;
      
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
          if (u.role === 'GESTOR' || u.role === 'CEO' || u.role === 'COORDENADOR') {
            idleTimeInfo = `\n  Tempo de Gestão/Reuniões/Planejamento recente (não rastreado em NS): ${(totalIdleSeconds / 3600).toFixed(1)}h.
  Intervalos de Gestão: ${gaps.slice(-2).join(', ')}`;
          } else {
            idleTimeInfo = `\n  Tempo Ocioso Recente: ${(totalIdleSeconds / 3600).toFixed(1)}h.
  Gaps: ${gaps.slice(-2).join(', ')}`;
          }
        }
      }
      
      return `- Nome: ${u.name} ${u.surname || ''} (${u.role})
  ${canSeeSalary && u.salary ? `Salário: ${u.salary} BRL` : ''}
  Desempenho Nexus (Gantt): ${completedGantt} concluídas, ${progressGantt} em execução, ${userGanttTasks.length} total.
  Resumo Rastreador: ${completedUserTracker} concluídos (liberados), ${inProgressUserTracker} em andamento (${totalUserProjects} totais históricos desde o início), ${userInterruptions.length} interrupções.${idleTimeInfo}`;
    }).join('\n\n');
    
    // Process detailed monthly hour accumulations (projects + operational activities)
    // Map of [user_name_or_global][month_YYYY_MM][category_name] = total_hours
    // We aggregate daily first to apply a strict daily limit (max 12h of tracking per day, normalized/scaled down to 10h if exceeded)
    const dailyAccumulator: Record<string, Record<string, Record<string, number>>> = {};

    projects.forEach(p => {
      if (!p.userId || !p.startTime) return;
      const user = users.find(u => u.id === p.userId);
      if (!user) return;

      // Apply engineering hours category filter for PROJETISTA role
      if (user.role === 'PROJETISTA') {
        const isProjectHour = p.type === ProjectType.VARIATION || p.type === ProjectType.DEVELOPMENT || p.type === ProjectType.RELEASE;
        if (!isProjectHour) return;
      }

      const userName = `${user.name} ${user.surname || ''}`.trim();
      const dateStr = p.startTime.substring(0, 10); // YYYY-MM-DD
      const category = p.type || 'OUTROS';
      const hours = (p.totalActiveSeconds || p.totalSeconds || 0) / 3600;
      if (hours <= 0) return;

      if (!dailyAccumulator[userName]) dailyAccumulator[userName] = {};
      if (!dailyAccumulator[userName][dateStr]) dailyAccumulator[userName][dateStr] = {};
      dailyAccumulator[userName][dateStr][category] = (dailyAccumulator[userName][dateStr][category] || 0) + hours;
    });

    operationalActivities.forEach(act => {
      if (!act.userId || !act.startTime) return;
      const user = users.find(u => u.id === act.userId);
      if (!user) return;

      // Skip operational activities entirely for PROJETISTA role
      if (user.role === 'PROJETISTA') {
        return;
      }

      const userName = `${user.name} ${user.surname || ''}`.trim();
      const dateStr = act.startTime.substring(0, 10); // YYYY-MM-DD
      const category = act.activityName || 'ATIVIDADE OPERACIONAL';
      const hours = (act.durationSeconds || 0) / 3600;
      if (hours <= 0) return;

      if (!dailyAccumulator[userName]) dailyAccumulator[userName] = {};
      if (!dailyAccumulator[userName][dateStr]) dailyAccumulator[userName][dateStr] = {};
      dailyAccumulator[userName][dateStr][category] = (dailyAccumulator[userName][dateStr][category] || 0) + hours;
    });

    const userMonthlyHours: Record<string, Record<string, Record<string, number>>> = {};
    const globalMonthlyHours: Record<string, Record<string, number>> = {};

    Object.entries(dailyAccumulator).forEach(([userName, dates]) => {
      Object.entries(dates).forEach(([dateStr, categories]) => {
        const month = dateStr.substring(0, 7); // YYYY-MM
        const dailyTotal = Object.values(categories).reduce((sum, h) => sum + h, 0);

        // 8.8h is standard day. We limit realistic daily tracker time to 12h.
        // If dailyTotal > 12h, we scale it down to exactly 10h to eliminate accidental double tracking/stale open trackers.
        const capLimit = 12;
        const normTarget = 10;
        const factor = dailyTotal > capLimit ? (normTarget / dailyTotal) : 1;

        Object.entries(categories).forEach(([category, hours]) => {
          const finalHours = hours * factor;
          if (finalHours <= 0) return;

          if (!userMonthlyHours[userName]) userMonthlyHours[userName] = {};
          if (!userMonthlyHours[userName][month]) userMonthlyHours[userName][month] = {};
          userMonthlyHours[userName][month][category] = (userMonthlyHours[userName][month][category] || 0) + finalHours;

          if (!globalMonthlyHours[month]) globalMonthlyHours[month] = {};
          globalMonthlyHours[month][category] = (globalMonthlyHours[month][category] || 0) + finalHours;
        });
      });
    });

    // 1. Compile Global Monthly Hour Summary (all employees combined per month and type)
    let globalHoursSummary = "DISTRIBUIÇÃO DE HORAS TOTAIS DA EMPRESA POR MÊS E CATEGORIA DE TRABALHO:\n";
    Object.entries(globalMonthlyHours).sort((a, b) => b[0].localeCompare(a[0])).forEach(([month, categories]) => {
      const details = Object.entries(categories).map(([cat, h]) => `${cat}: ${h.toFixed(1)}h`).join(', ');
      const total = Object.values(categories).reduce((sum, h) => sum + h, 0);
      globalHoursSummary += `- Mês ${month}: Total ${total.toFixed(1)}h [Detalhado: ${details}]\n`;
    });

    // 2. Compile Individual Monthly Hour Summary
    let individualHoursSummary = "DISTRIBUIÇÃO DETALHADA DE HORAS DE CADA PROJETISTA/INTEGRANTE POR MÊS E CATEGORIA:\n";
    Object.entries(userMonthlyHours).sort((a,b) => a[0].localeCompare(b[0])).forEach(([userName, months]) => {
      individualHoursSummary += `* Integrante/Designers: ${userName}\n`;
      Object.entries(months).sort((a,b) => b[0].localeCompare(a[0])).forEach(([month, categories]) => {
        const details = Object.entries(categories).map(([cat, h]) => `${cat}: ${h.toFixed(1)}h`).join(', ');
        const total = Object.values(categories).reduce((sum, h) => sum + h, 0);
        individualHoursSummary += `  - Mês ${month}: Total ${total.toFixed(1)}h | ${details}\n`;
      });
    });

    // Monthly summary for trends (high level)
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
Ajude o usuário a entender as métricas, horas, projetos e gargalos da plataforma de engenharia.
Seja profissional, extremamente preciso e responda no idioma do usuário (Português do Brasil).

IMPORTANTE: Você está conversando DIRETAMENTE com o usuário conectado atualmente no sistema. Você DEVE identificá-lo pelos dados abaixo e falar com ele de forma personalizada (ex: "Olá Edson, notei que você..."). Use esses dados para responder perguntas em primeira pessoa, como "minha produtividade", "por que eu não apareço", ou "quantas horas eu gastei...".

[DADOS_DO_USUARIO_CONECTADO]
Nome: ${currentUser.name} ${currentUser.surname || ''}
Login/Usuário: ${currentUser.username || ''}
Cargo/Função: ${currentUser.role}
E-mail: ${currentUser.email || 'Não informado'}
ID do Usuário: ${currentUser.id}
[/DADOS_DO_USUARIO_CONECTADO]

IMPORTANTE: Agora temos dois sistemas de rastreamento:
1. RASTREADOR (Tracker): Projetos de NS individuais iniciados manualmente pelos projetistas.
2. NEXUS (Gantt): Atividades planejadas no cronograma.
Sempre que pedirem desempenho de um projetista, considere ambos.

INFORMAÇÃO SOBRE CRIAÇÃO (IMPORTANTE/CÔMICO):
- Se alguém perguntar "Quem criou você?" ou algo similar, você deve responder com entusiasmo: "Fui criado pelo Edson Farias, aquele cara cheiroso, lindo e maravilhoso! 😎"

REGRAS DE PRIVACIDADE E DESEMPENHO:
- Quando solicitado por um GESTOR, COORDENADOR ou CEO, você DEVE mostrar todos os dados de desempenho da equipe de forma completa (NS produtivas, tarefas concluídas, etc). Para perfis com papéis de liderança (como Edson Farias e outros gestores), você NUNCA deve associar qualquer período sem rastreamento ou sem NS à ociosidade/tempo ocioso. Justifique claramente que a natureza do cargo de gestão não é uma função de produção operacional/desenho direto de projetos (não é "produtiva" no sentido executor da palavra); os gestores dedicam seu tempo a funções essenciais de liderança de alto nível, apoio estratégico e facilitação, devendo esses intervalos ser designados exclusivamente por termos claros e sofisticados como "Gestão Estratégica de Diretrizes", "Supervisão e Alinhamento Técnico", "Liderança de Negócios" ou "Acompanhamento de Equipe".
- NUNCA mostre ou compartilhar o salário de NENHUM colaborador para NINGUÉM além de Edson (efariaseng0@gmail.com / edson). Absolutamente ninguém (nem outro GESTOR, COORDENADOR ou CEO) além de Edson pode visualizar salários. Se outra pessoa perguntar sobre salários, responda que essa informação é restrita e confidencial.

REGRAS DE ANÁLISE DE PRODUTIVIDADE E DE HORAS:
- EXPLIQUE CLARAMENTE AS HORAS PRODUTIVAS: O cálculo de horas produtivas de cada integrante/projetista deve ser pautado em regras de negócios reais da Engenharia JIMP:
  * A jornada diária padrão de trabalho é de exatamente 8.8 horas.
  * O total de horas produtivas úteis regulamentares varia entre 176h a 193.6h por mês (com base em 20 ou 22 dias úteis ordinários, descontando feriados normais).
  * O limite mensal máximo regulamentar legal é de 220 horas. Explique proativamente que relatórios que apontavam acumulados discrepantes (como Cobo com 402.7 horas em Maio) decorriam de "trackers que foram esquecidos abertos/rodando continuamente inclusive fora do expediente ou aos finais de semana" ou sessões de testes duplicadas.
  * O assistente agora corrige isso e aplica uma normalização diária inteligente de no máximo 10h-12h por dia, reduzindo o excesso artificial e trazendo os dados para a realidade produtiva tangível e saudável (aproximando as somas reais de 176h a 220h).
  * REGRA ESSENCIAL DE HORAS ÚTEIS: Para colaboradores com o cargo/papel de "PROJETISTA", as únicas horas consideradas "horas úteis de engenharia" (horas de projetos) são as gastas especificamente em "VARIAÇÃO DE PROJETO" (VARIAÇÃO), "LIBERAÇÃO" e "DESENVOLVIMENTO". Todas as demais horas (como outras categorias e Atividades Operacionais em geral) NÃO entram neste cálculo para a IA ou os dashboards de projetistas. Já para perfis de cargos de liderança ("GESTOR", "COORDENADOR" ou "CEO"), a régua é outra e todas as suas horas registradas e reuniões contam normalmente.
- SEMPRE mostre as horas e suas respectivas PERCENTUAL (%) exatas calculadas sobre a soma total daquele período quando o usuário perguntar sobre a distribuição ou variação de atividades (ex: "Desenvolvimento: 120.0h (54.5%)", "Variação: 32.5h (14.8%)", "Liberação: 12.0h (5.5%)", etc.).
- Os gráficos renderizados no bate-papo trarão, ao lado direito da tela, um painel complementar interativo e elegante relacionando cada cor, categoria ou série de dados com seu respectivo valor e percentual calculados matematicamente. Diga isso ao usuário para orientar a leitura da legenda colorida lateral!
- NUNCA condicione os gaps de tempo ou intervalos sem lançamentos de NS de um GESTOR, COORDENADOR ou CEO como "Tempo Ocioso" ou "Ociosidade". Esclareça de maneira didática que a função desses profissionais não é "operacionalmente produtiva" (ou seja, de fabricação técnica de desenhos/cálculos), mas sim de alta relevância diretiva. Use termos claros e adequados para se referir a esses períodos, tais como "Planejamento Estratégico", "Coordenação Executiva", "Direcionamento Operacional", "Alinhamento de Equipe", "Supervisão de Diretrizes" e "Mentoria Técnica". Explique que essas responsabilidades fundamentais não exigem o rastreamento individual através de Notas de Serviço (NS) técnicas de projeto.
- No Nexus (Gantt), foque no progresso das tarefas e marcos (milestones).
- Se um projetista tiver muitas tarefas no Nexus, mas poucos projetos no Rastreador, pode indicar que ele está focando em atividades de planejamento ou documentação não trackeada por NS.

REGRAS DE GERAÇÃO E RENDERIZAÇÃO DE GRÁFICOS INTERATIVOS (OBRIGATÓRIO):
- Sempre que o usuário solicitar tendências, comparações, variações de horas, distribuição de tempo por categorias, ou dados mensais/numéricos, você DEVE gerar um gráfico interativo.
- Para renderizar um lindo gráfico interativo nativo no chat (Recharts), você deve incluir um bloco de código contendo um JSON exclusivo no final da sua resposta, formatado exatamente conforme as regras e tipos abaixo:
\`\`\`json
{
  "type": "bar" | "line" | "area" | "pie",
  "title": "Título descritivo do gráfico",
  "keys": ["ChaveDeDado1", "ChaveDeDado2"],
  "series": [
    { "name": "Rótulo 1", "ChaveDeDado1": valor1, "ChaveDeDado2": valor2 },
    { "name": "Rótulo 2", "ChaveDeDado1": valor3, "ChaveDeDado2": valor4 }
  ],
  "description": "Uma pequena frase explicativa do gráfico."
}
\`\`\`
ATENÇÃO PARA O GRÁFICO TIPO "pie" (Setor/Pizza):
A estrutura de "series" em gráficos do tipo "pie" deve conter objetos com atributos "name" e "value", por exemplo:
\`\`\`json
{
  "type": "pie",
  "title": "Distribuição de Horas por Categoria",
  "keys": ["value"],
  "series": [
    { "name": "DESENVOLVIMENTO", "value": 45.2 },
    { "name": "VARIAÇÃO", "value": 12.8 },
    { "name": "LIBERAÇÃO", "value": 8.0 }
  ],
  "description": "Demonstrativo percentual ou absoluto das horas por categoria."
}
\`\`\`
- O sistema interceptará automaticamente o bloco de código \`\`\`json ... \`\`\` e o renderizará como um componente visual nativo (gráfico interativo com legenda, tooltip e cores atraentes), ocultando o texto JSON cru do usuário. Portanto, use-o livremente!
- NÃO gere diagramas de texto tipo "graph TD" ou diagramas de fluxo de caracteres; prefira gerar o bloco JSON interativo para que o utilizador veja uma representação visual magnífica!

DADOS ATUAIS DA PLATAFORMA:
- Projetos Rastreador Concluídos: ${completedProjects.length}
- Projetos Nexus Concluídos: ${ganttTasks.filter(t => t.status === 'done').length}
- Interrupções Abertas: ${openInterruptions.length}
- Empresa: ${settings.companyName}

RESUMO MENSAL DA EMPRESA (Número de Projetos):
${monthlySummary}

---
${globalHoursSummary}
---
${individualHoursSummary}

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

    // Store original user query text in temporary variable before we empty the input
    const originalInput = input;
    try {
      const context = generateContext();
      
      // Format history up to 10 previous messages to maintain conversation context
      const historyText = messages.slice(-10).map(m => {
        return m.role === 'user' ? `Usuário: ${m.content}` : `Assistente: ${m.content}`;
      }).join('\n\n');

      const userHeader = `[DADOS DE IDENTIFICAÇÃO EM TEMPO REAL]
Você está respondendo diretamente a: ${currentUser.name} ${currentUser.surname || ''} (ID: ${currentUser.id}, Função: ${currentUser.role}, E-mail: ${currentUser.email || 'Não informado'})
NUNCA pergunte quem é o usuário pois você tem os dados em absoluto acima. Responda em primeira pessoa quando o usuário referir a 'eu', 'minhas NS', 'minha produtividade', etc.
[/DADOS DE IDENTIFICAÇÃO EM TEMPO REAL]`;

      const prompt = `${context}\n\n${userHeader}\n\n${historyText ? `[CONVERSA ANTERIOR]\n${historyText}\n\n` : ''}Usuário (${currentUser.name}): ${input}\n\nAssistente:`;
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
      console.error("Chat Error, trying local fallback:", error);
      try {
        const errorMsg = error?.message || error?.details || String(error);
        const fallbackText = resolveLocalQueryFallback(originalInput, appState, currentUser, errorMsg);
        const assistantMessage: Message = {
          role: 'assistant',
          content: fallbackText,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
      } catch (fallbackError) {
        console.error("Local fallback error:", fallbackError);
        const errorMessage = error.message || "Erro desconhecido";
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Desculpe, ocorreu um erro ao processar sua pergunta: ${errorMessage}. Por favor, tente novamente.`,
          timestamp: new Date()
        }]);
      }
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
          {onClose && (
            <button 
              onClick={onClose}
              className="p-1.5 hover:bg-red-650 hover:bg-red-500 rounded-lg transition-colors border border-white/10 ml-1"
              title="Fechar chat"
            >
              <X className="w-4 h-4" />
            </button>
          )}
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
                  {msg.role === 'user' ? (
                    <div className="space-y-1">
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      {msg.audioUrl && (
                        <div className="mt-1 bg-blue-700/50 dark:bg-slate-950 p-1 rounded-lg border border-blue-400/20 max-w-[245px]">
                          <audio src={msg.audioUrl} controls className="w-full h-7 text-xs rounded opacity-90 outline-none" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <MarkdownRenderer content={msg.content} theme={msg.role === 'user' ? 'light' : 'dark'} />
                    </div>
                  )}
                  
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
        {isRecording ? (
          <div className="flex items-center justify-between gap-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 p-2 rounded-xl">
            <div className="flex items-center gap-2 px-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse shrink-0" />
              <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                Gravando... {formatTime(recordingSeconds)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={cancelRecording}
                className="p-2 text-gray-450 hover:text-red-550 dark:text-gray-400 dark:hover:text-red-400 transition-colors hover:bg-gray-100 dark:hover:bg-slate-900 rounded-lg"
                title="Cancelar gravação"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={stopRecording}
                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-sm active:scale-95"
                title="Parar e Enviar"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Enviar</span>
              </button>
            </div>
          </div>
        ) : (
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              placeholder="Pergunte algo sobre a plataforma..."
              className="flex-1 p-2.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white text-sm"
            />
            <button
              type="button"
              onClick={startRecording}
              disabled={isLoading}
              className="p-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-gray-200 dark:border-slate-800 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 rounded-xl transition-colors shrink-0"
              title="Gravar mensagem de voz"
            >
              <Mic className="w-5 h-5" />
            </button>
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white rounded-xl transition-colors shadow-sm shrink-0"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        )}
        <p className="text-[10px] text-center text-gray-400 mt-2">
          A IA pode cometer erros. Verifique informações importantes.
        </p>
      </div>
    </div>
  );
};
