import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, UserPlus, Calendar, Plus, Trash2, Package, Save, Lock, Layers, Sparkles, 
  CheckCircle2, DollarSign, ChevronDown, Check, Upload, FileCheck, ChevronUp, 
  Sliders, Send, Clock, CreditCard, Landmark, Coins, ArrowRight, ArrowLeft, Camera, Paperclip,
  MessageSquare, Image, FileText, QrCode, User, CheckCircle, Settings, Edit2, Star, Printer
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
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { serializePaymentMetadata, updatePaymentMetadata, parsePaymentMetadata } from '@/utils/paymentHelper';
import { sendEvolutionText, getWhatsAppWebLink, formatWhatsAppNumber, handleWhatsAppDispatchError } from '@/services/whatsappService';
import { getStoredTemplates, formatEmbroideryTemplate } from '@/services/whatsappTemplatesService';
import { useBackgroundTasks } from '@/hooks/useBackgroundTasks';
import { printOrderReceipt } from '@/services/pdfGenerator';
import { printThermalReceipt } from '@/services/thermalPrinter';
import { Matrix } from '@/types/borda';

interface InitialOrderData {
  clientId?: string;
  matrixName?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  orderId?: string;
  fullOrder?: any;
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
  const { profile } = useAuth();
  const navigate = useNavigate();

  const canViewPrices = profile?.can_view_prices !== false;
  const formatPrice = (val: number | undefined | null) => {
    if (!canViewPrices) return 'R$ ***';
    if (val === undefined || val === null) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

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
  const [chargeColorAddon, setChargeColorAddon] = useState<boolean>(true);
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
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [depositAmount, setDepositAmount] = useState<number>(0);
  const [activeMatrixTab, setActiveMatrixTab] = useState<'client' | 'global'>('client');
  const [globalMatrices, setGlobalMatrices] = useState<Matrix[]>([]);
  const [entryMode, setEntryMode] = useState<'budget' | 'quick'>('quick');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  
  // Validation Animation States
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [shakeInputs, setShakeInputs] = useState(false);

  // Multi-Item / Multi-Matriz Lista do Pedido
  const [orderItemsList, setOrderItemsList] = useState<{
    id: string;
    matrixName: string;
    stitchCount: number;
    colorCount: number;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    manualUnitPrice?: number;
    matrixId?: string | null;
  }[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isAddingNewMatrix, setIsAddingNewMatrix] = useState(false);

  const hasItemsInCart = orderItemsList.length > 1 || (orderItemsList.length === 1 && !!(orderItemsList[0].matrixName || orderItemsList[0].stitchCount > 0));

  useEffect(() => {
    if (lastParsedFile) {
      setIsAddingNewMatrix(false);
    }
  }, [lastParsedFile]);

  // Compute live price
  const calculation = calculateEmbroideryPrice(
    {
      stitchCount: Math.max(0, Number(stitchCount) || 0),
      colorCount: Math.max(1, Number(colorCount) || 1),
      quantity: Math.max(1, Number(quantity) || 1),
      chargeColorAddon,
      isBigHoop,
      isReadyPiece,
      isFringe,
      hasLaser,
      hasPress,
    },
    rules
  );

  // Tempo Estimado de Máquina (Calculado com base na velocidade SPM da máquina do usuário)
  const estimatedMinutesPerPiece = useMemo(() => {
    const stitches = Number(stitchCount) || 0;
    const colors = Math.max(1, Number(colorCount) || 1);
    if (stitches <= 0) return 0;

    const spm = settings.machineSpeedSpm || 800; // Velocidade configurada (Padrão 800 SPM)
    const colorSecs = settings.colorChangeTimeSec !== undefined ? settings.colorChangeTimeSec : 30; // Tempo por troca de cor

    const stitchMinutes = stitches / spm;
    const colorMinutes = colors > 1 ? ((colors - 1) * colorSecs) / 60 : 0;

    return Math.max(1, Math.round(stitchMinutes + colorMinutes));
  }, [stitchCount, colorCount, settings.machineSpeedSpm, settings.colorChangeTimeSec]);

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

  // Cálculo total com suporte a múltiplos itens/matrizes no mesmo pedido
  const totalOrderAmount = useMemo(() => {
    return orderItemsList.reduce((acc, item) => acc + item.totalPrice, 0);
  }, [orderItemsList]);

  // Master-Detail Sync Effect (Syncs form inputs to the currently selected item)

  // SISTEMA DE RASCUNHO (Auto-Save & Load)
  useEffect(() => {
    if (initialData?.orderId) return; // Se está editando um pedido existente, ignora o rascunho
    
    // Tentamos carregar o rascunho apenas na montagem inicial se não for edição
    const saved = localStorage.getItem('borda_order_draft');
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        if (draft.selectedClientId) setSelectedClientId(draft.selectedClientId);
        if (draft.entryMode) setEntryMode(draft.entryMode);
        if (draft.observations) setObservations(draft.observations);
        if (draft.paymentStatus) setPaymentStatus(draft.paymentStatus);
        if (draft.paymentMethod) setPaymentMethod(draft.paymentMethod);
        if (draft.depositAmount) setDepositAmount(draft.depositAmount);
        
        if (draft.orderItemsList && draft.orderItemsList.length > 0) {
          setOrderItemsList(draft.orderItemsList);
          if (draft.selectedItemId) {
            setSelectedItemId(draft.selectedItemId);
            const item = draft.orderItemsList.find((i: any) => i.id === draft.selectedItemId);
            if (item) {
              setMatrixName(item.matrixName);
              setStitchCount(item.stitchCount ? item.stitchCount : '');
              setColorCount(item.colorCount ? item.colorCount : '');
              setQuantity(item.quantity);
              setSelectedMatrixId(item.matrixId || null);
            }
          }
        }
      } catch (e) {
        console.error("Erro ao carregar rascunho do localStorage", e);
      }
    }
  }, [initialData]);

  useEffect(() => {
    // Se for edição de um pedido existente, NÃO salva rascunho
    if (initialData?.orderId) return;
    
    const draft = {
      selectedClientId,
      entryMode,
      observations,
      paymentStatus,
      paymentMethod,
      depositAmount,
      orderItemsList,
      selectedItemId
    };
    
    // Só salva no rascunho se tiver algo preenchido
    if (selectedClientId || orderItemsList.length > 0 || observations) {
      localStorage.setItem('borda_order_draft', JSON.stringify(draft));
    }
  }, [selectedClientId, entryMode, observations, paymentStatus, paymentMethod, depositAmount, orderItemsList, selectedItemId, initialData]);

  useEffect(() => {
    if (selectedItemId) {
      setOrderItemsList(prev => prev.map(item => {
        if (item.id === selectedItemId) {
          const calcUnitPrice = entryMode === 'budget' ? calculation.unitPrice : 0;
          const finalUnitPrice = item.manualUnitPrice !== undefined ? item.manualUnitPrice : (item.unitPrice !== undefined ? item.unitPrice : calcUnitPrice);
          const newQty = Math.max(1, Number(quantity) || 1);
          return {
            ...item,
            matrixName: matrixName,
            stitchCount: Number(stitchCount) || 0,
            colorCount: Number(colorCount) || 1,
            quantity: newQty,
            unitPrice: finalUnitPrice,
            totalPrice: finalUnitPrice * newQty,
            matrixId: selectedMatrixId
          };
        }
        return item;
      }));
    }
  }, [matrixName, stitchCount, colorCount, quantity, calculation.unitPrice, calculation.totalPrice, selectedMatrixId, selectedItemId, entryMode]);

  const handleManualUnitPriceChange = (id: string, value: string) => {
    const numValue = value === '' ? undefined : Number(value);
    setOrderItemsList(prev => prev.map(item => {
      if (item.id === id) {
        const newUnitPrice = numValue !== undefined ? numValue : undefined;
        const finalUnitPrice = newUnitPrice !== undefined ? newUnitPrice : (item.id === selectedItemId ? calculation.unitPrice : item.unitPrice);
        return {
          ...item,
          manualUnitPrice: newUnitPrice,
          unitPrice: finalUnitPrice,
          totalPrice: finalUnitPrice * item.quantity
        };
      }
      return item;
    }));
  };

  const handleItemQuantityChange = (id: string, value: string) => {
    const newQty = value === '' ? 1 : Math.max(1, parseInt(value, 10) || 1);
    setOrderItemsList(prev => prev.map(item => {
      if (item.id === id) {
        const finalUnitPrice = item.manualUnitPrice !== undefined ? item.manualUnitPrice : item.unitPrice;
        if (item.id === selectedItemId) {
          setQuantity(newQty);
        }
        return {
          ...item,
          quantity: newQty,
          totalPrice: finalUnitPrice * newQty
        };
      }
      return item;
    }));
  };

  const handleSelectItem = (item: any) => {
    setSelectedItemId(item.id);
    setMatrixName(item.matrixName);
    setStitchCount(item.stitchCount ? item.stitchCount : '');
    setColorCount(item.colorCount ? item.colorCount : '');
    setQuantity(item.quantity);
    setSelectedMatrixId(item.matrixId || null);
  };

  const handleAddNewItem = () => {
    const newItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      matrixName: '',
      stitchCount: 0,
      colorCount: 1,
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      matrixId: null
    };
    setOrderItemsList(prev => [...prev, newItem]);
    handleSelectItem(newItem);
    setLastParsedFile(null);
  };

  const handleRemoveItemFromList = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Previne selecionar a linha ao clicar em remover
    setOrderItemsList(prev => {
      const filtered = prev.filter(i => i.id !== id);
      // Se removeu o item selecionado, seleciona o próximo disponível ou limpa
      if (id === selectedItemId) {
        if (filtered.length > 0) {
          // Precisamos agendar a seleção do novo item no próximo tick, senão o setState conflita
          setTimeout(() => handleSelectItem(filtered[0]), 0);
        } else {
          setSelectedItemId(null);
          setMatrixName('');
          setStitchCount('');
          setColorCount('');
        }
      }
      return filtered;
    });
  };

  // Ensure there's always at least one item when starting a budget
  useEffect(() => {
    if (entryMode === 'budget' && orderItemsList.length === 0 && !initialData?.orderId) {
      handleAddNewItem();
    }
  }, [entryMode, orderItemsList.length, initialData]);

  // Populate initialData if provided
  useEffect(() => {
    if (initialData) {
      if (initialData.clientId) setSelectedClientId(initialData.clientId);
      if (initialData.orderId) setEntryMode('budget');
      
      if (initialData.fullOrder) {
        const order = initialData.fullOrder;
        if (order.client_id) setSelectedClientId(order.client_id);
        if (order.payment_status) setPaymentStatus(order.payment_status);
        if (order.payment_method) setPaymentMethod(order.payment_method);
        if (order.due_date) setDueDate(new Date(`${order.due_date}T12:00:00`));
        
        // Extract observations from notes
        if (order.notes) {
          const parsedNotes = parsePaymentMetadata(order.notes);
          setObservations(parsedNotes.cleanNotes);
        }

        // Map items
        if (order.items && order.items.length > 0) {
          const mappedItems = order.items.map((item: any) => ({
            id: `item_${item.id}`,
            matrixName: item.description,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            totalPrice: item.total_price,
            stitchCount: 0,
            colorCount: 1,
            manualUnitPrice: item.unit_price
          }));
          setOrderItemsList(mappedItems);
          
          // Select first item
          if (mappedItems.length > 0) {
            const first = mappedItems[0];
            setSelectedItemId(first.id);
            setMatrixName(first.matrixName);
            setQuantity(first.quantity);
          }
        }
      } else {
        if (initialData.matrixName) setMatrixName(initialData.matrixName);
        if (initialData.quantity) setQuantity(initialData.quantity);
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

  // Fetch client and global matrices
  const fetchGlobalMatrices = async () => {
    try {
      const { data: matricesData, error: mError } = await supabase
        .from('matrices')
        .select('*')
        .is('client_id', null)
        .eq('category', 'Global')
        .order('created_at', { ascending: false });

      if (mError) throw mError;
      
      if (!matricesData || matricesData.length === 0) {
        setGlobalMatrices([]);
        return;
      }

      const matrixIds = matricesData.map(m => m.id);
      const { data: versionsData } = await supabase
        .from('matrix_versions')
        .select('*')
        .in('matrix_id', matrixIds);

      const versionsList = versionsData || [];

      const formatted = matricesData.map((m: any) => {
        const versions = versionsList.filter((v: any) => v.matrix_id === m.id);
        return {
          ...m,
          matrix_versions: versions,
          current_version: versions.find((v: any) => v.id === m.current_version_id) || versions[0],
        };
      });

      setGlobalMatrices(formatted);
    } catch (err: any) {
      console.error('Erro ao buscar matrizes globais', err);
    }
  };

  useEffect(() => {
    fetchGlobalMatrices();
  }, []);

  useEffect(() => {
    if (selectedClientId) {
      fetchClientMatrices(selectedClientId);
      setActiveMatrixTab('client');
    } else {
      setClientMatrices([]);
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
    const pStitches = matrix.current_version?.stitch_count || 0;
    const pColors = matrix.current_version?.color_count || 1;
    const pQuantity = Math.max(1, Number(quantity) || 1);

    const calcPrice = calculateEmbroideryPrice(
      {
        stitchCount: Math.max(0, pStitches),
        colorCount: Math.max(1, pColors),
        quantity: pQuantity,
        chargeColorAddon,
        isBigHoop,
        isReadyPiece,
        isFringe,
        hasLaser,
        hasPress,
      },
      rules
    );

    const hasFixedPrice = matrix.fixed_price !== null && matrix.fixed_price !== undefined;
    const finalUnitPrice = hasFixedPrice ? Number(matrix.fixed_price) : calcPrice.unitPrice;

    const newItemData = {
      matrixName: matrix.name,
      stitchCount: pStitches,
      colorCount: pColors,
      quantity: pQuantity,
      unitPrice: finalUnitPrice,
      totalPrice: finalUnitPrice * pQuantity,
      manualUnitPrice: hasFixedPrice ? Number(matrix.fixed_price) : undefined,
      matrixId: matrix.id
    };

    setOrderItemsList(prev => {
      const currentItem = prev.find(i => i.id === selectedItemId);
      if (currentItem && !currentItem.matrixName && !currentItem.stitchCount) {
        const updatedItem = { ...currentItem, ...newItemData };
        setTimeout(() => handleSelectItem(updatedItem), 0);
        return prev.map(i => i.id === selectedItemId ? updatedItem : i);
      }
      
      const newItem = {
        id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        ...newItemData
      };
      setTimeout(() => handleSelectItem(newItem), 0);
      return [...prev, newItem];
    });

    toast.success(`Matriz "${matrix.name}" adicionada ao carrinho!`);
  };

  const handleFileParsed = (meta: EmbroideryMetadata, file: File) => {
    const parsedName = meta.name || file.name.replace(/\.[^/.]+$/, "");
    const parsedStitches = meta.stitches || 0;
    const parsedColors = meta.colors || 1;

    setLastParsedFile(parsedName);
    setParsedMatrixFile(file);
    setParsedMatrixMeta(meta);

    // Auto-adiciona na lista de matrizes do pedido se tiver pontos válidos ou nome
    if (parsedName) {
      const calcPrice = calculateEmbroideryPrice(
        {
          stitchCount: Math.max(0, parsedStitches),
          colorCount: Math.max(1, parsedColors),
          quantity: Math.max(1, Number(quantity) || 1),
          chargeColorAddon,
          isBigHoop,
          isReadyPiece,
          isFringe,
          hasLaser,
          hasPress,
        },
        rules
      );

      const newItemData = {
        matrixName: parsedName,
        stitchCount: parsedStitches,
        colorCount: parsedColors,
        quantity: Math.max(1, Number(quantity) || 1),
        unitPrice: calcPrice.unitPrice,
        totalPrice: calcPrice.totalPrice,
        matrixId: null
      };

      setOrderItemsList(prev => {
        // Se o item selecionado atual estiver em branco, vamos sobrescrevê-lo
        const currentItem = prev.find(i => i.id === selectedItemId);
        if (currentItem && !currentItem.matrixName && !currentItem.stitchCount) {
          const updatedItem = { ...currentItem, ...newItemData };
          setTimeout(() => handleSelectItem(updatedItem), 0);
          return prev.map(i => i.id === selectedItemId ? updatedItem : i);
        }
        
        // Senão, cria um novo item
        const newItem = {
          id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          ...newItemData
        };
        setTimeout(() => handleSelectItem(newItem), 0);
        return [...prev, newItem];
      });
      
      toast.success(`Matriz "${parsedName}" importada e pronta para edição!`);
    }
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
      if (isPrivate) {
        initialMetadata.isPrivate = true;
      }
      if (uploadedUrls.length > 0) {
        initialMetadata.attachmentUrls = uploadedUrls;
      }
      const notesWithMetadata = serializePaymentMetadata(observations, initialMetadata);

      // 1.5 Save to library if toggled
      if (!isQuick && saveToLibrary && parsedMatrixFile && selectedClientId) {
        try {
          const uniqueSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
          const { data: mxData } = await supabase
            .from('matrices')
            .insert({
              name: matrixName.trim(),
              client_id: selectedClientId,
              code: `MAT-${Date.now().toString(36).toUpperCase()}-${uniqueSuffix}`,
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
            total_amount: isQuick ? 0 : totalOrderAmount,
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
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData?.user?.id;
        if (!userId) throw new Error('Usuário não autenticado. Faça login novamente.');

        const { data: insertedOrder, error: iError } = await supabase
          .from('orders')
          .insert({
            client_id: selectedClientId,
            user_id: userId,
            status: 'pending',
            payment_status: isQuick ? 'pending' : paymentStatus,
            payment_method: isQuick ? 'pix' : paymentMethod,
            due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
            total_amount: isQuick ? 0 : totalOrderAmount,
            notes: notesWithMetadata
          })
          .select()
          .single();
        order = insertedOrder;
        orderError = iError;
      }

      if (orderError) throw orderError;

      // 3. Insert Order Items (Suporte a Múltiplas Matrizes em Lote)
      if (order) {
        const validItems = orderItemsList.filter(it => it.matrixName && it.matrixName.trim() !== '');
        
        if (validItems.length > 0) {
          const itemsPayload = validItems.map(it => ({
            order_id: order.id,
            matrix_id: it.matrixId || null,
            description: `Bordado: ${it.matrixName} (${it.stitchCount.toLocaleString()} pts, ${it.colorCount} cores)`,
            quantity: it.quantity,
            unit_price: isQuick ? 0 : it.unitPrice,
            total_price: isQuick ? 0 : it.totalPrice
          }));

          const { error: batchErr } = await supabase
            .from('order_items')
            .insert(itemsPayload);

          if (batchErr) {
            console.error('Erro no insert de múltiplos itens:', batchErr);
          }
        } else if (matrixName.trim()) {
          // Fallback para item único configurado nos inputs
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
            await supabase.from('order_items').insert({
              order_id: order.id,
              description: isQuick ? `Entrada: ${matrixName}` : `Bordado: ${matrixName} (${stitchCount.toLocaleString()} pts, ${colorCount || 1} cores)`,
              quantity: Number(quantity) || 1,
              unit_price: isQuick ? 0 : calculation.unitPrice,
              total_price: isQuick ? 0 : calculation.totalPrice
            });
          }
        }
      }

      toast.success(initialData?.orderId ? "Pedido atualizado com sucesso!" : "Pedido criado com sucesso!");
      localStorage.removeItem('borda_order_draft'); // Limpa o rascunho após salvar com sucesso

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
              const itemDesc = matrixName || observations || 'Peças para bordado';

              // Contexto para interpolação de tags dinâmicas da GABI Automações
              const tp = calculation?.totalPrice || 0;
              const gabiContext = {
                nome_cliente: clientName,
                empresa_cliente: clientName,
                numero_pedido: orderCode,
                nome_matriz: itemDesc,
                quantidade_pecas: `${quantity || 1} peça(s)`,
                nome_oficina: settings.systemName,
                endereco_oficina: settings.address || '',
                chave_pix: settings.pixKey || 'Consulte a chave no ateliê',
                valor_entrada: tp ? `R$ ${(tp * 0.5).toFixed(2).replace('.', ',')}` : '',
                valor_total: tp ? `R$ ${tp.toFixed(2).replace('.', ',')}` : '',
              };

              // Carrega templates customizados salvos na Central GABI (/gabi)
              const gabiTemplates = getStoredTemplates();
              const findTemplate = (id: string) => gabiTemplates.find(t => t.id === id);

              const msgLines: string[] = [
                `*Entrada de Pedido - ${settings.systemName}* 🧵✨\n`,
              ];

              if (whatsappNotifyReceipt) {
                const tpl = findTemplate('tpl_confirmar_recebimento');
                msgLines.push(tpl ? formatEmbroideryTemplate(tpl.templateText, gabiContext)
                  : `📦 *Confirmação de Recebimento:* Suas peças (*${itemDesc}*, ${quantity || 1}x) foram recebidas com sucesso em nossa oficina e deram entrada no sistema.`);
              }

              if (whatsappRequestRef) {
                const tpl = findTemplate('tpl_solicitar_imagem');
                msgLines.push(tpl ? formatEmbroideryTemplate(tpl.templateText, gabiContext)
                  : `🖼️ *Solicitação de Imagem/Arte:* Por favor, nos envie aqui no WhatsApp a imagem/referência do seu bordado em alta resolução para a programação da matriz.`);
              }

              if (whatsappSendSummary) {
                const tpl = findTemplate('tpl_orcamento_aprovacao');
                msgLines.push(tpl ? formatEmbroideryTemplate(tpl.templateText, gabiContext)
                  : `📋 *Ficha de Registro:* Entrada ${orderCode} registrada no sistema da oficina.`);
              }

              if (whatsappSendPix) {
                const tpl = findTemplate('tpl_cobranca_pix');
                msgLines.push(tpl ? formatEmbroideryTemplate(tpl.templateText, gabiContext)
                  : `💳 *Dados para Pagamento via PIX:*\nChave PIX: *${settings.pixKey || 'Consulte a chave no ateliê'}*`);
              }

              msgLines.push(`\nQualquer dúvida estamos à disposição! — ${settings.systemName}`);
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

                handleWhatsAppDispatchError(err, clientData.phone, autoMsg, toastId);
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
    
    setIsAddingNewMatrix(false);

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

  const isFormValid = useMemo(() => {
    return entryMode === 'quick'
      ? selectedClientId && matrixName.trim() && quantity && Number(quantity) > 0
      : selectedClientId && matrixName.trim() && stitchCount && Number(stitchCount) > 0 && quantity && Number(quantity) > 0;
  }, [entryMode, selectedClientId, matrixName, quantity, stitchCount]);

  const handlePrintReceiptAction = async (printType: 'a4' | 'thermal') => {
    if (!isFormValid) {
      setShowValidationErrors(true);
      setShakeInputs(true);
      setTimeout(() => setShakeInputs(false), 500);
      toast.error("Por favor, preencha os campos destacados em vermelho antes de imprimir.");
      return;
    }

    let clientName = 'Cliente Geral';
    let clientPhone: string | undefined;
    let clientCompany: string | undefined;

    if (selectedClientId) {
      try {
        const { data: cData } = await supabase
          .from('clients')
          .select('name, phone, company_name')
          .eq('id', selectedClientId)
          .single();

        if (cData) {
          clientName = cData.name || clientName;
          clientPhone = cData.phone;
          clientCompany = cData.company_name;
        }
      } catch (err) {
        console.warn('Erro ao buscar dados do cliente para impressão:', err);
      }
    }

    const printPayload = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      dueDate: dueDate ? format(dueDate, 'yyyy-MM-dd') : undefined,
      clientName,
      clientPhone,
      clientCompany,
      paymentStatus: (entryMode === 'quick' ? 'pending' : paymentStatus) as any,
      totalAmount: entryMode === 'quick' ? (calculation.totalPrice || 0) : totalOrderAmount,
      notes: observations,
      items: orderItemsList.length > 0
        ? orderItemsList.map(it => ({
            description: it.matrixName,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            totalPrice: it.totalPrice
          }))
        : [{
            description: matrixName || 'Peças para Bordado',
            quantity: Number(quantity) || 1,
            unitPrice: calculation.unitPrice || 0,
            totalPrice: calculation.totalPrice || 0
          }],
      companyName: settings.systemName,
      canSeeFinancials: isUnlocked
    };

    if (printType === 'a4') {
      printOrderReceipt(printPayload);
    } else {
      printThermalReceipt(printPayload, isUnlocked);
    }
  };

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
    <div className="w-full flex flex-col flex-1 min-h-0">
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

                {/* 1. DADOS DO PEDIDO E CLIENTE */}
                <div className="glass-panel p-5 rounded-3xl border shadow-sm space-y-4 relative z-50 animate-in fade-in zoom-in-95 duration-200 mb-4" style={{ borderColor: `${settings.primaryColor}40`, backgroundColor: `${settings.primaryColor}05` }}>
                    <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2" style={{ color: settings.primaryColor }}>
                      <User className="h-4 w-4" /> 1. Dados do Pedido
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 block">
                          Cliente Registrado {!selectedClientId && <span className="text-red-500">*</span>}
                        </label>
                        <ClientSelect value={selectedClientId} onChange={setSelectedClientId} error={showValidationErrors && !selectedClientId} shake={showValidationErrors && !selectedClientId && shakeInputs} />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 block">
                          Prazo de Entrega Estimado
                        </label>
                        <DatePicker value={dueDate} onChange={setDueDate} />
                      </div>
                    </div>
                  </div>

                {/* 2. BIBLIOTECA DE MATRIZES */}
                {entryMode === 'budget' && (showMatrixSelector || selectedClientId) && (
                  <div className="glass-panel p-5 rounded-3xl border shadow-sm relative z-40 animate-in fade-in zoom-in-95 duration-200 mb-4" style={{ borderColor: `${settings.primaryColor}20`, backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                      <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2" style={{ color: settings.primaryColor }}>
                        <Layers className="h-4 w-4" /> 2. Matrizes na Biblioteca
                      </h3>
                      <div className="flex items-center gap-1 bg-black/10 dark:bg-white/5 p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setActiveMatrixTab('client')}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${
                            activeMatrixTab === 'client'
                              ? 'bg-white dark:bg-zinc-800 shadow-sm text-slate-900 dark:text-white'
                              : 'text-slate-500 hover:text-slate-700 dark:hover:text-zinc-300'
                          }`}
                        >
                          Do Cliente ({clientMatrices.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveMatrixTab('global')}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all flex items-center gap-1.5 ${
                            activeMatrixTab === 'global'
                              ? 'bg-gradient-to-r from-amber-500/20 to-yellow-500/10 text-amber-600 dark:text-amber-400 shadow-sm border border-amber-500/20'
                              : 'text-slate-500 hover:text-slate-700 dark:hover:text-zinc-300'
                          }`}
                        >
                          <Star className={`h-3 w-3 ${activeMatrixTab === 'global' ? 'fill-amber-500 text-amber-500' : ''}`} /> Da Empresa ({globalMatrices.length})
                        </button>
                      </div>
                    </div>
                    
                    {activeMatrixTab === 'client' && (
                      clientMatrices.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[220px] overflow-y-auto custom-scrollbar pr-2">
                          {clientMatrices.map(m => {
                            const ver = m.current_version;
                            const isSelected = selectedMatrixId === m.id;
                            return (
                              <div
                                key={m.id}
                                onClick={() => handleSelectSavedMatrix(m)}
                                className="p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between text-slate-800 dark:text-zinc-200"
                                style={isSelected ? { backgroundColor: `${settings.primaryColor}20`, borderColor: `${settings.primaryColor}50`, color: settings.primaryColor, boxShadow: `0 0 15px ${settings.primaryColor}20` } : { borderColor: 'rgba(255,255,255,0.05)', backgroundColor: 'rgba(255,255,255,0.02)' }}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-black truncate leading-tight mb-1" style={{ color: isSelected ? settings.primaryColor : 'inherit' }}>
                                    {m.name}
                                  </p>
                                  <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500 dark:text-zinc-400">
                                    {ver?.stitch_count && <span>🪡 {ver.stitch_count.toLocaleString()} pts</span>}
                                    {ver?.color_count && <span>🎨 {ver.color_count} cores</span>}
                                  </div>
                                </div>
                                {isSelected && <CheckCircle className="h-5 w-5 shrink-0 ml-2" style={{ color: settings.primaryColor }} />}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 italic">Nenhuma matriz salva para este cliente ainda.</p>
                      )
                    )}

                    {activeMatrixTab === 'global' && (
                      globalMatrices.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[220px] overflow-y-auto custom-scrollbar pr-2">
                          {globalMatrices.map(m => {
                            const ver = m.current_version;
                            const isSelected = selectedMatrixId === m.id;
                            return (
                              <div
                                key={m.id}
                                onClick={() => handleSelectSavedMatrix(m)}
                                className="p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between text-slate-800 dark:text-zinc-200"
                                style={isSelected ? { backgroundColor: `${settings.primaryColor}20`, borderColor: `${settings.primaryColor}50`, color: settings.primaryColor, boxShadow: `0 0 15px ${settings.primaryColor}20` } : { borderColor: 'rgba(255,255,255,0.05)', backgroundColor: 'rgba(255,255,255,0.02)' }}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-black truncate leading-tight mb-1" style={{ color: isSelected ? settings.primaryColor : 'inherit' }}>
                                    {m.name}
                                  </p>
                                  <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500 dark:text-zinc-400">
                                    {ver?.stitch_count && <span>🪡 {ver.stitch_count.toLocaleString()} pts</span>}
                                    {ver?.color_count && <span>🎨 {ver.color_count} cores</span>}
                                  </div>
                                </div>
                                {isSelected && <CheckCircle className="h-5 w-5 shrink-0 ml-2" style={{ color: settings.primaryColor }} />}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 italic">Nenhuma matriz global encontrada na biblioteca da empresa.</p>
                      )
                    )}
                  </div>
                )}

                {/* 3. LEITOR AUTOMÁTICO E CARRINHO */}
                {entryMode === 'budget' && (
                  <div className="glass-panel rounded-3xl border shadow-sm space-y-0 overflow-hidden relative z-30 animate-in fade-in zoom-in-95 duration-200 mb-4" style={{ borderColor: `${settings.primaryColor}40` }}>
                    <div className="bg-slate-50/50 dark:bg-white/5 p-4 sm:p-5 flex flex-col gap-5 border-b border-slate-200 dark:border-white/10">
                      
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${settings.primaryColor}20`, color: settings.primaryColor }}>
                          <Upload className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white flex items-center gap-2">
                            <span>
                              ARQUIVO MATRIZ <span className="text-[10px] text-slate-500 font-bold">(LEITOR DE MATRIZ AUTOMÁTICO)</span>
                            </span>
                            {lastParsedFile && (
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                                <FileCheck className="h-3 w-3" /> Lida
                              </span>
                            )}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                            {lastParsedFile ? `Última matriz: ${lastParsedFile}` : (selectedClientId ? 'Arraste o arquivo aqui se a matriz não estiver na biblioteca.' : 'Selecione o cliente primeiro, ou arraste o arquivo aqui para ler.')}
                          </p>
                        </div>
                      </div>

                      
                      {(!hasItemsInCart || isAddingNewMatrix) ? (
                        <>
                          <EmbroideryDropzone onFileParsed={handleFileParsed} primaryColor={settings.primaryColor} />
                          <div className="pt-3 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={handleAddNewItem}
                              className="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-white uppercase tracking-wider flex items-center gap-1.5 transition-colors"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Preencher Manualmente
                            </button>
                            {hasItemsInCart && (
                              <button
                                type="button"
                                onClick={() => setIsAddingNewMatrix(false)}
                                className="text-[10px] font-bold text-red-400 hover:text-red-500 uppercase tracking-wider transition-colors"
                              >
                                Cancelar
                              </button>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="pt-2 flex justify-center">
                          <button
                            type="button"
                            onClick={() => setIsAddingNewMatrix(true)}
                            className="py-2.5 px-6 rounded-full border border-dashed border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-sm"
                          >
                            <Plus className="h-4 w-4" />
                            ADICIONAR OUTRA MATRIZ
                          </button>
                        </div>
                      )}
                    </div>
                    
                    {/* Save to Library Toggle */}
                    {lastParsedFile && (
                      <div className="px-5 py-4 flex items-center justify-between bg-white dark:bg-black/40 border-t border-slate-200 dark:border-white/10">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-xl flex items-center justify-center" style={{ backgroundColor: saveToLibrary ? `${settings.primaryColor}20` : 'transparent', border: `1px solid ${saveToLibrary ? settings.primaryColor + '40' : '#ffffff20'}` }}>
                            <Layers className="h-3.5 w-3.5" style={{ color: saveToLibrary ? settings.primaryColor : '#6b7280' }} />
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-800 dark:text-white">Salvar na Biblioteca do Cliente</p>
                            <p className="text-[10px] text-slate-400 dark:text-zinc-500">{saveToLibrary ? 'O arquivo será arquivado' : 'Somente para este pedido'}</p>
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
                    
                    {/* Tabela do Carrinho (Embutida no Bloco 3) */}
                    {hasItemsInCart && (
                      <div className="p-4 sm:p-5 border-t bg-slate-50/30 dark:bg-white/[0.01]" style={{ borderColor: `${settings.primaryColor}30` }}>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-[11px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: settings.primaryColor }}>
                            <Layers className="h-4 w-4" /> Carrinho do Pedido ({orderItemsList.length} Matrizes)
                          </h4>
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                              Total: {formatPrice(totalOrderAmount)}
                            </span>
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-black/40">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-zinc-300 font-bold uppercase text-[9px] tracking-wider">
                              <tr>
                                <th className="p-2.5">Matriz / Descrição</th>
                                <th className="p-2.5 text-center">Qtd</th>
                                <th className="p-2.5 text-right">Valor Unit.</th>
                                <th className="p-2.5 text-right">Subtotal</th>
                                <th className="p-2.5 text-center">Ação</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-medium text-slate-800 dark:text-zinc-200">
                              {orderItemsList.map((it) => (
                                <tr 
                                  key={it.id} 
                                  onClick={() => handleSelectItem(it)}
                                  className={`cursor-pointer transition-colors ${
                                    selectedItemId === it.id 
                                      ? 'border-l-4' 
                                      : 'hover:bg-slate-50 dark:hover:bg-white/[0.02] border-l-4 border-transparent'
                                  }`}
                                  style={selectedItemId === it.id ? { 
                                    backgroundColor: `${settings.primaryColor}15`, 
                                    borderLeftColor: settings.primaryColor 
                                  } : undefined}
                                >
                                  <td className="p-2.5 font-bold">
                                    <span className="block truncate max-w-[150px] sm:max-w-[200px]">
                                      {it.matrixName || <span className="text-zinc-400 italic font-normal">Nome não informado</span>}
                                    </span>
                                    <span className="text-[9px] text-zinc-500 font-normal">🪡 {it.stitchCount.toLocaleString()} pts • 🎨 {it.colorCount} cores</span>
                                  </td>
                                  <td className="p-2.5 text-center font-bold font-mono">
                                    <div className="flex items-center justify-center gap-1 group" onClick={(e) => e.stopPropagation()}>
                                      <Edit2 className="h-3 w-3 text-purple-400 opacity-60 group-hover:opacity-100 transition-opacity" />
                                      <input
                                        type="number"
                                        min="1"
                                        value={it.quantity}
                                        onChange={(e) => handleItemQuantityChange(it.id, e.target.value)}
                                        className="w-16 bg-white/5 dark:bg-black/20 px-1 py-0.5 rounded-md border border-slate-300 dark:border-white/20 hover:border-purple-400 dark:hover:border-purple-400 text-center font-bold text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        title="Editar Quantidade de Peças do Lote"
                                      />
                                      <span className="text-[10px] text-zinc-400">un</span>
                                    </div>
                                  </td>
                                  <td className="p-2.5 text-right font-black" style={{ color: settings.primaryColor }}>
                                    <div className="flex items-center justify-end gap-1.5 group">
                                      <Edit2 className="h-3 w-3 opacity-30 group-hover:opacity-100 transition-opacity" style={{ color: settings.primaryColor }} />
                                      <span className="text-[10px] opacity-60">R$</span>
                                      <input
                                        type={canViewPrices ? "number" : "text"}
                                        step="0.01"
                                        min="0"
                                        value={canViewPrices ? (it.manualUnitPrice !== undefined ? it.manualUnitPrice.toFixed(2) : it.unitPrice.toFixed(2)) : '***'}
                                        onChange={(e) => canViewPrices && handleManualUnitPriceChange(it.id, e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        readOnly={!canViewPrices}
                                        className={`w-16 bg-white/5 dark:bg-black/20 px-1 py-0.5 rounded-md border-b-2 text-right focus:outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                          it.manualUnitPrice !== undefined 
                                            ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10' 
                                            : 'border-slate-300 dark:border-white/20 hover:border-slate-400 dark:hover:border-white/40'
                                        }`}
                                        title="Editar Valor Unitário"
                                      />
                                    </div>
                                  </td>
                                  <td className="p-2.5 text-right text-slate-600 dark:text-zinc-400">
                                    {formatPrice(it.totalPrice)}
                                  </td>
                                  <td className="p-2.5 text-center">
                                    <button
                                      type="button"
                                      onClick={(e) => handleRemoveItemFromList(e, it.id)}
                                      className="p-1 bg-red-500/10 text-red-500 dark:text-red-400 rounded-md hover:bg-red-500/20 transition-colors"
                                      title="Remover matriz do pedido"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                  </div>
                )}

                {/* 4. CONFIGURAÇÃO DA MATRIZ (Se houver item sendo editado/adicionado) */}
                {(!orderItemsList.length || selectedItemId) && (
                  <div className="glass-panel p-5 rounded-3xl border border-slate-200 dark:border-white/10 space-y-4 relative z-20 animate-in fade-in zoom-in-95 duration-200 mb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2" style={{ color: settings.primaryColor }}>
                        <Settings className="h-4 w-4" /> {selectedClientId ? '4. Configuração da Matriz' : '3. Configuração da Matriz'}
                      </h3>
                    </div>

                    {(() => {
                      const editingItem = orderItemsList.find(it => it.id === selectedItemId);
                      // Se tem matrixId (veio da biblioteca) ou se já tem um nome e pontos (veio do leitor)
                      const isAutoFilled = !!editingItem && (!!editingItem.matrixId || (editingItem.matrixName && editingItem.stitchCount > 0));
                      const inputBorderClass = isAutoFilled ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-slate-300 dark:border-white/10';
                      const inputColorStyle = isAutoFilled ? { borderColor: '#10b98180' } : undefined;

                      return (
                        <>
                          <div>
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1.5 block">
                              {entryMode === 'quick' ? 'Descrição das Peças / Lote' : 'Nome da Logo / Matriz'} {!matrixName.trim() && <span className="text-red-500">*</span>}
                            </label>
                            <input
                              type="text"
                              value={matrixName}
                              onChange={e => { setMatrixName(e.target.value); setSelectedMatrixId(null); }}
                              className={`w-full bg-slate-50 dark:bg-white/5 border rounded-2xl px-4 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none transition-all ${
                                showValidationErrors && !matrixName.trim() ? 'border-red-500 ring-2 ring-red-500/20 bg-red-500/10' : (!matrixName.trim() ? 'border-red-500/40 bg-red-500/5' : inputBorderClass)
                              } ${showValidationErrors && !matrixName.trim() && shakeInputs ? 'animate-shake' : ''}`}
                              style={matrixName.trim() ? (inputColorStyle || { borderColor: `${settings.primaryColor}30` }) : undefined}
                              placeholder={entryMode === 'quick' ? "Ex: 100 Camisetas Polo pretas" : "Ex: Logo Peito Esquerdo..."}
                            />
                          </div>

                          {entryMode === 'budget' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                              <div>
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">
                                  Quantidade Pontos
                                </label>
                                <input
                                  type="number"
                                  value={stitchCount}
                                  onChange={e => setStitchCount(e.target.value === '' ? '' : Number(e.target.value))}
                                  className={`w-full bg-slate-50 dark:bg-white/5 border rounded-2xl px-4 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none transition-all ${
                                    showValidationErrors && (!stitchCount || Number(stitchCount) <= 0) ? 'border-red-500 ring-2 ring-red-500/20 bg-red-500/10' : (!stitchCount ? 'border-red-500/40 bg-red-500/5' : inputBorderClass)
                                  } ${showValidationErrors && (!stitchCount || Number(stitchCount) <= 0) && shakeInputs ? 'animate-shake' : ''}`}
                                  style={stitchCount ? (inputColorStyle || { borderColor: `${settings.primaryColor}30` }) : undefined}
                                  placeholder="Ex: 15000"
                                />
                              </div>

                              <div>
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">
                                  Número de Cores
                                </label>
                                <input
                                  type="number"
                                  value={colorCount}
                                  onChange={e => setColorCount(e.target.value === '' ? '' : Number(e.target.value))}
                                  className={`w-full bg-slate-50 dark:bg-white/5 border rounded-2xl px-4 py-2 text-xs text-slate-900 dark:text-white focus:outline-none transition-all ${inputBorderClass}`}
                                  style={colorCount ? (inputColorStyle || { borderColor: `${settings.primaryColor}30` }) : undefined}
                                  placeholder="Ex: 4"
                                />
                              </div>

                        <div>
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-1 block">
                            Qtd Peças
                          </label>
                          <input
                            type="number"
                            value={quantity}
                            onChange={e => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                            className={`w-full bg-slate-50 dark:bg-white/5 border rounded-2xl px-4 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none transition-all ${
                              showValidationErrors && (!quantity || Number(quantity) <= 0) ? 'border-red-500 ring-2 ring-red-500/20 bg-red-500/10' : (!quantity ? 'border-red-500/40 bg-red-500/5' : 'border-slate-300 dark:border-white/10')
                            } ${showValidationErrors && (!quantity || Number(quantity) <= 0) && shakeInputs ? 'animate-shake' : ''}`}
                            style={quantity ? { borderColor: `${settings.primaryColor}30` } : undefined}
                            placeholder="Ex: 50"
                          />
                        </div>

                              {/* ⏱️ Tempo Estimado de Máquina */}
                              <div>
                                <label className="text-[10px] font-black uppercase tracking-wider text-amber-500 dark:text-amber-400 mb-1 flex items-center gap-1">
                                  <Clock className="h-3.5 w-3.5" /> Tempo Máquina
                                </label>
                                <div className="w-full bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-2 text-xs font-black text-amber-600 dark:text-amber-300 flex items-center justify-between">
                                  <span>{estimatedMinutesPerPiece > 0 ? `${formatTimeLabel(estimatedMinutesPerPiece)}/pc` : '0 min'}</span>
                                  <span className="text-[10px] font-bold bg-amber-500/20 px-1.5 py-0.5 rounded-full text-amber-400">
                                    {formatTimeLabel(totalEstimatedMinutes)} total
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-4 pt-2">
                              <div className="grid grid-cols-1 gap-4">
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
                              </div>
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 block">
                                    Observações do Recebimento / Instruções
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => setIsPrivate(!isPrivate)}
                                    className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-xl border transition-all ${
                                      isPrivate 
                                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm' 
                                        : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white'
                                    }`}
                                    title="Restringir visualização do pedido apenas para o Dono/Financeiro"
                                  >
                                    <Lock className={`h-3 w-3 ${isPrivate ? 'text-amber-400' : 'text-zinc-500'}`} />
                                    <span>{isPrivate ? '🔒 Pedido Sigiloso' : 'Público (Equipe)'}</span>
                                  </button>
                                </div>
                                <textarea
                                  rows={3}
                                  value={observations}
                                  onChange={e => setObservations(e.target.value)}
                                  placeholder="Ex: Peças deixadas na sacola, cliente solicita bordado no peito esquerdo e manga direita."
                                  className="w-full bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-2xl px-4 py-2.5 text-xs text-slate-900 dark:text-white outline-none resize-none"
                                  style={observations.trim() ? { borderColor: `${settings.primaryColor}30` } : undefined}
                                />
                                {isPrivate && (
                                  <p className="text-[10px] text-amber-400/90 font-medium mt-1 flex items-center gap-1">
                                    <span>⚠️ Apenas o Chefe/Financeiro poderá visualizar os detalhes e valores deste pedido.</span>
                                  </p>
                                )}
                              </div>
                              {renderAttachments()}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}



                {/* 3. Tactile Addons */}
                {entryMode === 'budget' && (
                  <div className="glass-panel p-4 rounded-3xl border border-slate-200 dark:border-white/10 space-y-3">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-zinc-400 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" style={{ color: settings.primaryColor }} /> Adicionais Operacionais
                    </h3>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                      {[
                        { label: 'Camisa Fechada', badge: '+50%', state: isReadyPiece, setter: setIsReadyPiece, info: 'Fixação difícil' },
                        { label: 'Bastidor Grande', badge: '+30%', state: isBigHoop, setter: setIsBigHoop, info: 'Maior produção' },
                        { label: 'Fringe (3D)', badge: '+30%', state: isFringe, setter: setIsFringe, info: 'Efeito 3D' },
                        { label: 'Corte Laser', badge: '+R$ 0,50', state: hasLaser, setter: setHasLaser, info: 'Corte contorno' },
                        { label: 'Prensa Térmica', badge: '+R$ 0,50', state: hasPress, setter: setHasPress, info: 'Pré-fixação' },
                      ].map((addon, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => addon.setter(!addon.state)}
                          className={`group flex flex-col justify-between p-2 rounded-2xl border text-left transition-all duration-300 ${
                            addon.state
                              ? 'text-slate-900 dark:text-white'
                              : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/5 text-slate-600 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-white/10'
                          }`}
                          style={addon.state ? { backgroundColor: `${settings.primaryColor}15`, borderColor: settings.primaryColor, boxShadow: `0 0 15px ${settings.primaryColor}20` } : undefined}
                        >
                          <div className="flex items-start justify-between w-full mb-1">
                            <span className="text-[10px] font-black tracking-tight text-slate-800 dark:text-zinc-200 leading-tight" style={addon.state ? { color: settings.primaryColor } : undefined}>
                              {addon.label}
                            </span>
                          </div>
                          <div className="flex items-end justify-between w-full">
                            <span className="text-[9px] text-slate-500 dark:text-zinc-500 leading-none">
                              {addon.info}
                            </span>
                            <span 
                              className="text-[9px] font-black px-1.5 py-0.5 rounded-md border leading-none bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 ml-1"
                              style={addon.state ? { backgroundColor: `${settings.primaryColor}20`, borderColor: `${settings.primaryColor}30`, color: settings.primaryColor } : undefined}
                            >
                              {addon.badge}
                            </span>
                          </div>
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
                <div className="glass-panel p-4 rounded-3xl border border-slate-200 dark:border-white/10 space-y-4">
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
                            className={`p-3 rounded-2xl border text-left transition-all ${
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
        <div className="lg:col-span-5 space-y-4">
          <div className="glass-panel p-4 rounded-3xl border border-slate-200 dark:border-white/10 space-y-4 lg:sticky lg:top-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
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
            <div className="space-y-2">
              <div className="space-y-0.5">
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
                  {calculation.breakdown.map((item, idx) => {
                    const isColorLine = item.label.includes('Adicional Cores');
                    return (
                      <div key={idx} className={`flex justify-between items-center ${isColorLine && !chargeColorAddon ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-600 dark:text-zinc-400'}`}>
                        <span className="flex items-center gap-1.5">
                          {isColorLine && (
                            <button
                              type="button"
                              onClick={() => setChargeColorAddon(!chargeColorAddon)}
                              className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                                chargeColorAddon ? 'bg-purple-600' : 'bg-zinc-600'
                              }`}
                              title={chargeColorAddon ? 'Clique para isentar adicional de cores' : 'Clique para cobrar adicional de cores'}
                            >
                              <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow transition duration-200 ${
                                chargeColorAddon ? 'translate-x-3' : 'translate-x-0'
                              }`} />
                            </button>
                          )}
                          {isColorLine && !chargeColorAddon ? `Cores (${colorCount || 1}) — Isento` : item.label}
                        </span>
                        <span className={`font-semibold ${isColorLine && !chargeColorAddon ? 'line-through opacity-50' : 'text-slate-800 dark:text-zinc-200'}`}>
                          {formatPrice(item.amount)}
                        </span>
                      </div>
                    );
                  })}
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

              {/* Se houver múltiplos itens no carrinho, exibe lista simplificada no resumo */}
              {isUnlocked && entryMode === 'budget' && orderItemsList.length > 1 && (
                <div className="pt-3 border-t border-slate-200 dark:border-white/5 space-y-1.5 text-xs">
                  <p className="text-[10px] font-black uppercase tracking-wider text-purple-500 dark:text-purple-400">
                    Resumo do Carrinho ({orderItemsList.length} Matrizes):
                  </p>
                  {orderItemsList.map((item, idx) => (
                    <div key={item.id || idx} className="flex justify-between items-center text-[11px]">
                      <span className="truncate max-w-[150px] text-slate-700 dark:text-zinc-300 font-medium">
                        {item.matrixName || 'Matriz'} ({item.quantity} un)
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {formatPrice(item.totalPrice)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Total Card Display */}
              {(() => {
                const totalCartPieces = orderItemsList.length > 0 
                  ? orderItemsList.reduce((acc, i) => acc + (i.quantity || 1), 0)
                  : (Number(quantity) || 0);

                const finalOrderTotal = orderItemsList.length > 0
                  ? totalOrderAmount
                  : calculation.totalPrice;

                return (
                  <div className="p-4 rounded-2xl text-white relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${settings.primaryColor} 0%, ${settings.primaryColor}dd 100%)`, boxShadow: `0 10px 15px -3px ${settings.primaryColor}30` }}>
                    <div className="absolute right-0 bottom-0 opacity-10 translate-x-4 translate-y-4">
                      {isUnlocked ? <DollarSign className="h-32 w-32" /> : <Package className="h-32 w-32" />}
                    </div>
                    
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-85 block">
                      {isUnlocked
                        ? (entryMode === 'quick' ? 'Entrada Registrada' : `Valor Total do Pedido (${totalCartPieces} pçs)`)
                        : `Lote de Produção (${totalCartPieces} pçs)`}
                    </span>
                    
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xl font-black tracking-tight">
                        {isUnlocked
                          ? (entryMode === 'quick' ? 'Aguardando Orçamento' : formatPrice(finalOrderTotal))
                          : `${totalCartPieces} Peças no Lote`}
                      </span>
                      <CheckCircle2 className="h-6 w-6 opacity-90" />
                    </div>
                  </div>
                );
              })()}

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                {entryMode === 'quick' ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!isFormValid) {
                          setShowValidationErrors(true);
                          setShakeInputs(true);
                          setTimeout(() => setShakeInputs(false), 500);
                          toast.error("Por favor, preencha os campos destacados em vermelho antes de prosseguir.");
                          return;
                        }
                        setShowValidationErrors(false);
                        handleCreateOrder();
                      }}
                      disabled={isSaving}
                      className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-95 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      {isSaving ? 'Registrando Entrada...' : '📥 Confirmar Entrada de Peças'}
                    </button>

                    {/* Botões de Impressão de Comprovante */}
                    <div className="pt-1 border-t border-slate-200 dark:border-white/10 space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 block text-center">
                        🖨️ Imprimir Comprovante de Recebimento
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handlePrintReceiptAction('a4')}
                          className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-slate-300 dark:border-white/10 text-[11px] font-bold text-slate-700 dark:text-zinc-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <FileText className="h-3.5 w-3.5 text-purple-400" /> Folha A4
                        </button>

                        <button
                          type="button"
                          onClick={() => handlePrintReceiptAction('thermal')}
                          className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-slate-300 dark:border-white/10 text-[11px] font-bold text-slate-700 dark:text-zinc-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Printer className="h-3.5 w-3.5 text-amber-400" /> Cupom (80mm)
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  step === 1 ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!isFormValid) {
                          setShowValidationErrors(true);
                          setShakeInputs(true);
                          setTimeout(() => setShakeInputs(false), 500);
                          toast.error("Por favor, preencha os campos destacados em vermelho antes de prosseguir.");
                          return;
                        }
                        setShowValidationErrors(false);
                        setStep(2);
                      }}
                      className="w-full py-3 rounded-xl hover:opacity-95 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
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
                        className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-95 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
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
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                      whatsappNotifyReceipt 
                        ? 'bg-emerald-500/10 border-emerald-500/40 shadow-sm shadow-emerald-500/10' 
                        : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-3 pr-2 min-w-0">
                      <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 border ${
                        whatsappNotifyReceipt
                          ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                          : 'bg-white/5 border-white/10 text-zinc-400'
                      }`}>
                        <Package className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-slate-800 dark:text-zinc-100 block text-[11px] leading-tight">
                          Avisar recebimento das peças
                        </span>
                        <span className="text-[9px] text-slate-500 dark:text-zinc-400 block mt-0.5 truncate">
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
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                      whatsappRequestRef 
                        ? 'bg-emerald-500/10 border-emerald-500/40 shadow-sm shadow-emerald-500/10' 
                        : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-3 pr-2 min-w-0">
                      <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 border ${
                        whatsappRequestRef
                          ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                          : 'bg-white/5 border-white/10 text-zinc-400'
                      }`}>
                        <Image className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-slate-800 dark:text-zinc-100 block text-[11px] leading-tight">
                          Solicitar imagem / referência
                        </span>
                        <span className="text-[9px] text-slate-500 dark:text-zinc-400 block mt-0.5 truncate">
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
