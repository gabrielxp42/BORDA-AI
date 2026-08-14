import React, { useEffect, useState } from 'react';

interface LuxurySlideTransitionProps {
  direction?: 'open' | 'close';
  onCommitNav?: () => void;
  onComplete?: () => void;
}

export const LuxurySlideTransition: React.FC<LuxurySlideTransitionProps> = ({
  direction = 'open',
  onCommitNav,
  onComplete
}) => {
  const [stage, setStage] = useState<'enter' | 'cover' | 'exit'>('enter');

  useEffect(() => {
    // Frame 1: Inicia o deslizamento para cobrir a tela (220ms)
    const tEnter = setTimeout(() => {
      setStage('cover');
      // No momento exato em que a tela está 100% coberta pelo painel Onyx, troca o DOM por trás sem NENHUMA piscada!
      if (onCommitNav) onCommitNav();

      // Frame 2: Desliza o painel para fora revelando a nova página (220ms)
      const tExit = setTimeout(() => {
        setStage('exit');
        const tDone = setTimeout(() => {
          if (onComplete) onComplete();
        }, 220);
        return () => clearTimeout(tDone);
      }, 50);

      return () => clearTimeout(tExit);
    }, 220);

    return () => clearTimeout(tEnter);
  }, [onCommitNav, onComplete]);

  // Cálculo da posição de deslizamento lateral baseada na direção (open/close)
  const getTransform = () => {
    if (stage === 'enter') {
      return direction === 'open' ? 'translate3d(100%, 0, 0)' : 'translate3d(-100%, 0, 0)';
    }
    if (stage === 'cover') {
      return 'translate3d(0, 0, 0)';
    }
    return direction === 'open' ? 'translate3d(-100%, 0, 0)' : 'translate3d(100%, 0, 0)';
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999999,
        pointerEvents: 'none',
        overflow: 'hidden'
      }}
    >
      {/* Painel Onyx de Vidro Dark Corporativo com Borda Prateada Neon */}
      <div
        className="w-full h-full bg-[#08080d] border-l border-r border-white/20 shadow-2xl flex items-center justify-center relative"
        style={{
          transform: getTransform(),
          transition: 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
          willChange: 'transform'
        }}
      >
        {/* Filete Elegante Prateado na Borda de Deslizamento */}
        <div 
          className={`absolute inset-y-0 ${direction === 'open' ? 'left-0' : 'right-0'} w-1 bg-gradient-to-b from-purple-500/60 via-white/50 to-emerald-500/60 shadow-[0_0_20px_rgba(255,255,255,0.4)]`} 
        />

        {/* Marca d'água discreta de alta sofisticação */}
        <div className="flex items-center gap-2 opacity-15 text-white text-xs font-black uppercase tracking-widest">
          <span className="h-2 w-2 rounded-full bg-purple-400 animate-ping" />
          <span>MODO COBRANÇA</span>
        </div>
      </div>
    </div>
  );
};
