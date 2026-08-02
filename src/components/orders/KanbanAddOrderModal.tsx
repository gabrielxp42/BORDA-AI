import React, { useState, useEffect } from 'react';
import { Search, Plus, Package, Check, X, ArrowRight, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { toast } from 'sonner';

interface KanbanAddOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetColumnId: string;
  targetColumnTitle: string;
  onOrderAssigned: (orderId: string, targetColumnId: string) => void;
  onOpenQuickOrder?: (columnId: string) => void;
}

export const KanbanAddOrderModal: React.FC<KanbanAddOrderModalProps> = ({
  isOpen,
  onClose,
  targetColumnId,
  targetColumnTitle,
  onOrderAssigned,
  onOpenQuickOrder
}) => {
  const { settings } = useCompanySettings();
  const pc = settings.primaryColor || '#8B5CF6';
  
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [availableOrders, setAvailableOrders] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      fetchAvailableOrders();
      setSearchTerm('');
    }
  }, [isOpen]);

  const fetchAvailableOrders = async () => {
    setLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;

      if (!userId) return;

      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, order_number, status, total_amount, payment_status, created_at, due_date, notes,
          clients (name, phone, company_name)
        `)
        .eq('user_id', userId)
        .neq('status', targetColumnId)
        .neq('status', 'completed')
        .neq('status', 'delivered')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setAvailableOrders(data || []);
    } catch (err) {
      console.error("Erro ao carregar pedidos para o Kanban:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = availableOrders.filter(o => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const clientName = o.clients?.name?.toLowerCase() || '';
    const company = o.clients?.company_name?.toLowerCase() || '';
    const orderNum = String(o.order_number || '');
    return clientName.includes(term) || company.includes(term) || orderNum.includes(term);
  });

  const handleSelectOrder = (orderId: string) => {
    onOrderAssigned(orderId, targetColumnId);
    toast.success(`Pedido movido para a etapa: ${targetColumnTitle}`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-3xl p-6 shadow-2xl overflow-hidden text-white space-y-5">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-wide text-white">Adicionar Pedido ao Kanban</h3>
              <p className="text-xs text-zinc-400">
                Etapa de destino: <span className="font-bold text-purple-400">{targetColumnTitle}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Action: Create New vs Link Existing */}
        <div className="grid grid-cols-1 gap-3">
          {onOpenQuickOrder && (
            <button
              onClick={() => {
                onClose();
                onOpenQuickOrder(targetColumnId);
              }}
              className="w-full flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-purple-600/30 to-indigo-600/30 border border-purple-500/40 hover:border-purple-400 transition-all text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300">
                  <Zap className="h-5 w-5 fill-purple-400/20" />
                </div>
                <div>
                  <div className="text-xs font-black text-white group-hover:text-purple-200">Criar Novo Pedido Rápido</div>
                  <div className="text-[11px] text-purple-300/80">Inserir direto na coluna {targetColumnTitle}</div>
                </div>
              </div>
              <Plus className="h-5 w-5 text-purple-300 group-hover:scale-110 transition-transform" />
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 my-2">
          <div className="h-[1px] flex-1 bg-white/10" />
          <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">ou selecione pedido em andamento</span>
          <div className="h-[1px] flex-1 bg-white/10" />
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por cliente, pedido #..."
            className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-2xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/50"
          />
        </div>

        {/* List of orders */}
        <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
          {loading ? (
            <div className="py-8 text-center text-xs text-zinc-500">Carregando pedidos...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500">
              Nenhum pedido pendente encontrado para vincular.
            </div>
          ) : (
            filteredOrders.map((ord) => (
              <div
                key={ord.id}
                onClick={() => handleSelectOrder(ord.id)}
                className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/5 hover:bg-white/10 hover:border-purple-500/30 cursor-pointer transition-all group"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-white">#{ord.order_number || ord.id.slice(0, 4)}</span>
                    <span className="text-xs font-bold text-zinc-300">{ord.clients?.name || 'Cliente Geral'}</span>
                  </div>
                  <div className="text-[10px] text-zinc-400 flex items-center gap-3">
                    <span>Status atual: <strong className="uppercase text-purple-400">{ord.status}</strong></span>
                    <span>Total: <strong className="text-emerald-400">R$ {ord.total_amount?.toFixed(2)}</strong></span>
                  </div>
                </div>

                <div className="p-2 rounded-xl bg-white/5 group-hover:bg-purple-600 text-zinc-400 group-hover:text-white transition-colors">
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
};
