import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { 
  X, 
  User, 
  Building, 
  Phone, 
  Mail, 
  MapPin, 
  DollarSign, 
  ShoppingBag, 
  CheckCircle2, 
  AlertCircle, 
  Send, 
  Calendar, 
  FileText, 
  Sparkles,
  LayoutDashboard,
  Receipt,
  History,
  Trash2,
  Download
} from 'lucide-react';
import { Client } from '@/types/borda';
import { supabase } from '@/integrations/supabase/client';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { useProfile } from '@/contexts/ProfileContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface ClientDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
  onDeleteClient?: (id: string, name: string) => void;
}

export const ClientDetailsModal: React.FC<ClientDetailsModalProps> = ({
  isOpen,
  onClose,
  client,
  onDeleteClient
}) => {
  const { settings } = useCompanySettings();
  const { isUnlocked } = useProfile();
  const pc = settings.primaryColor;

  const [activeTab, setActiveTab] = useState<'overview' | 'pending' | 'history'>('overview');
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen && client) {
      fetchClientOrders();
      setSelectedOrderIds([]);
      setActiveTab('overview');
    }
  }, [isOpen, client]);

  const fetchClientOrders = async () => {
    if (!client) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          status,
          payment_status,
          payment_method,
          total_amount,
          due_date,
          notes,
          created_at,
          order_items (id, description, quantity, unit_price, total_price)
        `)
        .eq('client_id', client.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (err: any) {
      console.error('Erro ao carregar pedidos do cliente:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !client) return null;

  // Separação de pedidos abertos e concluídos
  const openOrders = orders.filter(o => o.payment_status !== 'paid');
  const completedOrders = orders.filter(o => o.payment_status === 'paid');

  const totalPago = completedOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
  const totalPendente = openOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);

  const toggleSelectOrder = (id: string) => {
    setSelectedOrderIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedOrderIds.length === openOrders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(openOrders.map(o => o.id));
    }
  };

  const selectedOrders = openOrders.filter(o => selectedOrderIds.includes(o.id));
  const selectedTotal = selectedOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);

  // Cobrança WhatsApp
  const handleCobrarWhatsApp = () => {
    if (!client.phone) {
      toast.error('Este cliente não possui WhatsApp cadastrado.');
      return;
    }

    const ordersToCharge = selectedOrders.length > 0 ? selectedOrders : openOrders;
    if (ordersToCharge.length === 0) {
      toast.info('Nenhum pedido pendente para cobrança.');
      return;
    }

    const itemsText = ordersToCharge.map(o => 
      `• *Pedido #${o.id.slice(0, 6)}*: R$ ${Number(o.total_amount || 0).toFixed(2)} (${o.payment_status === 'half_paid' ? 'Sinal 50%' : 'Pendente'})`
    ).join('\n');

    const totalCobrar = ordersToCharge.reduce((sum, o) => sum + (o.total_amount || 0), 0);

    const message = `*Ficha de Cobrança - ${settings.systemName}*\n\n` +
      `Olá *${client.name}*, tudo bem?\n` +
      `Segue a relação de pedidos pendentes na oficina:\n\n` +
      `${itemsText}\n\n` +
      `*Valor Total em Aberto:* R$ ${totalCobrar.toFixed(2)}\n\n` +
      `Ficamos no aguardo da confirmação do pagamento! Obrigado.`;

    window.open(`https://wa.me/${client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-3xl flex flex-col rounded-none sm:rounded-[32px] border-0 sm:border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f0f16] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header com Avatar do Cliente */}
        <div className="p-6 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 relative shrink-0">
          <button 
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-full bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-700 dark:text-zinc-300 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-4">
            <div 
              className="h-16 w-16 rounded-3xl flex items-center justify-center font-black text-2xl border shadow-md shrink-0"
              style={{ backgroundColor: `${pc}15`, borderColor: `${pc}30`, color: pc }}
            >
              {client.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 pr-8">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white truncate">
                {client.name}
              </h2>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-zinc-400 mt-0.5">
                <Building className="h-3.5 w-3.5" style={{ color: pc }} />
                <span className="truncate">{client.company_name || 'Cliente Particular'}</span>
              </div>
            </div>
          </div>

          {/* Navegação por Abas CRM */}
          <div className="grid grid-cols-3 gap-2 bg-slate-200/60 dark:bg-black/40 p-1.5 rounded-2xl border border-slate-300 dark:border-white/10 mt-6">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                activeTab === 'overview'
                  ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-md'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200'
              }`}
              style={activeTab === 'overview' ? { color: pc } : undefined}
            >
              <LayoutDashboard className="h-4 w-4" /> Resumo CRM
            </button>

            <button
              onClick={() => setActiveTab('pending')}
              className={`py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all relative ${
                activeTab === 'pending'
                  ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-md'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200'
              }`}
              style={activeTab === 'pending' ? { color: pc } : undefined}
            >
              <Receipt className="h-4 w-4" /> Pendências
              {openOrders.length > 0 && (
                <span className="h-4 w-4 rounded-full bg-amber-500 text-black text-[9px] font-black flex items-center justify-center">
                  {openOrders.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                activeTab === 'history'
                  ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-md'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200'
              }`}
              style={activeTab === 'history' ? { color: pc } : undefined}
            >
              <History className="h-4 w-4" /> Histórico ({orders.length})
            </button>
          </div>
        </div>

        {/* Corpo Scrollável do Modal */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar touch-pan-y">
          
          {/* TAB 1: RESUMO & CRM */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Métricas Financeiras (Apenas Chefe) */}
              {isUnlocked ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-5 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Total Quitado</span>
                    <h3 className="text-2xl font-black text-emerald-700 dark:text-emerald-300">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPago)}
                    </h3>
                    <p className="text-[10px] font-bold text-emerald-600/70 dark:text-emerald-400/70">{completedOrders.length} pedido(s) pagos</p>
                  </div>

                  <div className="p-5 rounded-3xl bg-amber-500/10 border border-amber-500/20 space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">Em Aberto</span>
                    <h3 className="text-2xl font-black text-amber-700 dark:text-amber-300">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPendente)}
                    </h3>
                    <p className="text-[10px] font-bold text-amber-600/70 dark:text-amber-400/70">{openOrders.length} pedido(s) pendentes</p>
                  </div>
                </div>
              ) : (
                <div className="p-5 rounded-3xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">Total de Pedidos do Cliente</span>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                      📦 {orders.length} Ordem(ns) Registradas
                    </h3>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                    🟢 Ficha Ativa
                  </span>
                </div>
              )}

              {/* Contatos & Cadastro */}
              <div className="p-5 rounded-3xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-2">
                  <User className="h-4 w-4" style={{ color: pc }} /> Informações de Contato
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  {client.phone && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase">Telefone / WhatsApp</span>
                      <p className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span>📞</span> {client.phone}
                      </p>
                    </div>
                  )}

                  {client.email && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase">E-mail</span>
                      <p className="font-bold text-slate-900 dark:text-white truncate">
                        ✉️ {client.email}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Memória AI & Especificações de Bordado */}
              {client.notes && (
                <div className="p-5 rounded-3xl bg-purple-500/10 border border-purple-500/20 space-y-2 relative overflow-hidden">
                  <div className="flex items-center gap-2 text-purple-400">
                    <Sparkles className="h-4 w-4 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Preferências & Memória do Bordado</span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-zinc-200 italic font-medium leading-relaxed">
                    "{client.notes}"
                  </p>
                </div>
              )}

              {/* Ações de Rodapé */}
              <div className="flex items-center gap-3 pt-2">
                {client.phone && (
                  <button
                    type="button"
                    onClick={() => window.open(`https://wa.me/${client.phone?.replace(/\D/g, '')}`, '_blank')}
                    className="flex-1 py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95"
                  >
                    <Send className="h-4 w-4" />
                    <span>Chamar no WhatsApp</span>
                  </button>
                )}

                {isUnlocked && onDeleteClient && (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteClient(client.id, client.name);
                      onClose();
                    }}
                    className="p-3.5 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 transition-colors"
                    title="Excluir Cliente"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

            </div>
          )}

          {/* TAB 2: PENDÊNCIAS & COBRANÇA */}
          {activeTab === 'pending' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                  Pedidos em Aberto ({openOrders.length})
                </span>
                {openOrders.length > 0 && (
                  <button
                    onClick={toggleSelectAll}
                    className="text-[11px] font-bold text-purple-400 hover:underline"
                  >
                    {selectedOrderIds.length === openOrders.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                  </button>
                )}
              </div>

              {openOrders.length === 0 ? (
                <div className="p-12 text-center space-y-3 rounded-3xl border-2 border-dashed border-slate-200 dark:border-white/10">
                  <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">Tudo quitado!</h4>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">Este cliente não possui nenhuma nota ou pedido pendente no momento.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {openOrders.map(order => {
                    const isSelected = selectedOrderIds.includes(order.id);
                    return (
                      <div
                        key={order.id}
                        onClick={() => toggleSelectOrder(order.id)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-purple-500/10 border-purple-500/50 shadow-md'
                            : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="h-4 w-4 rounded accent-purple-500"
                          />
                          <div>
                            <h4 className="text-xs font-black text-slate-900 dark:text-white">
                              PEDIDO #{order.id.slice(0, 6)}
                            </h4>
                            <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-semibold">
                              Criado em {format(new Date(order.created_at), 'dd/MM/yyyy')}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          {isUnlocked ? (
                            <span className="text-xs font-black text-slate-900 dark:text-white block">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total_amount || 0)}
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-emerald-400 block">
                              🟢 Em Fila
                            </span>
                          )}
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                            order.payment_status === 'half_paid' ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'
                          }`}>
                            {order.payment_status === 'half_paid' ? 'Sinal 50%' : 'Pendente'}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Barra Flutuante de Cobrança WhatsApp */}
                  <div className="pt-3">
                    <button
                      type="button"
                      onClick={handleCobrarWhatsApp}
                      className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-110 text-white font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl active:scale-98 transition-all"
                    >
                      <Send className="h-4 w-4" />
                      <span>
                        {selectedOrderIds.length > 0 
                          ? `Cobrar (${selectedOrderIds.length}) Selecionado(s) - ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedTotal)} via WhatsApp` 
                          : `Cobrar Todos os Pendentes (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPendente)}) via WhatsApp`}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: HISTÓRICO COMPLETO */}
          {activeTab === 'history' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Histórico de Ordens ({orders.length})
              </span>

              {orders.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-zinc-400 italic text-center py-8">Nenhum pedido registrado para este cliente.</p>
              ) : (
                <div className="space-y-2.5">
                  {orders.map(order => (
                    <div
                      key={order.id}
                      className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white block">
                          PEDIDO #{order.id.slice(0, 6)}
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-zinc-400">
                          {format(new Date(order.created_at), 'dd/MM/yyyy HH:mm')}
                        </span>
                      </div>

                      <div className="text-right">
                        {isUnlocked && (
                          <span className="font-black text-slate-900 dark:text-white block">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total_amount || 0)}
                          </span>
                        )}
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                          order.payment_status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' :
                          order.payment_status === 'half_paid' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-amber-500/20 text-amber-400'
                        }`}>
                          {order.payment_status === 'paid' ? 'Pago' : order.payment_status === 'half_paid' ? 'Sinal' : 'Pendente'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};
