import React, { useState } from 'react';
import { X, Send, MessageCircle, ExternalLink, CheckCircle2, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { sendEvolutionText, sendEvolutionMedia, getWhatsAppWebLink, handleWhatsAppDispatchError } from '@/services/whatsappService';
import { getStoredTemplates, formatEmbroideryTemplate } from '@/services/whatsappTemplatesService';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { formatCurrency } from '@/utils/currencyFormatter';
import { generateOrderPDFBase64 } from '@/services/pdfGenerator';

interface WhatsAppBillingModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientData: {
    id: string;
    name: string;
    phone?: string;
    totalAmount: number;
    orderCount: number;
    orders: any[];
  } | null;
}

export const WhatsAppBillingModal: React.FC<WhatsAppBillingModalProps> = ({ isOpen, onClose, clientData }) => {
  const { profile } = useAuth();
  const { permissions } = useProfile();
  const { settings } = useCompanySettings();
  const [phoneNumber, setPhoneNumber] = useState(clientData?.phone || '');
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [attachPDF, setAttachPDF] = useState(false);

  if (!isOpen || !clientData) return null;

  const currentMonth = format(new Date(), 'MMMM', { locale: ptBR });
  const formattedTotal = formatCurrency(clientData.totalAmount, permissions?.canSeeFinancials ?? true);

  const gabiTemplates = getStoredTemplates();
  const billingTpl = gabiTemplates.find(t => t.id === 'tpl_cobranca_pix');
  const gabiContext = {
    nome_cliente: clientData.name,
    numero_pedido: `${clientData.orderCount} pedido(s)`,
    nome_matriz: `Fechamento ${currentMonth}`,
    valor_total: formattedTotal,
    valor_entrada: formattedTotal,
    chave_pix: settings.pixKey || 'Consulte a chave na oficina',
    nome_oficina: settings.systemName,
  };

  const defaultMessage = billingTpl
    ? formatEmbroideryTemplate(billingTpl.templateText, gabiContext)
    : `Olá ${clientData.name}!\n\nAqui é da *${settings.systemName}*.\nSegue o seu fechamento de bordados referente a *${currentMonth}*:\n\n👕 Total de Pedidos: ${clientData.orderCount}\n💰 *Valor Total: ${formattedTotal}*\n\n🔑 PIX: *${settings.pixKey || 'Consulte a chave na oficina'}*\n\nQualquer dúvida, estamos à disposição!`;

  const [message, setMessage] = useState(defaultMessage);

  const isEvolutionConnected = profile?.whatsapp_status === 'connected';

  const handleSendEvolution = () => {
    if (!phoneNumber || !phoneNumber.trim()) {
      toast.error("Por favor, informe um número de WhatsApp válido.");
      return;
    }

    const targetPhone = phoneNumber.trim();
    const msgText = message;
    const isPdfAttached = attachPDF;
    const cData = clientData;

    setIsSending(true);
    onClose();
    toast.info(`⚡ Enviando cobrança de ${cData.name} em segundo plano...`);

    setTimeout(async () => {
      const toastId = toast.loading(`Enviando cobrança para ${cData.name}...`);
      try {
        if (isPdfAttached) {
          const latestOrder = cData.orders[cData.orders.length - 1];
          if (!latestOrder) throw new Error("Pedido não encontrado para gerar PDF.");
          
          const pdfBase64 = await generateOrderPDFBase64({
            id: latestOrder.id,
            orderNumber: latestOrder.order_number,
            createdAt: latestOrder.created_at,
            clientName: cData.name,
            paymentStatus: 'pending',
            totalAmount: latestOrder.total_amount,
            items: latestOrder.items || [],
            companyName: settings.systemName,
          });

          await sendEvolutionMedia({
            phone: targetPhone,
            message: msgText,
            mediaUrl: `data:application/pdf;base64,${pdfBase64}`,
            mediaType: 'document',
            mediaName: `Fechamento_${cData.name.replace(/\s+/g, '_')}.pdf`
          });
        } else {
          await sendEvolutionText(targetPhone, msgText);
        }

        toast.success(`⚡ Cobrança enviada com sucesso para ${cData.name}!`, { id: toastId });
      } catch (err: any) {
        console.warn("Falha no disparo via API:", err);
        handleWhatsAppDispatchError(err, targetPhone, msgText, toastId);
      } finally {
        setIsSending(false);
      }
    }, 50);
  };

  const handleOpenWebWhatsApp = () => {
    if (!phoneNumber) {
      toast.error("Por favor, informe um número de WhatsApp válido.");
      return;
    }
    const webUrl = getWhatsAppWebLink(phoneNumber, message);
    window.open(webUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#0f0f13] border border-white/10 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl shadow-black relative">
        
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-emerald-900/20 via-teal-900/20 to-purple-900/20">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-white font-black text-base">Cobrar via WhatsApp</h2>
                {isEvolutionConnected ? (
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Evolution API
                  </span>
                ) : (
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Link Web
                  </span>
                )}
              </div>
              <p className="text-zinc-400 text-xs">Enviar extrato de fechamento de bordados</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-zinc-400 block">Número do Cliente (WhatsApp)</label>
            <input 
              type="text" 
              placeholder="Ex: 5511999999999"
              value={phoneNumber}
              onChange={e => setPhoneNumber(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:border-emerald-500/50 outline-none"
            />
          </div>

          <div className="flex items-center gap-2 p-3 bg-white/5 rounded-xl border border-white/10 cursor-pointer" onClick={() => setAttachPDF(!attachPDF)}>
            <input 
              type="checkbox" 
              checked={attachPDF}
              onChange={(e) => setAttachPDF(e.target.checked)}
              className="h-4 w-4 accent-emerald-500"
            />
            <FileText className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-bold text-zinc-300">Anexar Ficha do Pedido em PDF</span>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-zinc-400 block">Mensagem de Cobrança</label>
            <textarea 
              rows={8}
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:border-emerald-500/50 outline-none resize-none custom-scrollbar"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button 
            onClick={handleOpenWebWhatsApp}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-zinc-300 hover:text-white bg-white/5 hover:bg-white/10 transition-all border border-white/10"
          >
            <ExternalLink className="h-4 w-4 text-emerald-400" /> Abrir no Web WhatsApp
          </button>
          
          <button 
            onClick={handleSendEvolution}
            disabled={isSending || sendSuccess}
            className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-white text-xs font-black tracking-wider uppercase transition-all shadow-lg ${
              sendSuccess 
                ? 'bg-emerald-500 shadow-emerald-500/20' 
                : 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:brightness-110 shadow-emerald-500/20 active:scale-95'
            }`}
          >
            {isSending ? (
              'ENVIANDO...'
            ) : sendSuccess ? (
              <>
                <CheckCircle2 className="h-4 w-4" /> ENVIADO!
              </>
            ) : (
              <>
                <Send className="h-4 w-4" /> ENVIAR DIRETO
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
