import React, { useCallback, useState } from 'react';
import { UploadCloud, FileCode, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { parseEmbroideryFile, EmbroideryMetadata } from '../../utils/embroideryParser';

interface EmbroideryDropzoneProps {
  onFileParsed: (metadata: EmbroideryMetadata, file: File) => void;
  primaryColor?: string;
}

export const EmbroideryDropzone: React.FC<EmbroideryDropzoneProps> = ({ onFileParsed, primaryColor = '#a855f7' }) => {
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

  const processFiles = async (files: File[]) => {
    setIsParsing(true);
    setStatus('idle');
    setErrorMsg('');

    try {
      for (const file of files) {
        const ext = file.name.toLowerCase().split('.').pop();
        if (ext !== 'dst' && ext !== 'emb') {
          continue;
        }

        const meta = await parseEmbroideryFile(file);
        
        if (meta.format === 'emb' && !meta.stitches) {
          setStatus('partial');
        } else {
          setStatus('success');
        }
        
        onFileParsed(meta, file);
      }

      setTimeout(() => setStatus('idle'), 6000);
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || 'Erro ao ler arquivo(s).');
      setTimeout(() => setStatus('idle'), 5000);
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  return (
    <div 
      className={`relative w-full border-2 border-dashed rounded-2xl p-4 transition-all flex flex-col items-center justify-center text-center overflow-hidden
        ${isDragging ? 'scale-[1.02]' : 'border-white/10 bg-black/40 hover:bg-white/5 hover:border-white/20'}
        ${status === 'success' ? 'border-emerald-500/50 bg-emerald-500/10' : ''}
        ${status === 'partial' ? 'border-amber-500/50 bg-amber-500/10' : ''}
        ${status === 'error' ? 'border-red-500/50 bg-red-500/10' : ''}
      `}
      style={isDragging && status === 'idle' ? { borderColor: primaryColor, backgroundColor: `${primaryColor}1A` } : undefined}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input 
        type="file" 
        multiple
        accept=".dst,.emb"
        onChange={handleFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        disabled={isParsing}
      />

      <div className="pointer-events-none flex flex-col items-center">
        {isParsing ? (
          <>
            <div className="h-10 w-10 rounded-full flex items-center justify-center mb-2 animate-pulse" style={{ backgroundColor: `${primaryColor}33` }}>
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: primaryColor }} />
            </div>
            <h3 className="text-sm font-bold text-white mb-0.5">Decodificando...</h3>
            <p className="text-[10px] text-zinc-400">Extraindo dados.</p>
          </>
        ) : status === 'success' ? (
          <>
            <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center mb-2">
              <CheckCircle className="h-5 w-5 text-emerald-400" />
            </div>
            <h3 className="text-sm font-bold text-emerald-400 mb-0.5">Leitura Concluída!</h3>
            <p className="text-[10px] text-emerald-400/70">Tudo preenchido.</p>
          </>
        ) : status === 'partial' ? (
          <>
            <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center mb-2">
              <AlertCircle className="h-5 w-5 text-amber-400" />
            </div>
            <h3 className="text-sm font-bold text-amber-400 mb-0.5">Leitura Parcial</h3>
            <p className="text-[10px] text-amber-400/80 max-w-sm">
              .EMB lido parcialmente. Digite os pontos ou use um .DST.
            </p>
          </>
        ) : status === 'error' ? (
          <>
            <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center mb-2">
              <AlertCircle className="h-5 w-5 text-red-400" />
            </div>
            <h3 className="text-sm font-bold text-red-400 mb-0.5">Falha</h3>
            <p className="text-[10px] text-red-400/70">{errorMsg}</p>
          </>
        ) : (
          <>
            <div className="flex gap-2 mb-2">
              <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                <FileCode className="h-4 w-4 text-blue-400" />
              </div>
              <div className="h-10 w-10 rounded-full flex items-center justify-center border" style={{ backgroundColor: `${primaryColor}33`, borderColor: `${primaryColor}4D` }}>
                <UploadCloud className="h-4 w-4" style={{ color: primaryColor }} />
              </div>
            </div>
            <h3 className="text-sm font-bold text-white mb-1 tracking-wide">Arraste ou Selecione</h3>
            <p className="text-[10px] text-zinc-400 max-w-xs mx-auto">
              Formatos suportados: <span className="font-mono text-purple-300">.DST</span> e <span className="font-mono text-blue-300">.EMB</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
};
