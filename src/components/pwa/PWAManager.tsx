import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { 
  Download, 
  Share, 
  PlusSquare, 
  Sparkles, 
  X, 
  RefreshCw, 
  CheckCircle2, 
  Smartphone, 
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { toast } from 'sonner';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PWAManager: React.FC = () => {
  const { settings } = useCompanySettings();
  const pc = settings.primaryColor || '#ef4444';

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showAndroidBanner, setShowAndroidBanner] = useState(false);
  const [showIosModal, setShowIosModal] = useState(false);
  const [swUpdateAvailable, setSwUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  // 1. Identificação de Standalone / PWA Instalado
  useEffect(() => {
    const checkStandalone = () => {
      const isStandaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
      const isNavStandalone = (window.navigator as any).standalone === true;
      setIsStandalone(isStandaloneMedia || isNavStandalone);
    };

    checkStandalone();
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    mediaQuery.addEventListener?.('change', checkStandalone);

    return () => mediaQuery.removeEventListener?.('change', checkStandalone);
  }, []);

  // 2. Registro do Service Worker & Detecção de Atualizações em Tempo Real
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;

    const registerSW = async () => {
      try {
        registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.log('[PWA] Service Worker registrado com sucesso!');

        // Se houver uma atualização aguardando, ativa-a imediatamente
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          setWaitingWorker(registration.waiting);
          setSwUpdateAvailable(true);
        }

        // Listener para novas atualizações encontradas
        registration.addEventListener('updatefound', () => {
          const newWorker = registration?.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
                setWaitingWorker(newWorker);
                setSwUpdateAvailable(true);
              }
            });
          }
        });
      } catch (err) {
        console.warn('[PWA] Falha ao registrar Service Worker:', err);
      }
    };

    registerSW();

    // Listener para o evento de controle alterado (recarrega suavemente após skipWaiting)
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }, []);

  // 3. Captura do Evento Android beforeinstallprompt
  useEffect(() => {
    if (isStandalone) return;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);

      const dismissed = localStorage.getItem('pwa_prompt_dismissed_time');
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (!dismissed || Date.now() - Number(dismissed) > sevenDays) {
        setShowAndroidBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, [isStandalone]);

  // 4. Detecção de iOS Safari (iPhone / iPad) sem ser Standalone
  useEffect(() => {
    if (isStandalone) return;

    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);

    if (isIos && isSafari) {
      const dismissed = localStorage.getItem('pwa_ios_modal_dismissed_time');
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (!dismissed || Date.now() - Number(dismissed) > sevenDays) {
        // Exibe modal iOS após 3 segundos de navegação
        const timer = setTimeout(() => {
          setShowIosModal(true);
        }, 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [isStandalone]);

  // Handler de Atualização Instantânea do App (SW)
  const handleApplyUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  };

  // Handler para Instalar no Android
  const handleInstallAndroid = async () => {
    if (!deferredPrompt) return;
    setShowAndroidBanner(false);
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      toast.success('🎉 BORDA AI adicionado à Tela de Início!');
    }
    setDeferredPrompt(null);
  };

  const handleDismissAndroid = () => {
    setShowAndroidBanner(false);
    localStorage.setItem('pwa_prompt_dismissed_time', String(Date.now()));
  };

  const handleDismissIos = () => {
    setShowIosModal(false);
    localStorage.setItem('pwa_ios_modal_dismissed_time', String(Date.now()));
  };

  return (
    <>
      {/* 1. NOTIFICAÇÃO LIQUID GLASS DE NOVA VERSÃO DISPONÍVEL (AUTO-UPDATE) */}
      {swUpdateAvailable && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[999999] w-[92%] max-w-md animate-in slide-in-from-top-4 duration-300">
          <div 
            className="p-4 rounded-3xl bg-slate-900/95 dark:bg-[#12121a]/95 text-white border border-purple-500/40 shadow-2xl backdrop-blur-2xl flex items-center justify-between gap-3"
            style={{ boxShadow: `0 10px 30px -5px ${pc}40` }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div 
                className="h-10 w-10 rounded-2xl flex items-center justify-center border shrink-0 animate-pulse"
                style={{ backgroundColor: `${pc}20`, borderColor: `${pc}40`, color: pc }}
              >
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-black uppercase tracking-wider text-white truncate">
                  Nova Versão do BORDA AI!
                </h4>
                <p className="text-[10px] text-zinc-400 font-semibold truncate">
                  Atualização de sistema e performance pronta
                </p>
              </div>
            </div>

            <button
              onClick={handleApplyUpdate}
              className="py-2 px-3.5 rounded-xl text-white font-black text-xs uppercase tracking-wider shadow-lg flex items-center gap-1.5 shrink-0 hover:brightness-110 active:scale-95 transition-all"
              style={{ backgroundColor: pc }}
            >
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span>Atualizar</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. BANNER DE INSTALAÇÃO ANDROID / CHROME / EDGE */}
      {showAndroidBanner && !isStandalone && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[99999] w-[94%] max-w-md animate-in slide-in-from-bottom-6 duration-300">
          <div 
            className="p-4 rounded-3xl bg-slate-900/95 dark:bg-[#12121a]/95 text-white border border-slate-700 dark:border-white/15 shadow-2xl backdrop-blur-2xl space-y-3 relative"
            style={{ boxShadow: `0 15px 35px -5px ${pc}35` }}
          >
            <button
              onClick={handleDismissAndroid}
              className="absolute top-3 right-3 p-1.5 rounded-full text-zinc-400 hover:text-white bg-white/5"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3">
              {settings.logoUrl ? (
                <img src={settings.logoUrl} alt="Logo" className="h-12 w-12 object-contain rounded-2xl bg-white/5 p-1 border border-white/10 shrink-0" />
              ) : (
                <div className="h-12 w-12 rounded-2xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 shrink-0">
                  <Smartphone className="h-6 w-6" />
                </div>
              )}
              <div>
                <h4 className="text-sm font-black text-white flex items-center gap-1.5">
                  Instalar o App BORDA AI
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                </h4>
                <p className="text-[11px] text-zinc-400 font-medium">
                  Acesso rápido direto da Tela de Início sem precisar do navegador!
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleInstallAndroid}
                className="flex-1 py-3 px-4 rounded-2xl text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl hover:brightness-110 active:scale-98 transition-all"
                style={{ backgroundColor: pc }}
              >
                <Download className="h-4 w-4" />
                <span>Instalar Aplicativo Nativo</span>
              </button>

              <button
                onClick={handleDismissAndroid}
                className="py-3 px-3 rounded-2xl bg-white/10 hover:bg-white/15 text-zinc-300 font-bold text-xs"
              >
                Depois
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. MODAL GUIADO DE INSTALAÇÃO NO IOS SAFARI (IPHONE / IPAD) */}
      {showIosModal && !isStandalone && ReactDOM.createPortal(
        <div 
          onClick={handleDismissIos}
          className="fixed inset-0 z-[999999] bg-black/80 backdrop-blur-md flex flex-col justify-end p-4 animate-in fade-in duration-200"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md mx-auto bg-slate-900 dark:bg-[#12121a] border border-white/15 rounded-[32px] p-6 text-white shadow-2xl space-y-5 animate-in slide-in-from-bottom duration-300 relative"
          >
            {/* Puxador iOS */}
            <div className="w-12 h-1 bg-white/20 rounded-full mx-auto" />

            <button
              onClick={handleDismissIos}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-zinc-300 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Cabeçalho */}
            <div className="flex items-center gap-3">
              {settings.logoUrl ? (
                <img src={settings.logoUrl} alt="Logo" className="h-12 w-12 object-contain rounded-2xl bg-white/5 p-1 border border-white/10 shrink-0" />
              ) : (
                <div className="h-12 w-12 rounded-2xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 shrink-0">
                  <Smartphone className="h-6 w-6" />
                </div>
              )}
              <div>
                <h3 className="text-base font-black text-white">
                  Instalar BORDA AI no iPhone
                </h3>
                <p className="text-xs text-zinc-400 font-medium">
                  Adicione o sistema à sua Tela de Início para experiência 100% nativa
                </p>
              </div>
            </div>

            {/* Passos Guiados iOS */}
            <div className="space-y-3 pt-1">
              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-black text-xs shrink-0">
                  <Share className="h-5 w-5" />
                </div>
                <div className="text-xs">
                  <span className="font-bold text-white block">Passo 1</span>
                  <span className="text-zinc-400">Toque no ícone de <strong>Compartilhar</strong> no menu inferior do Safari</span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-black text-xs shrink-0">
                  <PlusSquare className="h-5 w-5" />
                </div>
                <div className="text-xs">
                  <span className="font-bold text-white block">Passo 2</span>
                  <span className="text-zinc-400">Role a lista para baixo e toque em <strong>"Adicionar à Tela de Início"</strong></span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black text-xs shrink-0">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div className="text-xs">
                  <span className="font-bold text-white block">Passo 3</span>
                  <span className="text-zinc-400">Confirme tocando em <strong>"Adicionar"</strong> no canto superior direito</span>
                </div>
              </div>
            </div>

            {/* Botão Entendi */}
            <button
              onClick={handleDismissIos}
              className="w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider text-white transition-all shadow-xl hover:brightness-110 active:scale-98"
              style={{ backgroundColor: pc }}
            >
              Entendi, obrigado!
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
