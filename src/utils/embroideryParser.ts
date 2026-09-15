import {readDst} from './embroidery/dst';
import {readEmb} from './embroidery/emb';
import {MAX_FILE_BYTES, OLE_SIGNATURE, requireData} from './embroidery/ole';

export interface EmbroideryMetadata {
  name: string;
  stitches: number;
  colors: number;
  widthMm: number;
  heightMm: number;
  format: 'dst' | 'emb';
  validated: true;
  colorMeaning: 'color-blocks' | 'unique-colors';
  sources: Record<'stitches' | 'colors' | 'widthMm' | 'heightMm', string>;
  preview_url?: string;
}

export function isValidatedEmbroidery(meta: EmbroideryMetadata | null | undefined): meta is EmbroideryMetadata {
  return !!meta && meta.validated === true && Number.isInteger(meta.stitches) && meta.stitches > 0
    && Number.isInteger(meta.colors) && meta.colors > 0 && meta.colors <= meta.stitches
    && Number.isFinite(meta.widthMm) && meta.widthMm > 0 && Number.isFinite(meta.heightMm) && meta.heightMm > 0;
}

export function embroideryProvenance(meta: EmbroideryMetadata) {
  const values = {...meta};
  delete values.preview_url;
  return JSON.stringify({embroideryAnalysis: {version: 1, ...values}});
}

export function inspectEmbroidery(data: Uint8Array, filename: string) {
  requireData(data.length > 0 && data.length <= MAX_FILE_BYTES, 'A matriz deve ter conteúdo e no máximo 32 MB.');
  const extension = filename.split('.').pop()?.toLowerCase();
  requireData(extension === 'dst' || extension === 'emb', 'Formato ainda não suportado. A leitura validada está disponível para DST e EMB.');
  const isOle = OLE_SIGNATURE.every((b, i) => data[i] === b);
  requireData(extension === 'emb' ? isOle : !isOle, 'A extensão não corresponde ao conteúdo da matriz.');
  const result = extension === 'emb' ? readEmb(data) : readDst(data);
  const metadata: EmbroideryMetadata = {
    name: filename.replace(/\.[^/.]+$/, ''), format: extension, validated: true,
    colorMeaning: extension === 'dst' ? 'color-blocks' : 'unique-colors',
    stitches: result.stitches, colors: result.colors, widthMm: result.widthMm, heightMm: result.heightMm,
    sources: result.sources,
  };
  requireData(isValidatedEmbroidery(metadata), 'A matriz contém medidas, pontos ou cores inválidos.');
  return {metadata, diagnostics: result.diagnostics, previewBytes: 'previewBytes' in result ? result.previewBytes : undefined};
}

export async function parseEmbroideryFile(file: File): Promise<EmbroideryMetadata> {
  requireData(file.size <= MAX_FILE_BYTES, 'A matriz excede o limite de 32 MB.');
  const {metadata, previewBytes} = inspectEmbroidery(new Uint8Array(await file.arrayBuffer()), file.name);
  if (previewBytes) metadata.preview_url = URL.createObjectURL(new Blob([new Uint8Array(previewBytes)], {type: 'image/jpeg'}));
  return metadata;
}
