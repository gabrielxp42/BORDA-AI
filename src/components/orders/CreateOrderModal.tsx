import React, { useState, useEffect } from 'react';
import { X, UserPlus, Calendar, Plus, Trash2, Package, Save, Lock, Layers, Sparkles, CheckCircle2, DollarSign, ChevronDown, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { DatePicker } from '../ui/DatePicker';
import { format } from 'date-fns';
import { useProfile } from '../../contexts/ProfileContext';
import { ClientSelect } from '../ui/ClientSelect';
import { Matrix } from '@/types/borda';
import { toast } from 'sonner';

interface InitialOrderData {
  clientId?: string;
  matrixName?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
}

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: InitialOrderData | null;
  onOrderCreated?: () => void;
}

interface OrderItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  matrixId?: string;
}

export const CreateOrderModal: React.FC<CreateOrderModalProps> = ({ 
  isOpen, 
  onClose, 
  initialData,
  onOrderCreated 
}) => {
  const [clientId, setClientId] = useState('');
  const { isUnlocked } = useProfile();
  
  const [dueDate, setDueDate] = useState<Date | null>(new Date());
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid' | 'half_paid'>('pending');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'credit_card' | 'cash' | 'transfer'>('pix');
  const [isPaymentMethodOpen, setIsPaymentMethodOpen] = useState(false);
  const [observations, setObservations] = useState('');
  const [items, setItems] = useState<OrderItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Lista de matrizes disponíveis
  const [availableMatrices, setAvailableMatrices] = useState<any[]>([]);
  const [loadingMatrices, setLoadingMatrices] = useState(false);
  const [showMatrixSelector, setShowMatrixSelector] = useState(false);

  // Preencher com dados iniciais se houver (ex: vindo da Calculadora)
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        if (initialData.clientId) setClientId(initialData.clientId);
        if (initialData.matrixName) {
          setItems([{
            id: crypto.randomUUID(),
            description: `Bordado: ${initialData.matrixName}`,
            quantity: initialData.quantity || 1,
            unitPrice: initialData.unitPrice || 0
          }]);
        }
      } else {
        // Reset padrao
        setItems([]);
        setObservations('');
        setPaymentStatus('pending');
      }
    }
  }, [isOpen, initialData]);

  // Buscar matrizes disponíveis
  useEffect(() => {
    if (isOpen) {
      fetchMatrices();
    }
  }, [isOpen, clientId]);

  const fetchMatrices = async () => {
    setLoadingMatrices(true);
    try {
      let query = supabase
        .from('matrices')
        .select('*')
        .order('created_at', { ascending: false });

      if (clientId) {
        query = query.eq('client_id', clientId);
      }

      const { data: matricesData, error: mError } = await query;
      if (mError) throw mError;

      if (!matricesData || matricesData.length === 0) {
        setAvailableMatrices([]);
        return;
      }

      // Buscar versões de matrizes de forma isolada e segura
      const matrixIds = matricesData.map(m => m.id);
      const { data: versionsData } = await supabase
        .from('matrix_versions')
        .select('*')
        .in('matrix_id', matrixIds);

      const combined = matricesData.map(m => {
        const ver = versionsData?.find(v => v.id === m.current_version_id || v.matrix_id === m.id);
        return {
          ...m,
          current_version: ver
        };
      });

      setAvailableMatrices(combined);
    } catch (err) {
      console.error("Erro ao buscar matrizes para o pedido:", err);
    } finally {
      setLoadingMatrices(false);
    }
  };

  if (!isOpen) return null;

  const handleAddItem = () => {
    setItems([
      ...items,
      { id: crypto.randomUUID(), description: '', quantity: 1, unitPrice: 0 }
    ]);
  };

  const handleSelectMatrix = (matrix: any) => {
    const version = matrix.current_version;
    const desc = `Matriz: ${matrix.name} ${version?.stitch_count ? `(${version.stitch_count.toLocaleString()} pts)` : ''}`;
    
    setItems(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        description: desc,
        quantity: 1,
        unitPrice: 0,
        matrixId: matrix.id
      }
    ]);
    setShowMatrixSelector(false);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handleItemChange = (id: string, field: keyof OrderItem, value: string | number) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const subtotal = items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);

  const handleSave = async () => {
    if (!clientId) {
      toast.error("Por favor, selecione um cliente.");
      return;
    }

    setIsSaving(true);
    try {
      // 1. Criar o Pedido
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          client_id: clientId,
          status: 'pending',
          payment_status: paymentStatus,
          payment_method: paymentMethod,
          due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
          total_amount: subtotal,
          notes: observations
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // 2. Criar os Itens se houver
      if (items.length > 0 && order) {
        const orderItems = items.map(item => ({
          order_id: order.id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total_price: item.quantity * item.unitPrice
        }));

        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(orderItems);

        if (itemsError) throw itemsError;
      }

      toast.success("Pedido criado com sucesso!");
      if (onOrderCreated) onOrderCreated();
      onClose();
    } catch (error) {
      console.error("Erro ao criar pedido:", error);
      toast.error("Erro ao criar pedido.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-[28px] border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d0d14] shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-purple-500/20 flex items-center justify-center border border-purple-500/30 text-purple-400">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-wider">Novo Pedido de Bordado</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">Registre uma nova ordem de serviço e conecte com as matrizes.</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          
          {/* Seção 1: Cliente e Prazo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-zinc-400 flex items-center gap-1.5">
                <UserPlus className="h-3.5 w-3.5 text-purple-400" /> Cliente {!clientId && <span className="text-red-500">*</span>}
              </label>
              <ClientSelect 
                value={clientId}
                onChange={setClientId}
                error={!clientId}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-zinc-400 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-purple-400" /> Prazo de Entrega
              </label>
              <DatePicker 
                value={dueDate}
                onChange={setDueDate}
              />
            </div>
          </div>

          {/* Seção 2: Status Financeiro & Pagamento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-2 block">
                Status do Pagamento
              </label>
              <div className="flex gap-2">
                {[
                  { id: 'pending', label: 'Pendente', color: 'bg-amber-500/20 text-amber-500 border-amber-500/40' },
                  { id: 'half_paid', label: 'Sinal 50%', color: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
                  { id: 'paid', label: 'Pago (100%)', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' },
                ].map(st => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setPaymentStatus(st.id as any)}
                    className={`flex-1 py-1.5 px-2 rounded-xl text-[11px] font-bold border transition-all ${
                      paymentStatus === st.id ? st.color + ' shadow-sm' : 'border-transparent text-slate-400 opacity-60 hover:opacity-100'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 block">
                Forma de Pagamento
              </label>
              
              {/* Botão Único Compacto */}
              <button
                type="button"
                onClick={() => setIsPaymentMethodOpen(!isPaymentMethodOpen)}
                className="w-full bg-slate-100 dark:bg-black/40 border border-slate-300 dark:border-white/10 hover:border-purple-500/50 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 dark:text-white flex items-center justify-between transition-all"
              >
                <span>
                  {[
                    { id: 'pix', label: '⚡ PIX Instantâneo' },
                    { id: 'credit_card', label: '💳 Cartão de Crédito' },
                    { id: 'cash', label: '💵 Dinheiro' },
                    { id: 'transfer', label: '🏦 Transferência Bancária' },
                  ].find(p => p.id === paymentMethod)?.label}
                </span>
                <ChevronDown className={`h-4 w-4 text-slate-400 dark:text-zinc-400 transition-transform duration-200 ${isPaymentMethodOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Animação Expandir */}
              {isPaymentMethodOpen && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-white dark:bg-[#12121a] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 p-1">
                  {[
                    { id: 'pix', label: '⚡ PIX Instantâneo' },
                    { id: 'credit_card', label: '💳 Cartão de Crédito' },
                    { id: 'cash', label: '💵 Dinheiro' },
                    { id: 'transfer', label: '🏦 Transferência Bancária' },
                  ].map(pm => (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => {
                        setPaymentMethod(pm.id as any);
                        setIsPaymentMethodOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs font-bold rounded-xl flex items-center justify-between transition-colors ${
                        paymentMethod === pm.id
                          ? 'bg-purple-500/10 text-purple-500 dark:text-purple-400'
                          : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <span>{pm.label}</span>
                      {paymentMethod === pm.id && <Check className="h-3.5 w-3.5 text-purple-500 dark:text-purple-400" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Seção 3: Seletor Discreto de Matrizes Salvas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-zinc-400 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-purple-400" /> Matrizes Salvas do Cliente ({availableMatrices.length})
              </label>
              <button
                type="button"
                onClick={() => setShowMatrixSelector(!showMatrixSelector)}
                className="text-[11px] font-bold text-purple-400 hover:text-purple-300 flex items-center gap-1"
              >
                {showMatrixSelector ? 'Ocultar Matrizes' : '+ Escolher da Lista'}
                <ChevronDown className={`h-3 w-3 transition-transform ${showMatrixSelector ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* Painel Compacto e Sleek de Matrizes */}
            {showMatrixSelector && (
              <div className="p-3 rounded-2xl bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 space-y-2 animate-in slide-in-from-top-2 duration-200">
                {loadingMatrices ? (
                  <p className="text-xs text-zinc-500 py-2 text-center">Buscando matrizes...</p>
                ) : availableMatrices.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-2 text-center">Nenhuma matriz encontrada para este cliente.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto custom-scrollbar p-1">
                    {availableMatrices.map(m => {
                      const ver = m.current_version;
                      return (
                        <div
                          key={m.id}
                          onClick={() => handleSelectMatrix(m)}
                          className="group p-2.5 rounded-xl border border-slate-200 dark:border-white/5 bg-white dark:bg-white/5 hover:border-purple-500/50 hover:bg-purple-500/10 cursor-pointer transition-all flex items-center justify-between"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-purple-400">
                              {m.name}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500 dark:text-zinc-400">
                              {ver?.stitch_count && <span>🪡 {ver.stitch_count.toLocaleString()} pts</span>}
                              {ver?.color_count && <span>🎨 {ver.color_count} cores</span>}
                              {ver?.file_format && <span className="uppercase font-mono text-purple-400">{ver.file_format}</span>}
                            </div>
                          </div>
                          <span className="p-1 rounded-lg bg-purple-500/20 text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Plus className="h-3.5 w-3.5" />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Seção 4: Itens do Pedido */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-2">
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Itens do Pedido</h3>
                <p className="text-[10px] text-slate-500 dark:text-zinc-400">Peças e matrizes que serão bordadas.</p>
              </div>
              <button 
                type="button"
                onClick={handleAddItem}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 text-xs font-bold transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar Item Manual
              </button>
            </div>

            {items.length === 0 ? (
              <div className="py-6 text-center border border-dashed border-slate-200 dark:border-white/10 rounded-2xl bg-slate-50 dark:bg-white/5">
                <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">Nenhum item adicionado ainda.</p>
                <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">Escolha uma matriz acima ou clique em adicionar item manual.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {items.map((item) => (
                  <div key={item.id} className="flex flex-col sm:flex-row gap-3 p-3.5 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
                    <div className="flex-1 min-w-[120px]">
                      <label className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase font-bold mb-1 block">Descrição / Peça</label>
                      <input 
                        type="text"
                        placeholder="Ex: Camisa Polo - Peito Esquerdo"
                        value={item.description}
                        onChange={e => handleItemChange(item.id, 'description', e.target.value)}
                        className="w-full bg-white dark:bg-black/40 border border-slate-300 dark:border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white font-medium outline-none focus:border-purple-500"
                      />
                    </div>
                    <div className="w-full sm:w-20">
                      <label className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase font-bold mb-1 block">Qtd</label>
                      <input 
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => handleItemChange(item.id, 'quantity', parseInt(e.target.value) || 0)}
                        className="w-full bg-white dark:bg-black/40 border border-slate-300 dark:border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white font-bold outline-none focus:border-purple-500"
                      />
                    </div>
                    
                    {isUnlocked && (
                      <div className="w-full sm:w-28">
                        <label className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase font-bold mb-1 block">Valor Unit. (R$)</label>
                        <input 
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={e => handleItemChange(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                          className="w-full bg-white dark:bg-black/40 border border-slate-300 dark:border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white font-bold outline-none focus:border-purple-500"
                        />
                      </div>
                    )}
                    
                    <div className="flex items-end pb-0.5">
                      <button 
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        className="p-2 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Remover Item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Seção 5: Observações */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-zinc-400 block">
              Observações Gerais
            </label>
            <textarea 
              rows={2}
              placeholder="Detalhes de entrega, cores de linha específicas..."
              value={observations}
              onChange={e => setObservations(e.target.value)}
              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-2xl px-4 py-2.5 text-xs text-slate-900 dark:text-white focus:border-purple-500 outline-none resize-none"
            />
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-left w-full sm:w-auto">
            {isUnlocked ? (
              <>
                <p className="text-[10px] text-slate-500 dark:text-zinc-500 font-bold uppercase tracking-widest">Valor Total do Pedido</p>
                <p className="text-xl font-black text-slate-900 dark:text-white">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal)}
                </p>
              </>
            ) : (
              <p className="text-[10px] text-slate-500 dark:text-zinc-500 font-bold uppercase tracking-widest flex items-center gap-2">
                <Lock className="h-3 w-3" /> Valores ocultos no Modo Produção
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button 
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-2xl text-xs font-bold text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              CANCELAR
            </button>
            <button 
              type="button"
              onClick={handleSave}
              disabled={isSaving || !clientId}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 text-white text-xs font-black tracking-wider uppercase hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 shadow-lg shadow-purple-500/25"
            >
              {isSaving ? (
                'SALVANDO...'
              ) : (
                <>
                  <Save className="h-4 w-4" /> SALVAR PEDIDO
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
