import React, { useState } from 'react';
import { Layers, Plus, Search, FileCode, CheckCircle, Tag, Eye, ChevronDown, ChevronRight, User, FolderOpen, Folder, Download, Hash, Maximize2, Clock, X, HardDrive, AlertCircle, DollarSign, RefreshCw, Save, Edit2, Star, Minus } from 'lucide-react';
import { Matrix } from '@/types/borda';
import { ClientSelect } from '../components/ui/ClientSelect';
import { EmbroideryDropzone } from '../components/ui/EmbroideryDropzone';
import { EmbroideryMetadata } from '../utils/embroideryParser';
import { MatrixDetailsModal } from '../components/matrices/MatrixDetailsModal';
import { supabase } from '../integrations/supabase/client';
import { useCompanySettings } from '../contexts/CompanySettingsContext';
import { useProfile } from '@/contexts/ProfileContext';
import { usePricing } from '@/contexts/PricingContext';
import { calculateEmbroideryPrice } from '@/services/pricingEngine';
import { formatCurrency } from '@/utils/currencyFormatter';
import { toast } from 'sonner';

export const Matrizes: React.FC = () => {
  const { settings } = useCompanySettings();
  const { permissions } = useProfile();
  const { rules } = usePricing();
  const [matrices, setMatrices] = useState<Matrix[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkPriceModalOpen, setIsBulkPriceModalOpen] = useState(false);
  const [bulkPriceChange, setBulkPriceChange] = useState<number>(1);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editPriceValue, setEditPriceValue] = useState<string>('');
  const [detailsMatrix, setDetailsMatrix] = useState<Matrix | null>(null);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [editingMatrixDataId, setEditingMatrixDataId] = useState<string | null>(null);
  const [editingMatrixVersionId, setEditingMatrixVersionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'clients' | 'global'>('clients');

  // Form State
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [stitchCount, setStitchCount] = useState(15000);
  const [colorCount, setColorCount] = useState(4);
  const [widthMm, setWidthMm] = useState(80);
  const [heightMm, setHeightMm] = useState(60);
  const [unit, setUnit] = useState<'cm' | 'mm'>('cm');
  const [format, setFormat] = useState('dst');
  const [fixedPrice, setFixedPrice] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  React.useEffect(() => {
    fetchMatrices();
  }, []);

  const fetchMatrices = async () => {
    setIsLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;

      if (!userId) {
        console.warn("Usuário não autenticado.");
        return;
      }

      const { data: matricesData, error: mError } = await supabase
        .from('matrices')
        .select('*, client:clients(*)')
        .eq('user_id', userId);

      if (mError) throw mError;

      const { data: versionsData } = await supabase
        .from('matrix_versions')
        .select('*');

      const versionsList = versionsData || [];

      const formatted = (matricesData || []).map((m: any) => {
        const versions = versionsList.filter((v: any) => v.matrix_id === m.id);
        return {
          ...m,
          matrix_versions: versions,
          current_version: versions.find((v: any) => v.id === m.current_version_id) || versions[0],
        };
      });

      const sorted = formatted.sort((a: any, b: any) =>
        (a.name || '').localeCompare(b.name || '')
      );

      setMatrices(sorted);
      // Folders start closed by default as requested
    } catch (error: any) {
      console.error('Erro ao buscar matrizes:', error);
      toast.error('Erro ao carregar biblioteca: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter by tab and search
  const tabFilteredMatrices = matrices.filter((m) => {
    if (activeTab === 'clients') return !!m.client_id;
    if (activeTab === 'global') return !m.client_id && m.category === 'Global';
    return true;
  });

  const filteredMatrices = tabFilteredMatrices.filter(
    (m) =>
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.client?.name && m.client.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (m.code && m.code.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const groupedByClient = filteredMatrices.reduce((acc, m) => {
    // Para a aba Global, não agrupamos por cliente, tudo vai para 'global'
    const key = activeTab === 'global' ? 'global' : (m.client_id || 'sem-cliente');
    const label = activeTab === 'global' ? 'Matrizes da Empresa' : (m.client?.name || 'Sem Cliente Vinculado');
    if (!acc[key]) acc[key] = { label, matrices: [] };
    acc[key].matrices.push(m);
    return acc;
  }, {} as Record<string, { label: string; matrices: Matrix[] }>);

  const toggleClient = (clientKey: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev);
      if (next.has(clientKey)) next.delete(clientKey);
      else next.add(clientKey);
      return next;
    });
  };

  const handleUpdateFixedPrice = async (matrixId: string, value: string) => {
    try {
      const numVal = value ? Number(value) : null;
      const { error } = await supabase.from('matrices').update({ fixed_price: numVal }).eq('id', matrixId);
      if (error) throw error;
      toast.success('Preço da matriz atualizado com sucesso!');
      setEditingPriceId(null);
      await fetchMatrices();
    } catch (err: any) {
      toast.error('Erro ao atualizar preço: ' + err.message);
    }
  };

  const handleBulkPriceUpdate = async () => {
    if (!bulkPriceChange || bulkPriceChange === 0) return;
    try {
      const { error } = await supabase.rpc('bulk_update_matrix_prices', { amount: bulkPriceChange });
      // Wait, we don't have this RPC. Let's do it in JS for now or just fetch all matrices with fixed_price and update them.
      // Fetch all matrices that have a fixed_price
      const { data: toUpdate, error: fetchErr } = await supabase.from('matrices').select('id, fixed_price').not('fixed_price', 'is', null);
      if (fetchErr) throw fetchErr;

      const updates = toUpdate.map(m => ({
        id: m.id,
        fixed_price: Number(m.fixed_price) + bulkPriceChange
      }));

      // A simple loop update (supabase doesn't have bulk update via js without upsert, let's use upsert or loop)
      for (const u of updates) {
        await supabase.from('matrices').update({ fixed_price: u.fixed_price }).eq('id', u.id);
      }

      toast.success(`${updates.length} matrizes reajustadas em R$ ${bulkPriceChange.toFixed(2)}`);
      setIsBulkPriceModalOpen(false);
      await fetchMatrices();
    } catch (err: any) {
      toast.error('Erro no reajuste em massa: ' + err.message);
    }
  };

  const handleFileParsed = (meta: EmbroideryMetadata, file: File) => {
    if (meta.name && !name) setName(meta.name);
    if (meta.stitches) setStitchCount(meta.stitches);
    if (meta.colors) setColorCount(meta.colors);
    if (meta.widthMm) {
      setWidthMm(meta.widthMm);
      if (meta.widthMm < 10) setUnit('mm');
      else setUnit('cm');
    }
    if (meta.heightMm) {
      setHeightMm(meta.heightMm);
      if (meta.heightMm < 10 && (!meta.widthMm || meta.widthMm < 10)) setUnit('mm');
    }
    if (meta.format && meta.format !== 'unknown') setFormat(meta.format);
    if (meta.preview_url) setPreviewUrl(meta.preview_url);
    setSelectedFile(file);
  };

  const handleAddMatrix = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    
    if (!editingMatrixDataId && !selectedFile) {
      setFormError('Você precisa fazer o upload do arquivo da matriz.');
      return;
    }
    if (!name) {
      setFormError('Você precisa informar o Nome da Matriz.');
      return;
    }
    if (activeTab === 'clients' && !clientId) {
      setFormError('Você precisa selecionar um Cliente para vincular esta matriz.');
      return;
    }

    setIsSaving(true);
    toast.info('Iniciando envio da matriz...', { id: 'upload-toast' });
    try {
      if (editingMatrixDataId) {
        toast.info('Atualizando matriz...', { id: 'upload-toast' });
        const { error: matrixError } = await supabase
          .from('matrices')
          .update({ 
            name, 
            client_id: activeTab === 'global' ? null : clientId,
            fixed_price: fixedPrice ? Number(fixedPrice.replace(',', '.')) : null
          })
          .eq('id', editingMatrixDataId);
        
        if (matrixError) throw matrixError;

        if (editingMatrixVersionId) {
          const { error: versionError } = await supabase
            .from('matrix_versions')
            .update({
              file_format: format,
              stitch_count: Number(stitchCount),
              width_mm: Number(widthMm),
              height_mm: Number(heightMm),
              color_count: Number(colorCount),
              estimated_time_minutes: Math.round((stitchCount / 1000) * 0.7),
            })
            .eq('id', editingMatrixVersionId);
            
          if (versionError) throw versionError;
        }

        toast.success('Matriz atualizada com sucesso!', { id: 'upload-toast' });
      } else {
        // Barreira contra duplicidade de matrizes pelo nome
        const isDuplicate = matrices.some(
          m => m.name.trim().toLowerCase() === name.trim().toLowerCase()
        );
        if (isDuplicate) {
          setIsSaving(false);
          toast.error(`⚠️ Já existe uma matriz cadastrada com o nome "${name.trim()}". Escolha um nome único.`);
          return;
        }

        const uniqueSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        const { data: matrixData, error: matrixError } = await supabase
          .from('matrices')
          .insert({
            name,
            client_id: activeTab === 'global' ? null : clientId,
            code: `MAT-${Date.now().toString(36).toUpperCase()}-${uniqueSuffix}`,
            status: 'approved',
            category: activeTab === 'global' ? 'Global' : 'Geral',
            fixed_price: fixedPrice ? Number(fixedPrice.replace(',', '.')) : null
          })
          .select()
          .single();

        if (matrixError) throw matrixError;

        const fileExt = selectedFile!.name.split('.').pop();
        const filePath = `${matrixData.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('embroidery_files')
          .upload(filePath, selectedFile!);

        if (uploadError) throw uploadError;

        toast.success('Arquivo subido com sucesso, salvando dados...', { id: 'upload-toast' });
        const fileUrl = supabase.storage.from('embroidery_files').getPublicUrl(filePath).data.publicUrl;

        let finalPreviewUrl = null;
        if (previewUrl) {
          try {
            const res = await fetch(previewUrl);
            const blob = await res.blob();
            const previewPath = `${matrixData.id}/preview.jpg`;
            await supabase.storage.from('embroidery_files').upload(previewPath, blob);
            finalPreviewUrl = supabase.storage.from('embroidery_files').getPublicUrl(previewPath).data.publicUrl;
          } catch (prevErr) {
            console.error('Erro ao fazer upload do preview', prevErr);
          }
        }

        const { data: versionData, error: versionError } = await supabase
          .from('matrix_versions')
          .insert({
            matrix_id: matrixData.id,
            version_number: 1,
            file_name: selectedFile!.name,
            file_url: fileUrl,
            preview_url: finalPreviewUrl,
            file_format: format,
            stitch_count: Number(stitchCount),
            width_mm: Number(widthMm),
            height_mm: Number(heightMm),
            color_count: Number(colorCount),
            estimated_time_minutes: Math.round((stitchCount / 1000) * 0.7),
          })
          .select()
          .single();

        if (versionError) throw versionError;

        await supabase
          .from('matrices')
          .update({ current_version_id: versionData.id })
          .eq('id', matrixData.id);

        toast.success('Matriz salva com sucesso!', { id: 'upload-toast' });
      }

      setIsModalOpen(false);
      setEditingMatrixDataId(null);
      setEditingMatrixVersionId(null);
      setName('');
      setClientId('');
      setStitchCount(15000);
      setColorCount(4);
      setWidthMm(80);
      setHeightMm(60);
      setFormat('dst');
      setFixedPrice('');
      setSelectedFile(null);
      setPreviewUrl(undefined);
      fetchMatrices();
    } catch (err: any) {
      toast.error('Erro ao salvar matriz: ' + err.message, { id: 'upload-toast' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleMakeGlobal = async (matrix: Matrix, version: any) => {
    try {
      toast.info('Tornando matriz global...', { id: 'global-toast' });
      
      const uniqueSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const { data: newMatrix, error: matrixError } = await supabase
        .from('matrices')
        .insert({
          name: matrix.name,
          client_id: null,
          code: `MAT-${Date.now().toString(36).toUpperCase()}-${uniqueSuffix}`,
          status: 'approved',
          category: 'Global',
        })
        .select()
        .single();

      if (matrixError) throw matrixError;

      if (version) {
        const { data: newVersion, error: versionError } = await supabase
          .from('matrix_versions')
          .insert({
            matrix_id: newMatrix.id,
            version_number: 1,
            file_name: version.file_name,
            file_url: version.file_url,
            preview_url: version.preview_url,
            file_format: version.file_format,
            stitch_count: version.stitch_count,
            width_mm: version.width_mm,
            height_mm: version.height_mm,
            color_count: version.color_count,
            estimated_time_minutes: version.estimated_time_minutes,
          })
          .select()
          .single();

        if (versionError) throw versionError;

        await supabase
          .from('matrices')
          .update({ current_version_id: newVersion.id })
          .eq('id', newMatrix.id);
      }

      toast.success('Matriz copiada para a biblioteca da Empresa!', { id: 'global-toast' });
      fetchMatrices();
    } catch (err: any) {
      toast.error('Erro ao tornar global: ' + err.message, { id: 'global-toast' });
    }
  };

  const clientKeys = Object.keys(groupedByClient);
  const totalMatrices = filteredMatrices.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <div
              className="h-9 w-9 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${settings.primaryColor}20` }}
            >
              <Layers className="h-5 w-5" style={{ color: settings.primaryColor }} />
            </div>
            Biblioteca de Matrizes
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 ml-12">
            {isLoading ? 'Carregando...' : `${totalMatrices} matrizes · ${clientKeys.length} clientes`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {permissions?.canSeeFinancials !== false && (
            <button
              onClick={() => setIsBulkPriceModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 font-bold text-xs hover:bg-slate-50 dark:hover:bg-white/10 transition-all active:scale-95"
            >
              <DollarSign className="h-4 w-4" /> Reajuste de Preços
            </button>
          )}
          <button
            onClick={() => {
              setEditingMatrixDataId(null);
              setEditingMatrixVersionId(null);
              setName('');
              setStitchCount(15000);
              setColorCount(4);
              setWidthMm(80);
              setHeightMm(60);
              setFixedPrice('');
              setSelectedFile(null);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl text-white font-bold text-xs shadow-lg hover:opacity-90 transition-all active:scale-95"
            style={{
              backgroundColor: settings.primaryColor,
              boxShadow: `0 4px 14px ${settings.primaryColor}40`,
            }}
          >
            <Plus className="h-4 w-4" /> Cadastrar Nova Matriz
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/10 pb-4">
        <button
          onClick={() => setActiveTab('clients')}
          className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'clients'
              ? 'bg-brand/10 text-brand shadow-sm'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5'
          }`}
          style={activeTab === 'clients' ? { backgroundColor: `${settings.primaryColor}20`, color: settings.primaryColor } : {}}
        >
          <User className="h-4 w-4" /> Matrizes de Clientes
        </button>
        <button
          onClick={() => setActiveTab('global')}
          className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'global'
              ? 'bg-gradient-to-r from-amber-500/20 to-yellow-500/10 text-amber-600 dark:text-amber-400 shadow-sm border border-amber-500/20'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5'
          }`}
        >
          <Star className={`h-4 w-4 ${activeTab === 'global' ? 'fill-amber-500 text-amber-500' : ''}`} /> Matrizes da Empresa
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 p-2 rounded-2xl shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-zinc-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, código ou cliente..."
            className="w-full bg-transparent pl-9 pr-4 py-2 text-xs text-slate-900 dark:text-zinc-200 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none"
          />
        </div>
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="text-xs font-bold px-3 py-1.5 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div
            className="h-10 w-10 rounded-2xl flex items-center justify-center animate-pulse"
            style={{ backgroundColor: `${settings.primaryColor}20` }}
          >
            <Layers className="h-5 w-5" style={{ color: settings.primaryColor }} />
          </div>
          <p className="text-xs text-zinc-400 font-medium">Carregando biblioteca...</p>
        </div>
      ) : clientKeys.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-3xl border-2 border-dashed border-slate-200 dark:border-white/10">
          <Layers className="h-10 w-10 text-slate-300 dark:text-zinc-600" />
          <p className="text-sm font-bold text-slate-500 dark:text-zinc-400">Nenhuma matriz encontrada</p>
          <p className="text-xs text-slate-400 dark:text-zinc-500">Cadastre a primeira matriz ou ajuste a busca</p>
        </div>
      ) : (
        /* Client Accordion Groups */
        <div className="space-y-3">
          {clientKeys.map((clientKey) => {
            const group = groupedByClient[clientKey];
            const isExpanded = activeTab === 'global' ? true : expandedClients.has(clientKey);
            const count = group.matrices.length;

            const totalFolderMB = group.matrices.reduce((acc, m) => {
              const v = m.current_version;
              const stitches = v?.stitch_count || 10000;
              const approxBytes = stitches * 35 + 350000;
              return acc + approxBytes;
            }, 0) / (1024 * 1024);

            const formattedSize = totalFolderMB < 1 
              ? `${Math.round(totalFolderMB * 1024)} KB` 
              : `${totalFolderMB.toFixed(1)} MB`;

            const quotaLimitMB = 50;
            const percentUsed = Math.min(100, Math.max(4, Math.round((totalFolderMB / quotaLimitMB) * 100)));

            return (
              <div
                key={clientKey}
                className="rounded-3xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-white/[0.03] shadow-sm"
              >
                {/* Client Header / Folder Row */}
                <button
                  onClick={() => toggleClient(clientKey)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-9 w-9 rounded-xl flex items-center justify-center transition-all"
                      style={{
                        backgroundColor: isExpanded ? `${settings.primaryColor}25` : `${settings.primaryColor}10`,
                      }}
                    >
                      {isExpanded
                        ? <FolderOpen className="h-5 w-5" style={{ color: settings.primaryColor }} />
                        : <Folder className="h-5 w-5" style={{ color: settings.primaryColor }} />
                      }
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-900 dark:text-white">
                          {group.label}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded-lg text-[10px] font-black"
                          style={{
                            backgroundColor: `${settings.primaryColor}15`,
                            color: settings.primaryColor,
                          }}
                        >
                          {count} {count === 1 ? 'matriz' : 'matrizes'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5 flex items-center gap-1">
                        <User className="h-3 w-3" /> Cliente
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:gap-4">
                    {/* Barra de Armazenamento Consumido */}
                    <div className="hidden sm:flex flex-col gap-1 w-28 sm:w-36">
                      <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-zinc-500 font-bold">
                        <span className="flex items-center gap-1">
                          <HardDrive className="h-3 w-3" style={{ color: settings.primaryColor }} /> {formattedSize}
                        </span>
                        <span>{percentUsed}%</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${percentUsed}%`,
                            backgroundColor: percentUsed > 85 ? '#ef4444' : settings.primaryColor,
                          }}
                        />
                      </div>
                    </div>

                    {/* Preview strip when collapsed */}
                    {!isExpanded && (
                      <div className="hidden md:flex items-center gap-1.5">
                        {group.matrices.slice(0, 4).map((m) => {
                          const v = m.current_version;
                          return v?.preview_url ? (
                            <div
                              key={m.id}
                              className="w-8 h-8 rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden bg-slate-100 dark:bg-white/5"
                            >
                              <img src={v.preview_url} alt="" className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div
                              key={m.id}
                              className="w-8 h-8 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 flex items-center justify-center"
                            >
                              <Layers className="h-3.5 w-3.5 text-slate-300 dark:text-zinc-600" />
                            </div>
                          );
                        })}
                        {count > 4 && (
                          <span className="text-[10px] font-black text-slate-400 dark:text-zinc-500">
                            +{count - 4}
                          </span>
                        )}
                      </div>
                    )}
                    <div
                      className="h-6 w-6 rounded-full flex items-center justify-center transition-all"
                      style={{ backgroundColor: `${settings.primaryColor}10` }}
                    >
                      {isExpanded
                        ? <ChevronDown className="h-3.5 w-3.5" style={{ color: settings.primaryColor }} />
                        : <ChevronRight className="h-3.5 w-3.5" style={{ color: settings.primaryColor }} />
                      }
                    </div>
                  </div>
                </button>

                {/* Expanded Matrix Grid */}
                {isExpanded && (
                  <div className="border-t border-slate-200 dark:border-white/10 p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {group.matrices.map((m) => {
                        const v = m.current_version;
                        return (
                          <div
                            key={m.id}
                            className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4 space-y-3 hover:border-opacity-60 transition-all group"
                            style={{ '--hover-color': settings.primaryColor } as React.CSSProperties}
                          >
                            {/* Matrix Header */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span
                                    className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border"
                                    style={{
                                      color: settings.primaryColor,
                                      backgroundColor: `${settings.primaryColor}15`,
                                      borderColor: `${settings.primaryColor}30`,
                                    }}
                                  >
                                    {m.code}
                                  </span>
                                  <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-bold">
                                    V{v?.version_number || 1}
                                  </span>
                                </div>
                                <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-1.5 leading-tight truncate">
                                  {m.name}
                                </h3>
                              </div>
                              {v?.preview_url ? (
                                <button
                                  onClick={() => setLightboxUrl(v.preview_url!)}
                                  className="w-12 h-12 rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden shrink-0 bg-slate-100 dark:bg-white/5 hover:scale-110 hover:border-brand/50 transition-all cursor-zoom-in"
                                  title="Ampliar prévia da matriz"
                                >
                                  <img src={v.preview_url} alt="" className="w-full h-full object-cover" />
                                </button>
                              ) : (
                                <div
                                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                                  style={{ backgroundColor: `${settings.primaryColor}10` }}
                                >
                                  <Layers className="h-5 w-5" style={{ color: settings.primaryColor }} />
                                </div>
                              )}
                            </div>

                            {/* Preço Fixo (Editável no card) */}
                            <div className="bg-white/5 p-2 rounded-xl border border-white/5 flex items-center justify-between">
                              <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400">PREÇO DE VENDA</span>
                              {editingPriceId === m.id ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editPriceValue}
                                    onChange={e => setEditPriceValue(e.target.value)}
                                    placeholder="Calculado"
                                    className="w-16 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded px-1.5 py-0.5 text-xs text-right focus:outline-none focus:border-emerald-500"
                                  />
                                  <button onClick={() => handleUpdateFixedPrice(m.id, editPriceValue)} className="text-emerald-500 p-0.5 hover:bg-emerald-500/20 rounded">
                                    <Save className="h-3.5 w-3.5" />
                                  </button>
                                  <button onClick={() => setEditingPriceId(null)} className="text-rose-500 p-0.5 hover:bg-rose-500/20 rounded">
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                  <button 
                                    onClick={() => { setEditingPriceId(m.id); setEditPriceValue(m.fixed_price ? m.fixed_price.toString() : ''); }}
                                    className="flex items-center gap-1.5 text-xs font-black text-emerald-500 dark:text-emerald-400 hover:opacity-80 transition-opacity bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20"
                                    title="Editar preço de venda"
                                  >
                                    <Edit2 className="h-3 w-3 opacity-70" />
                                    {(() => {
                                      if (m.fixed_price) {
                                        return formatCurrency(Number(m.fixed_price), permissions?.canSeeFinancials ?? true);
                                      } else {
                                        const calcPrice = calculateEmbroideryPrice({
                                          stitchCount: v?.stitch_count || 0,
                                          colorCount: v?.color_count || 1,
                                          quantity: 1,
                                          chargeColorAddon: true,
                                          isBigHoop: false,
                                          isReadyPiece: false,
                                          isFringe: false,
                                          hasLaser: false,
                                          hasPress: false
                                        }, rules).unitPrice;
                                        return `${formatCurrency(calcPrice, permissions?.canSeeFinancials ?? true)} (Auto)`;
                                      }
                                    })()}
                                  </button>
                              )}
                            </div>

                            {/* Format badge */}
                            {v?.file_format && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30">
                                <CheckCircle className="h-2.5 w-2.5" /> {v.file_format.toUpperCase()}
                              </span>
                            )}

                            {/* Specs grid */}
                            {v && (
                              <div className="grid grid-cols-2 gap-2 bg-white dark:bg-black/20 p-2.5 rounded-xl border border-slate-200 dark:border-white/5 text-xs">
                                <div>
                                  <div className="flex items-center gap-1 text-slate-400 dark:text-zinc-500 mb-0.5">
                                    <Hash className="h-2.5 w-2.5" />
                                    <span className="text-[9px] font-bold uppercase">Pontos</span>
                                  </div>
                                  <span className="font-black text-xs" style={{ color: settings.primaryColor }}>
                                    {v.stitch_count?.toLocaleString('pt-BR')} pts
                                  </span>
                                </div>
                                <div>
                                  <div className="flex items-center gap-1 text-slate-400 dark:text-zinc-500 mb-0.5">
                                    <Maximize2 className="h-2.5 w-2.5" />
                                    <span className="text-[9px] font-bold uppercase">Tamanho</span>
                                  </div>
                                  <span className="font-bold text-xs text-slate-700 dark:text-zinc-200">
                                    {v.width_mm}×{v.height_mm}mm
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[9px] text-slate-400 dark:text-zinc-500 uppercase font-bold block mb-0.5">Cores</span>
                                  <span className="font-bold text-xs text-slate-700 dark:text-zinc-200">{v.color_count} cores</span>
                                </div>
                                <div>
                                  <div className="flex items-center gap-1 text-slate-400 dark:text-zinc-500 mb-0.5">
                                    <Clock className="h-2.5 w-2.5" />
                                    <span className="text-[9px] font-bold uppercase">Tempo</span>
                                  </div>
                                  <span className="font-bold text-xs text-slate-700 dark:text-zinc-200">{v.estimated_time_minutes} min</span>
                                </div>
                              </div>
                            )}

                            {/* Tags */}
                            {m.tags && m.tags.length > 0 && (
                              <div className="flex items-center gap-1 flex-wrap">
                                <Tag className="h-3 w-3 text-slate-400 dark:text-zinc-500 shrink-0" />
                                {m.tags.map(tag => (
                                  <span key={tag} className="text-[10px] text-slate-500 dark:text-zinc-400">{tag}</span>
                                ))}
                              </div>
                            )}

                              <div className="flex items-center gap-2 pt-1 border-t border-slate-200 dark:border-white/10">
                                <button
                                  onClick={() => {
                                    setEditingMatrixDataId(m.id);
                                    setEditingMatrixVersionId(v?.id || null);
                                    setName(m.name);
                                    setClientId(m.client_id || '');
                                    setStitchCount(v?.stitch_count || 15000);
                                    setColorCount(v?.color_count || 1);
                                    setWidthMm(v?.width_mm || 80);
                                    setHeightMm(v?.height_mm || 60);
                                    setFixedPrice(m.fixed_price !== null ? String(m.fixed_price).replace('.', ',') : '');
                                    setFormat(v?.file_format || 'dst');
                                    setIsModalOpen(true);
                                  }}
                                  className="flex-1 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-white/10"
                                >
                                  <Edit2 className="h-3.5 w-3.5" /> Editar
                                </button>
                                <button
                                  onClick={() => setDetailsMatrix(m)}
                                  className="flex-1 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all hover:opacity-80"
                                  style={{
                                    backgroundColor: `${settings.primaryColor}15`,
                                    color: settings.primaryColor,
                                  }}
                                >
                                  <Eye className="h-3.5 w-3.5" /> Detalhes
                                </button>
                                {activeTab === 'clients' && (
                                  <button
                                    onClick={() => handleMakeGlobal(m, v)}
                                    title="Tornar Matriz Global (Copiar para Empresa)"
                                    className="py-2 px-3 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25"
                                  >
                                    <Star className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              {permissions?.canDownloadMatrices && v?.file_url && (
                                <button
                                  onClick={() => window.open(v.file_url, '_blank')}
                                  className="py-2 px-3 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Cadastro */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-panel p-6 rounded-3xl border border-white/10 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <FileCode className="h-5 w-5" style={{ color: settings.primaryColor }} />
              {editingMatrixDataId ? 'Editar Matriz de Bordado' : 'Cadastrar Matriz de Bordado'}
            </h3>

            <form onSubmit={handleAddMatrix} className="space-y-4">
              {formError && (
                <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold flex items-center justify-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  {formError}
                </div>
              )}
              
              {!editingMatrixDataId && (
                <div className="mb-6">
                  <EmbroideryDropzone onFileParsed={handleFileParsed} />
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase">Nome da Matriz / Logo</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Logo Nike Peito Esquerdo"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-xs text-white mt-1 focus:outline-none transition-colors"
                  style={{ ['--tw-ring-color' as any]: settings.primaryColor }}
                />
              </div>

              {activeTab === 'clients' && (
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase flex items-center gap-2">
                    Cliente <span className="text-red-500 text-[10px]">*Obrigatório</span>
                  </label>
                  <div className={`mt-1 rounded-2xl transition-all ${!clientId && formError?.includes('Cliente') ? 'ring-2 ring-red-500/50' : ''}`}>
                    <ClientSelect value={clientId} onChange={setClientId} />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase">Pontos (Stitches)</label>
                  <input
                    type="number"
                    required
                    value={stitchCount}
                    onChange={(e) => setStitchCount(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-xs text-white mt-1 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase">Nº de Cores</label>
                  <input
                    type="number"
                    required
                    value={colorCount}
                    onChange={(e) => setColorCount(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-xs text-white mt-1 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase">Largura ({unit.toUpperCase()})</label>
                  <input
                    type="number"
                    step="0.1"
                    value={unit === 'cm' ? Number((widthMm / 10).toFixed(2)) : widthMm}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setWidthMm(unit === 'cm' ? val * 10 : val);
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-xs text-white mt-1 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase">Altura ({unit.toUpperCase()})</label>
                  <input
                    type="number"
                    step="0.1"
                    value={unit === 'cm' ? Number((heightMm / 10).toFixed(2)) : heightMm}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setHeightMm(unit === 'cm' ? val * 10 : val);
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-xs text-white mt-1 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase">Formato</label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="w-full bg-[#12121a] border border-white/10 rounded-2xl px-4 py-2 text-xs text-white mt-1 focus:outline-none"
                  >
                    <option value="dst">DST (Tajim)</option>
                    <option value="emb">EMB (Wilcom)</option>
                    <option value="pes">PES (Brother)</option>
                    <option value="exp">EXP (Melco)</option>
                  </select>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mt-2 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10 bg-gradient-to-r from-emerald-500 to-teal-500 pointer-events-none" />
                <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4">
                  {(() => {
                    const isOverridden = fixedPrice.trim() !== '';
                    const autoPrice = calculateEmbroideryPrice({ stitchCount: stitchCount || 0, colorCount: colorCount || 1, quantity: 1 }, rules).totalPrice;
                    const displayPrice = isOverridden ? parseFloat(fixedPrice.replace(',', '.') || '0') : autoPrice;
                    
                    return (
                      <div className="flex-1">
                        <label className="text-xs font-bold text-zinc-400 uppercase">
                          {isOverridden ? 'Preço Fixado Manualmente' : 'Preço Calculado Automático'}
                        </label>
                        <p className={`text-xl font-black mt-1 ${isOverridden ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {formatCurrency(displayPrice)}
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-1 leading-tight">
                          {isOverridden 
                            ? 'Este valor será usado em vez da precificação automática.'
                            : `Baseado em ${stitchCount.toLocaleString()} pts e ${colorCount} cores, de acordo com suas regras.`}
                        </p>
                      </div>
                    );
                  })()}
                  <div className="w-full sm:w-1/2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-zinc-400 uppercase">Sobrescrever Valor</label>
                      {fixedPrice.trim() !== '' && (
                        <button
                          type="button"
                          onClick={() => setFixedPrice('')}
                          className="text-[10px] text-amber-500 hover:text-amber-400 flex items-center gap-1 font-bold uppercase transition-colors"
                        >
                          <RefreshCw className="h-3 w-3" /> Restaurar Automático
                        </button>
                      )}
                    </div>
                    <div className="relative flex items-center mt-1">
                      <button
                        type="button"
                        onClick={() => {
                          const current = parseFloat(fixedPrice.replace(',', '.') || '0');
                          if (current >= 1) setFixedPrice((current - 1).toFixed(2).replace('.', ','));
                        }}
                        className="h-10 w-10 flex-shrink-0 flex items-center justify-center bg-white/5 hover:bg-white/10 active:bg-white/20 text-white rounded-l-xl border border-white/10 transition-colors"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <span className="text-zinc-500 text-xs font-bold">R$</span>
                        </div>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={fixedPrice}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '') setFixedPrice('');
                            else if (/^[0-9.,]*$/.test(val)) setFixedPrice(val);
                          }}
                          placeholder="Automático"
                          className="w-full h-10 bg-[#12121a] border-y border-white/10 pl-9 pr-4 text-center text-sm font-bold text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                          style={{ WebkitAppearance: 'none', appearance: 'none' }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const current = parseFloat(fixedPrice.replace(',', '.') || '0');
                          setFixedPrice((current + 1).toFixed(2).replace('.', ','));
                        }}
                        className="h-10 w-10 flex-shrink-0 flex items-center justify-center bg-white/5 hover:bg-white/10 active:bg-white/20 text-white rounded-r-xl border border-white/10 transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-white/10 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs text-white hover:bg-white/10 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl text-white font-black text-xs transition-all flex items-center gap-2 disabled:opacity-50 hover:opacity-90"
                  style={{ backgroundColor: settings.primaryColor }}
                >
                  {isSaving ? 'Salvando...' : 'Cadastrar Matriz'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Detalhes */}
      <MatrixDetailsModal
        isOpen={!!detailsMatrix}
        onClose={() => setDetailsMatrix(null)}
        matrix={detailsMatrix}
      />
      {/* Lightbox da Matriz */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/92 backdrop-blur-md cursor-zoom-out animate-in fade-in duration-200"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-w-2xl w-full mx-6" onClick={e => e.stopPropagation()}>
            <img
              src={lightboxUrl}
              alt="Prévia da Matriz"
              className="w-full h-auto rounded-3xl shadow-2xl border border-white/10 animate-in zoom-in-95 duration-200"
            />
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute -top-4 -right-4 h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white border border-white/20 transition-colors backdrop-blur-sm"
            >
              <X className="h-4 w-4" />
            </button>
            <p className="text-center text-xs text-white/40 mt-3 font-medium">Clique fora para fechar</p>
          </div>
        </div>
      )}

      {/* Modal de Reajuste em Massa */}
      {isBulkPriceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-sm shadow-2xl p-6">
            <h3 className="text-lg font-black text-white mb-2 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-500" />
              Reajuste em Massa
            </h3>
            <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
              Defina um valor para aumentar (ou diminuir) o preço fixo de <strong>todas as matrizes</strong> que já possuem preço de venda definido.
            </p>
            
            <div className="mb-6">
              <label className="text-xs font-bold text-zinc-400 uppercase">Valor de Reajuste (R$)</label>
              <input
                type="number"
                step="0.01"
                value={bulkPriceChange}
                onChange={(e) => setBulkPriceChange(Number(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-sm font-black text-white mt-2 focus:outline-none focus:border-emerald-500"
                placeholder="Ex: 1.50 para aumentar ou -1.00 para diminuir"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setIsBulkPriceModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl font-bold text-xs text-white bg-white/5 hover:bg-white/10 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleBulkPriceUpdate}
                className="flex-1 py-2.5 rounded-xl text-white font-black text-xs bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 transition-colors"
              >
                Aplicar Reajuste
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
