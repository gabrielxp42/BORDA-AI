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
      className={`relative w-full border-2 border-dashed rounded-3xl p-8 min-h-[180px] transition-all duration-300 flex flex-col items-center justify-center text-center overflow-hidden group
        ${isDragging ? 'scale-[1.02] border-4 bg-white/10' : 'border-white/20 bg-black/40 hover:bg-white/5 hover:border-white/40'}
        ${status === 'success' ? 'border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_30px_rgba(16,185,129,0.15)]' : ''}
        ${status === 'partial' ? 'border-amber-500/50 bg-amber-500/10' : ''}
        ${status === 'error' ? 'border-red-500/50 bg-red-500/10' : ''}
      `}
      style={isDragging && status === 'idle' ? { borderColor: primaryColor, backgroundColor: `${primaryColor}1A`, boxShadow: `0 0 40px ${primaryColor}30` } : undefined}
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
            <div className={`flex gap-3 mb-4 transition-transform duration-300 ${isDragging ? 'scale-125' : 'group-hover:scale-110'}`}>
              <div className="h-14 w-14 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                <FileCode className="h-6 w-6 text-blue-400" />
              </div>
              <div className="h-14 w-14 rounded-full flex items-center justify-center border shadow-lg" style={{ backgroundColor: `${primaryColor}33`, borderColor: `${primaryColor}4D` }}>
                <UploadCloud className={`h-6 w-6 ${isDragging ? 'animate-bounce' : ''}`} style={{ color: primaryColor }} />
              </div>
            </div>
            <h3 className="text-base font-black text-white mb-1.5 tracking-wide uppercase">
              {isDragging ? 'Solte o arquivo aqui!' : 'Arraste a Matriz para cá'}
            </h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              Formatos suportados: <span className="font-mono text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded">.DST</span> e <span className="font-mono text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded">.EMB</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
};
