import React, { useState, useEffect } from 'react';
import { ShoppingBag, Kanban, LayoutGrid, Plus, Search, Filter, Calendar, CheckCircle2, Clock, DollarSign, User, Package, FileText, ChevronRight, RefreshCw, Trash2, Edit3, ArrowUpRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { useProfile } from '@/contexts/ProfileContext';
import { PedidosKanban } from './PedidosKanban';
import { CreateOrderModal } from '@/components/orders/CreateOrderModal';
import { PaymentStatusModal } from '@/components/orders/PaymentStatusModal';
import { OrderDetailsModal } from '@/components/orders/OrderDetailsModal';
import { toast } from 'sonner';

interface OrderItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface Order {
  id: string;
  order_number?: number;
  client_id: string;
  status: string;
  payment_status: 'pending' | 'paid' | 'half_paid';
  payment_method?: string;
  total_amount: number;
  due_date?: string;
  notes?: string;
  created_at: string;
  client?: { name: string; phone?: string; company_name?: string };
  clients?: { name: string; phone?: string; company_name?: string };
  items?: OrderItem[];
  order_items?: OrderItem[];
}

export const Pedidos: React.FC = () => {
  const { settings } = useCompanySettings();
  const { isUnlocked } = useProfile();
  
  const [activeTab, setActiveTab] = useState<'cards' | 'kanban'>('cards');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPayment, setFilterPayment] = useState<string>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Modais de Status e Detalhes
  const [selectedOrderForStatus, setSelectedOrderForStatus] = useState<Order | null>(null);
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<Order | null>(null);

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel('realtime-orders-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id, client_id, status, payment_status, payment_method, total_amount, due_date, notes, created_at,
          clients (name, phone, company_name)
        `)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select('*');

      if (itemsError) throw itemsError;

      const formatted: Order[] = (ordersData || []).map((o: any) => {
        const orderItems = itemsData?.filter(i => i.order_id === o.id) || [];
        return {
          ...o,
          client: o.clients,
          items: orderItems,
          order_items: orderItems
        };
      });

      setOrders(formatted);
    } catch (err) {
      console.error("Erro ao buscar lista de pedidos:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!confirm("Tem certeza que deseja excluir este pedido?")) return;

    try {
      const { error } = await supabase.from('orders').delete().eq('id', orderId);
      if (error) throw error;
      toast.success("Pedido excluído com sucesso!");
      fetchOrders();
      if (selectedOrderForDetails?.id === orderId) {
        setSelectedOrderForDetails(null);
      }
    } catch (err) {
      console.error("Erro ao excluir pedido:", err);
      toast.error("Erro ao excluir pedido.");
    }
  };

  const filteredOrders = orders.filter(o => {
    const matchesSearch = 
      o.client?.name?.toLowerCase().includes(search.toLowerCase()) ||
      o.id.toLowerCase().includes(search.toLowerCase()) ||
      o.notes?.toLowerCase().includes(search.toLowerCase());

    if (filterPayment === 'all') return matchesSearch;
    return matchesSearch && o.payment_status === filterPayment;
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Abas */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <ShoppingBag className="h-6 w-6 text-purple-400" /> Gestão de Pedidos
          </h2>
          <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1">
            Acompanhe orçamentos fechados, baixa de pagamentos e a esteira de produção.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Seletor de Visão (Cards DIRECT AI vs Fila Kanban) */}
          <div className="p-1 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center gap-1 shadow-inner">
            <button
              onClick={() => setActiveTab('cards')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'cards'
                  ? 'bg-white dark:bg-purple-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Visão em Cards
            </button>
            <button
              onClick={() => setActiveTab('kanban')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'kanban'
                  ? 'bg-white dark:bg-purple-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Kanban className="h-3.5 w-3.5" /> Fila Kanban
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 rounded-2xl text-xs font-bold text-white shadow-lg shadow-purple-500/25 hover:opacity-90 transition-all flex items-center gap-2"
            style={{ backgroundColor: settings.primaryColor }}
          >
            <Plus className="h-4 w-4" /> Novo Pedido
          </button>
        </div>
      </div>

      {/* Conteúdo da Aba 1: Cards DIRECT AI */}
      {activeTab === 'cards' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          
          {/* Filtros e Busca */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-3xl glass-panel border border-slate-200 dark:border-white/10">
            <div className="relative w-full sm:w-80">
              <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por cliente, peça ou notas..."
                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl pl-10 pr-4 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
              <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">Pagamento:</span>
              {[
                { id: 'all', label: 'Todos' },
                { id: 'pending', label: 'Pendentes' },
                { id: 'half_paid', label: 'Sinal 50%' },
                { id: 'paid', label: 'Pago (100%)' },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilterPayment(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    filterPayment === f.id
                      ? 'bg-purple-500/20 text-purple-400 border-purple-500/40 shadow-sm'
                      : 'border-slate-200 dark:border-white/5 text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/5'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Grid de Cards de Pedidos */}
          {loading ? (
            <div className="flex items-center justify-center p-12 text-slate-500">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-12 text-center glass-panel rounded-3xl border border-slate-200 dark:border-white/10">
              <Package className="h-10 w-10 mx-auto text-slate-400 mb-3" />
              <p className="text-sm font-bold text-slate-700 dark:text-zinc-300">Nenhum pedido encontrado.</p>
              <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">Crie um novo pedido na Calculadora ou no botão acima.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredOrders.map(order => {
                const isPaid = order.payment_status === 'paid';
                const isHalf = order.payment_status === 'half_paid';

                return (
                  <div
                    key={order.id}
                    onClick={() => setSelectedOrderForDetails(order)}
                    className="glass-panel p-5 rounded-3xl border border-slate-200 dark:border-white/10 hover:border-purple-500/50 transition-all shadow-md hover:shadow-xl flex flex-col justify-between space-y-4 group cursor-pointer"
                  >
                    {/* Cabeçalho do Card */}
                    <div className="flex items-start justify-between border-b border-slate-200 dark:border-white/10 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">
                            PEDIDO #{order.id.slice(0, 6)}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-zinc-500">
                            • {new Date(order.created_at).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                        <h3 className="text-sm font-black text-slate-900 dark:text-white mt-0.5 flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-purple-400" />
                          {order.client?.name || 'Cliente Geral'}
                        </h3>
                      </div>

                      {/* Status de Pagamento Interativo (Abre Modal de Status) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedOrderForStatus(order);
                        }}
                        title="Clique para gerenciar o pagamento"
                        className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all flex items-center gap-1.5 ${
                          isPaid
                            ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40 hover:bg-emerald-500/30'
                            : isHalf
                            ? 'bg-blue-500/20 text-blue-400 border-blue-500/40 hover:bg-blue-500/30'
                            : 'bg-amber-500/20 text-amber-500 border-amber-500/40 hover:bg-amber-500/30'
                        }`}
                      >
                        {isPaid ? (
                          <>
                            <CheckCircle2 className="h-3 w-3" /> PAGO (100%)
                          </>
                        ) : isHalf ? (
                          <>
                            <Clock className="h-3 w-3" /> SINAL (50%)
                          </>
                        ) : (
                          <>
                            <Clock className="h-3 w-3" /> PENDENTE
                          </>
                        )}
                      </button>
                    </div>

                    {/* Itens do Pedido */}
                    <div className="space-y-2 flex-1">
                      <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
                        Peças / Matrizes:
                      </p>
                      {order.items && order.items.length > 0 ? (
                        <div className="space-y-1.5 max-h-28 overflow-y-auto custom-scrollbar">
                          {order.items.map(item => (
                            <div key={item.id} className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-800 dark:text-zinc-200 truncate max-w-[180px]">
                                {item.description}
                              </span>
                              <span className="font-mono text-[11px] font-bold text-slate-500 dark:text-zinc-400">
                                {item.quantity}x
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs italic text-slate-400 dark:text-zinc-500">{order.notes || 'Sem itens individuais descritos.'}</p>
                      )}
                    </div>

                    {/* Rodapé com Valor Total e Ações */}
                    <div className="pt-3 border-t border-slate-200 dark:border-white/10 flex items-center justify-between">
                      <div>
                        {isUnlocked ? (
                          <>
                            <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest block">Total</span>
                            <span className="text-base font-black text-slate-900 dark:text-white" style={{ color: settings.primaryColor }}>
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total_amount || 0)}
                            </span>
                          </>
                        ) : (
                          <span className="text-[11px] font-bold text-slate-400 dark:text-zinc-500">Valores Ocultos</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteOrder(order.id);
                          }}
                          className="p-2 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Excluir Pedido"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}

      {/* Conteúdo da Aba 2: Fila Kanban Operacional */}
      {activeTab === 'kanban' && (
        <div className="animate-in fade-in duration-200">
          <PedidosKanban />
        </div>
      )}

      {/* Modal de Criação de Pedido */}
      <CreateOrderModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onOrderCreated={fetchOrders}
      />

      {/* Modal de Status do Pagamento */}
      <PaymentStatusModal
        isOpen={!!selectedOrderForStatus}
        onClose={() => setSelectedOrderForStatus(null)}
        order={selectedOrderForStatus}
        onStatusUpdated={fetchOrders}
      />

      {/* Modal de Detalhes da Ordem de Serviço / Gerador de PDF */}
      <OrderDetailsModal
        isOpen={!!selectedOrderForDetails}
        onClose={() => setSelectedOrderForDetails(null)}
        order={selectedOrderForDetails}
        onDelete={handleDeleteOrder}
      />
    </div>
  );
};
