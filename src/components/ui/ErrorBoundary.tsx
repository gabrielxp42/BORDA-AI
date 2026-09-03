import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Nome da área protegida, mostrado ao usuário e no log. */
  area?: string;
}

interface State {
  erro: Error | null;
}

/**
 * Rede de proteção contra tela preta.
 *
 * O PROBLEMA QUE ISSO RESOLVE
 * O app não tinha nenhum ErrorBoundary. No React, um erro durante o render
 * desmonta a árvore INTEIRA e deixa a tela vazia — sem mensagem, sem botão,
 * sem pista. Era o que o usuário via como "clico e fica preto, não aparece
 * nada": um erro de render em qualquer card do Hub apagava a tela toda.
 *
 * Agora o erro fica contido nesta área: o resto do sistema continua de pé, o
 * usuário lê o que houve e consegue tentar de novo. O erro real vai para o
 * console com o nome da área, para conseguirmos rastrear.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  componentDidCatch(erro: Error, info: React.ErrorInfo) {
    console.error(
      `[ErrorBoundary] Falha em "${this.props.area || 'área desconhecida'}":`,
      erro,
      info.componentStack
    );
  }

  private tentarDeNovo = () => this.setState({ erro: null });

  render() {
    if (!this.state.erro) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center text-center gap-4 p-8 min-h-[280px] rounded-3xl border border-rose-500/30 bg-rose-500/5">
        <div className="h-14 w-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
          <AlertTriangle className="h-7 w-7 text-rose-500" />
        </div>

        <div className="space-y-1 max-w-md">
          <h3 className="text-base font-black text-slate-900 dark:text-white">
            Não foi possível abrir {this.props.area ? `"${this.props.area}"` : 'esta parte'}
          </h3>
          <p className="text-xs text-slate-600 dark:text-zinc-400">
            O resto do sistema continua funcionando normalmente. Você pode tentar de novo
            ou voltar e seguir por outro caminho.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={this.tentarDeNovo}
            className="px-4 py-2.5 rounded-2xl bg-purple-600 hover:brightness-110 text-white text-xs font-black uppercase tracking-wide flex items-center gap-2 active:scale-95 transition-all"
          >
            <RefreshCw className="h-4 w-4" /> Tentar de novo
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-zinc-200 text-xs font-black uppercase tracking-wide flex items-center gap-2 active:scale-95 transition-all"
          >
            <Home className="h-4 w-4" /> Recarregar
          </button>
        </div>

        {/* Detalhe técnico recolhido: ajuda no suporte sem assustar quem usa. */}
        <details className="w-full max-w-md text-left">
          <summary className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 cursor-pointer">
            Detalhes técnicos
          </summary>
          <pre className="mt-2 p-3 rounded-xl bg-black/70 text-rose-300 text-[10px] overflow-x-auto whitespace-pre-wrap break-words">
            {this.state.erro.message}
          </pre>
        </details>
      </div>
    );
  }
}
