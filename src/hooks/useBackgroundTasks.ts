import { create } from 'zustand';

export type TaskStatus = 'pre-processing' | 'processing' | 'sending' | 'completed' | 'error';

export interface TaskStep {
  id: string;
  label: string;
  status: 'pending' | 'loading' | 'completed' | 'error';
}

export interface BackgroundTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  progress: number; // 0 to 100
  steps: TaskStep[];
  error?: string;
  createdAt: number;
}

interface BackgroundTasksStore {
  tasks: BackgroundTask[];
  addTask: (task: Omit<BackgroundTask, 'id' | 'createdAt'>) => string;
  updateTask: (id: string, updates: Partial<BackgroundTask>) => void;
  updateStep: (id: string, stepId: string, status: TaskStep['status']) => void;
  removeTask: (id: string) => void;
  clearCompleted: () => void;
}

export const useBackgroundTasks = create<BackgroundTasksStore>((set) => ({
  tasks: [],
  addTask: (task) => {
    const id = Math.random().toString(36).substring(2, 11);
    set((state) => ({
      tasks: [
        { ...task, id, createdAt: Date.now() },
        ...state.tasks
      ]
    }));
    return id;
  },
  updateTask: (id, updates) => set((state) => ({
    tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t))
  })),
  updateStep: (id, stepId, status) => set((state) => ({
    tasks: state.tasks.map((t) => {
      if (t.id !== id) return t;
      return {
        ...t,
        steps: t.steps.map((s) => (s.id === stepId ? { ...s, status } : s))
      };
    })
  })),
  removeTask: (id) => set((state) => ({
    tasks: state.tasks.filter((t) => t.id !== id)
  })),
  clearCompleted: () => set((state) => ({
    tasks: state.tasks.filter((t) => t.status !== 'completed')
  }))
}));
