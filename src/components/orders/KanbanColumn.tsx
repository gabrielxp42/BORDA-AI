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
    <div className={`glass-panel p-4 rounded-3xl space-y-4 flex flex-col min-h-[300px] md:min-h-[580px] transition-all duration-200 border border-white/5 ${
      isDraggingOver ? 'bg-white/[0.05] border-purple-500/20 shadow-2xl shadow-purple-500/5' : ''
    }`}>
      {/* Column Header */}
      <div className={`p-3 rounded-2xl border text-xs font-black uppercase tracking-wider flex items-center justify-between transition-colors shadow-sm ${colorClass}`}>
        <div className="flex items-center gap-2">
          {/* WhatsApp Autonotification Toggle Button */}
          {id !== 'pending' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleNotifications();
              }}
              className={`p-1.5 rounded-lg transition-all active:scale-95 ${
                notificationsEnabled 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                  : 'bg-zinc-700/20 text-zinc-500 border border-zinc-700/30'
              }`}
              title={notificationsEnabled ? 'Notificações de WhatsApp automáticas ativas' : 'Notificações automáticas desativadas'}
            >
              <MessageCircle className="h-4 w-4" />
            </button>
          )}
          <span className="font-extrabold tracking-widest">{title}</span>
          <span className="h-5.5 w-5.5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-black">
            {ordersCount}
          </span>
        </div>
        <button
          type="button"
          onClick={onAddOrderClick}
          className="h-7 w-7 rounded-xl bg-white/10 hover:bg-white/20 text-current flex items-center justify-center transition-all active:scale-90 cursor-pointer border border-white/5"
          title={`Adicionar novo pedido em: ${title}`}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Droppable Scroll Area */}
      <div className="space-y-4.5 flex-1 overflow-y-auto custom-scrollbar pt-1 pb-6 pr-1">
        {children}
      </div>

      {/* Quick Add Dotted Box at column bottom */}
      {ordersCount > 0 && (
        <button
          type="button"
          onClick={onAddOrderClick}
          className="w-full py-3.5 border border-dashed border-white/10 hover:border-purple-500/30 hover:bg-white/[0.02] text-zinc-500 hover:text-purple-300 rounded-2xl text-xs font-black flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>Adicionar Pedido</span>
        </button>
      )}
    </div>
  );
};
