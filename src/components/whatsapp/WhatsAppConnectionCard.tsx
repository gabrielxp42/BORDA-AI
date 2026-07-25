import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MessageSquare, 
  QrCode, 
  RefreshCw, 
  CheckCircle2, 
  Loader2, 
  AlertCircle, 
  Smartphone, 
  ShieldCheck, 
  Zap, 
  RefreshCcw, 
  Power,
  Sparkles,
  Send
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { 
  createEvolutionInstance, 
  checkEvolutionStatus, 
  deleteEvolutionInstance,
  sendEvolutionText
} from '@/services/whatsappService';
import { WhatsAppStatus } from '@/types/borda';

export const WhatsAppConnectionCard: React.FC = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<WhatsAppStatus>('disconnected');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Estados para teste de envio de mensagem
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Olá! Esta é uma mensagem de teste enviada via Evolution API do Borda AI 🧵✨');
  const [sendingTest, setSendingTest] = useState(false);

  const handleSendTestMessage = async () => {
    if (!testPhone.trim()) {
      toast.error('Informe o número de telefone com DDD.');
      return;
    }
    setSendingTest(true);
    try {
      await sendEvolutionText(testPhone, testMessage);
      toast.success('Mensagem de teste enviada com sucesso no WhatsApp!');
    } catch (err: any) {
      toast.error('Erro ao enviar mensagem: ' + (err.message || 'Falha na Evolution API'));
    } finally {
      setSendingTest(false);
    }
  };

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Inicializa o status baseado no perfil apenas na carga inicial ou quando mudar de id/status
  useEffect(() => {
    const waStatus = profile?.whatsapp_status;
    if (waStatus === 'connected') {
      setStatus('connected');
      setQrCode(null);
    } else if (waStatus === 'connecting') {
      setStatus('connecting');
      if (profile?.whatsapp_qr_cache) {
        setQrCode(profile.whatsapp_qr_cache);
      }
    } else {
      setStatus('disconnected');
      setQrCode(null);
    }
  }, [profile?.whatsapp_status, profile?.whatsapp_qr_cache]);

  // Polling automático de status quando em estado 'connecting'
  useEffect(() => {
    if (status !== 'connecting') {
      stopPolling();
      return;
    }

    if (!pollingRef.current) {
      pollingRef.current = setInterval(async () => {
        try {
          const res = await checkEvolutionStatus();
          setLastChecked(new Date());

          if (res.connected || res.state === 'open') {
            setStatus('connected');
            setQrCode(null);
            stopPolling();
          } else if (typeof res.qrcode === 'string') {
            setQrCode(res.qrcode);
          } else if (res.qrcode?.base64) {
            setQrCode(res.qrcode.base64);
          } else if (res.state === 'not_found' || res.error) {
            setStatus('disconnected');
            setQrCode(null);
            stopPolling();
          }
        } catch (err) {
          console.warn('[WhatsApp Polling] Erro de checagem silenciosa:', err);
        }
      }, 5000);
    }

    return () => {
      stopPolling();
    };
  }, [status, stopPolling]);

  // Função principal de conexão / geração de QR Code
  const handleConnect = useCallback(async (force = false) => {
    if (loading) return;
    setLoading(true);
    setErrorMsg(null);
    setStatus('connecting');

    try {
      if (force) {
        try {
          await deleteEvolutionInstance();
        } catch {}
        await new Promise((r) => setTimeout(r, 1500));
      }

      const cleanCompanyName = (profile?.full_name || 'borda_user')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 12);

      const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const instanceId = force 
        ? `borda_${cleanCompanyName}_${randomSuffix}` 
        : (profile?.whatsapp_instance_id || `borda_${cleanCompanyName}`);

      const res = await createEvolutionInstance(instanceId, force);

      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        await supabase.from('profiles').update({
          whatsapp_instance_id: instanceId,
          whatsapp_status: 'connecting'
        }).eq('id', user.id);
      }

      const qr = typeof res.qrcode === 'string' 
        ? res.qrcode 
        : res.qrcode?.base64 || (res as any)?.base64;

      if (qr) {
        const formattedQr = qr.startsWith('data:image') ? qr : `data:image/png;base64,${qr}`;
        setQrCode(formattedQr);
        setStatus('connecting');
      } else if (res.connected || res.instance?.state === 'open' || res.status === 'connected') {
        setStatus('connected');
        setQrCode(null);
      } else {
        setErrorMsg('Não foi possível gerar o QR Code. Tente usar a opção "Recriar Instância".');
        setStatus('disconnected');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao conectar com a Evolution API');
      setStatus('disconnected');
    } finally {
      setLoading(false);
    }
  }, [loading, profile]);

  // Atualização manual de status
  const handleRefreshStatus = async () => {
    setLoading(true);
    try {
      const res = await checkEvolutionStatus();
      setLastChecked(new Date());
      if (res.connected || res.state === 'open') {
        setStatus('connected');
        setQrCode(null);
      } else if (typeof res.qrcode === 'string') {
        setQrCode(res.qrcode);
        setStatus('connecting');
      } else if (res.qrcode?.base64) {
        setQrCode(res.qrcode.base64);
        setStatus('connecting');
      }
    } catch (err: any) {
      setErrorMsg('Erro ao atualizar status.');
    } finally {
      setLoading(false);
    }
  };

  // Desconexão limpa
  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await deleteEvolutionInstance();
      setStatus('disconnected');
      setQrCode(null);
    } catch (err: any) {
      setErrorMsg('Erro ao desconectar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel p-6 md:p-8 rounded-3xl border border-white/10 space-y-6 relative overflow-hidden">
      {/* Background glow effect */}
      <div className="absolute -top-24 -right-24 w-72 h-72 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${
            status === 'connected' 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-lg shadow-emerald-500/10'
              : status === 'connecting'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              : 'bg-purple-500/10 border-purple-500/30 text-purple-400'
          }`}>
            <MessageSquare className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Evolution API v2
              </span>
              <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full ${
                status === 'connected'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : status === 'connecting'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                  : 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30'
              }`}>
                {status === 'connected' ? '🟢 Conectado' : status === 'connecting' ? '🟡 Aguardando Scan' : '🔴 Desconectado'}
              </span>
            </div>
            <h3 className="text-xl font-black tracking-tight text-white mt-1">
              Conexão com WhatsApp
            </h3>
            <p className="text-xs text-zinc-400">
              Envie orçamentos e relatórios de bordado diretamente para os clientes sem wa.me.
            </p>
          </div>
        </div>

        <button
          onClick={handleRefreshStatus}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-zinc-300 hover:bg-white/10 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar Status
        </button>
      </div>

      {/* Message / Error Notification */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-bold flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* State Content Area */}
      {status === 'connected' ? (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30 shrink-0">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h4 className="text-lg font-black text-white">SISTEMA CONECTADO E PRONTO</h4>
                <p className="text-xs font-medium text-emerald-200">
                  O WhatsApp do seu ateliê está pareado. Todos os orçamentos e detalhes de matrizes serão enviados direto via Evolution API!
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                onClick={handleDisconnect}
                disabled={loading}
                className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 hover:bg-rose-500/20 font-bold text-xs transition-all"
              >
                <Power className="h-4 w-4" /> Desconectar
              </button>
            </div>
          </div>

          {/* Feature Highlights Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass-card p-4 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-purple-400">
                <Zap className="h-4 w-4" />
                <span className="text-xs font-black uppercase tracking-wider">Envio Automático</span>
              </div>
              <p className="text-xs text-zinc-400">Orçamentos e notificações de bordado enviadas direto ao cliente.</p>
            </div>

            <div className="glass-card p-4 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-indigo-400">
                <Smartphone className="h-4 w-4" />
                <span className="text-xs font-black uppercase tracking-wider">Multi-Dispositivo</span>
              </div>
              <p className="text-xs text-zinc-400">Mantém seu celular livre enquanto o servidor envia os comprovantes.</p>
            </div>

            <div className="glass-card p-4 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-emerald-400">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-xs font-black uppercase tracking-wider">Criptografia Segura</span>
              </div>
              <p className="text-xs text-zinc-400">Instância isolada de Baileys mantida na Evolution API v2.</p>
            </div>
          </div>

          {/* Test Message Sending Form */}
          <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3">
            <h5 className="text-xs font-black uppercase tracking-widest text-emerald-400 flex items-center gap-2">
              <Send className="h-4 w-4" /> Testar Envio de Mensagem WhatsApp
            </h5>
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <input
                type="text"
                placeholder="DDD + Número (ex: 11999999999)"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                className="w-full sm:w-64 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              />
              <input
                type="text"
                placeholder="Mensagem de teste..."
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                className="w-full flex-1 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={handleSendTestMessage}
                disabled={sendingTest || !testPhone}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {sendingTest ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                <span>Enviar Teste</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center space-y-6 py-6">
          {qrCode ? (
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="p-4 bg-white rounded-3xl shadow-2xl shadow-purple-500/20 border-4 border-purple-500/30 animate-in fade-in zoom-in duration-300">
                <img src={qrCode} alt="WhatsApp QR Code" className="w-56 h-56 md:w-64 md:h-64 object-contain" />
              </div>

              <div className="max-w-md space-y-2">
                <h4 className="text-base font-black text-white flex items-center justify-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-400" /> QR CODE PRONTO PARA CONECTAR
                </h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Abra o WhatsApp no seu celular {'>'} Vá em <strong className="text-purple-300">Aparelhos Conectados</strong> {'>'} Toque em <strong className="text-purple-300">Conectar um Aparelho</strong> e aponte a câmera.
                </p>
                <div className="flex items-center justify-center gap-2 pt-2 text-[11px] font-bold text-amber-400 animate-pulse">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verificando conexão automaticamente a cada 5s...
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-4 max-w-md">
              <div className="w-20 h-20 rounded-3xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto text-purple-400">
                <QrCode className="h-10 w-10" />
              </div>
              <div>
                <h4 className="text-lg font-black text-white">Parear WhatsApp do Ateliê</h4>
                <p className="text-xs text-zinc-400 mt-1">
                  Ao conectar seu WhatsApp, você poderá enviar orçamentos calculados com milheiro de pontos e comprovantes diretamente ao cliente.
                </p>
              </div>

              <button
                onClick={() => handleConnect(false)}
                disabled={loading || status === 'connecting'}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black text-sm shadow-xl shadow-purple-500/25 hover:brightness-110 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {status === 'connecting' ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" /> Conectando à Evolution API...
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5" /> CONECTAR WHATSAPP AGORA
                  </>
                )}
              </button>
            </div>
          )}

          {/* Reset button for troubleshooting */}
          <div className="w-full max-w-md pt-6 border-t border-white/10 text-center">
            <button
              onClick={() => handleConnect(true)}
              disabled={loading}
              className="inline-flex items-center gap-2 text-xs font-bold text-rose-400 hover:text-rose-300 transition-colors"
            >
              <RefreshCcw className="h-3.5 w-3.5" /> Bugou ou travou? Clique para Recriar a Instância do Zero
            </button>
          </div>
        </div>
      )}

      {lastChecked && (
        <div className="text-[10px] text-zinc-500 text-right">
          Última verificação: {lastChecked.toLocaleTimeString('pt-BR')}
        </div>
      )}
    </div>
  );
};
