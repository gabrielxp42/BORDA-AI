import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { 
  X, MessageSquare, Send, Phone, Sparkles, Smile, Zap, 
  ShieldAlert, Copy, ExternalLink, QrCode, CheckCircle2, FileText, Package
} from 'lucide-react';
import { toast } from 'sonner';
import { useProfile } from '@/contexts/ProfileContext';
import { formatCurrency } from '@/utils/currencyFormatter';
import { sendEvolutionText, sendEvolutionMedia, getWhatsAppWebLink, handleWhatsAppDispatchError } from '@/services/whatsappService';
import { useBackgroundTasks } from '@/hooks/useBackgroundTasks';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { generateOrderPDFBase64 } from '@/services/pdfGenerator';

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

interface CollectionActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
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
    description: 'Resumo técnico e educado da entrada' 
  },
];

export const CollectionActionModal: React.FC<CollectionActionModalProps> = ({
  isOpen,
  onClose,
  order,
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
  const [attachPDF, setAttachPDF] = useState<boolean>(false);
  const [messageDraft, setMessageDraft] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);

  useEffect(() => {
    if (order) {
      const phone = order.clients?.phone || order.client?.phone || '';
      setEditablePhone(phone);
      generateDraftMessage(tone, includePix, includeItems);
    }
  }, [order, tone, includePix, includeItems, settings]);

  if (!isOpen || !order) return null;

  const clientName = order.clients?.name || order.client?.name || 'Cliente';
  const orderCode = order.order_number ? `#${order.order_number}` : `#${order.id.slice(0, 4)}`;
  const totalFormatted = formatCurrency(order.total_amount || 0, canSeeFinancials);

  const cleanDescription = (desc: string) => {
    return desc
      .replace(/\s*\(\s*\d+([\.,]\d+)?\s*(pts|pontos|ponto|p)\s*,\s*\d+\s*(cores|cor|c)\s*\)/gi, '')
      .replace(/\s*\(\s*\d+\s*(cores|cor|c)\s*,\s*\d+([\.,]\d+)?\s*(pts|pontos|ponto|p)\s*\)/gi, '')
      .replace(/\s*\(\s*\d+([\.,]\d+)?\s*(pts|pontos|ponto|p)\s*\)/gi, '')
      .replace(/\s*\(\s*\d+\s*(cores|cor|c)\s*\)/gi, '')
      .trim();
  };

  const items = order.order_items || order.items || [];
  const itemsText = items.map(i => `• ${cleanDescription(i.description)} (${i.quantity}x)`).join('\n') || '• Bordado Personalizado';

  // Gerador dinâmico do rascunho de cobrança
  function generateDraftMessage(selectedTone: CollectionTone, withPix: boolean, withItems: boolean) {
    const systemName = settings.systemName || 'GUAÇU BORDADOS';
    const pix = settings.pixKey ? `\n\n💳 *Chave PIX:* *${settings.pixKey}*` : '';

    let text = '';
    const itemsBlock = withItems ? `\n\n📋 *Itens da Encomenda:*\n${itemsText}` : '';
    const pixBlock = withPix ? pix : '';

    switch (selectedTone) {
      case 'friendly':
        text = `Olá, *${clientName}*! Tudo bem? 😊\n\n` +
          `Passando para avisar que o seu pedido *${orderCode}* no valor de *${totalFormatted}* está cadastrado no sistema da oficina.${itemsBlock}${pixBlock}\n\n` +
          `Qualquer dúvida ou alteração, estamos à inteira disposição! ✨`;
        break;

      case 'today':
        text = `*Cobrança de Entrada - ${systemName}* ⚡\n\n` +
          `Olá, *${clientName}*! Precisamos da confirmação de pagamento do pedido *${orderCode}* no valor de *${totalFormatted}* para liberar a programação da matriz hoje.${itemsBlock}${pixBlock}\n\n` +
          `Assim que efetuar o pagamento, nos envie o comprovante por aqui para iniciarmos a produção imediata! 🚀`;
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
          `💵 *Valor Total:* *${totalFormatted}*` +
          `${itemsBlock}${pixBlock}\n\n` +
          `Qualquer dúvida estamos à disposição!`;
        break;
    }

    setMessageDraft(text);
  }

  // Disparo via Evolution API em segundo plano (Fechamento Instantâneo do Modal!)
  const handleSendDirectAPI = () => {
    if (!editablePhone || !editablePhone.trim()) {
      toast.error('Informe um número de WhatsApp válido.');
      return;
    }

    setIsSending(true);

    // Salva variáveis locais antes de fechar o modal
    const targetPhone = editablePhone.trim();
    const draftText = messageDraft;
    const isPdfAttached = attachPDF;
    const targetOrder = order;

    // Fecha o modal IMEDIATAMENTE (0ms) no ciclo de render do React
    onClose();
    toast.info(`⚡ Enviando cobrança de ${clientName} em segundo plano...`);

    // Adia o trabalho pesado (PDF + API) para o próximo tick do Event Loop para dar tempo do DOM re-renderizar e fechar o modal
    setTimeout(async () => {
      const baseSteps = [
        { id: 'prep', label: 'Montando Texto do Tom', status: 'completed' }
      ];
      if (isPdfAttached) {
        baseSteps.push({ id: 'pdf', label: 'Gerando PDF da Ficha', status: 'loading' });
      }
      baseSteps.push({ id: 'send', label: 'Conectando Evolution API', status: isPdfAttached ? 'pending' : 'loading' });
      baseSteps.push({ id: 'done', label: 'Entrega no WhatsApp', status: 'pending' });

      const taskId = addTask({
        title: `Cobrança (${clientName})`,
        description: `Disparando cobrança no WhatsApp de ${clientName}...`,
        status: 'processing',
        progress: 30,
        steps: baseSteps as any
      });

      const toastId = toast.loading(`Enviando cobrança para ${clientName}...`);

      try {
        updateTask(taskId, { progress: 60, status: 'sending' });

        if (isPdfAttached && targetOrder) {
          const rawItems = targetOrder.order_items || targetOrder.items || [];
          const mappedItems = rawItems.map((i: any) => ({
            description: i.description,
            quantity: i.quantity,
            unitPrice: Number(i.unitPrice ?? i.unit_price ?? 0),
            totalPrice: Number(i.totalPrice ?? i.total_price ?? ((i.unitPrice ?? i.unit_price ?? 0) * i.quantity))
          }));

          const pdfBase64 = await generateOrderPDFBase64({
            id: targetOrder.id,
            orderNumber: targetOrder.order_number,
            createdAt: targetOrder.created_at,
            dueDate: targetOrder.due_date,
            clientName: clientName,
            clientCompany: targetOrder.client?.company_name || targetOrder.clients?.company_name,
            clientPhone: targetOrder.client?.phone || targetOrder.clients?.phone,
            paymentStatus: targetOrder.payment_status,
            paymentMethod: targetOrder.payment_method,
            totalAmount: targetOrder.total_amount,
            notes: targetOrder.notes,
            items: mappedItems,
            companyName: settings.systemName,
            companySubtitle: settings.systemSubtitle,
            companyLogo: settings.logoUrl,
            companyColor: settings.primaryColor,
            companyPhone: settings.phone ?? undefined,
            companyEmail: settings.email ?? undefined,
            companyAddress: settings.address ?? undefined,
            companyDocument: settings.document ?? undefined,
            pixKey: settings.pixKey ?? undefined,
            workingHours: settings.workingHours ?? undefined,
            canSeeFinancials: true
          });

          updateStep(taskId, 'pdf', 'completed');
          updateStep(taskId, 'send', 'loading');

          await sendEvolutionMedia({
            phone: targetPhone,
            message: draftText,
            mediaUrl: `data:application/pdf;base64,${pdfBase64}`,
            mediaType: 'document',
            mediaName: `OS_${orderCode.replace('#', '')}.pdf`
          });
        } else {
          updateStep(taskId, 'send', 'completed');
          updateStep(taskId, 'done', 'loading');
          await sendEvolutionText(targetPhone, draftText);
        }

        updateStep(taskId, 'send', 'completed');
        updateStep(taskId, 'done', 'completed');
        updateTask(taskId, {
          progress: 100,
          status: 'completed',
          description: `Cobrança entregue com sucesso para ${clientName}!`
        });

        toast.success(`⚡ Cobrança enviada com sucesso para ${clientName}!`, { id: toastId });
        if (onMessageSent) onMessageSent();
      } catch (err: any) {
        console.warn("Falha no disparo via API:", err);
        updateStep(taskId, 'send', 'error');
        updateStep(taskId, 'done', 'error');
        if (isPdfAttached) updateStep(taskId, 'pdf', 'error');

        updateTask(taskId, {
          status: 'error',
          progress: 100,
          description: `Falha no envio: ${err.message || 'Erro no WhatsApp'}`,
          error: err.message || 'Falha no envio direto'
        });

        handleWhatsAppDispatchError(err, targetPhone, draftText, toastId);
      } finally {
        setIsSending(false);
      }
    }, 500);
  };

  // Abrir no WhatsApp Web
  const handleOpenWeb = () => {
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
        className="relative w-full max-w-lg rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#12121a] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header do Modal */}
        <div className="p-5 bg-gradient-to-r from-purple-600/10 via-purple-500/5 to-transparent border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-purple-500/20 border border-purple-500/30 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                Cobrança Inteligente <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-extrabold uppercase">WhatsApp</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Personalize o tom e o texto para {clientName} ({orderCode})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-2xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Seletor de Tons */}
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
                  className={`p-3 rounded-2xl border transition-all text-left flex items-start gap-2.5 cursor-pointer ${
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
            {/* Input do WhatsApp */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                <Phone className="h-3 w-3 text-purple-400" /> WhatsApp do Destinatário:
              </label>
              <input
                type="text"
                value={editablePhone}
                onChange={e => setEditablePhone(e.target.value)}
                placeholder="(21) 98624-3396"
                className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Switches */}
            <div className="space-y-2">
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20"><QrCode className="h-4 w-4" /></div>
                    <div className="flex flex-col"><span className="text-xs font-bold text-slate-900 dark:text-white uppercase italic tracking-tight">Dados PIX</span><span className="text-[10px] text-slate-500 dark:text-zinc-400 font-medium">Incluir chave PIX</span></div>
                  </div>
                  <ToggleSwitch checked={includePix} onChange={setIncludePix} />
                </div>
                
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20"><Package className="h-4 w-4" /></div>
                    <div className="flex flex-col"><span className="text-xs font-bold text-slate-900 dark:text-white uppercase italic tracking-tight">Resumo</span><span className="text-[10px] text-slate-500 dark:text-zinc-400 font-medium">Incluir itens</span></div>
                  </div>
                  <ToggleSwitch checked={includeItems} onChange={setIncludeItems} />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><FileText className="h-4 w-4" /></div>
                    <div className="flex flex-col"><span className="text-xs font-bold text-slate-900 dark:text-white uppercase italic tracking-tight">Anexar PDF</span><span className="text-[10px] text-slate-500 dark:text-zinc-400 font-medium">Enviar ficha do pedido</span></div>
                  </div>
                  <ToggleSwitch checked={attachPDF} onChange={setAttachPDF} />
                </div>
            </div>
          </div>

          {/* Rascunho da Mensagem Editável */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1">
                <FileText className="h-3.5 w-3.5 text-purple-400" /> Pré-visualização da Mensagem (Editável):
              </label>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(messageDraft);
                  toast.success('Texto copiado!');
                }}
                className="text-[10px] font-bold text-purple-500 hover:underline flex items-center gap-1"
              >
                <Copy className="h-3 w-3" /> Copiar
              </button>
            </div>
            <textarea
              rows={6}
              value={messageDraft}
              onChange={e => setMessageDraft(e.target.value)}
              className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl p-3.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-purple-500 font-mono leading-relaxed"
            />
          </div>
        </div>

        {/* Rodapé dos Botões de Envio */}
        <div className="p-4 bg-slate-50 dark:bg-black/40 border-t border-slate-200 dark:border-white/10 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleOpenWeb}
            className="px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-zinc-300 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <ExternalLink className="h-4 w-4" /> Abrir no Web
          </button>

          <button
            type="button"
            disabled={isSending}
            onClick={handleSendDirectAPI}
            className="px-6 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-lg shadow-purple-500/25 flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {isSending ? 'Enviando...' : 'Enviar no WhatsApp ⚡'}
          </button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};
