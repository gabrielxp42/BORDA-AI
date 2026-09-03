import React, { useEffect, useRef, useState } from 'react';
import {
  X, Send, Camera, Video, Mic, Square, Trash2, LifeBuoy, Paperclip, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface ReportarProblemaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Anexo {
  id: string;
  tipo: 'imagem' | 'video' | 'audio';
  nome: string;
  blob: Blob;
  previewUrl: string;
}

const BUCKET = 'bug-reports';
const LIMITE_MB = 45;

const tamanhoLegivel = (bytes: number) =>
  bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export const ReportarProblemaModal: React.FC<ReportarProblemaModalProps> = ({ isOpen, onClose }) => {
  const [descricao, setDescricao] = useState('');
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [gravando, setGravando] = useState<'tela' | 'audio' | null>(null);
  const [enviando, setEnviando] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Libera as URLs de preview ao fechar, senão o navegador segura os blobs.
  useEffect(() => {
    if (!isOpen) {
      anexos.forEach(a => URL.revokeObjectURL(a.previewUrl));
      setAnexos([]);
      setDescricao('');
      pararTudo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Colar print direto do Ctrl+V — é como a maioria manda evidência.
  useEffect(() => {
    if (!isOpen) return;
    const aoColar = (e: ClipboardEvent) => {
      const itens = Array.from(e.clipboardData?.items || []);
      itens.forEach(it => {
        if (it.type.startsWith('image/')) {
          const arquivo = it.getAsFile();
          if (arquivo) adicionar(arquivo, 'imagem', `print-${Date.now()}.png`);
        }
      });
    };
    window.addEventListener('paste', aoColar);
    return () => window.removeEventListener('paste', aoColar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const adicionar = (blob: Blob, tipo: Anexo['tipo'], nome: string) => {
    if (blob.size > LIMITE_MB * 1024 * 1024) {
      toast.error(`Arquivo muito grande (${tamanhoLegivel(blob.size)}). O limite é ${LIMITE_MB} MB.`);
      return;
    }
    setAnexos(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tipo, nome, blob,
      previewUrl: URL.createObjectURL(blob),
    }]);
    toast.success(`${nome} anexado.`);
  };

  const pararTudo = () => {
    try { recorderRef.current?.state === 'recording' && recorderRef.current.stop(); } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setGravando(null);
  };

  const gravar = async (modo: 'tela' | 'audio') => {
    if (gravando) { pararTudo(); return; }
    try {
      const stream = modo === 'tela'
        ? await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: true })
        : await navigator.mediaDevices.getUserMedia({ audio: true });

      streamRef.current = stream;
      chunksRef.current = [];

      const rec = new MediaRecorder(stream);
      recorderRef.current = rec;

      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: modo === 'tela' ? 'video/webm' : 'audio/webm',
        });
        if (blob.size > 0) {
          adicionar(blob, modo === 'tela' ? 'video' : 'audio',
            `${modo === 'tela' ? 'gravacao-tela' : 'audio'}-${Date.now()}.webm`);
        }
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setGravando(null);
      };

      // Se o usuário encerrar o compartilhamento pela barra do navegador
      stream.getVideoTracks()[0]?.addEventListener('ended', () => pararTudo());

      rec.start();
      setGravando(modo);
      toast.info(modo === 'tela'
        ? 'Gravando a tela. Faça o problema acontecer e clique em Parar.'
        : 'Gravando áudio. Fale o que está acontecendo.');
    } catch (err: any) {
      if (err?.name !== 'NotAllowedError') {
        toast.error('Não foi possível iniciar a gravação neste aparelho.');
      }
      setGravando(null);
    }
  };

  const enviar = async () => {
    if (!descricao.trim()) {
      toast.error('Escreva o que aconteceu, mesmo que em poucas palavras.');
      return;
    }
    setEnviando(true);
    const aviso = toast.loading('Enviando seu chamado...');

    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) throw new Error('Sessão expirada. Entre novamente.');

      // Sobe os anexos e guarda só os caminhos no registro
      const caminhos: any[] = [];
      for (const a of anexos) {
        const ext = a.nome.split('.').pop() || 'bin';
        const caminho = `${user.id}/${Date.now()}-${a.id}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(caminho, a.blob, {
          contentType: a.blob.type || 'application/octet-stream',
          upsert: false,
        });
        if (error) {
          console.warn('Falha ao subir anexo:', error.message);
          continue;
        }
        caminhos.push({ caminho, tipo: a.tipo, nome: a.nome, tamanho: a.blob.size });
      }

      const { error } = await supabase.from('bug_reports').insert({
        user_id: user.id,
        user_email: user.email,
        user_name: (user.user_metadata as any)?.name || user.email,
        descricao: descricao.trim(),
        pagina: window.location.pathname + window.location.search,
        user_agent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        anexos: caminhos,
      });
      if (error) throw error;

      toast.success('Chamado enviado! Vamos olhar isso.', { id: aviso });
      onClose();
    } catch (err: any) {
      toast.error('Não foi possível enviar: ' + (err?.message || 'erro'), { id: aviso });
    } finally {
      setEnviando(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999999999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d0d14] text-slate-900 dark:text-zinc-100 shadow-2xl overflow-hidden">

        <div className="flex items-start justify-between p-5 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center shrink-0">
              <LifeBuoy className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="font-black text-base">Relatar um problema</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Conte o que aconteceu. Se puder, grave a tela — ajuda muito.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
          <textarea
            autoFocus
            rows={4}
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            placeholder="Ex: cliquei no acordo do cliente e a tela ficou preta"
            className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm outline-none focus:border-purple-500 resize-none"
          />

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => gravar('tela')}
              className={`py-3 px-2 rounded-2xl border text-[11px] font-black uppercase tracking-wide flex flex-col items-center gap-1.5 transition-all ${
                gravando === 'tela'
                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-600 dark:text-rose-300 animate-pulse'
                  : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10'
              }`}
            >
              {gravando === 'tela' ? <Square className="h-4 w-4" /> : <Video className="h-4 w-4" />}
              {gravando === 'tela' ? 'Parar' : 'Gravar tela'}
            </button>

            <button
              type="button"
              onClick={() => gravar('audio')}
              className={`py-3 px-2 rounded-2xl border text-[11px] font-black uppercase tracking-wide flex flex-col items-center gap-1.5 transition-all ${
                gravando === 'audio'
                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-600 dark:text-rose-300 animate-pulse'
                  : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10'
              }`}
            >
              {gravando === 'audio' ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {gravando === 'audio' ? 'Parar' : 'Gravar áudio'}
            </button>

            <label className="py-3 px-2 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-[11px] font-black uppercase tracking-wide flex flex-col items-center gap-1.5 cursor-pointer transition-all">
              <Camera className="h-4 w-4" />
              Anexar
              <input
                type="file"
                accept="image/*,video/*,audio/*"
                multiple
                className="hidden"
                onChange={e => {
                  Array.from(e.target.files || []).forEach(f => {
                    const tipo: Anexo['tipo'] = f.type.startsWith('video') ? 'video'
                      : f.type.startsWith('audio') ? 'audio' : 'imagem';
                    adicionar(f, tipo, f.name);
                  });
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-zinc-500 text-center">
            Dica: tire um print e cole aqui com <b>Ctrl+V</b>.
          </p>

          {anexos.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                <Paperclip className="h-3 w-3" /> {anexos.length} anexo(s)
              </span>
              {anexos.map(a => (
                <div key={a.id} className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                  {a.tipo === 'imagem' ? (
                    <img src={a.previewUrl} alt="" className="h-11 w-11 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="h-11 w-11 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
                      {a.tipo === 'video' ? <Video className="h-4 w-4 text-purple-500" /> : <Mic className="h-4 w-4 text-purple-500" />}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold truncate">{a.nome}</p>
                    <p className="text-[10px] text-slate-500 dark:text-zinc-500">{tamanhoLegivel(a.blob.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(a.previewUrl);
                      setAnexos(prev => prev.filter(x => x.id !== a.id));
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 transition-colors shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
          <button
            type="button"
            onClick={enviar}
            disabled={enviando || !!gravando}
            className="w-full py-3 rounded-2xl bg-purple-600 hover:brightness-110 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {enviando ? 'Enviando...' : gravando ? 'Pare a gravação para enviar' : 'Enviar para o suporte'}
          </button>
        </div>
      </div>
    </div>
  );
};
