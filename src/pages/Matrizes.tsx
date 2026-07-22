import React, { useState } from 'react';
import { Layers, Plus, Search, Filter, FileCode, CheckCircle, Tag, Eye, Clock } from 'lucide-react';
import { Matrix } from '@/types/borda';
import { ClientSelect } from '../components/ui/ClientSelect';
import { EmbroideryDropzone } from '../components/ui/EmbroideryDropzone';
import { EmbroideryMetadata } from '../utils/embroideryParser';
import { MatrixDetailsModal } from '../components/matrices/MatrixDetailsModal';
import { supabase } from '../integrations/supabase/client';
import { toast } from 'sonner';

export const Matrizes: React.FC = () => {
  const [matrices, setMatrices] = useState<Matrix[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailsMatrix, setDetailsMatrix] = useState<Matrix | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [stitchCount, setStitchCount] = useState(15000);
  const [colorCount, setColorCount] = useState(4);
  const [widthMm, setWidthMm] = useState(80);
  const [heightMm, setHeightMm] = useState(60);
  const [unit, setUnit] = useState<'cm' | 'mm'>('cm');
  const [format, setFormat] = useState('dst');
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    fetchMatrices();
  }, []);

  const fetchMatrices = async () => {
    setIsLoading(true);
    try {
      // 1. Busca matrizes e clientes
      const { data: matricesData, error: mError } = await supabase
        .from('matrices')
        .select('*, client:clients(*)');

      if (mError) throw mError;

      // 2. Busca todas as versões para vincular no JS (evita o erro PGRST201 de chave estrangeira dupla)
      const { data: versionsData } = await supabase
        .from('matrix_versions')
        .select('*');

      const versionsList = versionsData || [];

      // 3. Monta a estrutura combinada
      const formatted = (matricesData || []).map((m: any) => {
        const versions = versionsList.filter((v: any) => v.matrix_id === m.id);
        return {
          ...m,
          matrix_versions: versions,
          current_version: versions.find((v: any) => v.id === m.current_version_id) || versions[0],
        };
      });

      setMatrices(formatted.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    } catch (error: any) {
      console.error('Erro ao buscar matrizes:', error);
      toast.error('Erro ao carregar biblioteca: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredMatrices = matrices.filter(
    (m) =>
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.client?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleFileParsed = (meta: EmbroideryMetadata, file: File) => {
    if (meta.name && !name) setName(meta.name);
    if (meta.stitches) setStitchCount(meta.stitches);
    if (meta.colors) setColorCount(meta.colors);
    if (meta.widthMm) {
      setWidthMm(meta.widthMm);
      // Se for menor que 1cm, muda a unidade para MM automaticamente
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
    if (!name || !clientId || !selectedFile) {
      toast.error('Por favor, preencha todos os campos e faça o upload do arquivo.');
      return;
    }

    setIsSaving(true);
    toast.info('Iniciando envio da matriz...', { id: 'upload-toast' });
    try {
      // 1. Inserir a Matriz pai
      const { data: matrixData, error: matrixError } = await supabase
        .from('matrices')
        .insert({
          name,
          client_id: clientId,
          code: `MAT-${String(matrices.length + 1).padStart(3, '0')}`,
          status: 'approved',
          category: 'Geral',
        })
        .select()
        .single();

      if (matrixError) throw matrixError;

      // 2. Fazer Upload do arquivo físico
      const fileExt = selectedFile.name.split('.').pop();
      const filePath = `${matrixData.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('embroidery_files')
        .upload(filePath, selectedFile);
      
      if (uploadError) throw uploadError;

      toast.success('Arquivo subido com sucesso, salvando dados...', { id: 'upload-toast' });
      const fileUrl = supabase.storage.from('embroidery_files').getPublicUrl(filePath).data.publicUrl;

      // 3. Fazer Upload do Preview (se existir)
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

      // 4. Inserir a Versão
      const { data: versionData, error: versionError } = await supabase
        .from('matrix_versions')
        .insert({
          matrix_id: matrixData.id,
          version_number: 1,
          file_name: selectedFile.name,
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

      // 5. Atualizar current_version_id
      await supabase.from('matrices').update({ current_version_id: versionData.id }).eq('id', matrixData.id);

      // Recarrega
      await fetchMatrices();
      
      setIsModalOpen(false);
      setName('');
      setClientId('');
      setPreviewUrl(undefined);
      setSelectedFile(null);
      
      toast.success('Matriz cadastrada com sucesso!', { id: 'upload-toast' });
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao salvar matriz: ' + err.message, { id: 'upload-toast' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
            <Layers className="h-6 w-6 text-purple-400" /> Biblioteca de Matrizes
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Acervo inteligente de arquivos Wilcom (.dst, .emb, .pes). Reutilize matrizes prontas e evite digitalizações duplicadas.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-xs shadow-lg shadow-purple-500/25 hover:brightness-110 transition-all"
        >
          <Plus className="h-4 w-4" /> Cadastrar Nova Matriz
        </button>
      </div>

      {/* Busca e Filtro */}
      <div className="flex items-center gap-3 bg-white/5 p-2 rounded-2xl border border-white/10">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome da matriz, código ou cliente..."
            className="w-full bg-transparent pl-9 pr-4 py-2 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
          />
        </div>
        <button className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-zinc-300 flex items-center gap-2">
          <Filter className="h-3.5 w-3.5" /> Filtros
        </button>
      </div>

      {/* Grid de Matrizes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredMatrices.map((m) => {
          const v = m.current_version;
          return (
            <div key={m.id} className="glass-card p-5 rounded-3xl space-y-4 relative group">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20">
                    {m.code} • V{v?.version_number || 1}
                  </span>
                  <h3 className="font-bold text-sm text-white mt-1.5">{m.name}</h3>
                  <p className="text-xs text-zinc-400 font-medium">{m.client?.name}</p>
                </div>
                <span className="px-2 py-1 rounded-lg text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> {v?.file_format?.toUpperCase()}
                </span>
              </div>

              {/* Especificações da Matriz (Metadados do Wilcom) */}
              <div className="grid grid-cols-2 gap-2 bg-white/5 p-3 rounded-2xl border border-white/5 text-xs">
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase block font-semibold">Pontos (Stitches)</span>
                  <span className="font-black text-purple-300">{v?.stitch_count.toLocaleString('pt-BR')} pts</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase block font-semibold">Dimensões</span>
                  <span className="font-bold text-zinc-200">{v?.width_mm} x {v?.height_mm} mm</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase block font-semibold">Cores</span>
                  <span className="font-bold text-zinc-200">{v?.color_count} cores</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase block font-semibold">Tempo Est.</span>
                  <span className="font-bold text-zinc-200">{v?.estimated_time_minutes} min</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[11px]">
                <div className="flex items-center gap-1 text-zinc-400">
                  <Tag className="h-3 w-3 text-purple-400" />
                  <span>{m.tags?.join(', ')}</span>
                </div>
                <button 
                  onClick={() => setDetailsMatrix(m)}
                  className="text-purple-400 font-bold hover:underline flex items-center gap-1"
                >
                  <Eye className="h-3.5 w-3.5" /> Detalhes
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de Cadastro de Matriz */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-panel p-6 rounded-3xl border border-white/10 w-full max-w-lg space-y-4">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <FileCode className="h-5 w-5 text-purple-400" /> Cadastrar Matriz de Bordado
            </h3>

            <form onSubmit={handleAddMatrix} className="space-y-4">
              {/* Leitor de Arquivos Mágico */}
              <div className="mb-6">
                <EmbroideryDropzone onFileParsed={handleFileParsed} />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase">Nome da Matriz / Logo</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Logo Nike Peito Esquerdo"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-xs text-white mt-1 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase">Cliente</label>
                <div className="mt-1">
                  <ClientSelect 
                    value={clientId}
                    onChange={setClientId}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase">Qtd de Pontos (Stitches)</label>
                  <input
                    type="number"
                    required
                    value={stitchCount}
                    onChange={(e) => setStitchCount(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-xs text-white mt-1 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase">Número de Cores</label>
                  <input
                    type="number"
                    required
                    value={colorCount}
                    onChange={(e) => setColorCount(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-xs text-white mt-1 focus:outline-none focus:border-purple-500"
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
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-xs text-white mt-1 focus:outline-none focus:border-purple-500"
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
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-xs text-white mt-1 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase">Formato</label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="w-full bg-[#12121a] border border-white/10 rounded-2xl px-4 py-2 text-xs text-white mt-1 focus:outline-none focus:border-purple-500"
                  >
                    <option value="dst">DST (Tajim)</option>
                    <option value="emb">EMB (Wilcom)</option>
                    <option value="pes">PES (Brother)</option>
                    <option value="exp">EXP (Melco)</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-white/10 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl font-bold text-xs text-white hover:bg-white/10 transition-colors">
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isSaving ? 'Salvando...' : 'Cadastrar Matriz'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal de Detalhes da Matriz */}
      <MatrixDetailsModal 
        isOpen={!!detailsMatrix} 
        onClose={() => setDetailsMatrix(null)} 
        matrix={detailsMatrix} 
      />
    </div>
  );
};
