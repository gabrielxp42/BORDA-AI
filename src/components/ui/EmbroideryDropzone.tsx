import React, { useCallback, useState } from 'react';
import { UploadCloud, FileCode, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { parseEmbroideryFile, EmbroideryMetadata } from '../../utils/embroideryParser';

interface EmbroideryDropzoneProps {
  onFileParsed: (metadata: EmbroideryMetadata, file: File) => void;
}

export const EmbroideryDropzone: React.FC<EmbroideryDropzoneProps> = ({ onFileParsed }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'partial' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processFile = async (file: File) => {
    setIsParsing(true);
    setStatus('idle');
    setErrorMsg('');

    try {
      const ext = file.name.toLowerCase().split('.').pop();
      if (ext !== 'dst' && ext !== 'emb') {
        throw new Error('Apenas arquivos .DST ou .EMB são suportados.');
      }

      // Adiciona um delay artificial de 1s para o usuário ver que o sistema está trabalhando
      await new Promise(resolve => setTimeout(resolve, 1000));

      const meta = await parseEmbroideryFile(file);
      
      if (meta.format === 'emb' && !meta.stitches) {
        setStatus('partial'); // Status novo para EMB caso o hack falhe
      } else {
        setStatus('success');
      }
      
      onFileParsed(meta, file);
      
      // Volta pro idle depois de 5 segundos para o usuário ter tempo de ler
      setTimeout(() => setStatus('idle'), 6000);
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || 'Erro ao ler arquivo.');
      setTimeout(() => setStatus('idle'), 5000);
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
      // Reseta o input para permitir selecionar o mesmo arquivo seguidas vezes
      e.target.value = '';
    }
  };

  return (
    <div 
      className={`relative w-full border-2 border-dashed rounded-3xl p-6 transition-all flex flex-col items-center justify-center text-center overflow-hidden
        ${isDragging ? 'border-purple-500 bg-purple-500/10 scale-[1.02]' : 'border-white/10 bg-black/40 hover:bg-white/5 hover:border-white/20'}
        ${status === 'success' ? 'border-emerald-500/50 bg-emerald-500/10' : ''}
        ${status === 'partial' ? 'border-amber-500/50 bg-amber-500/10' : ''}
        ${status === 'error' ? 'border-red-500/50 bg-red-500/10' : ''}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input 
        type="file" 
        accept=".dst,.emb"
        onChange={handleFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        disabled={isParsing}
      />

      <div className="pointer-events-none flex flex-col items-center">
        {isParsing ? (
          <>
            <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center mb-3 animate-pulse">
              <Loader2 className="h-6 w-6 text-purple-400 animate-spin" />
            </div>
            <h3 className="text-sm font-bold text-white mb-1">Decodificando Arquivo...</h3>
            <p className="text-xs text-zinc-400">Extraindo dados, pontos e dimensões.</p>
          </>
        ) : status === 'success' ? (
          <>
            <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center mb-3">
              <CheckCircle className="h-6 w-6 text-emerald-400" />
            </div>
            <h3 className="text-sm font-bold text-emerald-400 mb-1">Leitura Concluída!</h3>
            <p className="text-xs text-emerald-400/70">Todos os campos preenchidos perfeitamente.</p>
          </>
        ) : status === 'partial' ? (
          <>
            <div className="h-12 w-12 rounded-full bg-amber-500/20 flex items-center justify-center mb-3">
              <AlertCircle className="h-6 w-6 text-amber-400" />
            </div>
            <h3 className="text-sm font-bold text-amber-400 mb-1">Leitura Parcial (.EMB)</h3>
            <p className="text-xs text-amber-400/80 max-w-sm">
              O arquivo EMB bloqueia os pontos e tamanho. Extraímos apenas o nome e formato. Por favor, <strong>digite os pontos manualmente</strong> abaixo ou use um .DST.
            </p>
          </>
        ) : status === 'error' ? (
          <>
            <div className="h-12 w-12 rounded-full bg-red-500/20 flex items-center justify-center mb-3">
              <AlertCircle className="h-6 w-6 text-red-400" />
            </div>
            <h3 className="text-sm font-bold text-red-400 mb-1">Falha na Leitura</h3>
            <p className="text-xs text-red-400/70">{errorMsg}</p>
          </>
        ) : (
          <>
            <div className="flex gap-2 mb-3">
              <div className="h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                <FileCode className="h-5 w-5 text-blue-400" />
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center border border-purple-500/30">
                <UploadCloud className="h-5 w-5 text-purple-400" />
              </div>
            </div>
            <h3 className="text-sm font-bold text-white mb-1 tracking-wide">Leitor Automático de Matriz</h3>
            <p className="text-xs text-zinc-400 max-w-xs mx-auto">
              Arraste um arquivo <span className="font-mono text-purple-300">.DST</span> ou <span className="font-mono text-blue-300">.EMB</span> aqui ou clique para selecionar. O sistema preencherá os pontos, cores e tamanho sozinho.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
