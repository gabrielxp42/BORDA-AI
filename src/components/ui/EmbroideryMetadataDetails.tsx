import type {EmbroideryMetadata} from '../../utils/embroideryParser';

export function EmbroideryMetadataDetails({metadata}: {metadata: EmbroideryMetadata | null}) {
  if (!metadata) return null;
  const mm = (value: number) => value.toLocaleString('pt-BR', {maximumFractionDigits: 4});
  return (
    <details className="text-xs text-zinc-400 p-3 border border-white/10 rounded-xl">
      <summary className="cursor-pointer">Dados da matriz: {metadata.stitches.toLocaleString('pt-BR')} pontos • {mm(metadata.widthMm)} × {mm(metadata.heightMm)} mm</summary>
      <dl className="mt-2 space-y-2">
        <div><dt>Pontos: {metadata.stitches.toLocaleString('pt-BR')}</dt><dd>{metadata.sources.stitches}</dd></div>
        <div><dt>{metadata.colorMeaning === 'color-blocks' ? 'Etapas de cor' : 'Cores'}: {metadata.colors}</dt><dd>{metadata.sources.colors}</dd></div>
        <div><dt>Largura: {mm(metadata.widthMm)} mm</dt><dd>{metadata.sources.widthMm}</dd></div>
        <div><dt>Altura: {mm(metadata.heightMm)} mm</dt><dd>{metadata.sources.heightMm}</dd></div>
      </dl>
      {metadata.colorMeaning === 'color-blocks' && <p className="mt-2">DST informa etapas de cor. Uma mesma linha pode ser usada em mais de uma etapa; as cores únicas não são identificáveis neste formato.</p>}
    </details>
  );
}
