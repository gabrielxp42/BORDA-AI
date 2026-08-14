import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBackgroundTasks, BackgroundTask } from '../hooks/useBackgroundTasks';
import {
  CheckCircle2,
  Circle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
  Send,
  MessageSquare
} from 'lucide-react';

export const TaskDock: React.FC = () => {
  const { tasks, removeTask } = useBackgroundTasks();
  const [isExpanded, setIsExpanded] = useState(true);

  if (tasks.length === 0) return null;

  return (
    <div className="fixed z-[999999999] bottom-5 left-5 w-80 sm:w-88 flex flex-col gap-2 transition-all duration-300 pointer-events-auto">
      <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-900/90 dark:bg-black/90 border border-slate-700/60 dark:border-white/15 backdrop-blur-md shadow-xl">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-200 dark:text-zinc-200">
            Tarefas em Segundo Plano ({tasks.length})
          </span>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <div className="flex flex-col gap-2.5 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
            {tasks.map((task) => (
              <TaskItem key={task.id} task={task} onRemove={() => removeTask(task.id)} />
            ))}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const TaskItem = ({ task, onRemove }: { task: BackgroundTask; onRemove: () => void }) => {
  const isCompleted = task.status === 'completed';
  const isError = task.status === 'error';

  useEffect(() => {
    if (isCompleted) {
      const timer = setTimeout(() => {
        onRemove();
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [isCompleted, onRemove]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: -100, scale: 0.9, transition: { duration: 0.3 } }}
      className={`relative group overflow-hidden rounded-2xl border p-3.5 shadow-2xl backdrop-blur-xl transition-all ${
        isCompleted
          ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-100 shadow-emerald-950/50'
          : isError
          ? 'bg-red-950/80 border-red-500/40 text-red-100 shadow-red-950/50'
          : 'bg-slate-900/90 dark:bg-[#12121a]/95 border-purple-500/30 text-white shadow-purple-950/40'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {isCompleted ? (
            <div className="h-7 w-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </div>
          ) : isError ? (
            <div className="h-7 w-7 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
              <XCircle className="h-4 w-4 text-red-400" />
            </div>
          ) : (
            <div className="h-7 w-7 rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-black truncate pr-4 text-white">{task.title}</h4>
            <button
              onClick={onRemove}
              className="p-1 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors"
            >
              <X size={12} />
            </button>
          </div>

          <p className="text-[11px] text-zinc-300 dark:text-zinc-300 truncate mt-0.5 mb-2 font-medium">
            {task.description || (isCompleted ? 'Enviado com sucesso!' : isError ? task.error : 'Processando envio...')}
          </p>

          {/* Barra de Progresso Animada */}
          <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden mb-2 border border-white/5">
            <motion.div
              className={`h-full transition-all duration-300 ${
                isCompleted ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : isError ? 'bg-red-500' : 'bg-gradient-to-r from-purple-500 to-indigo-500'
              }`}
              initial={{ width: '0%' }}
              animate={{ width: `${task.progress}%` }}
            />
          </div>

          {/* Visualizador de Passos/Steps */}
          {task.steps && task.steps.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {task.steps.map((step) => (
                <div
                  key={step.id}
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold border transition-colors ${
                    step.status === 'completed'
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : step.status === 'error'
                      ? 'bg-red-500/20 border-red-500/40 text-red-300'
                      : step.status === 'loading'
                      ? 'bg-purple-500/20 border-purple-500/40 text-purple-200'
                      : 'bg-white/5 border-white/10 text-zinc-400'
                  }`}
                >
                  {step.status === 'completed' ? (
                    <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
                  ) : step.status === 'error' ? (
                    <XCircle className="h-2.5 w-2.5 text-red-400" />
                  ) : step.status === 'loading' ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin text-purple-400" />
                  ) : (
                    <Circle className="h-2.5 w-2.5 text-zinc-500" />
                  )}
                  <span>{step.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Brilho animado de conclusão */}
      {isCompleted && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-400/20 to-transparent -translate-x-full pointer-events-none"
          animate={{ x: ['100%', '-100%'] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
        />
      )}
    </motion.div>
  );
};
