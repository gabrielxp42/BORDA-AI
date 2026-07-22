import React, { useState, useEffect } from 'react';
import { ShoppingBag, Play, Package, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/contexts/ProfileContext';

interface OrderItem {
  id: string;
  description: string;
  quantity: number;
}

interface KanbanOrder {
  id: string;
  client_id: string;
  status: string;
  total_amount: number;
  notes: string;
  created_at: string;
  client: { name: string };
  items: OrderItem[];
}

const columns = [
  { id: 'pending', title: 'Aguardando', color: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10' },
  { id: 'production', title: 'Em Preparação', color: 'border-purple-500/30 text-purple-400 bg-purple-500/10' },
  { id: 'embroidering', title: 'Bordando na Máquina', color: 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10' },
  { id: 'completed', title: 'Concluído', color: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' },
];

export const PedidosKanban: React.FC = () => {
  const [orders, setOrders] = useState<KanbanOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const { isUnlocked } = useProfile();

  useEffect(() => {
    fetchOrders();
    
    // Subscribe to realtime changes on orders
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchOrders = async () => {
    try {
      // Busca ordens com clientes
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id, client_id, status, total_amount, notes, created_at,
          clients (name)
        `)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      // Busca itens de ordem
      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select('id, order_id, description, quantity');

      if (itemsError) throw itemsError;

      // Monta estrutura final
      const formattedOrders: KanbanOrder[] = (ordersData || []).map((o: any) => ({
        ...o,
        client: o.clients,
        items: itemsData?.filter(i => i.order_id === o.id) || []
      }));

      setOrders(formattedOrders);
    } catch (error) {
      console.error("Erro ao buscar pedidos do Kanban:", error);
    } finally {
      setLoading(false);
    }
  };

  const moveOrder = async (orderId: string, newStatus: string) => {
    // Atualização Otimista
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));

    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;
    } catch (err) {
      console.error("Erro ao mover pedido:", err);
      fetchOrders(); // reverte em caso de erro
    }
  };

  // Funções Drag and Drop
  const handleDragStart = (e: React.DragEvent, orderId: string) => {
    e.dataTransfer.setData('orderId', orderId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const orderId = e.dataTransfer.getData('orderId');
    if (orderId) {
      moveOrder(orderId, newStatus);
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
          <ShoppingBag className="h-6 w-6 text-purple-400" /> Fila de Produção (Kanban)
        </h2>
        <p className="text-xs text-zinc-400 mt-1">
          Acompanhe o andamento dos pedidos de bordado. Arraste os cards para atualizar o status.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1 pb-6">
        {columns.map((col) => {
          const colOrders = orders.filter((o) => o.status === col.id);
          return (
            <div 
              key={col.id} 
              className="glass-panel p-4 rounded-3xl space-y-3 flex flex-col min-h-[500px]"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col.id)}
            >
              <div className={`p-2.5 rounded-2xl border text-xs font-black uppercase tracking-wider flex items-center justify-between ${col.color}`}>
                <span>{col.title}</span>
                <span className="h-5 w-5 rounded-full bg-white/10 flex items-center justify-center text-[10px]">
                  {colOrders.length}
                </span>
              </div>

              <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pt-1 pb-4 pr-1">
                {loading ? (
                  <div className="h-32 flex items-center justify-center text-zinc-500 text-xs font-medium">Carregando...</div>
                ) : colOrders.length === 0 ? (
                  <div className="h-32 flex items-center justify-center text-zinc-600 text-xs font-medium italic border border-dashed border-white/5 rounded-2xl">
                    Vazio
                  </div>
                ) : (
                  colOrders.map((ord) => (
                    <div 
                      key={ord.id} 
                      draggable
                      onDragStart={(e) => handleDragStart(e, ord.id)}
                      className="glass-card p-4 rounded-2xl space-y-3 relative group border border-white/5 cursor-grab active:cursor-grabbing hover:border-purple-500/30 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <span className="text-[10px] font-black uppercase text-purple-300">
                          {new Date(ord.created_at).toLocaleDateString()}
                        </span>
                        
                        {isUnlocked ? (
                          <span className="text-xs font-black text-emerald-400">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ord.total_amount || 0)}
                          </span>
                        ) : (
                          <span title="Valor Oculto">
                            <Lock className="h-3 w-3 text-zinc-600" />
                          </span>
                        )}
                      </div>

                      <div>
                        <h4 className="text-xs font-bold text-white truncate" title={ord.client?.name}>
                          {ord.client?.name || 'Cliente Desconhecido'}
                        </h4>
                      </div>

                      {/* Lista curta de itens (o que tem na sacola) */}
                      {ord.items && ord.items.length > 0 && (
                        <div className="bg-black/20 p-2 rounded-xl space-y-1">
                          {ord.items.slice(0, 3).map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-[10px] text-zinc-400">
                              <Package className="h-3 w-3 text-zinc-500" />
                              <span className="font-bold text-zinc-300">{item.quantity}x</span>
                              <span className="truncate">{item.description}</span>
                            </div>
                          ))}
                          {ord.items.length > 3 && (
                            <div className="text-[9px] text-zinc-500 italic pl-5">
                              + {ord.items.length - 3} outros itens
                            </div>
                          )}
                        </div>
                      )}

                      {ord.notes && (
                        <p className="text-[10px] text-zinc-500 italic border-l-2 border-white/10 pl-2">
                          {ord.notes}
                        </p>
                      )}

                      <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                        <button
                          onClick={() => {
                            const nextStatusMap: Record<string, string> = {
                              pending: 'production',
                              production: 'embroidering',
                              embroidering: 'completed',
                              completed: 'pending',
                            };
                            moveOrder(ord.id, nextStatusMap[ord.status]);
                          }}
                          className="text-[10px] font-bold text-purple-400 hover:text-purple-300 flex items-center gap-1 sm:hidden md:flex lg:flex"
                        >
                          <Play className="h-3 w-3" /> {ord.status === 'completed' ? 'Reiniciar' : 'Avançar'}
                        </button>
                        <div className="text-[9px] text-zinc-600 hidden lg:block">Arraste para mover</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
