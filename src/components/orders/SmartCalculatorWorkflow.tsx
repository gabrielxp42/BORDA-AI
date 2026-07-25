import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, UserPlus, Calendar, Plus, Trash2, Package, Save, Lock, Layers, Sparkles, 
  CheckCircle2, DollarSign, ChevronDown, Check, Upload, FileCheck, ChevronUp, 
  Sliders, Send, Clock, CreditCard, Landmark, Coins, ArrowRight, ArrowLeft, Camera, Paperclip,
  MessageSquare, Image, FileText, QrCode
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { calculateEmbroideryPrice } from '@/services/pricingEngine';
import { EmbroideryDropzone } from '../ui/EmbroideryDropzone';
import { EmbroideryMetadata } from '@/utils/embroideryParser';
import { ClientSelect } from '../ui/ClientSelect';
import { DatePicker } from '../ui/DatePicker';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { usePricing } from '@/contexts/PricingContext';
import { useProfile } from '@/contexts/ProfileContext';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { serializePaymentMetadata, updatePaymentMetadata } from '@/utils/paymentHelper';
import { sendEvolutionText, getWhatsAppWebLink, formatWhatsAppNumber } from '@/services/whatsappService';
import { useBackgroundTasks } from '@/hooks/useBackgroundTasks';

interface InitialOrderData {
  clientId?: string;
  matrixName?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  orderId?: string;
}

interface SmartCalculatorWorkflowProps {
  mode: 'modal' | 'standalone';
  onClose?: () => void;
  initialData?: InitialOrderData | null;
  onOrderCreated?: () => void;
}

export const SmartCalculatorWorkflow: React.FC<SmartCalculatorWorkflowProps> = ({
  mode,
  onClose,
  initialData,
  onOrderCreated
}) => {
  const { settings } = useCompanySettings();
  const { rules, openPricingModal } = usePricing();
  const { isUnlocked } = useProfile();
  const navigate = useNavigate();

  // Active step: 1 = Orçamento, 2 = Fechamento (only relevant if saving order)
  const [step, setStep] = useState<1 | 2>(1);

  // Background Task Store
  const addTask = useBackgroundTasks(state => state.addTask);
  const updateTask = useBackgroundTasks(state => state.updateTask);
  const updateStep = useBackgroundTasks(state => state.updateStep);

  // Input States
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [matrixName, setMatrixName] = useState<string>('');
  const [stitchCount, setStitchCount] = useState<number | ''>('');
  const [colorCount, setColorCount] = useState<number | ''>('');
  const [quantity, setQuantity] = useState<number | ''>(1);

  // WhatsApp Smart Automation Toggles (Chaves WhatsApp ao Salvar)
  const [whatsappNotifyReceipt, setWhatsappNotifyReceipt] = useState<boolean>(true);
  const [whatsappRequestRef, setWhatsappRequestRef] = useState<boolean>(false);
  const [whatsappSendSummary, setWhatsappSendSummary] = useState<boolean>(false);
  const [whatsappSendPix, setWhatsappSendPix] = useState<boolean>(false);

  // Addon States
  const [isBigHoop, setIsBigHoop] = useState<boolean>(false);
  const [isReadyPiece, setIsReadyPiece] = useState<boolean>(false);
  const [isFringe, setIsFringe] = useState<boolean>(false);
  const [hasLaser, setHasLaser] = useState<boolean>(false);
  const [hasPress, setHasPress] = useState<boolean>(false);

  // File Dropzone Accordion
  const [isDropzoneExpanded, setIsDropzoneExpanded] = useState<boolean>(false);
  const [lastParsedFile, setLastParsedFile] = useState<string | null>(null);
  const [parsedMatrixFile, setParsedMatrixFile] = useState<File | null>(null);
  const [parsedMatrixMeta, setParsedMatrixMeta] = useState<EmbroideryMetadata | null>(null);
  const [saveToLibrary, setSaveToLibrary] = useState<boolean>(true);

  // Saved client matrices
  const [clientMatrices, setClientMatrices] = useState<any[]>([]);
  const [loadingMatrices, setLoadingMatrices] = useState<boolean>(false);
  const [showMatrixSelector, setShowMatrixSelector] = useState<boolean>(false);
  const [selectedMatrixId, setSelectedMatrixId] = useState<string | null>(null);

  // Step 2: Fechamento States
  const [dueDate, setDueDate] = useState<Date | null>(new Date());
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid' | 'half_paid'>('pending');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'credit_card' | 'cash' | 'transfer'>('pix');
  const [isPaymentMethodOpen, setIsPaymentMethodOpen] = useState(false);
  const [observations, setObservations] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [depositAmount, setDepositAmount] = useState<number>(0);
  const [entryMode, setEntryMode] = useState<'budget' | 'quick'>('quick');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

  // Compute live price
  const calculation = calculateEmbroideryPrice(
    {
      stitchCount: Math.max(0, Number(stitchCount) || 0),
      colorCount: Math.max(1, Number(colorCount) || 1),
      quantity: Math.max(1, Number(quantity) || 1),
      isBigHoop,
      isReadyPiece,
      isFringe,
      hasLaser,
      hasPress,
    },
    rules
  );

  // Tempo Estimado de Máquina (Base industrial 700 pts/min + 1 min por troca de cor)
  const estimatedMinutesPerPiece = useMemo(() => {
    const stitches = Number(stitchCount) || 0;
    const colors = Math.max(1, Number(colorCount) || 1);
    if (stitches <= 0) return 0;
    const mins = Math.ceil(stitches / 700) + (colors > 1 ? colors * 1 : 0);
    return Math.max(1, mins);
  }, [stitchCount, colorCount]);

  const totalEstimatedMinutes = useMemo(() => {
    const qty = Math.max(1, Number(quantity) || 1);
    return estimatedMinutesPerPiece * qty;
  }, [estimatedMinutesPerPiece, quantity]);

  const formatTimeLabel = (minutes: number) => {
    if (minutes <= 0) return '0 min';
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hrs > 0) {
      return mins > 0 ? `${hrs}h ${mins}min` : `${hrs}h`;
    }
    return `${mins} min`;
  };

  // Populate initialData if provided
  useEffect(() => {
    if (initialData) {
      if (initialData.clientId) setSelectedClientId(initialData.clientId);
      if (initialData.matrixName) setMatrixName(initialData.matrixName);
      if (initialData.quantity) setQuantity(initialData.quantity);
      if (initialData.orderId) {
        setEntryMode('budget');
      }
    }
  }, [initialData]);

  // Auto-set deposit to 50% when half_paid is selected
  useEffect(() => {
    if (paymentStatus === 'half_paid') {
      setDepositAmount(Number((calculation.totalPrice / 2).toFixed(2)));
    } else {
      setDepositAmount(0);
    }
  }, [paymentStatus, calculation.totalPrice]);

  // Fetch client matrices
  useEffect(() => {
    if (selectedClientId) {
      fetchClientMatrices(selectedClientId);
    } else {
      setClientMatrices([]);
      setShowMatrixSelector(false);
    }
  }, [selectedClientId]);

  const fetchClientMatrices = async (clientId: string) => {

    setLoadingMatrices(true);
    try {
      const { data: matricesData, error: mError } = await supabase
        .from('matrices')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (mError) throw mError;

      if (!matricesData || matricesData.length === 0) {
        setClientMatrices([]);
        return;
      }

      const matrixIds = matricesData.map(m => m.id);
      const { data: versionsData } = await supabase
        .from('matrix_versions')
        .select('*')
        .in('matrix_id', matrixIds);

      const combined = matricesData.map(m => {
        const ver = versionsData?.find(v => v.id === m.current_version_id || v.matrix_id === m.id);
        return { ...m, current_version: ver };
      });

      setClientMatrices(combined);
      if (combined.length > 0) {
        setShowMatrixSelector(true);
      }
    } catch (err) {
      console.error("Erro ao buscar matrizes do cliente:", err);
    } finally {
      setLoadingMatrices(false);
    }
  };

  const handleSelectSavedMatrix = (matrix: any) => {
    setMatrixName(matrix.name);
    setSelectedMatrixId(matrix.id);
    const ver = matrix.current_version;
    if (ver) {
      if (ver.stitch_count) setStitchCount(ver.stitch_count);
      if (ver.color_count) setColorCount(ver.color_count);
    }
    toast.success(`Matriz "${matrix.name}" carregada!`);
  };

  const handleFileParsed = (meta: EmbroideryMetadata, file: File) => {
    if (meta.name) setMatrixName(meta.name);
    if (meta.stitches) setStitchCount(meta.stitches);
    if (meta.colors) setColorCount(meta.colors);
    setLastParsedFile(meta.name || 'Matriz Importada');
    setParsedMatrixFile(file);
    setParsedMatrixMeta(meta);
    setIsDropzoneExpanded(false);
    toast.success(`Arquivo carregado: ${meta.name || 'Matriz'}`);
  };

  const handleFileAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setAttachedFiles(prev => [...prev, ...Array.from(e.target.files as FileList)]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreateOrder = async () => {
    if (!selectedClientId) {
      toast.error("Selecione um cliente.");
      return;
    }
    if (!matrixName.trim()) {
      toast.error(entryMode === 'quick' ? "Informe a descrição das peças." : "Informe o nome da matriz.");
      return;
    }
    if (entryMode === 'budget') {
      if (!stitchCount || Number(stitchCount) <= 0) {
        toast.error("Informe a quantidade de pontos.");
        return;
      }
    }

    setIsSaving(true);
    try {
      // 1. Upload attachments to Supabase Storage
      const uploadedUrls: string[] = [];
      for (const file of attachedFiles) {
        try {
          const ext = file.name.split('.').pop();
          const filePath = `${selectedClientId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from('order-attachments')
            .upload(filePath, file, { cacheControl: '3600', upsert: false });
          if (!upErr) {
            const { data: urlData } = supabase.storage
              .from('order-attachments')
              .getPublicUrl(filePath);
            if (urlData?.publicUrl) uploadedUrls.push(urlData.publicUrl);
          }
        } catch (e) {
          console.error('Attachment upload error:', e);
        }
      }

      // 2. Generate payment metadata
      const isQuick = entryMode === 'quick';
      const initialMetadata = updatePaymentMetadata(
        {},
        isQuick ? 'pending' : paymentStatus,
        isQuick ? 0 : calculation.totalPrice,
        isQuick ? 'pix' : paymentMethod,
        isQuick ? undefined : depositAmount
      );
      
      if (isQuick) {
        initialMetadata.isQuickEntry = true;
      }
      if (uploadedUrls.length > 0) {
        initialMetadata.attachmentUrls = uploadedUrls;
      }
      const notesWithMetadata = serializePaymentMetadata(observations, initialMetadata);

      // 1.5 Save to library if toggled
      if (!isQuick && saveToLibrary && parsedMatrixFile && selectedClientId) {
        try {
          const { data: mxData } = await supabase
            .from('matrices')
            .insert({
              name: matrixName.trim(),
              client_id: selectedClientId,
              code: `MAT-${Date.now().toString(36).toUpperCase()}`,
              status: 'approved',
              category: 'Geral',
            })
            .select()
            .single();

          if (mxData) {
            const ext = parsedMatrixFile.name.split('.').pop();
            const filePath = `${mxData.id}/${Date.now()}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from('embroidery_files')
              .upload(filePath, parsedMatrixFile);

            if (!upErr) {
              const fileUrl = supabase.storage.from('embroidery_files').getPublicUrl(filePath).data.publicUrl;
              const { data: verData } = await supabase
                .from('matrix_versions')
                .insert({
                  matrix_id: mxData.id,
                  version_number: 1,
                  file_name: parsedMatrixFile.name,
                  file_url: fileUrl,
                  file_format: parsedMatrixMeta?.format || ext || 'dst',
                  stitch_count: Number(stitchCount) || 0,
                  width_mm: parsedMatrixMeta?.widthMm || 0,
                  height_mm: parsedMatrixMeta?.heightMm || 0,
                  color_count: Number(colorCount) || 1,
                  estimated_time_minutes: Math.round((Number(stitchCount) / 1000) * 0.7),
                })
                .select()
                .single();

              if (verData) {
                await supabase.from('matrices').update({ current_version_id: verData.id }).eq('id', mxData.id);
                // Link the order item to this matrix
                setSelectedMatrixId(mxData.id);
              }
            }
            toast.success('✅ Matriz salva na biblioteca do cliente!');
          }
        } catch (libErr) {
          console.error('Erro ao salvar na biblioteca:', libErr);
        }
      }

      // 2. Insert or Update Order
      let order;
      let orderError;

      if (initialData?.orderId) {
        // If editing/precificando an existing order
        const { data: updatedOrder, error: uError } = await supabase
          .from('orders')
          .update({
            client_id: selectedClientId,
            payment_status: paymentStatus,
            payment_method: paymentMethod,
            due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
            total_amount: calculation.totalPrice,
            notes: notesWithMetadata
          })
          .eq('id', initialData.orderId)
          .select()
          .single();
        order = updatedOrder;
        orderError = uError;

        if (!orderError) {
          // Delete old placeholder item
          await supabase
            .from('order_items')
            .delete()
            .eq('order_id', initialData.orderId);
        }
      } else {
        const { data: insertedOrder, error: iError } = await supabase
          .from('orders')
          .insert({
            client_id: selectedClientId,
            status: 'pending',
            payment_status: isQuick ? 'pending' : paymentStatus,
            payment_method: isQuick ? 'pix' : paymentMethod,
            due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
            total_amount: isQuick ? 0 : calculation.totalPrice,
            notes: notesWithMetadata
          })
          .select()
          .single();
        order = insertedOrder;
        orderError = iError;
      }

      if (orderError) throw orderError;

      // 3. Insert Order Item
      if (order) {
        const { error: itemError } = await supabase
          .from('order_items')
          .insert({
            order_id: order.id,
            matrix_id: selectedMatrixId || null,
            description: isQuick 
              ? `Entrada: ${matrixName}`
              : `Bordado: ${matrixName} (${stitchCount.toLocaleString()} pts, ${colorCount || 1} cores)`,
            quantity: Number(quantity) || 1,
            unit_price: isQuick ? 0 : calculation.unitPrice,
            total_price: isQuick ? 0 : calculation.totalPrice
          });

        if (itemError) {
          console.error('Error inserting order_item. Does matrix_id exist?', itemError);
          // If it failed because of matrix_id, fallback without it
          await supabase.from('order_items').insert({
            order_id: order.id,
            description: isQuick ? `Entrada: ${matrixName}` : `Bordado: ${matrixName} (${stitchCount.toLocaleString()} pts, ${colorCount || 1} cores)`,
            quantity: Number(quantity) || 1,
            unit_price: isQuick ? 0 : calculation.unitPrice,
            total_price: isQuick ? 0 : calculation.totalPrice
          });
        }
      }

      toast.success(initialData?.orderId ? "Pedido atualizado com sucesso!" : "Pedido criado com sucesso!");

      // 4. Fecha a modal e atualiza a interface INSTANTANEAMENTE (sem travar no botão de registrando)
      if (onOrderCreated) {
        onOrderCreated();
      }
      
      if (mode === 'modal' && onClose) {
        onClose();
      } else if (mode === 'standalone') {
        navigate('/pedidos');
      }

      // 5. DISPARO DA AUTOMAÇÃO WHATSAPP EM SEGUNDO PLANO (TASK DOCK)
      if ((whatsappNotifyReceipt || whatsappRequestRef || whatsappSendSummary || whatsappSendPix) && selectedClientId) {
        (async () => {
          try {
            const { data: clientData } = await supabase
              .from('clients')
              .select('name, phone')
              .eq('id', selectedClientId)
              .maybeSingle();

            if (clientData?.phone && clientData.phone.trim()) {
              const clientName = clientData.name || 'Cliente';
              const orderCode = order?.id ? `#${order.id.slice(0, 4)}` : '';
              const itemDesc = matrixName || notes || 'Peças para bordado';

              const msgLines: string[] = [
                `*Entrada de Pedido - ${settings.systemName}* 🧵✨\n`,
                `Olá, *${clientName}*!`
              ];

              if (whatsappNotifyReceipt) {
                msgLines.push(`📦 *Confirmação de Recebimento:* Suas peças (*${itemDesc}*, ${quantity || 1}x) foram recebidas com sucesso em nossa oficina e deram entrada no sistema.`);
              }

              if (whatsappRequestRef) {
                msgLines.push(`🖼️ *Solicitação de Imagem/Arte:* Por favor, nos envie aqui no WhatsApp a imagem/referência do seu bordado em alta resolução para a programação da matriz.`);
              }

              if (whatsappSendSummary) {
                msgLines.push(`📋 *Ficha de Registro:* Entrada ${orderCode} registrada no sistema da oficina.`);
              }

              if (whatsappSendPix) {
                msgLines.push(`💳 *Dados para Pagamento via PIX:*\nChave PIX: *${settings.pixKey || 'Consulte a chave no ateliê'}*`);
              }

              msgLines.push(`\nQualquer dúvida estamos à disposição!`);
              const autoMsg = msgLines.join('\n\n');

              // Adiciona a tarefa ao painel flutuante de TAREFAS EM SEGUNDO PLANO (TaskDock)
              const taskId = addTask({
                title: `Automação WhatsApp (${clientName})`,
                description: `Enviando confirmação de entrada para ${clientName}...`,
                status: 'processing',
                progress: 30,
                steps: [
                  { id: 'prep', label: 'Montando Ficha de Entrada', status: 'completed' },
                  { id: 'send', label: 'Conectando Evolution API', status: 'loading' },
                  { id: 'done', label: 'Entrega no WhatsApp', status: 'pending' },
                ]
              });

              const toastId = toast.loading(`Disparando WhatsApp para ${clientName}...`);

              try {
                updateStep(taskId, 'send', 'completed');
                updateStep(taskId, 'done', 'loading');
                updateTask(taskId, { progress: 70, status: 'sending' });

                await sendEvolutionText(clientData.phone, autoMsg);

                updateStep(taskId, 'done', 'completed');
                updateTask(taskId, {
                  progress: 100,
                  status: 'completed',
                  description: `Notificação enviada com sucesso para ${clientName}!`
                });

                const webLink = getWhatsAppWebLink(clientData.phone, autoMsg);
                toast.success(`⚡ Automação enviada com sucesso para ${clientName}!`, {
                  id: toastId,
                  action: {
                    label: "Conferir Web",
                    onClick: () => window.open(webLink, '_blank')
                  }
                });
              } catch (err: any) {
                console.warn("Falha no disparo automático WhatsApp:", err);

                updateTask(taskId, {
                  status: 'error',
                  progress: 100,
                  error: err.message || 'Falha no envio direto'
                });

                const webLink = getWhatsAppWebLink(clientData.phone, autoMsg);
                window.open(webLink, '_blank');
                toast.info(`Evolution API indisponível. Abrindo WhatsApp Web para ${clientName}...`, { id: toastId });
              }
            }
          } catch (autoErr) {
            console.warn("Erro ao buscar dados do cliente para notificação:", autoErr);
          }
        })();
      }
    } catch (err) {
      console.error("Erro ao registrar pedido:", err);
      toast.error("Erro ao registrar pedido.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleShareWhatsApp = async () => {
    if (!selectedClientId) {
      toast.error('Selecione um cliente para enviar a cobrança.');
      return;
    }

    try {
      const { data: client, error } = await supabase
        .from('clients')
        .select('name, phone, company_name')
        .eq('id', selectedClientId)
        .single();

      if (error || !client) {
        toast.error('Erro ao recuperar dados do cliente.');
        return;
      }

      if (!client.phone || !client.phone.trim()) {
        toast.error('O cliente selecionado não tem telefone/WhatsApp cadastrado.');
        return;
      }

      const clientName = client.name || 'Cliente';
      const formattedTotal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculation.totalPrice);
      const formattedUnit = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculation.unitPrice);

      const message = `*Orçamento de Bordado - ${settings.systemName}* 🧵✨\n\n` +
        `Olá, *${clientName}*! Seguem os detalhes do seu orçamento de produção:\n\n` +
        `📋 *Matriz/Descrição:* ${matrixName || 'Bordado Personalizado'}\n` +
        `🧵 *Pontos:* ${Number(stitchCount || 0).toLocaleString('pt-BR')} pts (${colorCount || 1} cores)\n` +
        `📦 *Quantidade:* ${quantity || 1} peças\n` +
        `💰 *Valor Unitário:* ${formattedUnit}\n` +
        `💵 *VALOR TOTAL DO PEDIDO:* *${formattedTotal}*\n\n` +
        `✨ Ficamos no aguardo da sua confirmação para iniciar a produção!`;

      // 1. Adiciona a tarefa ao painel flutuante de TAREFAS EM SEGUNDO PLANO (TaskDock)
      const taskId = addTask({
        title: `Orçamento (${matrixName || 'Bordado'})`,
        description: `Enviando para ${clientName}...`,
        status: 'processing',
        progress: 25,
        steps: [
          { id: 'prep', label: 'Gerando Orçamento', status: 'completed' },
          { id: 'send', label: 'Conectando Evolution API', status: 'loading' },
          { id: 'done', label: 'Envio WhatsApp', status: 'pending' },
        ]
      });

      const toastId = toast.loading(`Enviando cobrança de ${formattedTotal} para ${clientName} via WhatsApp...`);
      
      try {
        updateStep(taskId, 'send', 'completed');
        updateStep(taskId, 'done', 'loading');
        updateTask(taskId, { progress: 65, status: 'sending' });

        await sendEvolutionText(client.phone, message);

        updateStep(taskId, 'done', 'completed');
        updateTask(taskId, {
          progress: 100,
          status: 'completed',
          description: `Enviado com sucesso para ${clientName}!`
        });

        toast.success(`⚡ Orçamento enviado com sucesso para ${clientName}!`, { id: toastId });
      } catch (evoErr: any) {
        console.warn('Falha no envio direto via Evolution API, abrindo WhatsApp Web:', evoErr);
        
        updateTask(taskId, {
          status: 'error',
          progress: 100,
          error: evoErr.message || 'Falha no envio direto'
        });

        const webLink = getWhatsAppWebLink(client.phone, message);
        window.open(webLink, '_blank');
        toast.info(`Evolution API indisponível. Abrindo WhatsApp Web para ${clientName}...`, { id: toastId });
      }
    } catch (err: any) {
      toast.error('Erro ao processar cobrança via WhatsApp.');
    }
  };

  const isFormValid = entryMode === 'quick'
    ? selectedClientId && matrixName.trim() && quantity && Number(quantity) > 0
    : selectedClientId && matrixName.trim() && stitchCount && Number(stitchCount) > 0 && quantity && Number(quantity) > 0;

  const renderAttachments = () => (
    <div className="mt-4 border-t border-slate-200 dark:border-white/10 pt-4">
      <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-2 block flex items-center gap-2">
        <Paperclip className="h-3.5 w-3.5" style={{ color: settings.primaryColor }} /> Anexos e Fotos (Opcional)
      </label>
      <div className="flex flex-wrap gap-3">
        {attachedFiles.map((file, idx) => (
          <div key={idx} className="relative group w-16 h-16 rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-slate-100 dark:bg-white/5 flex items-center justify-center">
            {file.type.startsWith('image/') ? (
              <img src={URL.createObjectURL(file)} alt="Anexo" className="w-full h-full object-cover" />
            ) : (
              <FileCheck className="h-6 w-6 text-slate-400" />
            )}
            <button 
              type="button" 
              onClick={() => removeAttachment(idx)} 
              className="absolute top-1 right-1 p-1 bg-red-500 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <input
          type="file"
          id="camera-upload"
          accept="image/*"
          capture="environment"
          onChange={handleFileAttachment}
          className="hidden"
        />
        <label htmlFor="camera-upload" className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 dark:border-white/20 flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-slate-500 hover:text-slate-700 dark:hover:text-zinc-300 hover:border-slate-400 dark:hover:border-white/30">
          <Camera className="h-5 w-5" />
          <span className="text-[8px] font-bold uppercase">Câmera</span>
        </label>
        
        <input
          type="file"
          id="file-upload"
          multiple
          accept="image/*,application/pdf"
          onChange={handleFileAttachment}
          className="hidden"
        />
        <label htmlFor="file-upload" className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 dark:border-white/20 flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-slate-500 hover:text-slate-700 dark:hover:text-zinc-300 hover:border-slate-400 dark:hover:border-white/30">
          <Paperclip className="h-5 w-5" />
          <span className="text-[8px] font-bold uppercase">Arquivo</span>
        </label>
      </div>
    </div>
  );

  return (
    <div className="w-full flex flex-col h-full">
      {/* Workflow Header - Steps */}
      <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 pr-12 sm:pr-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-2xl flex items-center justify-center border transition-colors shrink-0" style={{ backgroundColor: `${settings.primaryColor}20`, borderColor: `${settings.primaryColor}30`, color: settings.primaryColor }}>
            <Package className="h-4 w-4 sm:h-5 sm:w-5 animate-pulse" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xs sm:text-sm md:text-base font-black text-slate-900 dark:text-white uppercase tracking-wider truncate">
              {mode === 'modal' ? 'Novo Pedido de Produção' : 'Calculadora de Produção'}
            </h2>
            <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-zinc-400 truncate">
              {step === 1 ? 'Configure as especificações e adicionais da matriz.' : 'Defina os termos de faturamento e prazo.'}
            </p>
          </div>
        </div>

        {/* Step Indicators */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-black/20 p-1 rounded-full border border-slate-200 dark:border-white/5">
            <button
              onClick={() => setStep(1)}
              className="h-6 px-2.5 sm:px-3 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all"
              style={step === 1 ? { backgroundColor: settings.primaryColor, color: 'white', boxShadow: `0 4px 6px -1px ${settings.primaryColor}40` } : { color: '#6b7280' }}
            >
              {isUnlocked ? '1. Orçamento' : '1. Especificações'}
            </button>
            <button
              onClick={() => isFormValid && setStep(2)}
              disabled={!isFormValid}
              className="h-6 px-2.5 sm:px-3 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={step === 2 ? { backgroundColor: settings.primaryColor, color: 'white', boxShadow: `0 4px 6px -1px ${settings.primaryColor}40` } : { color: '#6b7280' }}
            >
              {isUnlocked ? '2. Fechamento' : '2. Registrar Pedido'}
            </button>
          </div>
        </div>

        {/* Botão Fechar (Sempre visível no canto superior direito) */}
        {mode === 'modal' && onClose && (
          <button 
            onClick={onClose}
            className="absolute top-3.5 right-3.5 sm:static p-2 rounded-xl bg-slate-200/60 hover:bg-slate-300 dark:bg-white/10 dark:hover:bg-white/20 text-slate-700 dark:text-zinc-200 transition-colors z-20 shrink-0"
            title="Fechar Modal"
          >
            <X className="h-5 w-5 stroke-[2.5]" />
          </button>
        )}
      </div>

      {/* Main Grid */}
      <div className="flex-1 overflow-y-auto custom-scrollbar touch-pan-y p-4 sm:p-6 pb-28 sm:pb-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Steps Content */}
        <div className="lg:col-span-7 space-y-6">
          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                {/* Selector de Entrada */}
                {!initialData?.orderId && (
                  <div className="grid grid-cols-2 gap-3 bg-slate-100 dark:bg-black/20 p-1.5 rounded-2xl border border-slate-200 dark:border-white/5">
                    <button
                      type="button"
                      onClick={() => setEntryMode('budget')}
                      className={`py-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                        entryMode === 'budget'
                          ? 'bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-md text-slate-900 dark:text-white font-black'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200'
                      }`}
                      style={entryMode === 'budget' ? { borderLeftColor: settings.primaryColor, borderLeftWidth: 3 } : undefined}
                    >
                      🧮 Orçamento Completo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEntryMode('quick');
                        setStitchCount('');
                        setColorCount('');
                      }}
                      className={`py-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                        entryMode === 'quick'
                          ? 'bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-md text-slate-900 dark:text-white font-black'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200'
                      }`}
                      style={entryMode === 'quick' ? { borderLeftColor: settings.primaryColor, borderLeftWidth: 3 } : undefined}
                    >
                      📝 Entrada Rápida
                    </button>
                  </div>
                )}

                {/* 1. Drag and Drop Parser */}
                {entryMode === 'budget' && (
                  <div className="glass-panel rounded-3xl border border-slate-200 dark:border-white/10 overflow-hidden shadow-sm">
                    <button
                      type="button"
                      onClick={() => setIsDropzoneExpanded(!isDropzoneExpanded)}
                      className="w-full p-4 flex items-center justify-between bg-slate-50/50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${settings.primaryColor}20`, color: settings.primaryColor }}>
                          <Upload className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white flex items-center gap-2">
                            <span>ADICIONAR O ARQUIVO MATRIZ</span>
                            <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full font-mono normal-case">.EMB / .DST</span>
                          </h3>
                          <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                            {lastParsedFile ? `Matriz ativa: ${lastParsedFile}` : 'Carregue o arquivo da matriz (.EMB / .DST) para preencher automaticamente os pontos, cores, dimensões e tempo estimado de máquina.'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {lastParsedFile && (
                          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                            <FileCheck className="h-3.5 w-3.5" /> Processado
                          </span>
                        )}
                        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isDropzoneExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </button>
                    {isDropzoneExpanded && (
                      <div className="p-5 border-t border-slate-200 dark:border-white/10">
                        <EmbroideryDropzone onFileParsed={handleFileParsed} />
                      </div>
                    )}

                    {/* Save to Library Toggle — aparece depois de um arquivo ser carregado */}
                    {lastParsedFile && (
                      <div className="px-4 py-3 border-t border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50/50 dark:bg-white/[0.02]">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-xl flex items-center justify-center" style={{ backgroundColor: saveToLibrary ? `${settings.primaryColor}20` : 'transparent', border: `1px solid ${saveToLibrary ? settings.primaryColor + '40' : '#ffffff20'}` }}>
                            <Layers className="h-3.5 w-3.5" style={{ color: saveToLibrary ? settings.primaryColor : '#6b7280' }} />
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-800 dark:text-white">Salvar na Biblioteca do Cliente</p>
                            <p className="text-[10px] text-slate-400 dark:text-zinc-500">{saveToLibrary ? 'O arquivo .DST/.EMB será arquivado na Biblioteca' : 'Somente para uso neste pedido'}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSaveToLibrary(v => !v)}
                          className={`relative h-6 w-11 rounded-full transition-all duration-300 focus:outline-none shrink-0`}
                          style={{ backgroundColor: saveToLibrary ? settings.primaryColor : '#374151' }}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-300 ${saveToLibrary ? 'translate-x-5' : 'translate-x-0'}`}
                          />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Client & Technical details */}
                <div className="glass-panel p-6 rounded-3xl border border-slate-200 dark:border-white/10 space-y-5 relative z-20">
                  <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2" style={{ color: settings.primaryColor }}>
                    <Layers className="h-4 w-4" /> Configuração do Serviço
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 block">
                        Cliente Registrado {!selectedClientId && <span className="text-red-500">*</span>}
                      </label>
                      <ClientSelect
                        value={selectedClientId}
                        onChange={setSelectedClientId}
                        error={!selectedClientId}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 block">
                        {entryMode === 'quick' ? 'Descrição das Peças / Lote' : 'Nome da Logo / Matriz'} {!matrixName.trim() && <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type="text"
                        value={matrixName}
                        onChange={e => { setMatrixName(e.target.value); setSelectedMatrixId(null); }}
                        className={`w-full bg-slate-50 dark:bg-white/5 border rounded-2xl px-4 py-2 text-xs text-slate-900 dark:text-white focus:outline-none transition-all ${
                          !matrixName.trim() ? 'border-red-500/40 bg-red-500/5' : 'border-slate-300 dark:border-white/10'
                        }`}
                        style={matrixName.trim() ? { borderColor: `${settings.primaryColor}30` } : undefined}
                        placeholder={entryMode === 'quick' ? "Ex: 100 Camisetas Polo pretas" : "Ex: Logo Peito Esquerdo..."}
                      />
                    </div>
                  </div>

                  {/* Saved matrices select list */}
                  {entryMode === 'budget' && selectedClientId && clientMatrices.length > 0 && (
                    <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-zinc-400 flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5" style={{ color: settings.primaryColor }} /> Matrizes Históricas ({clientMatrices.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowMatrixSelector(!showMatrixSelector)}
                          className="text-[10px] font-bold flex items-center gap-1"
                          style={{ color: settings.primaryColor }}
                        >
                          {showMatrixSelector ? 'Ocultar' : 'Ver Matrizes'}
                          <ChevronDown className={`h-3 w-3 transition-transform ${showMatrixSelector ? 'rotate-180' : ''}`} />
                        </button>
                      </div>

                      {showMatrixSelector && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 max-h-36 overflow-y-auto custom-scrollbar">
                          {clientMatrices.map(m => {
                            const ver = m.current_version;
                            const isSelected = selectedMatrixId === m.id;
                            return (
                              <div
                                key={m.id}
                                onClick={() => handleSelectSavedMatrix(m)}
                                className="p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between text-slate-800 dark:text-zinc-200"
                                style={isSelected ? { backgroundColor: `${settings.primaryColor}20`, borderColor: `${settings.primaryColor}50`, color: settings.primaryColor } : { borderColor: 'rgba(255,255,255,0.05)' }}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold truncate">{m.name}</p>
                                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500 dark:text-zinc-400">
                                    {ver?.stitch_count && <span>🪡 {ver.stitch_count.toLocaleString()} pts</span>}
                                    {ver?.color_count && <span>🎨 {ver.color_count} cores</span>}
                                  </div>
                                </div>
                                {isSelected && <Check className="h-4 w-4 shrink-0 ml-2" style={{ color: settings.primaryColor }} />}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Technical Values / Quick Entry Fields */}
                  {entryMode === 'budget' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 block">
                          Quantidade Pontos
                        </label>
                        <input
                          type="number"
                          value={stitchCount}
                          onChange={e => setStitchCount(e.target.value === '' ? '' : Number(e.target.value))}
                          className={`w-full bg-slate-50 dark:bg-white/5 border rounded-2xl px-4 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none transition-all ${
                            !stitchCount ? 'border-red-500/40 bg-red-500/5' : 'border-slate-300 dark:border-white/10'
                          }`}
                          style={stitchCount ? { borderColor: `${settings.primaryColor}30` } : undefined}
                          placeholder="Ex: 15000"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 block">
                          Número de Cores
                        </label>
                        <input
                          type="number"
                          value={colorCount}
                          onChange={e => setColorCount(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-2xl px-4 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
                          style={colorCount ? { borderColor: `${settings.primaryColor}30` } : undefined}
                          placeholder="Ex: 4"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 block">
                          Qtd Peças
                        </label>
                        <input
                          type="number"
                          value={quantity}
                          onChange={e => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                          className={`w-full bg-slate-50 dark:bg-white/5 border rounded-2xl px-4 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none transition-all ${
                            !quantity ? 'border-red-500/40 bg-red-500/5' : 'border-slate-300 dark:border-white/10'
                          }`}
                          style={quantity ? { borderColor: `${settings.primaryColor}30` } : undefined}
                          placeholder="Ex: 50"
                        />
                      </div>

                      {/* ⏱️ Tempo Estimado de Máquina */}
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-amber-500 dark:text-amber-400 mb-1.5 block flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> Tempo Estimado Máquina
                        </label>
                        <div className="w-full bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-2 text-xs font-black text-amber-600 dark:text-amber-300 flex items-center justify-between">
                          <span>{estimatedMinutesPerPiece > 0 ? `${formatTimeLabel(estimatedMinutesPerPiece)} / pc` : '0 min'}</span>
                          <span className="text-[10px] font-bold bg-amber-500/20 px-2 py-0.5 rounded-full text-amber-400">
                            {formatTimeLabel(totalEstimatedMinutes)} total
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 block">
                            Quantidade de Peças / Lote {!quantity && <span className="text-red-500">*</span>}
                          </label>
                          <input
                            type="number"
                            value={quantity}
                            onChange={e => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                            className={`w-full bg-slate-50 dark:bg-white/5 border rounded-2xl px-4 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none transition-all ${
                              !quantity ? 'border-red-500/40 bg-red-500/5' : 'border-slate-300 dark:border-white/10'
                            }`}
                            style={quantity ? { borderColor: `${settings.primaryColor}30` } : undefined}
                            placeholder="Ex: 100"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 block">
                            Prazo de Entrega Estimado
                          </label>
                          <DatePicker value={dueDate} onChange={setDueDate} />
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 block">
                          Observações do Recebimento / Instruções
                        </label>
                        <textarea
                          rows={3}
                          value={observations}
                          onChange={e => setObservations(e.target.value)}
                          placeholder="Ex: Peças deixadas na sacola, cliente solicita bordado no peito esquerdo e manga direita. Sem matriz pronta."
                          className="w-full bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-2xl px-4 py-2.5 text-xs text-slate-900 dark:text-white outline-none resize-none"
                          style={observations.trim() ? { borderColor: `${settings.primaryColor}30` } : undefined}
                        />
                      </div>
                      
                      {renderAttachments()}
                    </div>
                  )}
                </div>

                {/* 3. Tactile Addons */}
                {entryMode === 'budget' && (
                  <div className="glass-panel p-6 rounded-3xl border border-slate-200 dark:border-white/10 space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-zinc-400 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" style={{ color: settings.primaryColor }} /> Adicionais Operacionais (Toque para Ativar)
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {[
                        { label: 'Peça Pronta (Camisa Fechada)', badge: '+50%', state: isReadyPiece, setter: setIsReadyPiece, info: 'Exige maior dificuldade na fixação' },
                        { label: 'Bastidor Grande', badge: '+30%', state: isBigHoop, setter: setIsBigHoop, info: 'Tamanho estendido de produção' },
                        { label: 'Aplicação de Fringe', badge: '+30%', state: isFringe, setter: setIsFringe, info: 'Efeito 3D com fios cortados' },
                        { label: 'Corte a Laser', badge: '+R$ 0,50/un', state: hasLaser, setter: setHasLaser, info: 'Corte automático de alta precisão' },
                        { label: 'Prensa Térmica', badge: '+R$ 0,50/un', state: hasPress, setter: setHasPress, info: 'Fixação de apliques prévia' },
                      ].map((addon, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => addon.setter(!addon.state)}
                          className={`group flex flex-col justify-between p-3.5 rounded-2xl border text-left transition-all duration-300 ${
                            addon.state
                              ? 'text-slate-900 dark:text-white'
                              : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/5 text-slate-600 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-white/10'
                          }`}
                          style={addon.state ? { backgroundColor: `${settings.primaryColor}15`, borderColor: settings.primaryColor, boxShadow: `0 0 15px ${settings.primaryColor}20` } : undefined}
                        >
                          <div className="flex items-start justify-between w-full mb-1">
                            <span className="text-xs font-black tracking-tight text-slate-800 dark:text-zinc-200" style={addon.state ? { color: settings.primaryColor } : undefined}>
                              {addon.label}
                            </span>
                            <span 
                              className="text-[9px] font-black px-2 py-0.5 rounded-lg border leading-none bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500"
                              style={addon.state ? { backgroundColor: `${settings.primaryColor}20`, borderColor: `${settings.primaryColor}30`, color: settings.primaryColor } : undefined}
                            >
                              {addon.badge}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 dark:text-zinc-500 leading-snug">
                            {addon.info}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                            <div className="glass-panel p-6 rounded-3xl border border-slate-200 dark:border-white/10 space-y-5">
                  <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2" style={{ color: settings.primaryColor }}>
                    <Calendar className="h-4 w-4" /> Cronograma & Notas
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                        Prazo de Entrega Estimado
                      </label>
                      <DatePicker value={dueDate} onChange={setDueDate} />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                        Observações do Pedido
                      </label>
                      <textarea
                        rows={2}
                        value={observations}
                        onChange={e => setObservations(e.target.value)}
                        placeholder="Ex: Usar linha poliéster cor 456, passar termocolante..."
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-2xl px-4 py-2.5 text-xs text-slate-900 dark:text-white outline-none resize-none"
                        style={observations.trim() ? { borderColor: `${settings.primaryColor}30` } : undefined}
                      />
                    </div>
                  </div>
                  
                  {renderAttachments()}
                </div>

                {/* 2. Visual payment billing selections */}
                <div className="glass-panel p-6 rounded-3xl border border-slate-200 dark:border-white/10 space-y-6">
                  <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2" style={{ color: settings.primaryColor }}>
                    <DollarSign className="h-4 w-4" /> Condições Financeiras
                  </h3>

                  {/* Payment Status visual buttons */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                      Status de Entrada Financeira
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { id: 'pending', label: 'Pendente', icon: Clock, desc: 'Faturar integral na entrega', color: 'border-amber-500/40 text-amber-500 bg-amber-500/5' },
                        { id: 'half_paid', label: 'Sinal', icon: CheckCircle2, desc: 'Entrada paga antecipado', color: 'border-blue-500/40 text-blue-500 bg-blue-500/5' },
                        { id: 'paid', label: 'Pago (100%)', icon: CheckCircle2, desc: 'Total quitado no ato', color: 'border-emerald-500/40 text-emerald-500 bg-emerald-500/5' },
                      ].map(st => {
                        const Icon = st.icon;
                        const isSelected = paymentStatus === st.id;
                        return (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => setPaymentStatus(st.id as any)}
                            className={`p-4 rounded-2xl border text-left transition-all ${
                              isSelected 
                                ? `${st.color} border-2 shadow-sm font-black` 
                                : 'border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/5 opacity-60 hover:opacity-100'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <Icon className="h-4 w-4 shrink-0" />
                              <span className="text-xs font-black tracking-tight">{st.label}</span>
                            </div>
                            <p className="text-[10px] text-slate-500 dark:text-zinc-400">{st.desc}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Visual input for deposit amount when half_paid is selected */}
                  <AnimatePresence>
                    {paymentStatus === 'half_paid' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                        className="space-y-1.5 overflow-hidden"
                      >
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                          Valor do Sinal / Entrada (R$)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 dark:text-zinc-500">
                            R$
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            value={depositAmount === 0 ? '' : depositAmount}
                            onChange={e => setDepositAmount(e.target.value === '' ? 0 : Number(e.target.value))}
                            className="w-full bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-2xl pl-10 pr-4 py-2.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none transition-all"
                            placeholder="Valor da entrada"
                            style={{ borderColor: `${settings.primaryColor}30` }}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Payment Method visual selector */}
                  <AnimatePresence>
                    {paymentStatus !== 'pending' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                        className="space-y-2 overflow-hidden"
                      >
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                          Forma de Recebimento
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {[
                            { id: 'pix', label: '⚡ PIX', icon: Sparkles },
                            { id: 'credit_card', label: '💳 Cartão', icon: CreditCard },
                            { id: 'cash', label: '💵 Dinheiro', icon: Coins },
                            { id: 'transfer', label: '🏦 Transf.', icon: Landmark },
                          ].map(pm => {
                            const Icon = pm.icon;
                            const isSelected = paymentMethod === pm.id;
                            return (
                              <button
                                key={pm.id}
                                type="button"
                                onClick={() => setPaymentMethod(pm.id as any)}
                                className="p-3.5 rounded-2xl border flex flex-col items-center justify-center gap-1.5 transition-all text-xs font-black"
                                style={isSelected ? { backgroundColor: settings.primaryColor, borderColor: settings.primaryColor, color: '#ffffff' } : undefined}
                              >
                                <Icon className="h-5 w-5" />
                                <span>{pm.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Side: Pricing / Specifications Live Panel */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-panel p-4 sm:p-6 rounded-3xl border border-slate-200 dark:border-white/10 space-y-6 lg:sticky lg:top-6">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">
                {isUnlocked ? 'Resumo de Custos' : 'Resumo de Especificações'}
              </h3>
              {isUnlocked && (
                <button
                  type="button"
                  onClick={openPricingModal}
                  className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-zinc-400 transition-colors"
                  title="Ver Tabela de Milheiro"
                >
                  <Sliders className="h-4 w-4" style={{ color: settings.primaryColor }} />
                </button>
              )}
            </div>

            {/* Specifications & Calculations items list */}
            <div className="space-y-3.5">
              <div className="space-y-1">
                <p className="text-xs font-black text-slate-800 dark:text-zinc-200 truncate">
                  {selectedClientId ? 'Cliente Definido' : 'Cliente Não Selecionado'}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-zinc-500 truncate font-bold">
                  {entryMode === 'quick' ? '📝 Modo: Entrada Rápida' : (matrixName ? `Matriz: ${matrixName}` : 'Matriz Não Informada')}
                </p>
              </div>

              {/* Dynamic Cost breakdown for Chefe */}
              {isUnlocked && entryMode === 'budget' && (
                <div className="pt-3 border-t border-slate-200 dark:border-white/5 space-y-2 text-xs">
                  {calculation.breakdown.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-slate-600 dark:text-zinc-400">
                      <span>{item.label}</span>
                      <span className="font-semibold text-slate-800 dark:text-zinc-200">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.amount)}
                      </span>
                    </div>
                  ))}
                  {/* Linha de Tempo Estimado de Máquina */}
                  {estimatedMinutesPerPiece > 0 && (
                    <div className="flex justify-between items-center text-amber-500 font-bold pt-1 border-t border-slate-200/60 dark:border-white/5">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> Tempo Estimado de Máquina:
                      </span>
                      <span className="font-black text-amber-500 dark:text-amber-300">
                        {formatTimeLabel(totalEstimatedMinutes)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Operational Specs breakdown for Operador */}
              {!isUnlocked && (
                <div className="pt-3 border-t border-slate-200 dark:border-white/5 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600 dark:text-zinc-400">
                    <span>Pontos Estimados:</span>
                    <span className="font-bold text-slate-800 dark:text-zinc-200">
                      {stitchCount ? `${Number(stitchCount).toLocaleString('pt-BR')} pts` : 'A definir'}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-zinc-400">
                    <span>Cores de Linha:</span>
                    <span className="font-bold text-slate-800 dark:text-zinc-200">
                      {colorCount ? `${colorCount} cores` : 'A definir'}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-zinc-400">
                    <span>Total do Lote:</span>
                    <span className="font-bold text-emerald-400">
                      {quantity ? `${quantity} peça(s)` : '0 peças'}
                    </span>
                  </div>
                  {estimatedMinutesPerPiece > 0 && (
                    <div className="flex justify-between items-center text-amber-500 font-bold pt-1 border-t border-slate-200/60 dark:border-white/5">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> Tempo Estimado Produção:
                      </span>
                      <span className="font-black text-amber-500 dark:text-amber-300">
                        {formatTimeLabel(totalEstimatedMinutes)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Live Pricing Big Cards */}
            <div className="pt-4 border-t border-slate-200 dark:border-white/10 space-y-4">
              {isUnlocked && entryMode === 'budget' && (
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-black text-slate-500 dark:text-zinc-500 uppercase tracking-wider">Valor Unitário:</span>
                  <span className="text-base font-black text-slate-900 dark:text-white">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculation.unitPrice)}
                  </span>
                </div>
              )}

              {/* Total Card Display */}
              <div className="p-5 rounded-3xl text-white relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${settings.primaryColor} 0%, ${settings.primaryColor}dd 100%)`, boxShadow: `0 10px 15px -3px ${settings.primaryColor}30` }}>
                <div className="absolute right-0 bottom-0 opacity-10 translate-x-4 translate-y-4">
                  {isUnlocked ? <DollarSign className="h-32 w-32" /> : <Package className="h-32 w-32" />}
                </div>
                
                <span className="text-[10px] font-black uppercase tracking-widest opacity-85 block">
                  {isUnlocked
                    ? (entryMode === 'quick' ? 'Entrada Registrada' : `Valor Total do Pedido (${quantity || 0} pçs)`)
                    : `Lote de Produção (${quantity || 0} pçs)`}
                </span>
                
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xl font-black tracking-tight">
                    {isUnlocked
                      ? (entryMode === 'quick' ? 'Aguardando Orçamento' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculation.totalPrice))
                      : `${quantity || 0} Peças no Lote`}
                  </span>
                  <CheckCircle2 className="h-6 w-6 opacity-90" />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                {entryMode === 'quick' ? (
                  <button
                    type="button"
                    onClick={handleCreateOrder}
                    disabled={isSaving || !isFormValid}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-95 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    {isSaving ? 'Registrando Entrada...' : '📥 Confirmar Entrada de Peças'}
                  </button>
                ) : (
                  step === 1 ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!isFormValid) {
                          toast.error("Por favor, preencha os dados do cliente, matriz e pontos antes de prosseguir.");
                          return;
                        }
                        setStep(2);
                      }}
                      className="w-full py-4 rounded-2xl hover:opacity-95 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                      style={{ background: `linear-gradient(135deg, ${settings.primaryColor} 0%, ${settings.primaryColor}dd 100%)`, boxShadow: `0 4px 6px -1px ${settings.primaryColor}30` }}
                    >
                      <span>Prosseguir para Fechamento</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="px-4 rounded-2xl bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-white/20 font-black text-xs uppercase transition-all"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateOrder}
                        disabled={isSaving || !isFormValid}
                        className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-95 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
                      >
                        <Save className="h-4 w-4" />
                        {isSaving ? 'Registrando...' : 'Confirmar & Registrar Pedido'}
                      </button>
                    </div>
                  )
                )}

                {entryMode === 'budget' && step === 2 && paymentStatus === 'pending' && (
                  <button
                    type="button"
                    onClick={handleShareWhatsApp}
                    className="w-full py-3.5 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2 transition-all active:scale-[0.98] text-white shadow-lg shadow-orange-500/25 hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}
                  >
                    <Send className="h-4 w-4" />
                    <span>💰 Cobrar Cliente</span>
                  </button>
                )}
              </div>

              {/* SEÇÃO DE CHAVES DE AUTOMAÇÃO WHATSAPP (GABI AI) */}
              <div className="pt-4 border-t border-slate-200 dark:border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-emerald-400" /> Automação WhatsApp ao Salvar
                  </span>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    Gabi AI
                  </span>
                </div>

                <div className="space-y-2.5">
                  {/* Chave 1: Avisar Recebimento de Peças */}
                  <div 
                    onClick={() => setWhatsappNotifyReceipt(!whatsappNotifyReceipt)}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer select-none ${
                      whatsappNotifyReceipt 
                        ? 'bg-emerald-500/10 border-emerald-500/40 shadow-sm shadow-emerald-500/10' 
                        : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-3 pr-2 min-w-0">
                      <div className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 border ${
                        whatsappNotifyReceipt
                          ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                          : 'bg-white/5 border-white/10 text-zinc-400'
                      }`}>
                        <Package className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-slate-800 dark:text-zinc-100 block text-xs leading-tight">
                          Avisar recebimento das peças
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-zinc-400 block mt-0.5 truncate">
                          Notifica o cliente que as peças deram entrada
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={whatsappNotifyReceipt}
                      onClick={(e) => {
                        e.stopPropagation();
                        setWhatsappNotifyReceipt(!whatsappNotifyReceipt);
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        whatsappNotifyReceipt ? 'bg-emerald-500 shadow-sm shadow-emerald-500/40' : 'bg-zinc-700/80 dark:bg-white/10'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                          whatsappNotifyReceipt ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Chave 2: Solicitar Imagem/Referência */}
                  <div 
                    onClick={() => setWhatsappRequestRef(!whatsappRequestRef)}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer select-none ${
                      whatsappRequestRef 
                        ? 'bg-emerald-500/10 border-emerald-500/40 shadow-sm shadow-emerald-500/10' 
                        : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-3 pr-2 min-w-0">
                      <div className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 border ${
                        whatsappRequestRef
                          ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                          : 'bg-white/5 border-white/10 text-zinc-400'
                      }`}>
                        <Image className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-slate-800 dark:text-zinc-100 block text-xs leading-tight">
                          Solicitar imagem / referência
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-zinc-400 block mt-0.5 truncate">
                          Pede a foto/logomarca do bordado no WhatsApp
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={whatsappRequestRef}
                      onClick={(e) => {
                        e.stopPropagation();
                        setWhatsappRequestRef(!whatsappRequestRef);
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        whatsappRequestRef ? 'bg-emerald-500 shadow-sm shadow-emerald-500/40' : 'bg-zinc-700/80 dark:bg-white/10'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                          whatsappRequestRef ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Chave 3: Enviar Comprovante / Ficha */}
                  <div 
                    onClick={() => setWhatsappSendSummary(!whatsappSendSummary)}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer select-none ${
                      whatsappSendSummary 
                        ? 'bg-emerald-500/10 border-emerald-500/40 shadow-sm shadow-emerald-500/10' 
                        : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-3 pr-2 min-w-0">
                      <div className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 border ${
                        whatsappSendSummary
                          ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                          : 'bg-white/5 border-white/10 text-zinc-400'
                      }`}>
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-slate-800 dark:text-zinc-100 block text-xs leading-tight">
                          Enviar ficha de registro / recibo
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-zinc-400 block mt-0.5 truncate">
                          Envia o resumo da entrada e quantidade
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={whatsappSendSummary}
                      onClick={(e) => {
                        e.stopPropagation();
                        setWhatsappSendSummary(!whatsappSendSummary);
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        whatsappSendSummary ? 'bg-emerald-500 shadow-sm shadow-emerald-500/40' : 'bg-zinc-700/80 dark:bg-white/10'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                          whatsappSendSummary ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Chave 4: Enviar Chave PIX (Destaque Dourado/Âmbar) */}
                  <div 
                    onClick={() => setWhatsappSendPix(!whatsappSendPix)}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer select-none ${
                      whatsappSendPix 
                        ? 'bg-amber-500/10 border-amber-500/40 shadow-sm shadow-amber-500/10' 
                        : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-3 pr-2 min-w-0">
                      <div className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 border ${
                        whatsappSendPix
                          ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                          : 'bg-white/5 border-white/10 text-zinc-400'
                      }`}>
                        <QrCode className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-slate-800 dark:text-zinc-100 block text-xs leading-tight flex items-center gap-1.5">
                          🔑 Enviar Chave PIX <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">Destaque</span>
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-zinc-400 block mt-0.5 truncate">
                          Inclui os dados da Chave PIX no texto
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={whatsappSendPix}
                      onClick={(e) => {
                        e.stopPropagation();
                        setWhatsappSendPix(!whatsappSendPix);
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        whatsappSendPix ? 'bg-amber-500 shadow-sm shadow-amber-500/40' : 'bg-zinc-700/80 dark:bg-white/10'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                          whatsappSendPix ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
