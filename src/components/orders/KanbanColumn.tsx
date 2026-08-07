import React from 'react';
import { Plus, MessageCircle } from 'lucide-react';
import { Droppable } from '@hello-pangea/dnd';

interface KanbanColumnProps {
  id: string;
  title: string;
  colorClass: string;
  ordersCount: number;
  notificationsEnabled: boolean;
  onToggleNotifications: () => void;
  onAddOrderClick: () => void;
  isDraggingOver: boolean;
  children: React.ReactNode;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  id,
  title,
  colorClass,
  ordersCount,
  notificationsEnabled,
  onToggleNotifications,
  onAddOrderClick,
  isDraggingOver,
  children
}) => {
  return (
    <div className={`glass-panel p-3 sm:p-4 rounded-3xl space-y-3 flex flex-col min-h-[300px] md:min-h-[580px] transition-all duration-200 border border-slate-200/80 dark:border-white/10 bg-slate-100/40 dark:bg-white/[0.02] min-w-[270px] sm:min-w-[300px] flex-1 ${
      isDraggingOver ? 'bg-purple-500/5 dark:bg-white/[0.05] border-purple-500/40 shadow-2xl shadow-purple-500/5' : ''
    }`}>
      {/* Column Header */}
      <div className={`p-3 rounded-2xl border flex flex-col gap-2 transition-colors shadow-sm ${colorClass}`}>
        {/* Row 1: Title, Count & Add Button */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-5.5 w-5.5 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center text-[10px] font-black shrink-0">
              {ordersCount}
            </span>
            <span className="font-extrabold text-xs uppercase tracking-widest truncate">{title}</span>
          </div>
          <button
            type="button"
            onClick={onAddOrderClick}
            className="h-6.5 w-6.5 rounded-xl bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-current flex items-center justify-center transition-all active:scale-90 cursor-pointer border border-black/5 dark:border-white/5 shrink-0"
            title={`Adicionar novo pedido em: ${title}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Row 2: MENSAGENS AUTOMÁTICAS Bar & Toggle Switch (Estilo Direct AI) */}
        {id !== 'pending' && (
          <div 
            onClick={(e) => {
              e.stopPropagation();
              onToggleNotifications();
            }}
            className="flex items-center justify-between pt-2 border-t border-black/5 dark:border-white/10 cursor-pointer select-none group"
            title={notificationsEnabled ? "Mensagens automáticas via WhatsApp ATIVAS para esta etapa" : "Mensagens automáticas via WhatsApp DESATIVADAS para esta etapa"}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <MessageCircle className={`h-3.5 w-3.5 shrink-0 transition-colors ${
                notificationsEnabled ? 'text-emerald-500 fill-emerald-500/20' : 'text-slate-400 dark:text-zinc-500'
              }`} />
              <span className={`text-[9px] font-black uppercase tracking-wider transition-colors truncate ${
                notificationsEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-zinc-500'
              }`}>
                Mensagens Automáticas
              </span>
            </div>

            {/* Chave Toggle Switch (Liga / Desliga) */}
            <div className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
              notificationsEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-zinc-700'
            }`}>
              <span
                className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  notificationsEnabled ? 'translate-x-3.5' : 'translate-x-0'
                }`}
              />
            </div>
          </div>
        )}
      </div>

      {/* Droppable Scroll Area */}
      <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pt-1 pb-6 pr-0.5">
        {children}
      </div>

      {/* Quick Add Dotted Box at column bottom */}
      {ordersCount > 0 && (
        <button
          type="button"
          onClick={onAddOrderClick}
          className="w-full py-2.5 border border-dashed border-slate-300 dark:border-white/10 hover:border-purple-500/40 hover:bg-purple-500/5 text-slate-500 dark:text-zinc-500 hover:text-purple-600 dark:hover:text-purple-300 rounded-2xl text-xs font-black flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Adicionar Pedido</span>
        </button>
      )}
    </div>
  );
};
