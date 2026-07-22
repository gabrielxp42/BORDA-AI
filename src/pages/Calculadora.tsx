import React, { useState, useEffect } from 'react';
import { Calculator, Sparkles, CheckSquare, Send, DollarSign, Layers, CheckCircle2, Upload, ChevronDown, ChevronUp, FileCheck, Sliders, Package, Plus, Check } from 'lucide-react';
import { calculateEmbroideryPrice } from '@/services/pricingEngine';
import { EmbroideryDropzone } from '@/components/ui/EmbroideryDropzone';
import { EmbroideryMetadata } from '@/utils/embroideryParser';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { usePricing } from '@/contexts/PricingContext';
import { ClientSelect } from '@/components/ui/ClientSelect';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export const Calculadora: React.FC = () => {
  const { settings } = useCompanySettings();
  const { rules, openPricingModal } = usePricing();
  const navigate = useNavigate();

  // Input States
  const [stitchCount, setStitchCount] = useState<number | ''>('');
  const [colorCount, setColorCount] = useState<number | ''>('');
  const [quantity, setQuantity] = useState<number | ''>('');

  // Addon Checkboxes
  const [isBigHoop, setIsBigHoop] = useState<boolean>(false);
  const [isReadyPiece, setIsReadyPiece] = useState<boolean>(false);
  const [isFringe, setIsFringe] = useState<boolean>(false);
  const [hasLaser, setHasLaser] = useState<boolean>(false);
  const [hasPress, setHasPress] = useState<boolean>(false);

  // Client info
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [matrixName, setMatrixName] = useState<string>('');

  // File Dropzone Accordion
  const [isDropzoneExpanded, setIsDropzoneExpanded] = useState<boolean>(false);
  const [lastParsedFile, setLastParsedFile] = useState<string | null>(null);

  // Lista de Matrizes do Cliente Selecionado
  const [clientMatrices, setClientMatrices] = useState<any[]>([]);
  const [loadingMatrices, setLoadingMatrices] = useState<boolean>(false);
  const [showMatrixSelector, setShowMatrixSelector] = useState<boolean>(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState<boolean>(false);

  // Buscar matrizes quando um cliente for selecionado
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
    const ver = matrix.current_version;
    if (ver) {
      if (ver.stitch_count) setStitchCount(ver.stitch_count);
      if (ver.color_count) setColorCount(ver.color_count);
    }
    toast.success(`Matriz "${matrix.name}" selecionada!`);
  };

  const handleFileParsed = (meta: EmbroideryMetadata) => {
    if (meta.name) setMatrixName(meta.name);
    if (meta.stitches) setStitchCount(meta.stitches);
    if (meta.colors) setColorCount(meta.colors);
    setLastParsedFile(meta.name || 'Matriz Importada');
    setIsDropzoneExpanded(false);
  };

  // Compute live price using user's pricing rules from DB
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

  // Criação Direta de Pedido sem Modal
  const handleCreateDirectOrder = async () => {
    if (!selectedClientId) {
      toast.error("Por favor, selecione um cliente registrado antes de criar o pedido.");
      return;
    }

    if (!matrixName.trim()) {
      toast.error("Por favor, informe o nome da logo / matriz.");
      return;
    }

    if (!stitchCount || Number(stitchCount) <= 0) {
      toast.error("Por favor, informe a quantidade de pontos.");
      return;
    }

    if (!quantity || Number(quantity) <= 0) {
      toast.error("Por favor, informe a quantidade de peças.");
      return;
    }

    setIsCreatingOrder(true);
    try {
      // 1. Inserir Pedido
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          client_id: selectedClientId,
          status: 'pending',
          payment_status: 'pending',
          payment_method: 'pix',
          total_amount: calculation.totalPrice,
          notes: `Matriz: ${matrixName} (${stitchCount} pts, ${colorCount} cores)`
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // 2. Inserir Item do Pedido
      if (order) {
        const { error: itemError } = await supabase
          .from('order_items')
          .insert({
            order_id: order.id,
            description: `Bordado: ${matrixName}`,
            quantity: Number(quantity) || 1,
            unit_price: calculation.unitPrice,
            total_price: calculation.totalPrice
          });

        if (itemError) throw itemError;
      }

      toast.success(`Pedido #${order.id.slice(0, 6)} criado com sucesso!`, {
        action: {
          label: 'Ver Pedidos',
          onClick: () => navigate('/pedidos')
        }
      });
    } catch (err) {
      console.error("Erro ao criar pedido direto:", err);
      toast.error("Erro ao registrar pedido.");
    } finally {
      setIsCreatingOrder(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <Calculator className="h-6 w-6" style={{ color: settings.primaryColor }} /> Calculadora Dinâmica de Orçamentos
          </h2>
          <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1">
            Suba a matriz (.EMB / .DST) para auto-preenchimento instantâneo ou insira os dados do Wilcom manualmente.
          </p>
        </div>

        <button
          type="button"
          onClick={openPricingModal}
          className="self-start sm:self-auto flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-900 dark:text-white text-xs font-bold transition-all border border-slate-200 dark:border-white/10 shadow-sm"
        >
          <Sliders className="h-4 w-4" style={{ color: settings.primaryColor }} />
          Tabela de Preços (Milheiro)
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Formulário de Parâmetros */}
        <div className="lg:col-span-7 space-y-6">
          {/* Leitor Automático de Matriz (Sanfona Collapsible Premium) */}
          <div className="glass-panel rounded-3xl border border-slate-200 dark:border-white/10 overflow-hidden transition-all shadow-md">
            <button
              type="button"
              onClick={() => setIsDropzoneExpanded(!isDropzoneExpanded)}
              className="w-full p-4 flex items-center justify-between bg-slate-50/50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl" style={{ backgroundColor: `${settings.primaryColor}20`, color: settings.primaryColor }}>
                  <Upload className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white flex items-center gap-2">
                    Auto-Preenchimento via Arquivo Wilcom (.EMB / .DST)
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                    {lastParsedFile ? `Matriz Ativa: ${lastParsedFile}` : 'Clique para expandir e arrastar o arquivo .EMB / .DST'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {lastParsedFile && (
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <FileCheck className="h-3.5 w-3.5" /> Processado
                  </span>
                )}
                <div className="p-1.5 rounded-xl bg-slate-200/60 dark:bg-white/10 text-slate-600 dark:text-zinc-400">
                  {isDropzoneExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>
            </button>

            {isDropzoneExpanded && (
              <div className="p-5 border-t border-slate-200 dark:border-white/10 animate-in slide-in-from-top-2 duration-200">
                <EmbroideryDropzone onFileParsed={handleFileParsed} />
              </div>
            )}
          </div>

          {/* Dados do Cliente e Matrizes Salvas */}
          <div className="glass-panel p-6 rounded-3xl border border-slate-200 dark:border-white/10 space-y-5 relative z-20">
            <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2" style={{ color: settings.primaryColor }}>
              <Layers className="h-4 w-4" /> Dados do Wilcom & Cliente
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-zinc-400 uppercase mb-1 block">
                  Cliente Registrado {(!selectedClientId) && <span className="text-red-500 ml-1">*</span>}
                </label>
                <div className={!selectedClientId ? 'rounded-2xl border border-red-500/80 shadow-[0_0_12px_rgba(239,68,68,0.3)] transition-all' : ''}>
                  <ClientSelect
                    value={selectedClientId}
                    onChange={(clientId) => {
                      setSelectedClientId(clientId);
                    }}
                    error={!selectedClientId}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-zinc-400 uppercase mb-1 block">
                  Nome da Logo / Matriz {(!matrixName.trim()) && <span className="text-red-500 ml-1">*</span>}
                </label>
                <input
                  type="text"
                  value={matrixName}
                  onChange={(e) => setMatrixName(e.target.value)}
                  className={`w-full bg-slate-50 dark:bg-white/5 border rounded-2xl px-4 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none transition-all ${
                    !matrixName.trim()
                      ? 'border-red-500/80 shadow-[0_0_12px_rgba(239,68,68,0.3)] bg-red-500/5'
                      : 'border-slate-300 dark:border-white/10'
                  }`}
                  style={matrixName.trim() ? { borderColor: `${settings.primaryColor}40` } : {}}
                  placeholder="Ex: Logo Peito Esquerdo..."
                />
              </div>
            </div>

            {/* Lista Discreta de Matrizes Salvas do Cliente Selecionado */}
            {selectedClientId && clientMatrices.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 space-y-2 animate-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-zinc-400 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-purple-400" /> Matrizes Salvas deste Cliente ({clientMatrices.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowMatrixSelector(!showMatrixSelector)}
                    className="text-[10px] font-bold text-purple-400 hover:text-purple-300 flex items-center gap-1"
                  >
                    {showMatrixSelector ? 'Ocultar' : 'Ver Matrizes'}
                    <ChevronDown className={`h-3 w-3 transition-transform ${showMatrixSelector ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {showMatrixSelector && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 max-h-36 overflow-y-auto custom-scrollbar">
                    {clientMatrices.map(m => {
                      const ver = m.current_version;
                      const isSelected = matrixName === m.name;
                      return (
                        <div
                          key={m.id}
                          onClick={() => handleSelectSavedMatrix(m)}
                          className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                              : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/5 hover:border-purple-500/30 text-slate-800 dark:text-zinc-200'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold truncate">{m.name}</p>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500 dark:text-zinc-400">
                              {ver?.stitch_count && <span>🪡 {ver.stitch_count.toLocaleString()} pts</span>}
                              {ver?.color_count && <span>🎨 {ver.color_count} cores</span>}
                            </div>
                          </div>
                          {isSelected && <Check className="h-4 w-4 text-purple-400 shrink-0 ml-2" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-bold uppercase flex items-center gap-1 mb-1" style={{ color: settings.primaryColor }}>
                  <Sparkles className="h-3 w-3" /> Qtd Pontos {(!stitchCount || Number(stitchCount) <= 0) && <span className="text-red-500 ml-1">*</span>}
                </label>
                <input
                  type="number"
                  value={stitchCount}
                  onChange={(e) => setStitchCount(e.target.value === '' ? '' : Number(e.target.value))}
                  className={`w-full bg-slate-50 dark:bg-white/5 border rounded-2xl px-4 py-2.5 text-xs text-slate-900 dark:text-white font-bold focus:outline-none transition-all ${
                    !stitchCount || Number(stitchCount) <= 0
                      ? 'border-red-500/80 shadow-[0_0_12px_rgba(239,68,68,0.3)] bg-red-500/5'
                      : 'border-slate-300 dark:border-white/10'
                  }`}
                  style={stitchCount && Number(stitchCount) > 0 ? { borderColor: `${settings.primaryColor}40` } : {}}
                  placeholder="Ex: 15000"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-zinc-400 uppercase mb-1 block">
                  Número de Cores {(!colorCount || Number(colorCount) <= 0) && <span className="text-red-500 ml-1">*</span>}
                </label>
                <input
                  type="number"
                  value={colorCount}
                  onChange={(e) => setColorCount(e.target.value === '' ? '' : Number(e.target.value))}
                  className={`w-full bg-slate-50 dark:bg-white/5 border rounded-2xl px-4 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none transition-all ${
                    !colorCount || Number(colorCount) <= 0
                      ? 'border-red-500/80 shadow-[0_0_12px_rgba(239,68,68,0.3)] bg-red-500/5'
                      : 'border-slate-300 dark:border-white/10'
                  }`}
                  placeholder="Ex: 4"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-zinc-400 uppercase mb-1 block">
                  Quantidade de Peças {(!quantity || Number(quantity) <= 0) && <span className="text-red-500 ml-1">*</span>}
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                  className={`w-full bg-slate-50 dark:bg-white/5 border rounded-2xl px-4 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none transition-all ${
                    !quantity || Number(quantity) <= 0
                      ? 'border-red-500/80 shadow-[0_0_12px_rgba(239,68,68,0.3)] bg-red-500/5'
                      : 'border-slate-300 dark:border-white/10'
                  }`}
                  placeholder="Ex: 50"
                />
              </div>
            </div>
          </div>

          {/* Adicionais Operacionais */}
          <div className="glass-panel p-6 rounded-3xl border border-slate-200 dark:border-white/10 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-zinc-400 flex items-center gap-2">
              <CheckSquare className="h-4 w-4" /> Adicionais Operacionais (Planilha)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: 'Peça Pronta (Camisa fechada)', badge: '+50%', state: isReadyPiece, setter: setIsReadyPiece },
                { label: 'Bastidor Grande', badge: '+30%', state: isBigHoop, setter: setIsBigHoop },
                { label: 'Aplicação de Fringe', badge: '+30%', state: isFringe, setter: setIsFringe },
                { label: 'Corte a Laser', badge: '+R$ 0,50', state: hasLaser, setter: setHasLaser },
                { label: 'Aplicação com Prensa', badge: '+R$ 0,50', state: hasPress, setter: setHasPress },
              ].map((addon, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => addon.setter(!addon.state)}
                  className={`flex items-center justify-between p-3 rounded-2xl border text-xs font-bold transition-all text-left ${
                    addon.state
                      ? 'bg-slate-100 dark:bg-white/10 border-slate-300 dark:border-white/20 text-slate-900 dark:text-white'
                      : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/5 text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/10'
                  }`}
                  style={addon.state ? { borderColor: settings.primaryColor, color: settings.primaryColor } : undefined}
                >
                  <span className="truncate">{addon.label}</span>
                  <span 
                    className="text-[10px] font-black px-2 py-0.5 rounded-lg border ml-2"
                    style={{ backgroundColor: `${settings.primaryColor}20`, borderColor: `${settings.primaryColor}40`, color: settings.primaryColor }}
                  >
                    {addon.badge}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Resumo do Orçamento */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-panel p-6 rounded-3xl border border-slate-200 dark:border-white/10 space-y-6 sticky top-6">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-zinc-400">
                Resumo do Orçamento
              </h3>
              <div className="p-2 rounded-xl bg-slate-100 dark:bg-white/5" style={{ color: settings.primaryColor }}>
                <DollarSign className="h-5 w-5" />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-800 dark:text-white truncate">
                {selectedClientId ? 'Cliente Selecionado' : 'Cliente Não Informado'}
              </p>
              <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">{matrixName || 'Matriz Não Informada'}</p>

              <div className="pt-3 border-t border-slate-200 dark:border-white/5 space-y-2 text-xs">
                {calculation.breakdown.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-slate-600 dark:text-zinc-400">
                    <span>{item.label}</span>
                    <span className="font-semibold text-slate-800 dark:text-zinc-200">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-white/10 space-y-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-zinc-400 uppercase">Valor Unitário por Peça:</span>
                <span className="text-lg font-black text-slate-900 dark:text-white" style={{ color: settings.primaryColor }}>
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculation.unitPrice)}
                </span>
              </div>

              <div className="p-4 rounded-2xl text-white shadow-xl transition-all" style={{ backgroundColor: settings.primaryColor }}>
                <span className="text-[10px] font-black uppercase tracking-widest opacity-80">
                  Valor Total ({quantity || 0} peças)
                </span>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-2xl font-black">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculation.totalPrice)}
                  </span>
                  <CheckCircle2 className="h-6 w-6 opacity-90" />
                </div>
              </div>

              <div className="space-y-2 pt-2">
                {/* Botão de Criação Direta em 1 Clique (Sem Modal Popup!) */}
                <button
                  type="button"
                  onClick={handleCreateDirectOrder}
                  disabled={isCreatingOrder}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 hover:opacity-95 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25 transition-all active:scale-95 disabled:opacity-50"
                >
                  <Package className="h-4 w-4" />
                  {isCreatingOrder ? 'CRIANDO PEDIDO...' : 'Criar Pedido Oficial'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const text = `*Orçamento de Bordado - ${settings.systemName}*\n\n` +
                      `*Cliente:* ${selectedClientId ? 'Registrado' : 'Não informado'}\n` +
                      `*Matriz:* ${matrixName || 'Sem nome'}\n` +
                      `*Pontos:* ${stitchCount ? stitchCount.toLocaleString() : 0} pts\n` +
                      `*Cores:* ${colorCount || 1}\n` +
                      `*Quantidade:* ${quantity || 1} peças\n` +
                      `*Valor Unitário:* R$ ${calculation.unitPrice.toFixed(2)}\n` +
                      `*Valor Total:* R$ ${calculation.totalPrice.toFixed(2)}`;
                    
                    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                  }}
                  className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
                >
                  <Send className="h-4 w-4" /> Enviar WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
