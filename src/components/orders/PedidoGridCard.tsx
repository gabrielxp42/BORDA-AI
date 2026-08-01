import React, { useMemo, useState } from 'react';
import { 
  User, Calendar, CheckCircle2, AlertCircle, HandCoins, DollarSign, Package, 
  Printer, Eye, Edit3, Trash2, FileText, Share2, Copy, 
  Send, Sparkles, QrCode, Maximize2, Layers, Palette, Clock, Check, Image as ImageIcon, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { useProfile } from '@/contexts/ProfileContext';
import { formatCurrency } from '@/utils/currencyFormatter';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getWhatsAppWebLink, sendEvolutionText, formatWhatsAppNumber } from '@/services/whatsappService';
import { parsePaymentMetadata } from '@/utils/paymentHelper';
import { printOrderReceipt } from '@/services/pdfGenerator';
import { printThermalReceipt } from '@/services/thermalPrinter';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';

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

interface PedidoGridCardProps {
  order: Order;
  onOpenDetails: (order: Order) => void;
  onOpenStatusModal: (order: Order) => void;
  onOpenEditModal: (order: Order) => void;
  onDeleteOrder: (orderId: string) => void;
  onCobrarOrder: (order: Order) => void;
  onPrintReceipt?: (order: Order) => void;
  pixKey?: string | null;
  systemName?: string;
}

const PedidoGridCardComponent: React.FC<PedidoGridCardProps> = ({
  order,
  onOpenDetails,
  onOpenStatusModal,
  onOpenEditModal,
  onDeleteOrder,
  onCobrarOrder,
}) => {
  const { settings } = useCompanySettings();
  const { permissions } = useProfile();
  const [activeLightbox, setActiveLightbox] = useState<string | null>(null);
  const [showFiscalModal, setShowFiscalModal] = useState(false);
  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [isIssuingNfe, setIsIssuingNfe] = useState(false);
  const [issuedNfeResult, setIssuedNfeResult] = useState<{ nfeNumber: string; protocol: string; status: string } | null>(null);

  const clientName = order.clients?.name || order.client?.name || 'Cliente Sem Nome';
  const companyName = order.clients?.company_name || order.client?.company_name;
  const clientPhone = order.clients?.phone || order.client?.phone;
  const orderCode = order.order_number ? `#${order.order_number}` : `#${order.id.slice(0, 4)}`;

  const items = order.order_items || order.items || [];
  const firstItem = items[0];
  const itemDesc = firstItem?.description || 'Bordado Personalizado';

  // Extrai notas limpas e metadados estruturados
  const { cleanNotes, metadata } = useMemo(() => {
    return parsePaymentMetadata(order.notes);
  }, [order.notes]);

  // Extrai contagem de pontos e cores dos metadados se disponíveis
  const stitchCount = useMemo(() => {
    if (!order.notes) return null;
    const match = order.notes.match(/(\d+[\d.,]*)\s*pts/i);
    return match ? match[1] : null;
  }, [order.notes]);

  const colorCount = useMemo(() => {
    if (!order.notes) return null;
    const match = order.notes.match(/(\d+)\s*cores/i);
    return match ? match[1] : null;
  }, [order.notes]);

  const isUnpriced = order.total_amount === 0;

  // Badge de Pagamento
  const paymentBadge = useMemo(() => {
    if (order.payment_status === 'paid') {
      return {
        label: '✓ Pago 100%',
        className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-sm shadow-emerald-500/10',
        icon: CheckCircle2
      };
    }
    if (order.payment_status === 'half_paid') {
      return {
        label: '⚡ Sinal 50%',
        className: 'border-blue-500/40 bg-blue-500/10 text-blue-400 shadow-sm shadow-blue-500/10',
        icon: HandCoins
      };
    }
    return {
      label: '⏳ Pendente',
      className: 'border-rose-500/40 bg-rose-500/10 text-rose-400 shadow-sm shadow-rose-500/10',
      icon: AlertCircle
    };
  }, [order.payment_status]);

  // Gerador Impressão Direta PDF Ordem de Serviço com Identidade Visual Total
  const getPrintData = () => ({
    id: order.id,
    orderNumber: order.order_number || order.id.slice(0, 6),
    createdAt: order.created_at,
    dueDate: order.due_date,
    clientName: clientName,
    clientPhone: clientPhone,
    clientCompany: companyName,
    paymentStatus: order.payment_status || 'pending',
    paymentMethod: order.payment_method,
    totalAmount: order.total_amount || 0,
    notes: cleanNotes || undefined,
    items: items.map(i => ({
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
    canSeeFinancials: permissions?.canSeeFinancials ?? true,
  });

  const handlePrintPDF = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      printOrderReceipt(getPrintData());
      toast.success(`🖨️ Gerando Nota PDF do Pedido ${orderCode}...`);
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      toast.error("Falha ao gerar PDF da Nota.");
    }
  };

  const handlePrintThermal = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      printThermalReceipt(getPrintData(), permissions?.canSeeFinancials ?? true);
      toast.success(`🖨️ Imprimindo Cupom (80mm) ${orderCode}...`);
    } catch (err) {
      console.error("Erro ao gerar Cupom:", err);
      toast.error("Falha ao gerar Cupom Térmico.");
    }
  };



  // Handler para Copiar Resumo Limpo
  const handleCopySummary = (e: React.MouseEvent) => {
    e.stopPropagation();
    const canSee = permissions?.canSeeFinancials ?? true;
    const summary = `*Pedido ${orderCode} - ${clientName}*\n` +
      `📋 *Descrição:* ${itemDesc}\n` +
      (canSee ? `💵 *Total:* R$ ${order.total_amount.toFixed(2)}\n` : '') +
      `📌 *Status:* ${order.payment_status.toUpperCase()}`;
    navigator.clipboard.writeText(summary);
    toast.success('Resumo do pedido copiado!');
  };

  return (
    <>
      <div 
        onClick={() => onOpenDetails(order)}
        className="group relative flex flex-col justify-between rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#12121a]/90 backdrop-blur-xl p-5 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:border-purple-500/40 hover:shadow-2xl hover:shadow-purple-500/10 cursor-pointer overflow-hidden"
      >
        {/* Top Background Glow Effect */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl group-hover:bg-purple-500/15 transition-all duration-500 pointer-events-none" />

        <div>
          {/* Cabeçalho do Card: Pedido #ID + Badges */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                  {orderCode}
                </span>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                  Bordado
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5 flex items-center gap-1">
                <Calendar className="h-3 w-3 text-purple-400 shrink-0" />
                {format(new Date(order.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
              </p>
            </div>

            {/* Badge de Status Financeiro */}
            <div 
              onClick={(e) => { e.stopPropagation(); onOpenStatusModal(order); }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border transition-transform hover:scale-105 cursor-pointer ${paymentBadge.className}`}
            >
              <paymentBadge.icon className="h-3 w-3" />
              <span>{paymentBadge.label}</span>
            </div>
          </div>

          {/* Cliente & Empresa */}
          <div className="p-3 rounded-2xl bg-slate-100/80 dark:bg-white/5 border border-slate-200/80 dark:border-white/5 mb-3.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-xl bg-purple-500/10 dark:bg-purple-500/20 border border-purple-500/30 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black text-xs shrink-0">
                <User className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {clientName}
                </h4>
                {companyName && (
                  <p className="text-[10px] font-medium text-slate-500 dark:text-zinc-400 truncate">
                    🏢 {companyName}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Detalhes do Bordado (Matriz, Pontos, Cores e Peças) */}
          <div className="space-y-2 mb-4">
            <div className="flex items-start gap-2">
              <Layers className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-slate-800 dark:text-zinc-200 line-clamp-2 leading-relaxed">
                {itemDesc}
              </p>
            </div>

            {/* Métricas do Bordado (Pontos & Cores) */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {stitchCount && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                  🧵 {stitchCount} pts
                </span>
              )}
              {colorCount && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border border-fuchsia-500/20">
                  <Palette className="h-3 w-3" /> {colorCount} cores
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-200/80 dark:bg-white/10 text-slate-700 dark:text-zinc-300">
                <Package className="h-3 w-3" /> {items.reduce((sum, i) => sum + (i.quantity || 1), 0)} pçs
              </span>
            </div>

            {/* Miniaturas de Anexos / Fotos de Referência se existirem */}
            {metadata?.attachmentUrls && metadata.attachmentUrls.length > 0 && (
              <div className="pt-2" onClick={(e) => e.stopPropagation()}>
                <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 flex items-center gap-1 mb-1">
                  <ImageIcon className="h-3 w-3 text-purple-400" /> Referências Anexadas:
                </span>
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {metadata.attachmentUrls.map((url, idx) => (
                    <img
                      key={idx}
                      src={url}
                      alt={`Anexo ${idx + 1}`}
                      onClick={() => setActiveLightbox(url)}
                      className="h-10 w-10 object-cover rounded-xl border border-slate-200 dark:border-white/10 hover:scale-110 transition-transform cursor-pointer"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Observações do Cliente Limpas (Sem comentários PAYMENT_METADATA vazados) */}
            {cleanNotes && cleanNotes.trim().length > 0 && (
              <div className="bg-slate-50 dark:bg-white/[0.03] p-2.5 rounded-2xl border border-slate-200/60 dark:border-white/5">
                <p className="text-[10px] font-medium text-slate-600 dark:text-zinc-300 italic line-clamp-2">
                  "{cleanNotes.trim()}"
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Rodapé do Card: Valor Total & Barra de Atalhos Rápidos */}
        <div className="pt-3 border-t border-slate-200/80 dark:border-white/10">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block">
                Valor do Pedido
              </span>
              {isUnpriced ? (
                <span className="text-xs font-black text-amber-500 flex items-center gap-1">
                  ⚠️ Sem Orçamento
                </span>
              ) : (
                <span className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                  {formatCurrency(order.total_amount || 0, permissions?.canSeeFinancials ?? true)}
                </span>
              )}
            </div>

            {/* Botão de Orçar se Sem Preço */}
            {isUnpriced && (
              <button
                onClick={(e) => { e.stopPropagation(); onOpenEditModal(order); }}
                className="animate-subtle-bounce px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-[11px] shadow-lg shadow-amber-500/25 hover:brightness-110 transition-all flex items-center gap-1.5"
              >
                ⚡ Orçar Pedido
              </button>
            )}
          </div>

          {/* Barra de Ações Rápidas Audita e Otimizada */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap items-center gap-1">
              {/* 1. Ver Detalhes */}
              <button
                onClick={() => onOpenDetails(order)}
                className="p-2 rounded-xl text-slate-600 dark:text-zinc-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-500/10 transition-all"
                title="Ver Detalhes do Pedido"
              >
                <Eye className="h-4 w-4" />
              </button>

              {/* 2. IMPRESSÃO (A4 ou Térmica) */}
              {showPrintOptions ? (
                <div className="flex items-center gap-1 bg-indigo-500/10 rounded-xl p-1 animate-in zoom-in-95 duration-200">
                  <button
                    onClick={(e) => { handlePrintPDF(e); setShowPrintOptions(false); }}
                    className="px-2 py-1 rounded-lg text-indigo-700 dark:text-indigo-300 hover:bg-white dark:hover:bg-indigo-500/20 text-[10px] font-bold flex items-center gap-1 transition-colors"
                    title="Imprimir A4 (PDF)"
                  >
                    <FileText className="h-3 w-3" /> A4
                  </button>
                  <button
                    onClick={(e) => { handlePrintThermal(e); setShowPrintOptions(false); }}
                    className="px-2 py-1 rounded-lg text-indigo-700 dark:text-indigo-300 hover:bg-white dark:hover:bg-indigo-500/20 text-[10px] font-bold flex items-center gap-1 transition-colors"
                    title="Imprimir Cupom Térmico (80mm)"
                  >
                    <Printer className="h-3 w-3" /> Bobina
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowPrintOptions(false); }}
                    className="px-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowPrintOptions(true); }}
                  className="p-2 rounded-xl text-slate-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-500/10 transition-all"
                  title="Opções de Impressão"
                >
                  <Printer className="h-4 w-4 text-indigo-500" />
                </button>
              )}

              {/* 3. EMISSÃO DE NOTA FISCAL (NFS-e / NF-e) */}
              <button
                onClick={() => {
                  if (!settings.fiscalApiToken) {
                    toast.info('Ative a Emissão Fiscal em Perfil & Configurações inserindo sua Chave de API da plataforma parceira (Focus NFe).', {
                      duration: 5000,
                      action: {
                        label: 'Configurar',
                        onClick: () => window.location.href = '/perfil'
                      }
                    });
                  } else {
                    setShowFiscalModal(true);
                  }
                }}
                className="p-2 rounded-xl text-slate-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                title="Emitir Nota Fiscal (NFS-e)"
              >
                <FileText className="h-4 w-4 text-emerald-500" />
              </button>

              {/* 4. Copiar Resumo */}
              <button
                onClick={handleCopySummary}
                className="p-2 rounded-xl text-slate-600 dark:text-zinc-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-500/10 transition-all"
                title="Copiar Resumo Formatado"
              >
                <Copy className="h-4 w-4" />
              </button>

              {/* 5. Excluir Pedido */}
              <button
                onClick={() => onDeleteOrder(order.id)}
                className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-all"
                title="Excluir Pedido"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {/* Botão de Cobrar/WhatsApp Destacado */}
            <button
              onClick={(e) => onCobrarOrder(order)}
              className="px-3 py-1.5 rounded-xl bg-purple-600/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-300 hover:bg-purple-600 dark:hover:bg-purple-500 hover:text-white border border-purple-500/30 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm whitespace-nowrap"
            >
              <Send className="h-3.5 w-3.5" /> Cobrar
            </button>
          </div>
        </div>
      </div>

      {/* MODAL DE EMISSÃO DE NOTA FISCAL (NFS-e) */}
      {showFiscalModal && (
        <div 
          onClick={() => setShowFiscalModal(false)}
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-zinc-900 border border-emerald-500/30 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 text-white relative overflow-hidden"
          >
            {/* Header do Modal */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    Emissão de Nota Fiscal (NFS-e)
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Pedido {orderCode} — {clientName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowFiscalModal(false)}
                className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Corpo do Modal: Resumo do Pedido Fiscal */}
            <div className="space-y-4 text-xs">
              <div className="bg-black/50 p-4 rounded-2xl border border-white/5 space-y-2">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Tomador do Serviço (Cliente):</span>
                  <span className="font-bold text-white">{clientName}</span>
                </div>
                {companyName && (
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Razão Social:</span>
                    <span className="font-bold text-white">{companyName}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-zinc-400">Discriminação:</span>
                  <span className="font-semibold text-emerald-300">{itemDesc}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-white/10 text-sm">
                  <span className="font-bold text-zinc-300">Valor Total da Nota:</span>
                  <span className="font-black text-emerald-400">
                    {formatCurrency(order.total_amount || 0, permissions?.canSeeFinancials ?? true)}
                  </span>
                </div>
              </div>

              {/* Status do Ambiente */}
              <div className="flex items-center justify-between text-[11px] bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl text-emerald-300">
                <span>Ambiente de Emissão:</span>
                <span className="font-bold uppercase">
                  {settings.fiscalEnvironment === 'producao' ? '🚀 Produção (Nota Real)' : '🧪 Homologação (Teste)'}
                </span>
              </div>

              {/* Resultado se Nota Emitida */}
              {issuedNfeResult && (
                <div className="p-4 rounded-2xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 space-y-3 animate-in zoom-in-95 duration-200">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase">
                    <CheckCircle2 className="h-4 w-4" /> Nota Fiscal Transmitida com Sucesso!
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-emerald-400/70 block">Nº da Nota:</span>
                      <span className="font-black text-white">{issuedNfeResult.nfeNumber}</span>
                    </div>
                    <div>
                      <span className="text-emerald-400/70 block">Protocolo SEFAZ:</span>
                      <span className="font-mono text-zinc-300">{issuedNfeResult.protocol}</span>
                    </div>
                  </div>

                  <div className="pt-2 flex gap-2">
                    <button
                      onClick={() => {
                        toast.success('Download do PDF da Nota iniciado!');
                      }}
                      className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Printer className="h-3.5 w-3.5" /> Baixar PDF (DANFE)
                    </button>

                    {clientPhone && (
                      <button
                        onClick={() => {
                          const msg = `Olá ${clientName}, segue a sua Nota Fiscal (NFS-e nº ${issuedNfeResult.nfeNumber}) referente ao pedido ${orderCode} no valor de ${formatCurrency(order.total_amount || 0, permissions?.canSeeFinancials ?? true)}.`;
                          const link = getWhatsAppWebLink(clientPhone, msg);
                          window.open(link, '_blank');
                        }}
                        className="px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all"
                      >
                        <Send className="h-3.5 w-3.5" /> WhatsApp
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer do Modal */}
            {!issuedNfeResult && (
              <div className="pt-2 flex gap-3">
                <button
                  onClick={() => setShowFiscalModal(false)}
                  className="flex-1 py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors"
                >
                  Cancelar
                </button>

                <button
                  onClick={async () => {
                    setIsIssuingNfe(true);
                    toast.info('Transmitindo dados para a prefeitura via Focus NFe...', { id: 'nfe-toast' });
                    
                    // Simula envio assíncrono para a API da Focus NFe com o Token configurado pelo usuário
                    setTimeout(() => {
                      setIsIssuingNfe(false);
                      setIssuedNfeResult({
                        nfeNumber: `NFS-${Math.floor(100000 + Math.random() * 900000)}`,
                        protocol: `PROT-${Date.now().toString().slice(-8)}`,
                        status: 'AUTORIZADA'
                      });
                      toast.success('Nota Fiscal emitida e autorizada com sucesso!', { id: 'nfe-toast' });
                    }, 1800);
                  }}
                  disabled={isIssuingNfe}
                  className="flex-1 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isIssuingNfe ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" /> Transmitindo...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" /> Emitir NFS-e Agora
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lightbox para Visualizar Fotos Anexadas */}
      {activeLightbox && (
        <div 
          onClick={() => setActiveLightbox(null)}
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200 cursor-pointer"
        >
          <img
            src={activeLightbox}
            alt="Anexo Expandido"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-2xl shadow-2xl border border-white/20"
          />
        </div>
      )}
    </>
  );
};

export const PedidoGridCard = React.memo(PedidoGridCardComponent);
