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
  Check,
  ArrowRight,
  Pencil
} from 'lucide-react';
import { Client } from '@/types/borda';
import { supabase } from '@/integrations/supabase/client';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { useProfile } from '@/contexts/ProfileContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { formatCurrency } from '@/utils/currencyFormatter';
import { printClientStatementPDF } from '@/services/pdfGenerator';
import { WhatsAppBillingModal } from '@/components/billing/WhatsAppBillingModal';

interface ClientDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
  onDeleteClient?: (id: string, name: string) => void;
  onEditClient?: (client: Client) => void;
}

export const ClientDetailsModal: React.FC<ClientDetailsModalProps> = ({
  isOpen,
  onClose,
  client,
  onDeleteClient,
  onEditClient
}) => {
  const { settings } = useCompanySettings();
  const { isUnlocked, permissions } = useProfile();
  const canSeeFinancials = isUnlocked || (permissions?.canSeeFinancials === true);
  const pc = settings.primaryColor;

  const [activeTab, setActiveTab] = useState<'overview' | 'pending' | 'history'>('overview');
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);

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
  const effectiveTotal = selectedOrderIds.length > 0 ? selectedTotal : totalPendente;


  // Impressão de Extrato Consolidado em PDF
  const handlePrintStatement = () => {
    const ordersToPrint = selectedOrders.length > 0 ? selectedOrders : openOrders;
    if (ordersToPrint.length === 0) {
      toast.info('Nenhum pedido pendente para imprimir extrato.');
      return;
    }

    const statementOrders = ordersToPrint.map(o => {
      const total = Number(o.total_amount || 0);
      const pending = o.payment_status === 'half_paid' ? total * 0.5 : total;
      return {
        id: o.id,
        orderNumber: o.order_number ? String(o.order_number) : o.id.slice(0, 6),
        createdAt: o.created_at,
        dueDate: o.due_date,
        totalAmount: total,
        paymentStatus: o.payment_status,
        pendingAmount: pending
      };
    });

    const grandPending = ordersToPrint.reduce((sum, o) => {
      const total = Number(o.total_amount || 0);
      return sum + (o.payment_status === 'half_paid' ? total * 0.5 : total);
    }, 0);

    printClientStatementPDF({
      clientName: client.name,
      clientPhone: client.phone,
      clientCompany: client.company_name,
      orders: statementOrders,
      grandPending,
      companyName: settings.systemName,
      companyColor: settings.primaryColor,
      pixKey: settings.pixKey
    });

    toast.success('🖨️ Extrato consolidado enviado para impressão!');
  };

  // Abrir Modal de Cobrança Inteligente WhatsApp
  const handleCobrarWhatsApp = () => {
    const ordersToCharge = selectedOrders.length > 0 ? selectedOrders : openOrders;
    if (ordersToCharge.length === 0) {
      toast.info('Nenhum pedido pendente para cobrança.');
      return;
    }
    setIsBillingModalOpen(true);
  };

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl flex flex-col rounded-3xl border border-white/10 bg-[#0d0d14] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header Elegante Minimalista */}
        <div className="p-5 sm:p-6 border-b border-white/10 bg-white/[0.02] relative shrink-0">
          <div className="absolute top-5 right-5 flex items-center gap-2">
            {onEditClient && (
              <button 
                onClick={() => onEditClient(client)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 font-bold text-xs transition-all active:scale-95"
                title="Editar informações do cliente"
              >
                <Pencil className="h-3.5 w-3.5" /> Editar Cadastro
              </button>
            )}
            <button 
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center font-black text-lg text-white shadow-lg shadow-purple-500/20 shrink-0">
              {client.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 pr-6">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight truncate">
                  {client.name}
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-medium text-zinc-400 shrink-0">
                  {client.company_name ? 'Empresa' : 'Particular'}
                </span>
              </div>
              <p className="text-xs text-zinc-400 truncate mt-0.5">
                {client.company_name || client.phone || 'Cliente Registrado'}
              </p>
            </div>
          </div>

          {/* Navegação por Abas Minimalista */}
          <div className="grid grid-cols-3 gap-1.5 bg-white/[0.04] p-1 rounded-2xl border border-white/10 mt-5">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                activeTab === 'overview'
                  ? 'bg-white/10 text-white shadow-sm font-bold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <LayoutDashboard className="h-3.5 w-3.5 text-purple-400" /> Resumo
            </button>

            <button
              onClick={() => setActiveTab('pending')}
              className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                activeTab === 'pending'
                  ? 'bg-white/10 text-white shadow-sm font-bold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Receipt className="h-3.5 w-3.5 text-amber-400" /> Pendências
              {openOrders.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                  {openOrders.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                activeTab === 'history'
                  ? 'bg-white/10 text-white shadow-sm font-bold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <History className="h-3.5 w-3.5 text-cyan-400" /> Histórico ({orders.length})
            </button>
          </div>
        </div>

        {/* Corpo Scrollável do Modal */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 max-h-[60vh] custom-scrollbar">
          
          {/* TAB 1: RESUMO & CRM */}
          {activeTab === 'overview' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              
              {/* Métricas Financeiras */}
              {canSeeFinancials ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                    <span className="text-[10px] font-bold uppercase text-emerald-400 tracking-wider">Total Quitado</span>
                    <h3 className="text-xl font-bold text-white">
                      {formatCurrency(totalPago, canSeeFinancials)}
                    </h3>
                    <p className="text-[10px] text-emerald-300/80">{completedOrders.length} pedido(s) pagos</p>
                  </div>

                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-1">
                    <span className="text-[10px] font-bold uppercase text-amber-400 tracking-wider">Em Aberto</span>
                    <h3 className="text-xl font-bold text-white">
                      {formatCurrency(totalPendente, canSeeFinancials)}
                    </h3>
                    <p className="text-[10px] text-amber-300/80">{openOrders.length} pedido(s) pendentes</p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-zinc-400">Total de Pedidos</span>
                    <h3 className="text-base font-bold text-white mt-0.5">
                      📦 {orders.length} Ordem(ns) Registradas
                    </h3>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium">
                    🟢 Ficha Ativa
                  </span>
                </div>
              )}

              {/* Informações de Contato */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <h4 className="text-xs font-bold text-zinc-300 flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-purple-400" /> Contato
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {client.phone && (
                    <div>
                      <span className="text-[10px] text-zinc-500 font-medium uppercase block">WhatsApp</span>
                      <p className="font-semibold text-white mt-0.5">{client.phone}</p>
                    </div>
                  )}

                  {client.email && (
                    <div>
                      <span className="text-[10px] text-zinc-500 font-medium uppercase block">E-mail</span>
                      <p className="font-semibold text-white mt-0.5 truncate">{client.email}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Memória & Observações */}
              {client.notes && (
                <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 space-y-1">
                  <div className="flex items-center gap-1.5 text-purple-400">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Notas de Bordado</span>
                  </div>
                  <p className="text-xs text-zinc-300 font-normal leading-relaxed">
                    "{client.notes}"
                  </p>
                </div>
              )}

              {/* Ações */}
              <div className="flex items-center gap-3 pt-1">
                {client.phone && (
                  <button
                    type="button"
                    onClick={() => window.open(`https://wa.me/${client.phone?.replace(/\D/g, '')}`, '_blank')}
                    className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Conversar no WhatsApp</span>
                  </button>
                )}

                {isUnlocked && onDeleteClient && (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteClient(client.id, client.name);
                      onClose();
                    }}
                    className="p-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-all"
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
            <div className="space-y-3.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-400">
                  Selecione os pedidos para cobrança ({openOrders.length})
                </span>
                {openOrders.length > 0 && (
                  <button
                    onClick={toggleSelectAll}
                    className="text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    {selectedOrderIds.length === openOrders.length ? 'Desmarcar Todos' : 'Marcar Todos'}
                  </button>
                )}
              </div>

              {openOrders.length === 0 ? (
                <div className="p-10 text-center space-y-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.02]">
                  <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto opacity-80" />
                  <h4 className="text-sm font-bold text-white">Nenhuma pendência!</h4>
                  <p className="text-xs text-zinc-400">Todos os pedidos deste cliente estão devidamente quitados.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {openOrders.map(order => {
                    const isSelected = selectedOrderIds.includes(order.id);
                    return (
                      <div
                        key={order.id}
                        onClick={() => toggleSelectOrder(order.id)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-purple-500/10 border-purple-500/40 shadow-sm'
                            : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`h-5 w-5 rounded-lg border flex items-center justify-center transition-colors ${
                            isSelected ? 'bg-purple-600 border-purple-500 text-white' : 'border-white/20 bg-white/5'
                          }`}>
                            {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-white">
                              Pedido #{order.order_number || order.id.slice(0, 6)}
                            </h4>
                            <p className="text-[10px] text-zinc-400">
                              {format(new Date(order.created_at), 'dd/MM/yyyy')}
                            </p>
                          </div>
                        </div>

                        <div className="text-right flex items-center gap-3">
                          <div>
                            {canSeeFinancials ? (
                              <span className="text-xs font-bold text-white block">
                                {formatCurrency(order.total_amount || 0, canSeeFinancials)}
                              </span>
                            ) : (
                              <span className="text-xs font-medium text-emerald-400 block">
                                Em Fila
                              </span>
                            )}
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-semibold ${
                              order.payment_status === 'half_paid' 
                                ? 'bg-blue-500/15 text-blue-300 border border-blue-500/20' 
                                : 'bg-amber-500/15 text-amber-300 border border-amber-500/20'
                            }`}>
                              {order.payment_status === 'half_paid' ? 'Sinal 50%' : 'Pendente'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: HISTÓRICO COMPLETO */}
          {activeTab === 'history' && (
            <div className="space-y-3 animate-in fade-in duration-200">
              <span className="text-xs font-semibold text-zinc-400 block">
                Todas as ordens efetuadas ({orders.length})
              </span>

              {orders.length === 0 ? (
                <p className="text-xs text-zinc-500 italic text-center py-6">Nenhum pedido registrado.</p>
              ) : (
                <div className="space-y-2">
                  {orders.map(order => (
                    <div
                      key={order.id}
                      className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-white block">
                          Pedido #{order.order_number || order.id.slice(0, 6)}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          {format(new Date(order.created_at), 'dd/MM/yyyy HH:mm')}
                        </span>
                      </div>

                      <div className="text-right">
                        {canSeeFinancials && (
                          <span className="font-bold text-white block">
                            {formatCurrency(order.total_amount || 0, canSeeFinancials)}
                          </span>
                        )}
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-medium ${
                          order.payment_status === 'paid' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20' :
                          order.payment_status === 'half_paid' ? 'bg-blue-500/15 text-blue-300 border border-blue-500/20' :
                          'bg-amber-500/15 text-amber-300 border border-amber-500/20'
                        }`}>
                          {order.payment_status === 'paid' ? 'Pago' : order.payment_status === 'half_paid' ? 'Sinal 50%' : 'Pendente'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Rodapé Flutuante de Cobrança WhatsApp (Exibido na aba Pendências quando há itens) */}
        {activeTab === 'pending' && openOrders.length > 0 && (
          <div className="p-4 border-t border-white/10 bg-[#0d0d14]">
            <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl">
              <div className="text-center sm:text-left">
                <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider block">
                  {selectedOrderIds.length > 0 ? `${selectedOrderIds.length} selecionado(s)` : 'Todas as pendências'}
                </span>
                <span className="text-base font-bold text-white">
                  {formatCurrency(effectiveTotal, canSeeFinancials)}
                </span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handlePrintStatement}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold text-xs transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Gerar Extrato PDF</span>
                </button>

                <button
                  type="button"
                  onClick={handleCobrarWhatsApp}
                  className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-95"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Cobrar via WhatsApp</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      <WhatsAppBillingModal
        isOpen={isBillingModalOpen}
        onClose={() => setIsBillingModalOpen(false)}
        clientData={{
          id: client.id,
          name: client.name,
          phone: client.phone,
          totalAmount: effectiveTotal,
          orderCount: (selectedOrders.length > 0 ? selectedOrders : openOrders).length,
          orders: selectedOrders.length > 0 ? selectedOrders : openOrders
        }}
      />
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};
