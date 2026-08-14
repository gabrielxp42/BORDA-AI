import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { 
  X, MessageSquare, Send, Phone, Sparkles, Smile, Zap, 
  ShieldAlert, Copy, ExternalLink, QrCode, CheckCircle2, FileText, Package, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { useProfile } from '@/contexts/ProfileContext';
import { formatCurrency } from '@/utils/currencyFormatter';
import { sendEvolutionText, sendEvolutionMedia, getWhatsAppWebLink, handleWhatsAppDispatchError } from '@/services/whatsappService';
import { useBackgroundTasks } from '@/hooks/useBackgroundTasks';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { generateOrderPDFBase64, generateClientStatementPDFBase64 } from '@/services/pdfGenerator';

const ToggleSwitch: React.FC<{ checked: boolean; onChange: (checked: boolean) => void }> = ({ checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
      checked ? 'bg-purple-600' : 'bg-slate-300 dark:bg-zinc-700'
    }`}
  >
    <span
      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`}
    />
  </button>
);

export type CollectionTone = 'friendly' | 'today' | 'firm' | 'default';

interface OrderItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price?: number;
  total_price?: number;
}

export interface Order {
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

export interface ClientDebtData {
  clientId: string;
  clientName: string;
  clientPhone?: string;
  clientCompany?: string;
  orders: Order[];
  totalPending: number;
}

interface CollectionActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  order?: Order | null;
  clientDebts?: ClientDebtData | null;
  onMessageSent?: () => void;
}

const TONES: { id: CollectionTone; label: string; icon: any; color: string; description: string }[] = [
  { 
    id: 'friendly', 
    label: 'Amigável', 
    icon: Smile, 
    color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30', 
    description: 'Focado no relacionamento e cortesia' 
  },
  { 
    id: 'today', 
    label: 'Receber Hoje', 
    icon: Zap, 
    color: 'text-amber-500 bg-amber-500/10 border-amber-500/30', 
    description: 'Urgência comercial para liberação da oficina' 
  },
  { 
    id: 'firm', 
    label: 'Firme', 
    icon: ShieldAlert, 
    color: 'text-rose-500 bg-rose-500/10 border-rose-500/30', 
    description: 'Assertivo para pendências e atrasos' 
  },
  { 
    id: 'default', 
    label: 'Padrão Oficial', 
    icon: MessageSquare, 
    color: 'text-purple-500 bg-purple-500/10 border-purple-500/30', 
    description: 'Resumo técnico e educado da fatura' 
  },
];

// Helper para calcular o valor real total de um pedido com fallback para a soma dos itens
export const getOrderValue = (o: Order): number => {
  let total = Number(o.total_amount || 0);
  if (total <= 0) {
    const rawItems = o.order_items || o.items || [];
    total = rawItems.reduce((acc, item) => {
      const itemVal = Number(item.total_price || (item.unit_price ? Number(item.unit_price) * Number(item.quantity || 1) : 0));
      return acc + itemVal;
    }, 0);
  }
  return total;
};

// Helper para calcular a pendência de um pedido (50% se sinal foi pago)
export const getOrderPendingValue = (o: Order): number => {
  const total = getOrderValue(o);
  return o.payment_status === 'half_paid' ? total * 0.5 : total;
};

export const CollectionActionModal: React.FC<CollectionActionModalProps> = ({
  isOpen,
  onClose,
  order,
  clientDebts,
  onMessageSent
}) => {
  const { settings } = useCompanySettings();
  const { permissions, isUnlocked } = useProfile();
  const canSeeFinancials = isUnlocked || (permissions?.canSeeFinancials === true);
  const addTask = useBackgroundTasks(state => state.addTask);
  const updateTask = useBackgroundTasks(state => state.updateTask);
  const updateStep = useBackgroundTasks(state => state.updateStep);

  const [tone, setTone] = useState<CollectionTone>('default');
  const [editablePhone, setEditablePhone] = useState<string>('');
  const [includePix, setIncludePix] = useState<boolean>(true);
  const [includeItems, setIncludeItems] = useState<boolean>(true);
  const [attachPDF, setAttachPDF] = useState<boolean>(true);
  const [messageDraft, setMessageDraft] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);

  // Determina se a cobrança é de 1 PEDIDO ÚNICO ou VÁRIOS PEDIDOS (Extrato)
  const targetOrders = clientDebts ? clientDebts.orders : (order ? [order] : []);
  const isSingleOrder = targetOrders.length === 1;
  const singleOrder = isSingleOrder ? targetOrders[0] : null;

  // Nome do cliente
  const clientName = clientDebts?.clientName || order?.clients?.name || order?.client?.name || 'Cliente';

  // Valor Pendente Efetivo com Recálculo Garantido (Sem R$ 0,00 fantasma)
  const calculatedTotalPending = targetOrders.reduce((acc, o) => acc + getOrderPendingValue(o), 0);
  const totalFormatted = formatCurrency(calculatedTotalPending, canSeeFinancials);

  // Atualização dinâmica da mensagem
  useEffect(() => {
    if (clientDebts) {
      setEditablePhone(clientDebts.clientPhone || '');
    } else if (order) {
      const phone = order.clients?.phone || order.client?.phone || '';
      setEditablePhone(phone);
    }
    generateDynamicDraftMessage(tone, includePix, includeItems);
  }, [order, clientDebts, tone, includePix, includeItems, settings]);

  if (!isOpen || targetOrders.length === 0) return null;

  const titleSubtitle = isSingleOrder
    ? `Pedido #${singleOrder?.order_number || singleOrder?.id.slice(0, 4)}`
    : `Resumo de Fechamento (${targetOrders.length} encomendas)`;

  const cleanDescription = (desc: string) => {
    return desc
      .replace(/\s*\(\s*\d+([\.,]\d+)?\s*(pts|pontos|ponto|p)\s*,\s*\d+\s*(cores|cor|c)\s*\)/gi, '')
      .replace(/\s*\(\s*\d+\s*(cores|cor|c)\s*,\s*\d+([\.,]\d+)?\s*(pts|pontos|ponto|p)\s*\)/gi, '')
      .replace(/\s*\(\s*\d+([\.,]\d+)?\s*(pts|pontos|ponto|p)\s*\)/gi, '')
      .replace(/\s*\(\s*\d+\s*(cores|cor|c)\s*\)/gi, '')
      .trim();
  };

  // Gerador Inteligente Único de Rascunho (Trata 1 pedido vs N pedidos com gramática exata!)
  function generateDynamicDraftMessage(selectedTone: CollectionTone, withPix: boolean, withItems: boolean) {
    const systemName = settings.systemName || 'GUAÇU BORDADOS';
    const pix = settings.pixKey ? `\n\n🔑 *Chave PIX:* *${settings.pixKey}*` : '';
    const pixBlock = withPix ? pix : '';

    let text = '';

    if (isSingleOrder && singleOrder) {
      // 🎯 CASO A: APENAS 1 PEDIDO
      const orderCode = singleOrder.order_number ? `#${singleOrder.order_number}` : `#${singleOrder.id.slice(0, 4)}`;
      const items = singleOrder.order_items || singleOrder.items || [];
      const itemsText = items.map(i => `• ${cleanDescription(i.description)} (${i.quantity}x)`).join('\n') || '• Bordado Personalizado';
      const itemsBlock = withItems ? `\n\n📋 *Itens da Encomenda:*\n${itemsText}` : '';

      switch (selectedTone) {
        case 'friendly':
          text = `Olá, *${clientName}*! Tudo bem? 😊\n\n` +
            `Passando para avisar que o seu pedido *${orderCode}* no valor de *${totalFormatted}* está cadastrado e pronto no sistema da oficina.${itemsBlock}${pixBlock}\n\n` +
            `Qualquer dúvida ou alteração, estamos à inteira disposição! ✨`;
          break;

        case 'today':
          text = `*Cobrança de Entrada - ${systemName}* ⚡\n\n` +
            `Olá, *${clientName}*! Precisamos da confirmação de pagamento do pedido *${orderCode}* no valor de *${totalFormatted}* para liberar a produção hoje.${itemsBlock}${pixBlock}\n\n` +
            `Assim que efetuar o pagamento, nos envie o comprovante por aqui! 🚀`;
          break;

        case 'firm':
          text = `*Aviso Financeiro - ${systemName}* ⚠️\n\n` +
            `Prezado(a) *${clientName}*, consta em nosso sistema o pedido *${orderCode}* pendente de quitação no valor de *${totalFormatted}*${itemsBlock}${pixBlock}\n\n` +
            `Pedimos a gentileza de regularizar o pagamento para dar continuidade ao atendimento. Obrigado!`;
          break;

        case 'default':
        default:
          text = `*Ficha de Registro & Cobrança - ${systemName}* 🧵✨\n\n` +
            `Olá, *${clientName}*!\n\n` +
            `Seguem os dados para pagamento do seu pedido *${orderCode}*:\n` +
            `💵 *Valor Pendente:* *${totalFormatted}*` +
            `${itemsBlock}${pixBlock}\n\n` +
            `Qualquer dúvida estamos à disposição!`;
          break;
      }

    } else {
      // 📋 CASO B: MÚLTIPLOS PEDIDOS (2, 5, 20 PEDIDOS DE UM CLIENTE)
      const ordersListText = targetOrders
        .map(o => {
          const val = getOrderPendingValue(o);
          return `• Pedido #${o.order_number || o.id.slice(0, 4)}: R$ ${val.toFixed(2)} (${o.payment_status === 'half_paid' ? 'Sinal 50% Pago' : 'Pendente'})`;
        })
        .join('\n');

      const itemsBlock = withItems ? `\n\n📋 *Resumo dos ${targetOrders.length} Pedidos em Aberto:*\n${ordersListText}` : '';

      switch (selectedTone) {
        case 'friendly':
          text = `Olá, *${clientName}*! Tudo bem? 😊\n\n` +
            `Segue o resumo das suas *${targetOrders.length} encomendas* pendentes na *${systemName}* no valor total de *${totalFormatted}*.${itemsBlock}${pixBlock}\n\n` +
            `Qualquer dúvida ou ajuste de data, por favor nos avise por aqui! ✨`;
          break;

        case 'today':
          text = `*Fechamento de Faturas - ${systemName}* ⚡\n\n` +
            `Olá, *${clientName}*! Passando para solicitar a confirmação das suas *${targetOrders.length} faturas* que somam *${totalFormatted}*.${itemsBlock}${pixBlock}\n\n` +
            `Enviando o comprovante hoje conseguimos dar andamento imediato na oficina! 🚀`;
          break;

        case 'firm':
          text = `*Aviso Financeiro de Pendência - ${systemName}* ⚠️\n\n` +
            `Prezado(a) *${clientName}*, identificamos pendências financeiras acumuladas (${targetOrders.length} pedidos) no valor de *${totalFormatted}*.${itemsBlock}${pixBlock}\n\n` +
            `Solicitamos a gentileza da quitação ou envio dos comprovantes para atualização no sistema da oficina. Obrigado!`;
          break;

        case 'default':
        default:
          text = `*Extrato de Fechamento de Faturas - ${systemName}* 🧵✨\n\n` +
            `Olá, *${clientName}*!\n\n` +
            `Seguem os detalhes atualizados dos seus débitos pendentes:\n` +
            `💰 *Valor Total a Pagar:* *${totalFormatted}*` +
            `${itemsBlock}${pixBlock}\n\n` +
            `Qualquer dúvida estamos à disposição!`;
          break;
      }
    }

    setMessageDraft(text);
  }

  // Disparo via Evolution API
  const handleSendDirectAPI = () => {
    if (!editablePhone || !editablePhone.trim()) {
      toast.error('Informe um número de WhatsApp válido.');
      return;
    }

    setIsSending(true);

    const targetPhone = editablePhone.trim();
    const draftText = messageDraft;
    const isPdfAttached = attachPDF;
    const targetName = clientName;

    onClose();
    if (onMessageSent) onMessageSent();

    const baseSteps = [
      { id: 'prep', label: 'Preparando Dados da Cobrança', status: 'completed' },
      ...(isPdfAttached ? [{ id: 'pdf', label: 'Gerando Extrato PDF (Sem Pontos)', status: 'loading' }] : []),
      { id: 'send', label: 'Conectando Evolution API', status: isPdfAttached ? 'pending' : 'loading' },
      { id: 'done', label: 'Entrega no WhatsApp', status: 'pending' }
    ];

    const taskId = addTask({
      title: `Cobrança de ${targetName}`,
      description: `Enviando extrato financeiro para ${targetName}...`,
      status: 'processing',
      progress: 25,
      steps: baseSteps as any
    });

    setTimeout(async () => {
      let pdfBase64 = '';

      if (isPdfAttached) {
        try {
          updateTask(taskId, { progress: 45 });

          if (!isSingleOrder) {
            const statementOrders = targetOrders.map(o => ({
              id: o.id,
              orderNumber: o.order_number || o.id.slice(0, 4),
              createdAt: o.created_at,
              dueDate: o.due_date,
              totalAmount: getOrderValue(o),
              paymentStatus: o.payment_status,
              pendingAmount: getOrderPendingValue(o)
            }));

            pdfBase64 = await generateClientStatementPDFBase64({
              clientName: targetName,
              clientPhone: targetPhone,
              orders: statementOrders,
              grandPending: calculatedTotalPending,
              companyName: settings.systemName || 'GUAÇU BORDADOS',
              companyColor: settings.primaryColor || '#8B5CF6',
              pixKey: settings.pixKey,
              workingHours: settings.workingHours
            });
          } else if (singleOrder) {
            pdfBase64 = await generateOrderPDFBase64({
              id: singleOrder.id,
              orderNumber: singleOrder.order_number,
              createdAt: singleOrder.created_at,
              clientName: targetName,
              clientPhone: targetPhone,
              paymentStatus: singleOrder.payment_status,
              totalAmount: getOrderValue(singleOrder),
              companyName: settings.systemName || 'GUAÇU BORDADOS',
              companySubtitle: settings.systemSubtitle || 'GESTÃO INTELIGENTE DE BORDADOS',
              companyColor: settings.primaryColor || '#8B5CF6',
              pixKey: settings.pixKey,
              items: (singleOrder.order_items || singleOrder.items || []).map(i => ({
                description: i.description,
                quantity: i.quantity,
                unit_price: i.unit_price,
                total_price: i.total_price
              }))
            });
          }

          updateStep(taskId, 'pdf', 'completed');
        } catch (pdfErr) {
          console.error('Erro ao gerar PDF Base64 para envio:', pdfErr);
          updateStep(taskId, 'pdf', 'error');
        }
      }

      const toastId = toast.loading(`Enviando cobrança para ${targetName} via WhatsApp...`);

      try {
        updateStep(taskId, 'send', 'completed');
        updateStep(taskId, 'done', 'loading');
        updateTask(taskId, { progress: 75, status: 'sending' });

        if (pdfBase64) {
          const filename = isSingleOrder 
            ? `Pedido_${singleOrder?.order_number || 'Bordado'}_${targetName.replace(/\s+/g, '_')}.pdf`
            : `Extrato_${targetName.replace(/\s+/g, '_')}.pdf`;
          
          await sendEvolutionMedia(targetPhone, pdfBase64, filename, draftText, 'document');
        } else {
          await sendEvolutionText(targetPhone, draftText);
        }

        updateStep(taskId, 'done', 'completed');
        updateTask(taskId, {
          progress: 100,
          status: 'completed',
          description: `Cobrança entregue no WhatsApp de ${targetName}!`
        });

        toast.success(`⚡ Cobrança enviada com sucesso para ${targetName}!`, { id: toastId });
      } catch (evoErr: any) {
        console.warn('Falha no envio via Evolution API:', evoErr);
        updateTask(taskId, {
          status: 'error',
          progress: 100,
          error: evoErr.message || 'Falha na conexão'
        });

        handleWhatsAppDispatchError(evoErr, targetPhone, draftText, toastId);
      }
    }, 100);
  };

  const handleOpenWebWhatsApp = () => {
    if (!editablePhone || !editablePhone.trim()) {
      toast.error('Informe um número de WhatsApp válido.');
      return;
    }
    const webLink = getWhatsAppWebLink(editablePhone, messageDraft);
    window.open(webLink, '_blank');
    toast.success('Abrindo conversa no WhatsApp Web...');
    onClose();
  };

  const modalContent = (
    <div className="fixed inset-0 z-[99999999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-xl rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#12121a] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200 text-white"
        onClick={e => e.stopPropagation()}
      >
        {/* Header do Modal */}
        <div className="p-5 bg-gradient-to-r from-purple-600/20 via-indigo-600/10 to-transparent border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-2xl bg-purple-500/20 border border-purple-500/30 text-purple-400 flex items-center justify-center shadow-lg font-black">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                Central de Cobrança Inteligente <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-extrabold uppercase">Evolution API</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                {clientName} — {titleSubtitle} (Total: <strong>{totalFormatted}</strong>)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-2xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-zinc-400 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin scrollbar-thumb-white/10">
          
          {/* Seletor de Tons da Cobrança */}
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-2.5">
              Escolha o Tom da Cobrança:
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {TONES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTone(t.id)}
                  className={`p-3.5 rounded-2xl border transition-all text-left flex items-start gap-2.5 cursor-pointer ${
                    tone === t.id
                      ? `${t.color} ring-2 ring-purple-500/50 shadow-md scale-[1.02]`
                      : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:border-purple-500/30'
                  }`}
                >
                  <t.icon className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-slate-900 dark:text-white block leading-tight">
                      {t.label}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-zinc-400 block mt-0.5 line-clamp-1">
                      {t.description}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Telefone & Opções de Anexo */}
          <div className="space-y-3 p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                <Phone className="h-3 w-3 text-emerald-400" /> WhatsApp de Destino:
              </label>
              <input
                type="text"
                value={editablePhone}
                onChange={e => setEditablePhone(e.target.value)}
                placeholder="(00) 00000-0000"
                className="w-full bg-white dark:bg-black/50 border border-slate-300 dark:border-white/10 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/5">
                <span className="text-[11px] font-bold text-zinc-300">Incluir Chave PIX</span>
                <ToggleSwitch checked={includePix} onChange={setIncludePix} />
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/5">
                <span className="text-[11px] font-bold text-zinc-300">Detalhes dos Itens</span>
                <ToggleSwitch checked={includeItems} onChange={setIncludeItems} />
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30">
                <span className="text-[11px] font-black text-purple-300">
                  {isSingleOrder ? 'Anexar Ficha PDF' : 'Anexar Extrato PDF'}
                </span>
                <ToggleSwitch checked={attachPDF} onChange={setAttachPDF} />
              </div>
            </div>
          </div>

          {/* Rascunho da Mensagem Editável */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Preview da Mensagem que será Enviada:
              </label>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(messageDraft);
                  toast.success('Texto copiado para a área de transferência!');
                }}
                className="text-[10px] font-extrabold text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer"
              >
                <Copy className="h-3 w-3" /> Copiar Texto
              </button>
            </div>

            <textarea
              rows={6}
              value={messageDraft}
              onChange={e => setMessageDraft(e.target.value)}
              className="w-full bg-white dark:bg-black/60 border border-slate-300 dark:border-white/10 rounded-2xl p-4 text-xs font-mono text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 leading-relaxed shadow-inner"
            />
          </div>

        </div>

        {/* Footer com Botões de Disparo */}
        <div className="p-4 bg-slate-50 dark:bg-white/[0.02] border-t border-slate-200 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleOpenWebWhatsApp}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-white/5 hover:bg-slate-300 dark:hover:bg-white/10 text-slate-700 dark:text-zinc-300 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Abrir no WhatsApp Web</span>
          </button>

          <button
            type="button"
            disabled={isSending}
            onClick={handleSendDirectAPI}
            className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-emerald-600 hover:brightness-110 text-white text-xs font-black shadow-xl shadow-purple-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            <span>ENVIAR VIA EVOLUTION API (COM PDF)</span>
          </button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};
