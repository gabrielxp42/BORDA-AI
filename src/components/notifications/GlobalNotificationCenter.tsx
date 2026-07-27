import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bell, X, Bot, MessageCircle, Package, CheckCheck,
  Clock, AlertTriangle, Sparkles, Trash2, Filter
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';

interface Notification {
  id: string;
  type: 'gabi' | 'whatsapp' | 'pedido' | 'sistema';
  title: string;
  description: string;
  timestamp: number;
  read: boolean;
  actionUrl?: string;
}

interface GlobalNotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

type FilterTab = 'todas' | 'gabi' | 'whatsapp' | 'pedido';

const STORAGE_KEY = 'borda_notifications_v2';

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  return `há ${Math.floor(diff / 86400)}d`;
}

function loadNotifications(): Notification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveNotifications(notifs: Notification[]) {
  try {
    // Keep max 50 notifications
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifs.slice(0, 50)));
  } catch { /* quota exceeded */ }
}

export const GlobalNotificationCenter: React.FC<GlobalNotificationCenterProps> = ({ isOpen, onClose }) => {
  const { settings } = useCompanySettings();
  const pc = settings.primaryColor || '#ef4444';
  const [notifications, setNotifications] = useState<Notification[]>(loadNotifications);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('todas');
  const panelRef = useRef<HTMLDivElement>(null);

  // Add a notification (deduplicating by id)
  const addNotification = useCallback((notif: Notification) => {
    setNotifications(prev => {
      if (prev.some(n => n.id === notif.id)) return prev;
      const updated = [notif, ...prev].slice(0, 50);
      saveNotifications(updated);
      return updated;
    });
  }, []);

  // Generate initial Gabi alerts from pending orders
  useEffect(() => {
    const generateGabiAlerts = async () => {
      try {
        const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
        const { data: pending } = await supabase
          .from('orders')
          .select('id, order_number, created_at, clients(name)')
          .eq('status', 'orcamento')
          .lt('created_at', twoDaysAgo)
          .limit(5);

        pending?.forEach((o: any) => {
          const days = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 86400000);
          addNotification({
            id: `gabi_orc_${o.id}`,
            type: 'gabi',
            title: `Orçamento #${o.order_number || o.id} pendente`,
            description: `${o.clients?.name || 'Cliente'} aguarda há ${days} dias`,
            timestamp: new Date(o.created_at).getTime(),
            read: false,
          });
        });
      } catch { /* silent */ }
    };

    generateGabiAlerts();
  }, [addNotification]);

  // Subscribe to realtime order changes
  useEffect(() => {
    const channel = supabase
      .channel('notif_orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload: any) => {
        addNotification({
          id: `order_new_${payload.new.id}`,
          type: 'pedido',
          title: `Novo pedido #${payload.new.order_number || payload.new.id}`,
          description: 'Pedido criado com sucesso.',
          timestamp: Date.now(),
          read: false,
          actionUrl: '/pedidos',
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload: any) => {
        if (payload.new.status !== payload.old?.status) {
          const statusLabels: Record<string, string> = {
            orcamento: 'Orçamento',
            aprovado: 'Aprovado',
            producao: 'Em Produção',
            concluido: 'Concluído',
            cancelado: 'Cancelado',
            entregue: 'Entregue',
          };
          addNotification({
            id: `order_upd_${payload.new.id}_${payload.new.status}`,
            type: 'pedido',
            title: `Pedido #${payload.new.order_number || payload.new.id} atualizado`,
            description: `Status: ${statusLabels[payload.new.status] || payload.new.status}`,
            timestamp: Date.now(),
            read: false,
            actionUrl: '/pedidos',
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [addNotification]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const markAllRead = () => {
    setNotifications(prev => {
      const updated = prev.map(n => ({ ...n, read: true }));
      saveNotifications(updated);
      return updated;
    });
  };

  const clearAll = () => {
    setNotifications([]);
    saveNotifications([]);
  };

  const markRead = (id: string) => {
    setNotifications(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, read: true } : n);
      saveNotifications(updated);
      return updated;
    });
  };

  const filtered = activeFilter === 'todas'
    ? notifications
    : notifications.filter(n => n.type === activeFilter);

  const unreadCount = notifications.filter(n => !n.read).length;

  const typeConfig: Record<string, { icon: React.ReactNode; color: string }> = {
    gabi: { icon: <Bot className="h-4 w-4" />, color: '#a855f7' },
    whatsapp: { icon: <MessageCircle className="h-4 w-4" />, color: '#25d366' },
    pedido: { icon: <Package className="h-4 w-4" />, color: pc },
    sistema: { icon: <Sparkles className="h-4 w-4" />, color: '#06b6d4' },
  };

  const tabs: { key: FilterTab; label: string; emoji: string }[] = [
    { key: 'todas', label: 'Todas', emoji: '🔔' },
    { key: 'gabi', label: 'Gabi IA', emoji: '🤖' },
    { key: 'whatsapp', label: 'WhatsApp', emoji: '📲' },
    { key: 'pedido', label: 'Pedidos', emoji: '📦' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[70] transition-all duration-300 ${isOpen ? 'bg-black/50 backdrop-blur-sm pointer-events-auto' : 'bg-transparent pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed top-0 right-0 h-full z-[80] w-full sm:w-96 md:w-[420px] transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="h-full backdrop-blur-2xl bg-zinc-900/95 border-l border-white/10 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div
                className="h-9 w-9 rounded-xl flex items-center justify-center"
                style={{ background: `${pc}22`, border: `1px solid ${pc}44` }}
              >
                <Bell className="h-4.5 w-4.5" style={{ color: pc }} />
              </div>
              <div>
                <h2 className="text-white font-bold text-base">Central de Notificações</h2>
                <p className="text-zinc-500 text-xs">
                  {unreadCount > 0 ? `${unreadCount} não lida${unreadCount > 1 ? 's' : ''}` : 'Tudo em dia'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 hover:text-white transition-all"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-1 px-4 py-3 border-b border-white/5 overflow-x-auto no-scrollbar">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  activeFilter === tab.key
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                }`}
              >
                <span>{tab.emoji}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Actions bar */}
          {notifications.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
              <button onClick={markAllRead} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors">
                <CheckCheck className="h-3.5 w-3.5" /> Marcar todas como lidas
              </button>
              <button onClick={clearAll} className="text-xs text-zinc-500 hover:text-red-400 flex items-center gap-1 transition-colors">
                <Trash2 className="h-3.5 w-3.5" /> Limpar
              </button>
            </div>
          )}

          {/* Notifications List */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {filtered.length === 0 ? (
              <div className="text-center py-16">
                <Bell className="h-12 w-12 mx-auto mb-4 text-zinc-700" />
                <p className="text-zinc-500 font-medium">Nenhuma notificação</p>
                <p className="text-zinc-600 text-sm mt-1">Você será notificado sobre atualizações importantes.</p>
              </div>
            ) : (
              filtered.map(notif => {
                const config = typeConfig[notif.type] || typeConfig.sistema;
                return (
                  <div
                    key={notif.id}
                    onClick={() => markRead(notif.id)}
                    className={`relative rounded-xl p-4 transition-all duration-200 cursor-pointer ${
                      notif.read
                        ? 'bg-white/[0.02] hover:bg-white/[0.05]'
                        : 'bg-white/[0.05] hover:bg-white/[0.08]'
                    }`}
                    style={{ borderLeft: `3px solid ${config.color}` }}
                  >
                    {/* Unread dot */}
                    {!notif.read && (
                      <span
                        className="absolute top-3 right-3 h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: config.color, boxShadow: `0 0 8px ${config.color}66` }}
                      />
                    )}
                    <div className="flex items-start gap-3">
                      <span
                        className="mt-0.5 flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${config.color}15`, color: config.color }}
                      >
                        {config.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold leading-tight ${notif.read ? 'text-zinc-400' : 'text-white'}`}>
                          {notif.title}
                        </p>
                        <p className="text-zinc-500 text-xs mt-1 line-clamp-2">{notif.description}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Clock className="h-3 w-3 text-zinc-600" />
                          <span className="text-zinc-600 text-[11px]">{timeAgo(notif.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export { type Notification };
