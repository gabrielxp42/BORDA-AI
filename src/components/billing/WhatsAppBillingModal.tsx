import React, { useState } from 'react';
import { X, Send, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

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
  const [phoneNumber, setPhoneNumber] = useState(clientData?.phone || '');
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);

  if (!isOpen || !clientData) return null;

  const currentMonth = format(new Date(), 'MMMM', { locale: ptBR });
  const formattedTotal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(clientData.totalAmount);

  // Mensagem padrão formatada
  const defaultMessage = `Olá ${clientData.name}!\n\nAqui é da *Bordados Elite*.\nSegue o seu fechamento referente aos pedidos de *${currentMonth}*:\n\n👕 Total de Pedidos: ${clientData.orderCount}\n💰 *Valor Total: ${formattedTotal}*\n\nVocê pode realizar o pagamento via PIX (Chave: CNPJ XX.XXX.XXX/0001-XX).\n\nQualquer dúvida, estamos à disposição!`;

  const [message, setMessage] = useState(defaultMessage);

  const handleSend = async () => {
    if (!phoneNumber) {
      toast.error("Por favor, informe um número de WhatsApp válido.");
      return;
    }

    setIsSending(true);
    // Aqui no futuro entraremos com a chamada real para a Evolution API (como no Direct-AI)
    // ex: await fetch('https://evolution-api.../message/sendText', { ... })
    
    // Simulação de disparo
    setTimeout(() => {
      setIsSending(false);
      setSendSuccess(true);
      setTimeout(() => {
        setSendSuccess(false);
        onClose();
      }, 2000);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f0f13] border border-white/10 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl shadow-black">
        
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-emerald-900/20 to-teal-900/20">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-white font-black">Cobrar via WhatsApp</h2>
              <p className="text-zinc-400 text-xs">Enviar extrato de fechamento</p>
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

          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-zinc-400 block">Mensagem</label>
            <textarea 
              rows={8}
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:border-emerald-500/50 outline-none resize-none custom-scrollbar"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-white/5 flex justify-end gap-3">
          <button 
            onClick={onClose}
            disabled={isSending}
            className="px-6 py-2.5 rounded-xl text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            CANCELAR
          </button>
          
          <button 
            onClick={handleSend}
            disabled={isSending || sendSuccess}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-xs font-black tracking-wider uppercase transition-all shadow-lg ${
              sendSuccess 
                ? 'bg-emerald-500 shadow-emerald-500/20' 
                : 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:opacity-90 shadow-emerald-500/20 active:scale-95'
            }`}
          >
            {isSending ? (
              'ENVIANDO...'
            ) : sendSuccess ? (
              'ENVIADO!'
            ) : (
              <>
                <Send className="h-4 w-4" /> ENVIAR COBRANÇA
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
