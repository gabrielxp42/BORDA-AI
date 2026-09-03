import React, { useEffect, useState } from 'react';
import {
  LifeBuoy, Loader2, RefreshCw, Video, Mic, Image as ImageIcon,
  Download, Monitor, Clock, CheckCircle2
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Anexo {
  caminho: string;
  tipo: 'imagem' | 'video' | 'audio';
  nome: string;
  tamanho?: number;
}

interface Chamado {
  id: string;
  user_email?: string;
  user_name?: string;
  descricao: string;
  pagina?: string;
  user_agent?: string;
  viewport?: string;
  anexos?: Anexo[];
  status: string;
  created_at: string;
}

const BUCKET = 'bug-reports';

/** Resume o user agent para algo legível: "iPhone · Safari". */
function aparelho(ua?: string): string {
  if (!ua) return 'desconhecido';
  const so = /iPhone/i.test(ua) ? 'iPhone'
    : /iPad/i.test(ua) ? 'iPad'
    : /Android/i.test(ua) ? 'Android'
    : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X/i.test(ua) ? 'Mac'
    : 'outro';
  const nav = /Edg\//i.test(ua) ? 'Edge'
    : /Chrome\//i.test(ua) ? 'Chrome'
    : /Firefox\//i.test(ua) ? 'Firefox'
    : /Safari\//i.test(ua) ? 'Safari'
    : '';
  return nav ? `${so} · ${nav}` : so;
}

export const PainelChamados: React.FC = () => {
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [links, setLinks] = useState<Record<string, string>>({});

  const buscar = async () => {
    setCarregando(true);
    try {
      const { data, error } = await supabase
        .from('bug_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setChamados((data as any) || []);
    } catch (err: any) {
      toast.error('Erro ao carregar chamados: ' + (err?.message || ''));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { buscar(); }, []);

  /** Gera link temporário do anexo, que fica em bucket privado. */
  const abrirAnexo = async (a: Anexo) => {
    if (links[a.caminho]) { window.open(links[a.caminho], '_blank'); return; }
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(a.caminho, 3600);
    if (error || !data?.signedUrl) {
      toast.error('Não foi possível abrir o anexo.');
      return;
    }
    setLinks(prev => ({ ...prev, [a.caminho]: data.signedUrl }));
    window.open(data.signedUrl, '_blank');
  };

  const marcarResolvido = async (id: string) => {
    const { error } = await supabase
      .from('bug_reports')
      .update({ status: 'resolvido', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { toast.error('Não foi possível atualizar.'); return; }
    toast.success('Chamado marcado como resolvido.');
    buscar();
  };

  const abertos = chamados.filter(c => c.status !== 'resolvido');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-purple-300 font-black text-sm">
          <LifeBuoy className="h-5 w-5" />
          Chamados dos Usuários
          {abertos.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200 text-[10px]">
              {abertos.length} aberto(s)
            </span>
          )}
        </div>
        <button
          onClick={buscar}
          className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-300 transition-colors"
          title="Recarregar"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {carregando ? (
        <div className="h-40 flex items-center justify-center gap-2 text-zinc-500 text-xs">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
        </div>
      ) : chamados.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-white/10 rounded-2xl">
          <LifeBuoy className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
          <p className="text-zinc-400 text-sm font-bold">Nenhum chamado até agora.</p>
          <p className="text-zinc-600 text-xs mt-1">
            O usuário abre um apertando a seta para baixo duas vezes.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {chamados.map(c => (
            <div
              key={c.id}
              className={`rounded-2xl border p-4 space-y-3 ${
                c.status === 'resolvido'
                  ? 'border-white/5 bg-white/[0.02] opacity-70'
                  : 'border-purple-500/25 bg-purple-500/[0.06]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white break-words">{c.descricao}</p>
                  <p className="text-[11px] text-zinc-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span>{c.user_name || c.user_email || 'usuário'}</span>
                    <span className="text-zinc-600">•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(c.created_at), 'dd/MM HH:mm')}
                    </span>
                    {c.pagina && (
                      <>
                        <span className="text-zinc-600">•</span>
                        <code className="text-purple-300">{c.pagina}</code>
                      </>
                    )}
                    <span className="text-zinc-600">•</span>
                    <span className="flex items-center gap-1">
                      <Monitor className="h-3 w-3" /> {aparelho(c.user_agent)}
                      {c.viewport ? ` (${c.viewport})` : ''}
                    </span>
                  </p>
                </div>

                {c.status !== 'resolvido' && (
                  <button
                    onClick={() => marcarResolvido(c.id)}
                    className="shrink-0 px-3 py-1.5 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 text-white text-[10px] font-black uppercase flex items-center gap-1 transition-all active:scale-95"
                  >
                    <CheckCircle2 className="h-3 w-3" /> Resolver
                  </button>
                )}
              </div>

              {(c.anexos?.length || 0) > 0 && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                  {c.anexos!.map(a => (
                    <button
                      key={a.caminho}
                      onClick={() => abrirAnexo(a)}
                      className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-[11px] font-bold text-zinc-200 flex items-center gap-2 transition-colors"
                    >
                      {a.tipo === 'video' ? <Video className="h-3.5 w-3.5 text-purple-400" />
                        : a.tipo === 'audio' ? <Mic className="h-3.5 w-3.5 text-amber-400" />
                        : <ImageIcon className="h-3.5 w-3.5 text-emerald-400" />}
                      <span className="truncate max-w-[160px]">{a.nome}</span>
                      <Download className="h-3 w-3 text-zinc-500" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
