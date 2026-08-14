import React, { useEffect, useRef } from 'react';

interface FastDustTransitionProps {
  onCommitNav?: () => void;
  onComplete?: () => void;
  direction?: 'open' | 'close';
}

export const FastDustTransition: React.FC<FastDustTransitionProps> = ({
  onCommitNav,
  onComplete,
  direction = 'open'
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      if (onCommitNav) onCommitNav();
      if (onComplete) onComplete();
      return;
    }

    const W = window.innerWidth;
    const H = window.innerHeight;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);

    let rafId = 0;
    let startTime = 0;
    let navCommitted = false;
    const DUR = 380; // 380ms ultra-fluido, extremamente elegante e ágil

    // Micro-partículas minimalistas de poeira prateada/diamante (estética luxo/monocromática)
    const particleCount = Math.min(800, Math.floor((W * H) / 1800));
    const particles = new Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      particles[i] = {
        x,
        y,
        baseX: x,
        baseY: y,
        size: Math.random() * 2 + 0.8,
        vx: (Math.random() - 0.3) * 3 * (direction === 'open' ? 1 : -1),
        vy: -Math.random() * 2.5 - 0.5,
        alpha: Math.random() * 0.7 + 0.2,
        delay: (x / W) * 0.25
      };
    }

    const render = (now: number) => {
      if (!startTime) startTime = now;
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / DUR);

      // PONTO CRÍTICO ANTI-PISCADA:
      // Aos 35% de progresso, a cortina Onyx está 100% OPACA sobre a tela.
      // É aqui que disparamos o onCommitNav() sem gerar nenhum flash/piscar na UI!
      if (progress >= 0.35 && !navCommitted) {
        navCommitted = true;
        if (onCommitNav) onCommitNav();
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);

      // 1. Cortina Minimalista Dark Onyx
      let opacity = 1;
      if (progress < 0.35) {
        opacity = progress / 0.35; // Suave fade-in até 100% opaco
      } else {
        opacity = 1 - (progress - 0.35) / 0.65; // Dissolução elegante
      }

      if (opacity > 0.005) {
        ctx.fillStyle = `rgba(9, 9, 13, ${Math.min(0.98, opacity * 1.05)})`;
        ctx.fillRect(0, 0, W, H);

        // Linha de luz prateada minimalista varrendo a tela
        const sweepX = (direction === 'open' ? progress : 1 - progress) * W;
        const sweepGrad = ctx.createLinearGradient(sweepX - 80, 0, sweepX + 80, 0);
        sweepGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        sweepGrad.addColorStop(0.5, `rgba(255, 255, 255, ${0.12 * opacity})`);
        sweepGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = sweepGrad;
        ctx.fillRect(0, 0, W, H);
      }

      // 2. Micro-Poeira Cristalina/Prateada (Subtil, Corporativa e Sofisticada)
      for (let i = 0; i < particleCount; i++) {
        const p = particles[i];
        const pProg = Math.max(0, Math.min(1, (progress - p.delay) / (1 - p.delay)));

        if (pProg > 0) {
          const moveFactor = Math.pow(pProg, 1.2);
          const px = p.baseX + p.vx * moveFactor * 90;
          const py = p.baseY + p.vy * moveFactor * 70;
          const pAlpha = p.alpha * (1 - pProg) * opacity;

          if (pAlpha > 0.01) {
            ctx.fillStyle = `rgba(240, 240, 250, ${pAlpha})`;
            ctx.beginPath();
            ctx.arc(px, py, p.size * (1 - pProg * 0.4), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      ctx.restore();

      if (progress < 1) {
        rafId = requestAnimationFrame(render);
      } else {
        if (!navCommitted && onCommitNav) onCommitNav();
        if (onComplete) onComplete();
      }
    };

    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [direction, onCommitNav, onComplete]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999999,
        pointerEvents: 'none',
        width: '100%',
        height: '100%'
      }}
    />
  );
};
