import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, FileText, Printer, Send, Trash2, Calendar, User, Package, DollarSign, Layers, CheckCircle2, AlertCircle, Download, Plus, Edit2 } from 'lucide-react';
import { printOrderReceipt } from '@/services/pdfGenerator';
import { sendEvolutionText, getWhatsAppWebLink, handleWhatsAppDispatchError } from '@/services/whatsappService';
import { useBackgroundTasks } from '@/hooks/useBackgroundTasks';
import { supabase } from '@/integrations/supabase/client';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { useProfile } from '@/contexts/ProfileContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { formatCurrency } from '@/utils/currencyFormatter';
import { parsePaymentMetadata, serializePaymentMetadata } from '@/utils/paymentHelper';
import { printThermalReceipt } from '@/services/thermalPrinter';

interface OrderDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any | null;
  onDelete?: (orderId: string) => void;
  onPriceOrder?: (order: any) => void;
  onEditOrder?: (order: any) => void;
}

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({
  isOpen,
  onClose,
  order,
  onDelete,
  onPriceOrder,
  onEditOrder
}) => {
  const { settings } = useCompanySettings();
  const { isUnlocked, permissions } = useProfile();

  const [matrixUrls, setMatrixUrls] = useState<Record<string, string>>({});
  const [matrixPreviews, setMatrixPreviews] = useState<Record<string, string>>({});
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // States para adicionar novo bordado ao pedido existente
  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemQty, setNewItemQty] = useState<number>(1);
  const [newItemPrice, setNewItemPrice] = useState<number>(0);
  const [isAddingItem, setIsAddingItem] = useState(false);

  // States para Edição Rápida (Híbrida)
  const [isQuickEditing, setIsQuickEditing] = useState(false);
  const [tempNotes, setTempNotes] = useState('');
  const [tempDueDate, setTempDueDate] = useState('');
  const [tempItems, setTempItems] = useState<any[]>([]);
  const [isSavingQuickEdit, setIsSavingQuickEdit] = useState(false);
  const [showPrintOptions, setShowPrintOptions] = useState(false);

  useEffect(() => {
    const fetchMatrixUrls = async () => {
      if (!order?.order_items) return;
      const urls: Record<string, string> = {};
      const previews: Record<string, string> = {};
      
      for (const item of order.order_items) {
        try {
          let fileUrl: string | null = null;
          let previewUrl: string | null = null;

          // 1. Try by matrix_id (preferred — new orders)
          if (item.matrix_id) {
            const { data } = await supabase
              .from('matrix_versions')
              .select('file_url, preview_url')
              .eq('matrix_id', item.matrix_id)
              .order('version_number', { ascending: false })
              .limit(1)
              .single();
            fileUrl = data?.file_url ?? null;
            previewUrl = data?.preview_url ?? null;
          }

          // 2. Fallback: extract name from description and look up by matrix name
          if (!fileUrl && item.description) {
            const nameMatch = item.description.match(/^(?:Bordado|Entrada):\s*(.+?)(?:\s*\(|$)/);
            if (nameMatch?.[1]) {
              const matrixName = nameMatch[1].trim();
              const { data: mx } = await supabase
                .from('matrices')
                .select('id')
                .ilike('name', `%${matrixName}%`)
                .limit(1)
                .single();
              if (mx?.id) {
                const { data: ver } = await supabase
                  .from('matrix_versions')
                  .select('file_url, preview_url')
                  .eq('matrix_id', mx.id)
                  .order('version_number', { ascending: false })
                  .limit(1)
                  .single();
                fileUrl = ver?.file_url ?? null;
                previewUrl = ver?.preview_url ?? null;
              }
            }
          }

          if (fileUrl) urls[item.id] = fileUrl;
          if (previewUrl) previews[item.id] = previewUrl;
        } catch (e) {
          // silently ignore
        }
      }
      setMatrixUrls(urls);
      setMatrixPreviews(previews);
    };

    if (isOpen) {
      fetchMatrixUrls();
    }
  }, [order, isOpen]);

  if (!isOpen || !order) return null;

  const { cleanNotes, metadata } = parsePaymentMetadata(order.notes);

  const getPrintData = () => {
    return {
      id: order.id,
      orderNumber: order.order_number || order.id.slice(0, 6),
      createdAt: order.created_at,
      dueDate: order.due_date,
      clientName: order.clients?.name || order.client?.name || 'Cliente',
      clientPhone: order.clients?.phone || order.client?.phone,
      clientCompany: order.clients?.company_name || order.client?.company_name,
      paymentStatus: order.payment_status || 'pending',
      paymentMethod: order.payment_method,
      totalAmount: order.total_amount || 0,
      notes: order.notes,
      items: (order.order_items || order.items || []).map((i: any) => ({
        description: i.description,
        quantity: i.quantity || 1,
        unitPrice: i.unit_price || 0,
        totalPrice: i.total_price || 0
      })),
      companyName: settings.systemName,
      companySubtitle: settings.systemSubtitle,
      companyLogo: settings.logoUrl,
      companyColor: settings.primaryColor,
      companyPhone: settings.phone || undefined,
      companyEmail: settings.email || undefined,
      companyAddress: settings.address || undefined,
      companyDocument: settings.document || undefined,
      pixKey: settings.pixKey || undefined,
      workingHours: settings.workingHours || undefined,
    };
  };

  const handlePrintPDF = () => {
    const data = getPrintData();
    printOrderReceipt(data);
  };

  const handlePrintThermal = () => {
    const data = getPrintData();
    printThermalReceipt(data, permissions?.canSeeFinancials ?? true);
  };

  const handleSendWhatsApp = async () => {
    const phone = order.clients?.phone;
    const clientName = order.clients?.name || 'Cliente';
    if (!phone) {
      toast.error("Este cliente não possui WhatsApp cadastrado.");
      return;
    }

    const { addTask, updateTask, updateStep } = useBackgroundTasks.getState();

    const itemsSummary = order.order_items?.map((it: any) => `- ${it.description} (${it.quantity}x)`).join('\n') || '';
    const text = `*Ficha do Pedido #${order.id.slice(0, 6)} - ${settings.systemName}* 🧵✨\n\n` +
      `Olá, *${clientName}*! Seguem os detalhes do seu pedido:\n\n` +
      `*Cliente:* ${clientName}\n` +
      `*Status:* ${order.payment_status === 'paid' ? 'Pago (100%)' : order.payment_status === 'half_paid' ? 'Sinal (50%)' : 'Pendente'}\n\n` +
      `*Itens:* \n${itemsSummary}\n\n` +
      `*Valor Total:* R$ ${Number(order.total_amount || 0).toFixed(2)}`;

    const taskId = addTask({
      title: `Ficha Pedido #${order.id.slice(0, 4)}`,
      description: `Enviando para ${clientName}...`,
      status: 'processing',
      progress: 25,
      steps: [
        { id: 'prep', label: 'Gerando Resumo', status: 'completed' },
        { id: 'send', label: 'Conectando Evolution API', status: 'loading' },
        { id: 'done', label: 'Envio WhatsApp', status: 'pending' },
      ]
    });

    const toastId = toast.loading(`Enviando ficha do pedido para ${clientName} via WhatsApp...`);

    try {
      updateStep(taskId, 'send', 'completed');
      updateStep(taskId, 'done', 'loading');
      updateTask(taskId, { progress: 65, status: 'sending' });

      await sendEvolutionText(phone, text);

      updateStep(taskId, 'done', 'completed');
      updateTask(taskId, {
        progress: 100,
        status: 'completed',
        description: `Enviado com sucesso para ${clientName}!`
      });

      toast.success(`⚡ Ficha enviada com sucesso no WhatsApp de ${clientName}!`, { id: toastId });
    } catch (evoErr: any) {
      console.warn('Falha no envio direto via Evolution API:', evoErr);
      updateTask(taskId, {
        status: 'error',
        progress: 100,
        error: evoErr.message || 'Falha no envio direto'
      });

      handleWhatsAppDispatchError(evoErr, phone, text, toastId);
    }
  };

  const handleAddNewItem = async () => {
    if (!newItemDesc.trim()) {
      toast.error('Informe a descrição ou nome da matriz.');
      return;
    }

    setIsAddingItem(true);
    try {
      const subtotal = (Number(newItemQty) || 1) * (Number(newItemPrice) || 0);

      // 1. Inserir novo item na tabela order_items
      const { data: insertedItem, error: itemErr } = await supabase
        .from('order_items')
        .insert({
          order_id: order.id,
          description: newItemDesc.trim(),
          quantity: Number(newItemQty) || 1,
          unit_price: Number(newItemPrice) || 0,
          total_price: subtotal,
        })
        .select()
        .single();

      if (itemErr) throw itemErr;

      // 2. Atualizar o valor total do pedido
      const currentTotal = Number(order.total_amount) || 0;
      const newTotal = currentTotal + subtotal;

      await supabase
        .from('orders')
        .update({ total_amount: newTotal })
        .eq('id', order.id);

      // 3. Atualizar o estado local do pedido
      if (order.order_items) {
        order.order_items.push(insertedItem);
      } else {
        order.order_items = [insertedItem];
      }
      order.total_amount = newTotal;

      toast.success(`Matriz "${newItemDesc}" adicionada ao pedido!`);
      setNewItemDesc('');
      setNewItemQty(1);
      setNewItemPrice(0);
      setShowAddItemForm(false);
    } catch (err: any) {
      console.error('Erro ao adicionar bordado ao pedido:', err);
      toast.error('Erro ao salvar novo bordado: ' + (err.message || 'Falha de conexão'));
    } finally {
      setIsAddingItem(false);
    }
  };

  const handleStartQuickEdit = () => {
    setTempNotes(cleanNotes || '');
    setTempDueDate(order.due_date ? format(new Date(order.due_date), 'yyyy-MM-dd') : '');
    setTempItems(JSON.parse(JSON.stringify(order.order_items || [])));
    setIsQuickEditing(true);
  };

  const handleSaveQuickEdits = async () => {
    if (!order) return;
    setIsSavingQuickEdit(true);
    try {
      const finalNotes = serializePaymentMetadata(tempNotes, metadata);

      const updates: any = {
        notes: finalNotes,
        due_date: tempDueDate || null,
        updated_at: new Date().toISOString()
      };

      // 1. Update order
      const { error: orderError } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', order.id);

      if (orderError) throw orderError;

      // 2. Update all changed items
      if (tempItems.length > 0) {
        let newTotal = 0;
        for (const item of tempItems) {
          const qty = Number(item.quantity) || 1;
          const price = Number(item.unit_price) || 0;
          const total = qty * price;
          newTotal += total;

          await supabase
            .from('order_items')
            .update({ 
              quantity: qty, 
              unit_price: price, 
              total_price: total 
            })
            .eq('id', item.id);
        }
        
        // Update order total amount
        await supabase.from('orders').update({ total_amount: newTotal }).eq('id', order.id);
        updates['total_amount'] = newTotal;
        updates['order_items'] = tempItems.map(i => ({
          ...i,
          total_price: (Number(i.quantity) || 1) * (Number(i.unit_price) || 0)
        }));
      }

      if (onEditOrder) {
        onEditOrder({ ...order, ...updates });
      }

      setIsQuickEditing(false);
      toast.success('Alterações rápidas salvas com sucesso!');
    } catch (e: any) {
      toast.error('Erro ao salvar edições: ' + e.message);
    } finally {
      setIsSavingQuickEdit(false);
    }
  };



  const paymentLabels: Record<string, string> = {
    pix: 'PIX',
    credit_card: 'Cartão de Crédito',
    cash: 'Dinheiro',
    transfer: 'Transferência'
  };

  const modalContent = (
    <>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
        <div 
          className="relative w-full max-w-3xl max-h-[92vh] bg-white dark:bg-[#0d0d14] border border-slate-200 dark:border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-purple-500/20 text-purple-400">
                <Package className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-wider">
                    PEDIDO #{order.id.slice(0, 6)}
                  </h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    order.payment_status === 'paid' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' :
                    order.payment_status === 'half_paid' ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30' :
                    'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                  }`}>
                    {order.payment_status === 'paid' ? 'PAGO (100%)' : order.payment_status === 'half_paid' ? 'SINAL (50%)' : 'PENDENTE'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Criado em {format(new Date(order.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isQuickEditing && (
                <button 
                  onClick={handleStartQuickEdit}
                  title="Edição Rápida (Prazo e Anotações)"
                  className="p-2 text-purple-500 hover:text-purple-600 dark:hover:text-purple-400 rounded-full hover:bg-purple-500/10 transition-colors"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
              )}
              <button 
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-6 custom-scrollbar">
            {/* Informações do Cliente e Prazo */}
            <div className="flex items-center justify-between p-3 sm:p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-2 sm:p-2.5 rounded-xl bg-purple-500/10 text-purple-400">
                  <User className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div>
                  <p className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">Cliente</p>
                  <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">{order.clients?.name || 'Cliente Geral'}</h4>
                  {order.clients?.phone && (
                    <p className="text-[10px] sm:text-xs text-slate-500 dark:text-zinc-400">📞 {order.clients.phone}</p>
                  )}
                </div>
              </div>

              {(order.due_date || isQuickEditing) && (
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">Prazo de Entrega</p>
                  {isQuickEditing ? (
                    <input
                      type="date"
                      value={tempDueDate}
                      onChange={(e) => setTempDueDate(e.target.value)}
                      className="mt-1 bg-white dark:bg-black/50 border border-slate-300 dark:border-white/10 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white outline-none focus:border-purple-500 font-bold"
                    />
                  ) : (
                    <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1 justify-end">
                      <Calendar className="h-3.5 w-3.5 text-purple-400" />
                      {format(new Date(order.due_date), 'dd/MM/yyyy')}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Tabela de Itens */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-zinc-400 flex items-center gap-2">
                <Layers className="h-4 w-4" style={{ color: settings.primaryColor }} /> Itens e Matrizes do Pedido
              </h4>

              <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden bg-slate-50 dark:bg-white/5">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-200/50 dark:bg-white/10 text-slate-700 dark:text-zinc-300 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Descrição / Matriz</th>
                      <th className="p-3 text-center">Qtd Lote</th>
                      {isUnlocked ? (
                        <>
                          <th className="p-3 text-right">Valor Unit.</th>
                          <th className="p-3 text-right">Subtotal</th>
                        </>
                      ) : (
                        <>
                          <th className="p-3 text-center">Status Produção</th>
                          <th className="p-3 text-right">Ordem</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-white/5 font-medium text-slate-800 dark:text-zinc-200">
                    {(isQuickEditing && tempItems.length > 0 ? tempItems : order.order_items) && (isQuickEditing && tempItems.length > 0 ? tempItems : order.order_items).length > 0 ? (
                      (isQuickEditing && tempItems.length > 0 ? tempItems : order.order_items).map((item: any, idx: number) => (
                        <tr key={item.id || idx}>
                          <td className="p-3 font-bold">
                            <div className="flex items-center gap-3">
                              {/* Preview thumbnail */}
                              {matrixPreviews[item.id] ? (
                                <button
                                  onClick={() => setLightboxUrl(matrixPreviews[item.id])}
                                  title="Ver arte da matriz"
                                  className="shrink-0 w-10 h-10 rounded-xl overflow-hidden border-2 border-slate-200 dark:border-white/10 hover:border-purple-500 hover:scale-105 transition-all shadow-sm"
                                >
                                  <img src={matrixPreviews[item.id]} alt="" className="w-full h-full object-cover" />
                                </button>
                              ) : (
                                <div
                                  className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border border-slate-200 dark:border-white/10"
                                  style={{ backgroundColor: `${settings.primaryColor}10` }}
                                >
                                  <Layers className="h-4 w-4" style={{ color: settings.primaryColor, opacity: 0.5 }} />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <span className="block truncate">{item.description}</span>
                              </div>
                              {matrixUrls[item.id] && permissions?.canDownloadMatrices && (
                                <button
                                  onClick={() => window.open(matrixUrls[item.id], '_blank')}
                                  title="Baixar Matriz"
                                  className="p-1.5 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-500/30 transition-colors shrink-0 flex items-center justify-center shadow-sm"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-center font-bold text-white">
                            {isQuickEditing ? (
                              <div className="flex items-center justify-center gap-1">
                                <Edit2 className="h-3 w-3 text-slate-400" />
                                <input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => {
                                    const newItems = [...tempItems];
                                    newItems[idx] = { ...newItems[idx], quantity: Number(e.target.value) };
                                    setTempItems(newItems);
                                  }}
                                  className="w-16 bg-white dark:bg-black/50 border border-slate-300 dark:border-white/10 rounded px-1.5 py-1 text-xs text-slate-900 dark:text-white text-center outline-none focus:border-purple-500"
                                />
                              </div>
                            ) : (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleStartQuickEdit(); }}
                                className="group flex items-center justify-center gap-1.5 w-full hover:text-purple-400 transition-colors"
                              >
                                {item.quantity} un <Edit2 className="h-3 w-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </button>
                            )}
                          </td>
                          {isUnlocked ? (
                            <>
                              <td className="p-3 text-right">
                                {isQuickEditing ? (
                                  <div className="flex items-center justify-end gap-1">
                                    <Edit2 className="h-3 w-3 text-slate-400" />
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={item.unit_price}
                                      onChange={(e) => {
                                        const newItems = [...tempItems];
                                        newItems[idx] = { ...newItems[idx], unit_price: Number(e.target.value) };
                                        setTempItems(newItems);
                                      }}
                                      className="w-20 bg-white dark:bg-black/50 border border-slate-300 dark:border-white/10 rounded px-1.5 py-1 text-xs text-slate-900 dark:text-white text-right outline-none focus:border-purple-500"
                                    />
                                  </div>
                                ) : (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleStartQuickEdit(); }}
                                    className="group flex items-center justify-end gap-1.5 w-full hover:text-purple-400 transition-colors"
                                  >
                                    {formatCurrency(item.unit_price || 0, permissions?.canSeeFinancials ?? true)}
                                    <Edit2 className="h-3 w-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </button>
                                )}
                              </td>
                              <td className="p-3 text-right font-black">
                                {isQuickEditing
                                  ? formatCurrency((item.quantity || 1) * (item.unit_price || 0), permissions?.canSeeFinancials ?? true)
                                  : formatCurrency(item.total_price || 0, permissions?.canSeeFinancials ?? true)
                                }
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="p-3 text-center">
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                                  🟢 Liberado p/ Bordar
                                </span>
                              </td>
                              <td className="p-3 text-right font-mono text-zinc-400 text-[11px]">
                                #OP-{(idx + 1).toString().padStart(2, '0')}
                              </td>
                            </>
                          )}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-slate-500 dark:text-zinc-400">
                          {order.notes || 'Sem itens individuais descritos'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Botão para Incluir Mais de 1 Bordado/Matriz no Pedido */}
              <div className="pt-1">
                {!showAddItemForm ? (
                  <button
                    type="button"
                    onClick={() => setShowAddItemForm(true)}
                    className="w-full py-2.5 px-4 rounded-xl border border-dashed border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Incluir Mais 1 Bordado / Matriz neste Pedido</span>
                  </button>
                ) : (
                  <div className="p-4 rounded-2xl border border-purple-500/30 bg-purple-950/20 space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                        <Plus className="h-4 w-4 text-purple-400" /> Adicionar Matriz ao Pedido
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAddItemForm(false)}
                        className="text-xs font-bold text-zinc-400 hover:text-white"
                      >
                        Cancelar
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                          Descrição / Nome da Matriz *
                        </label>
                        <input
                          type="text"
                          value={newItemDesc}
                          onChange={e => setNewItemDesc(e.target.value)}
                          placeholder="Ex: Logo Manga Direita (5.000 pts)"
                          className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                          Qtd Peças *
                        </label>
                        <input
                          type="number"
                          value={newItemQty}
                          onChange={e => setNewItemQty(Number(e.target.value) || 1)}
                          className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500 font-bold"
                        />
                      </div>

                      {isUnlocked && (
                        <div>
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                            Valor Unitário (R$)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={newItemPrice}
                            onChange={e => setNewItemPrice(Number(e.target.value) || 0)}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500 font-bold"
                            placeholder="0.00"
                          />
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleAddNewItem}
                      disabled={isAddingItem || !newItemDesc.trim()}
                      className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isAddingItem ? 'Adicionando...' : '📥 Confirmar e Adicionar Bordado'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Resumo da Ordem de Produção / Resumo Financeiro */}
            <div className="space-y-3">
              <div className="p-3 sm:p-4 rounded-2xl bg-[#111118] border border-white/10 flex items-center justify-between">
                <div>
                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-purple-400">
                    {isUnlocked ? 'Valor Total do Pedido' : 'Resumo da Ordem de Produção'}
                  </span>
                  <h3 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white leading-tight">
                    {isUnlocked ? (
                      formatCurrency(order.total_amount || 0, permissions?.canSeeFinancials ?? true)
                    ) : (
                      `${order.order_items?.reduce((acc: number, it: any) => acc + (it.quantity || 1), 0) || 1} Peça(s) no Lote`
                    )}
                  </h3>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                    {isUnlocked ? 'Forma Registrada' : 'Status da Oficina'}
                  </span>
                  <p className="text-xs font-bold text-purple-400 uppercase">
                    {isUnlocked
                      ? (order.payment_method ? `⚡ ${paymentLabels[order.payment_method] || order.payment_method.toUpperCase()}` : 'Não informada')
                      : '⚡ Produção Ativa'}
                  </p>
                </div>
              </div>

              {/* Financial Metadata Details (Apenas para Chefe) */}
              {isUnlocked && (order.payment_status === 'half_paid' || order.payment_status === 'paid' || (metadata?.depositAmount || 0) > 0) && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-3 text-xs">
                  {order.payment_status === 'half_paid' && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-slate-600 dark:text-zinc-400">
                        <span>Sinal Recebido:</span>
                        <strong className="text-blue-500 dark:text-blue-400">
                          {formatCurrency(metadata?.depositAmount || 0, permissions?.canSeeFinancials ?? true)}
                        </strong>
                      </div>
                      <div className="flex justify-between items-center text-slate-600 dark:text-zinc-400">
                        <span>Restante a Pagar:</span>
                        <strong className="text-slate-900 dark:text-white font-black">
                          {formatCurrency(Math.max(0, (order.total_amount || 0) - (metadata?.depositAmount || 0)), permissions?.canSeeFinancials ?? true)}
                        </strong>
                      </div>
                    </div>
                  )}

                  {order.payment_status === 'paid' && (
                    <div className="flex justify-between items-center text-slate-600 dark:text-zinc-400">
                      <span>Pago integralmente em:</span>
                      <strong className="text-emerald-500 dark:text-emerald-400">
                        {metadata?.paidAt 
                          ? format(new Date(metadata.paidAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                          : format(new Date(order.updated_at || order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                        }
                      </strong>
                    </div>
                  )}

                  {/* History timeline */}
                  {metadata?.history && metadata.history.length > 0 && (
                    <div className="pt-2 border-t border-slate-200 dark:border-white/5 space-y-1.5">
                      <p className="text-[10px] font-black uppercase text-slate-400 dark:text-zinc-500">Histórico de Transações</p>
                      {metadata.history.map((h: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-[10px] text-slate-500">
                          <span>
                            {h.status === 'half_paid' ? 'Sinal' : h.status === 'paid' ? 'Quitação' : 'Pendente'} ({paymentLabels[h.method] || String(h.method).toUpperCase()})
                          </span>
                          <span>
                            {formatCurrency(h.amount, permissions?.canSeeFinancials ?? true)} - {format(new Date(h.timestamp), "dd/MM/yy HH:mm")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Observações */}
            {(cleanNotes || isQuickEditing) && (
              <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-2">
                <p className="text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400">Observações Gerais</p>
                {isQuickEditing ? (
                  <textarea
                    value={tempNotes}
                    onChange={(e) => setTempNotes(e.target.value)}
                    className="w-full bg-white dark:bg-black/50 border border-slate-300 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-purple-500 min-h-[80px] custom-scrollbar"
                    placeholder="Adicione anotações aqui..."
                  />
                ) : (
                  <p className="text-xs text-slate-700 dark:text-zinc-300 whitespace-pre-wrap">{cleanNotes}</p>
                )}
              </div>
            )}

            {/* Anexos / Fotos */}
            {metadata?.attachmentUrls && metadata.attachmentUrls.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                  <span>📎</span> Anexos do Pedido ({metadata.attachmentUrls.length})
                </p>
                <div className="flex flex-wrap gap-3">
                  {metadata.attachmentUrls.map((url: string, i: number) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative w-20 h-20 rounded-2xl border-2 border-slate-200 dark:border-white/10 overflow-hidden hover:border-purple-500 hover:scale-105 transition-all shadow-sm"
                      title="Ver anexo em tamanho completo"
                    >
                      <img
                        src={url}
                        alt={`Anexo ${i + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <span className="text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">↗</span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Footer Actions */}
          <div className="p-3 sm:p-5 border-t border-slate-200 dark:border-white/10 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between bg-slate-50 dark:bg-white/5 gap-3 sm:gap-4">
            <div>
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(order.id)}
                  className="w-full sm:w-auto px-4 py-2.5 sm:py-3 rounded-xl text-xs font-bold text-red-500 hover:bg-red-500/10 transition-colors flex items-center justify-center sm:justify-start gap-1.5"
                >
                  <Trash2 className="h-4 w-4" /> Excluir
                </button>
              )}
            </div>

            <div className="flex flex-1 flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
              {isQuickEditing ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsQuickEditing(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveQuickEdits}
                    disabled={isSavingQuickEdit}
                    className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white shadow-lg flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
                    style={{ backgroundColor: settings.primaryColor }}
                  >
                    {isSavingQuickEdit ? 'Salvando...' : 'Salvar Edições'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleSendWhatsApp}
                    className="group flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white rounded-full transition-all duration-300 shadow-md h-10 sm:h-12 px-3 sm:px-3.5 hover:px-4 sm:hover:px-5 shrink-0"
                    title="Compartilhar via WhatsApp"
                  >
                    <Send className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                    <span className="max-w-0 overflow-hidden group-hover:max-w-[100px] group-hover:ml-2 text-[10px] sm:text-xs font-bold whitespace-nowrap transition-all duration-300">
                      WhatsApp
                    </span>
                  </button>

                  {onEditOrder && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onEditOrder(order);
                      }}
                      className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-700 dark:text-zinc-300 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 shadow-sm flex items-center justify-center gap-1.5 sm:gap-2 transition-all hover:opacity-90 active:scale-95 border border-slate-200 dark:border-white/10"
                    >
                      <Edit2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" /> <span className="truncate">Editar Pedido</span>
                    </button>
                  )}

                  {onPriceOrder && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onPriceOrder(order);
                      }}
                      className="flex-1 sm:flex-none px-3 sm:px-6 py-2.5 sm:py-3 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-wider text-white shadow-lg flex items-center justify-center gap-1.5 sm:gap-2 transition-all hover:opacity-90 active:scale-95 animate-bounce"
                      style={{ backgroundColor: settings.primaryColor }}
                    >
                      <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" /> <span className="truncate">Precificar</span>
                    </button>
                  )}

                  {showPrintOptions ? (
                    <div className="flex-1 sm:flex-none flex items-center gap-2 bg-indigo-500/10 rounded-2xl p-1.5 animate-in zoom-in-95 duration-200">
                      <button
                        onClick={(e) => { handlePrintPDF(); setShowPrintOptions(false); }}
                        className="flex-1 px-3 py-2 rounded-xl text-indigo-700 dark:text-indigo-300 hover:bg-white dark:hover:bg-indigo-500/20 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
                        title="Imprimir A4 (PDF)"
                      >
                        <FileText className="h-4 w-4" /> A4
                      </button>
                      <button
                        onClick={(e) => { handlePrintThermal(); setShowPrintOptions(false); }}
                        className="flex-1 px-3 py-2 rounded-xl text-indigo-700 dark:text-indigo-300 hover:bg-white dark:hover:bg-indigo-500/20 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
                        title="Imprimir Cupom Térmico (80mm)"
                      >
                        <Printer className="h-4 w-4" /> Bobina
                      </button>
                      <button
                        onClick={() => setShowPrintOptions(false)}
                        className="px-2 py-2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowPrintOptions(true)}
                      className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl text-[11px] sm:text-xs font-black text-slate-700 dark:text-zinc-300 bg-slate-200 hover:bg-slate-300 dark:bg-white/10 dark:hover:bg-white/20 shadow-lg flex items-center justify-center gap-1.5 sm:gap-2 transition-all hover:opacity-90 active:scale-95"
                    >
                      <Printer className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-indigo-500" /> <span className="truncate">Imprimir</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Lightbox de Preview da Matriz */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200 cursor-zoom-out"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-w-2xl w-full mx-4" onClick={e => e.stopPropagation()}>
            <img
              src={lightboxUrl}
              alt="Preview da Matriz"
              className="w-full h-auto rounded-3xl shadow-2xl border border-white/10 animate-in zoom-in-95 duration-200"
            />
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute -top-4 -right-4 h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white border border-white/20 transition-colors backdrop-blur-sm"
            >
              <X className="h-4 w-4" />
            </button>
            <p className="text-center text-xs text-white/50 mt-3">Clique fora para fechar</p>
          </div>
        </div>
      )}
    </>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};
