import React, { createContext, useContext, useState, useCallback } from 'react';
import { AppState, User } from '../types';

interface StateContextType {
  data: AppState;
  setData: React.Dispatch<React.SetStateAction<AppState>>;
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  activeTab: string;
  setActiveTab: (tab: any) => void;
  theme: 'light' | 'dark';
  setTheme: React.Dispatch<React.SetStateAction<'light' | 'dark'>>;
  isLocked: boolean;
  setIsLocked: (locked: boolean) => void;
}

const defaultSettings = { 
  hourlyCost: 150,
  emailTo: '',
  interruptionEmailTo: '',
  interruptionEmailTemplate: '',
  companyName: 'JIMP NEXUS',
  language: 'pt-BR' as const,
  workdayStart: '07:30',
  workdayEnd: '17:30',
  lunchStart: '12:00',
  lunchEnd: '13:00',
  workdays: [1, 2, 3, 4, 5],
  autoLockTimeout: 15
};

const initialAppState: AppState = { 
  projects: [], 
  issues: [], 
  innovations: [],
  interruptions: [],
  interruptionTypes: [],
  users: [],
  settings: defaultSettings,
  seoData: { keywords: [], metrics: [], tasks: [] },
  activityTypes: [],
  operationalActivities: [],
  projectRequests: [],
  ganttTasks: [],
  auditLogs: []
};

const StateContext = createContext<StateContextType | undefined>(undefined);

export const StateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = useState<AppState>(initialAppState);
  const [currentUser, setCurrentUserState] = useState<User | null>(() => {
    try {
      const saved = sessionStorage.getItem('nexus_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<any>('dashboard');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('theme');
      return (saved as 'light' | 'dark') || 'light';
    } catch {
      return 'light';
    }
  });
  const [isLocked, setIsLockedState] = useState(() => {
    try {
      return sessionStorage.getItem('nexus_locked') === 'true';
    } catch {
      return false;
    }
  });

  const setIsLocked = useCallback((locked: boolean) => {
    setIsLockedState(locked);
    if (locked) {
      sessionStorage.setItem('nexus_locked', 'true');
    } else {
      sessionStorage.removeItem('nexus_locked');
    }
  }, []);

  const setCurrentUser = useCallback((user: User | null) => {
    setCurrentUserState(user);
    if (user) {
      sessionStorage.setItem('nexus_user', JSON.stringify(user));
      // Standard cleanup of legacy insecure localStorage item
      localStorage.removeItem('nexus_user');
    } else {
      sessionStorage.removeItem('nexus_user');
      localStorage.removeItem('nexus_user');
      sessionStorage.removeItem('nexus_locked');
    }
  }, []);

  return (
    <StateContext.Provider value={{
      data,
      setData,
      currentUser,
      setCurrentUser,
      isLoading,
      setIsLoading,
      activeTab,
      setActiveTab,
      theme,
      setTheme,
      isLocked,
      setIsLocked
    }}>
      {children}
    </StateContext.Provider>
  );
};

export const useAppState = () => {
  const context = useContext(StateContext);
  if (context === undefined) {
    throw new Error('useAppState must be used within a StateProvider');
  }
  return context;
};
