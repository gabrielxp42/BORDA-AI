import React, { useEffect, useRef } from 'react';

/* ============================================================
   BORDA AI — Page transition: WEBGL2 dust disintegration
   (Copiado e adaptado 1:1 do OverOne transition.jsx)
   ------------------------------------------------------------
   Efeito "Thanos Snap": A tela antiga é fotografada (ou construída
   proceduralmente de forma ultra-rápida), o WebGL2 cobre a tela,
   o callback onCommitNav() troca o estado do DOM por baixo, e a
   camada WebGL2 se desintegra em pó levado pelo vento, revelando
   a nova tela pronta por baixo!
   ============================================================ */

const NOISE_GLSL = `
float hash21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p),f=fract(p);
  float a=hash21(i),b=hash21(i+vec2(1.,0.)),c=hash21(i+vec2(0.,1.)),d=hash21(i+vec2(1.,1.));
  vec2 u=f*f*(3.-2.*f); return mix(mix(a,b,u.x),mix(c,d,u.x),u.y); }
float fbm(vec2 p){ float s=0.,a=.5; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.+7.1; a*=.5; } return s; }
float sweepAt(vec2 uv, float dir){ float x = dir>0.0 ? uv.x : 1.0-uv.x; return x*0.72 + 0.28*fbm(uv*5.0); }
`;

const SHEET_VS = `#version 300 es
precision highp float;
in vec2 a_pos; out vec2 v_uv;
void main(){ v_uv = a_pos*0.5+0.5; v_uv.y = 1.0 - v_uv.y; gl_Position = vec4(a_pos,0.,1.); }`;

const SHEET_FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_tex; uniform float u_P, u_dir;
${NOISE_GLSL}
void main(){
  vec2 uv = v_uv;
  float sweep = sweepAt(uv, u_dir);
  float er = smoothstep(sweep, sweep+0.06, u_P);
  vec4 c = texture(u_tex, uv);
  float edge = smoothstep(sweep-0.04, sweep, u_P) * (1.0-er);
  vec3 rgb = c.rgb * (1.0 - 0.4*edge);
  float a = c.a * (1.0 - er);
  if(a < 0.004) discard;
  o = vec4(rgb, a);
}`;

const DUST_VS = `#version 300 es
precision highp float;
in vec2 a_uv; in vec2 a_rnd;
uniform sampler2D u_tex; uniform float u_P, u_time, u_dir, u_base;
out vec4 v_col; out float v_a;
${NOISE_GLSL}
void main(){
  vec2 uv = a_uv;
  float sweep = sweepAt(uv, u_dir);
  float t = u_P - sweep;
  float tt = max(0.0, t);
  float vis = smoothstep(-0.02, 0.03, t) * (1.0 - smoothstep(0.0, 0.42, t));
  vec2 curl = vec2(fbm(uv*7.0 + u_time*0.25 + a_rnd*2.3) - 0.5,
                   fbm(uv*7.0 + 13.7 - u_time*0.2 + a_rnd*1.7) - 0.5);
  vec2 wind = vec2(0.22*u_dir, -0.10);
  vec2 disp = wind*tt + curl*tt*0.9 + vec2(0.0, 0.05*tt*tt);
  disp += (a_rnd-0.5)*0.02;
  vec2 pos = uv + disp;
  gl_Position = vec4(pos.x*2.0-1.0, 1.0-pos.y*2.0, 0.0, 1.0);
  gl_PointSize = max(1.0, u_base * (1.0 - 0.7*smoothstep(0.0,0.42,tt)));
  v_col = texture(u_tex, uv);
  v_a = vis;
}`;

const DUST_FS = `#version 300 es
precision highp float;
in vec4 v_col; in float v_a; out vec4 o;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  float s = smoothstep(0.5, 0.12, r);
  float a = v_a * s * v_col.a;
  if(a < 0.012) discard;
  o = vec4(v_col.rgb * 1.06, a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('shader', gl.getShaderInfoLog(sh));
    return null;
  }
  return sh;
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const p = gl.createProgram();
  if (!p) return null;
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.warn('link', gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function buildSheet() {
  const W = 480, H = 270;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d');
  if (!c) return cv;

  c.fillStyle = '#0a0a12';
  c.fillRect(0, 0, W, H);
  
  c.fillStyle = 'rgba(147, 51, 234, 0.15)';
  c.fillRect(0, 0, W, 40);
  
  c.fillStyle = '#9333ea';
  roundRect(c, 12, 10, 20, 20, 6);
  c.fill();
  
  c.fillStyle = '#ffffff';
  c.fillRect(40, 14, 120, 12);

  c.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 5; i++) {
    roundRect(c, 12, 55 + i * 26, W - 24, 20, 6);
    c.fill();
  }
  
  for (let i = 0; i < 1500; i++) {
    c.fillStyle = `rgba(168, 85, 247, ${Math.random() * 0.12})`;
    c.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
  }
  return cv;
}

async function snapshot() {
  try { if (document.querySelectorAll("#root img").length > 10) return null; } catch (e) {}
  
  const w = window as any;
  if (!w.html2canvas) {
    try {
      w.html2canvas = (await import('html2canvas')).default;
    } catch (e) {
      return null;
    }
  }
  
  if (!w.html2canvas) return null;
  
  try {
    const rootEl = document.getElementById('root') || document.body;
    const cap = w.html2canvas(rootEl, {
      scale: 0.35,
      backgroundColor: null,
      logging: false,
      useCORS: true,
      allowTaint: false,
      imageTimeout: 350,
      width: window.innerWidth,
      height: window.innerHeight,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      ignoreElements: (el: any) => el.classList && (el.classList.contains("dust-canvas") || el.tagName === 'IFRAME'),
    });
    
    const to = new Promise((resolve) => setTimeout(() => resolve(null), 400));
    return await Promise.race([cap, to]);
  } catch (e) {
    return null;
  }
}

interface WebGLDustTransitionProps {
  onCommitNav?: () => void; // Chamado no momento exato em que a tela cobriu para trocar o DOM por baixo
  onComplete?: () => void;  // Chamado quando o efeito de pó termina totalmente
  variant?: 'shatter' | 'morph';
}

export const WebGLDustTransition: React.FC<WebGLDustTransitionProps> = ({
  onCommitNav,
  onComplete,
  variant = 'shatter'
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let raf = 0;
    let killed = false;
    let lost = false;
    let gl: WebGL2RenderingContext | null = null;
    let ended = false;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const Wc = window.innerWidth;
    const Hc = window.innerHeight;
    canvas.width = Math.floor(Wc * dpr);
    canvas.height = Math.floor(Hc * dpr);

    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
    };
    canvas.addEventListener('webglcontextlost', onLost);

    const finish = () => {
      if (ended) return;
      ended = true;
      if (canvas) {
        canvas.style.transition = 'opacity .22s ease';
        canvas.style.opacity = '0';
      }
      setTimeout(() => {
        if (!killed && onComplete) onComplete();
      }, 240);
    };

    (async () => {
      const snap = await snapshot();
      if (killed) return;
      const tex = snap || buildSheet();

      gl = canvas.getContext('webgl2', { premultipliedAlpha: false, alpha: true, antialias: false });
      if (!gl) {
        if (onCommitNav) onCommitNav();
        finish();
        return;
      }

      const sheetP = program(gl, SHEET_VS, SHEET_FS);
      const dustP = program(gl, DUST_VS, DUST_FS);
      if (!sheetP || !dustP) {
        if (onCommitNav) onCommitNav();
        finish();
        return;
      }

      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tex);
      } catch (e) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, buildSheet());
      }

      const quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

      const cols = Math.min(300, Math.ceil(Wc / 6));
      const rows = Math.min(180, Math.ceil(Hc / 6));
      const n = cols * rows;
      const uvs = new Float32Array(n * 2);
      const rnd = new Float32Array(n * 2);
      let k = 0;
      
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          uvs[k * 2] = (x + 0.5) / cols;
          uvs[k * 2 + 1] = (y + 0.5) / rows;
          rnd[k * 2] = Math.random();
          rnd[k * 2 + 1] = Math.random();
          k++;
        }
      }

      const uvB = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, uvB);
      gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);

      const rB = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, rB);
      gl.bufferData(gl.ARRAY_BUFFER, rnd, gl.STATIC_DRAW);

      const baseSize = (Wc * dpr / cols) * 1.05;
      const dir = -1;
      const DUR = variant === 'morph' ? 1100 : 950;

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      const aPos = gl.getAttribLocation(sheetP, 'a_pos');
      const aUv = gl.getAttribLocation(dustP, 'a_uv');
      const aRnd = gl.getAttribLocation(dustP, 'a_rnd');

      const uSheet = {
        tex: gl.getUniformLocation(sheetP, 'u_tex'),
        P: gl.getUniformLocation(sheetP, 'u_P'),
        dir: gl.getUniformLocation(sheetP, 'u_dir')
      };

      const uDust = {
        tex: gl.getUniformLocation(dustP, 'u_tex'),
        P: gl.getUniformLocation(dustP, 'u_P'),
        time: gl.getUniformLocation(dustP, 'u_time'),
        dir: gl.getUniformLocation(dustP, 'u_dir'),
        base: gl.getUniformLocation(dustP, 'u_base')
      };

      const start = performance.now();

      // ============================================================
      // PONTO CHAVE DO OVERONE: Troca a rota/DOM por baixo imediatamente
      // assim que o canvas desenha o primeiro frame cobrindo a tela!
      // ============================================================
      if (onCommitNav) {
        onCommitNav();
      }

      const draw = (P: number, timeSec: number) => {
        if (!gl) return;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(sheetP);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.uniform1i(uSheet.tex, 0);
        gl.uniform1f(uSheet.P, P);
        gl.uniform1f(uSheet.dir, dir);

        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.useProgram(dustP);
        gl.uniform1i(uDust.tex, 0);
        gl.uniform1f(uDust.P, P);
        gl.uniform1f(uDust.time, timeSec);
        gl.uniform1f(uDust.dir, dir);
        gl.uniform1f(uDust.base, baseSize);

        gl.bindBuffer(gl.ARRAY_BUFFER, uvB);
        gl.enableVertexAttribArray(aUv);
        gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, rB);
        gl.enableVertexAttribArray(aRnd);
        gl.vertexAttribPointer(aRnd, 2, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.POINTS, 0, n);
      };

      const frame = (now: number) => {
        if (killed || lost) return;
        const e = Math.min(1, (now - start) / DUR);
        draw(Math.pow(e, 1.1) * 1.7, (now - start) / 1000);

        if (e < 1) {
          raf = requestAnimationFrame(frame);
        } else {
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          finish();
        }
      };

      frame(start);
      raf = requestAnimationFrame(frame);
    })();

    return () => {
      killed = true;
      cancelAnimationFrame(raf);
      if (canvas) canvas.removeEventListener('webglcontextlost', onLost);
    };
  }, [variant, onComplete]);

  return (
    <canvas
      ref={canvasRef}
      className={"dust-canvas dust--" + variant}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999999,
        pointerEvents: 'none',
        width: '100%',
        height: '100%',
        opacity: 1
      }}
      aria-hidden="true"
    />
  );
};
