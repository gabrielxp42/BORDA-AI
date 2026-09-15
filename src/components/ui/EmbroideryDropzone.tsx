import React, {useEffect, useRef, useState} from 'react';
import {UploadCloud, CheckCircle, AlertCircle, Loader2} from 'lucide-react';
import {parseEmbroideryFile, type EmbroideryMetadata} from '../../utils/embroideryParser';

export type EmbroideryParseState = 'idle' | 'parsing' | 'ready' | 'error';
interface EmbroideryDropzoneProps {
  onFileParsed: (metadata: EmbroideryMetadata, file: File) => void;
  onParseStateChange?: (state: EmbroideryParseState) => void;
  multiple?: boolean;
  primaryColor?: string;
}

export const EmbroideryDropzone: React.FC<EmbroideryDropzoneProps> = ({onFileParsed, onParseStateChange, multiple = true, primaryColor = '#a855f7'}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<EmbroideryParseState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const busy = useRef(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);

  const processFiles = async (files: File[]) => {
    if (busy.current || !files.length) return;
    busy.current = true;
    const request = ++generation.current;
    const parsed: {metadata: EmbroideryMetadata; file: File}[] = [];
    setStatus('parsing');
    setErrorMsg('');
    onParseStateChange?.('parsing');
    try {
      if (!multiple && files.length !== 1) throw new Error('Selecione uma matriz por cadastro.');
      if (files.length > 20) throw new Error('Selecione no máximo 20 matrizes por vez.');
      for (const file of files) {
        try { parsed.push({metadata: await parseEmbroideryFile(file), file}); }
        catch (error) { throw new Error(`${file.name}: ${error instanceof Error ? error.message : 'Falha ao validar a matriz.'}`); }
        if (request !== generation.current) return;
      }
      // Deliver the batch only after every file has passed validation.
      for (const {metadata, file} of parsed) onFileParsed(metadata, file);
      setStatus('ready');
      onParseStateChange?.('ready');
    } catch (error) {
      for (const {metadata} of parsed) if (metadata.preview_url) URL.revokeObjectURL(metadata.preview_url);
      if (request !== generation.current) return;
      setStatus('error');
      setErrorMsg(error instanceof Error ? error.message : 'Falha ao validar a matriz.');
      onParseStateChange?.('error');
    } finally {
      if (request !== generation.current) {
        for (const {metadata} of parsed) if (metadata.preview_url) URL.revokeObjectURL(metadata.preview_url);
      }
      busy.current = false;
    }
  };

  return (
    <div
      className={`relative w-full border-2 border-dashed rounded-3xl p-8 min-h-[180px] flex flex-col items-center justify-center text-center ${isDragging ? 'bg-white/10' : 'bg-black/40'} ${status === 'error' ? 'border-red-500/50' : status === 'ready' ? 'border-emerald-500/50' : 'border-white/20'}`}
      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
      onDrop={e => { e.preventDefault(); setIsDragging(false); void processFiles(Array.from(e.dataTransfer.files)); }}
      aria-busy={status === 'parsing'}
    >
      <input type="file" aria-label="Selecionar matriz DST ou EMB" multiple={multiple} accept=".dst,.emb" disabled={status === 'parsing'}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        onChange={e => { void processFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
      <div className="pointer-events-none flex flex-col items-center gap-2" role="status" aria-live="polite">
        {status === 'parsing' ? <Loader2 className="h-9 w-9 animate-spin" style={{color: primaryColor}} />
          : status === 'error' ? <AlertCircle className="h-9 w-9 text-red-400" />
          : status === 'ready' ? <CheckCircle className="h-9 w-9 text-emerald-400" />
          : <UploadCloud className="h-9 w-9" style={{color: primaryColor}} />}
        <h3 className="text-sm font-bold text-white">
          {status === 'parsing' ? 'Validando a matriz…' : status === 'error' ? 'Não foi possível validar a matriz' : status === 'ready' ? 'Dados extraídos e conferidos' : 'Arraste a matriz ou selecione o arquivo'}
        </h3>
        <p className={`text-xs max-w-lg ${status === 'error' ? 'text-red-300' : 'text-zinc-400'}`}>
          {status === 'parsing' ? 'Pontos, cores e medidas pendentes de validação.' : status === 'error' ? errorMsg : status === 'ready' ? 'A origem dos valores está disponível abaixo.' : 'DST e EMB • até 32 MB por arquivo'}
        </p>
      </div>
    </div>
  );
};
