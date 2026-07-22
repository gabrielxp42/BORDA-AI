import * as CFB from 'cfb';
import { unzlibSync } from 'fflate';

export interface EmbroideryMetadata {
  name: string;
  stitches?: number;
  colors?: number;
  widthMm?: number;
  heightMm?: number;
  format: 'dst' | 'emb' | 'unknown';
  preview_url?: string;
}

/**
 * Lê um arquivo DST (Tajima) byte a byte e calcula seus metadados.
 * Algoritmo padrão da indústria de bordados.
 */
function parseDST(buffer: ArrayBuffer, name: string): EmbroideryMetadata {
  let stitches = 0;
  let colors = 1; // Sempre começa com 1 cor
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  let x = 0;
  let y = 0;
  
  const view = new DataView(buffer);
  
  // O cabeçalho do DST tem sempre 512 bytes. Pulamos ele e vamos para os dados.
  for (let i = 512; i < buffer.byteLength; i += 3) {
    if (i + 2 >= buffer.byteLength) break;
    
    const b0 = view.getUint8(i);
    const b1 = view.getUint8(i + 1);
    const b2 = view.getUint8(i + 2);
    
    // Decodificação de agulhadas Tajima
    let dx = 0;
    let dy = 0;
    
    if (b0 & 0x01) dx += 1;
    if (b0 & 0x02) dx -= 1;
    if (b0 & 0x04) dx += 9;
    if (b0 & 0x08) dx -= 9;
    if (b0 & 0x80) dy += 1;
    if (b0 & 0x40) dy -= 1;
    if (b0 & 0x20) dy += 9;
    if (b0 & 0x10) dy -= 9;
    
    if (b1 & 0x01) dx += 3;
    if (b1 & 0x02) dx -= 3;
    if (b1 & 0x04) dx += 27;
    if (b1 & 0x08) dx -= 27;
    if (b1 & 0x80) dy += 3;
    if (b1 & 0x40) dy -= 3;
    if (b1 & 0x20) dy += 27;
    if (b1 & 0x10) dy -= 27;
    
    if (b2 & 0x04) dx += 81;
    if (b2 & 0x08) dx -= 81;
    if (b2 & 0x20) dy += 81;
    if (b2 & 0x10) dy -= 81;
    
    // Tipos de Comando
    const isJump = (b2 & 0x80) !== 0; // Pulo (não faz ponto)
    const isStop = (b2 & 0x40) !== 0; // Troca de linha
    
    // Comando FINAL
    if (b0 === 0x00 && b1 === 0x00 && b2 === 0xF3) {
      break;
    }
    
    if (isStop) {
      colors++;
    }
    
    if (!isJump && !isStop) {
      stitches++;
    }
    
    x += dx;
    y += dy;
    
    if (x > maxX) maxX = x;
    if (x < minX) minX = x;
    if (y > maxY) maxY = y;
    if (y < minY) minY = y;
  }
  
  // As coordenadas do DST estão em 0.1 milímetros.
  const widthMm = (maxX - minX) / 10;
  const heightMm = (maxY - minY) / 10;
  
  return {
    name,
    format: 'dst',
    stitches,
    colors,
    widthMm: Math.round(widthMm),
    heightMm: Math.round(heightMm)
  };
}

/**
 * Lê propriedades OLE padronizadas do stream WilcomDesignInformationDDD
 */
function readWilcomPropertySet(content: Uint8Array): { stitches?: number, colors?: number, width?: number, height?: number } {
  const result: { stitches?: number, colors?: number, width?: number, height?: number } = {};
  
  try {
    const view = new DataView(content.buffer, content.byteOffset, content.byteLength);
    
    // Assinatura do Property Set Storage (0xFFFE0000 ou 0xFEFF0000)
    if (view.getUint16(0, true) === 0xFFFE || view.getUint16(0, true) === 0xFEFF) {
      // Offset para a primeira seção fica no byte 44 (0x2C)
      const sectionOffset = view.getUint32(0x2C, true);
      
      // Quantidade de propriedades nesta seção
      const propCount = view.getUint32(sectionOffset + 4, true);
      
      // Loop na tabela de propriedades
      for (let i = 0; i < propCount; i++) {
        const propId = view.getUint32(sectionOffset + 8 + (i * 8), true);
        const propOffset = view.getUint32(sectionOffset + 12 + (i * 8), true);
        
        const absoluteOffset = sectionOffset + propOffset;
        const propType = view.getUint32(absoluteOffset, true);

        // Property Type 3 = VT_I4 (Inteiro 32-bits)
        if (propType === 3) {
          const value = view.getInt32(absoluteOffset + 4, true);
          if (propId === 3) result.colors = value; // ID 3 = Colors
          if (propId === 6) result.stitches = value; // ID 6 = Stitches
        } else if (propType === 5) {
          // Property Type 5 = VT_R8 (Float 64-bits)
          const value = view.getFloat64(absoluteOffset + 4, true);
          if (propId === 17) result.width = Number((value / 180).toFixed(1)); // ID 17 = Width
          if (propId === 16) result.height = Number((value / 180).toFixed(1)); // ID 16 = Height
        }
      }
    }
  } catch (err) {
    console.warn('Falha no parse estruturado, tentando busca binária fallback.');
  }

  // Fallback: Busca binária bruta caso a estrutura do arquivo esteja diferente
  if (!result.stitches) {
    for(let i = 0; i < content.length - 12; i++) {
      // Padrão Wilcom para Pontos: ID 6 (0x06000000) -> Type 3 VT_I4 (0x03000000) -> [Pontos]
      if (content[i] === 6 && content[i+1] === 0 && content[i+4] === 3 && content[i+5] === 0) {
        const view = new DataView(content.buffer, content.byteOffset, content.byteLength);
        result.stitches = view.getInt32(i + 8, true);
        break;
      }
    }
  }

  return result;
}

/**
 * Tenta ler metadados de um arquivo EMB (Wilcom) via Container OLE.
 */
function parseEMB(buffer: ArrayBuffer, name: string): EmbroideryMetadata {
  const meta: EmbroideryMetadata = {
    name,
    format: 'emb'
  };

  try {
    const data = new Uint8Array(buffer);
    const cfbFile = CFB.read(data, { type: 'array' });
    
    const dddStream = CFB.find(cfbFile, '\x05WilcomDesignInformationDDD');
    if (dddStream && dddStream.content) {
      const contentArray = new Uint8Array(dddStream.content);
      
      // Mágica 1: Lê as propriedades secretas do Windows (VT_I4 e VT_R8)
      const props = readWilcomPropertySet(contentArray);
      if (props.stitches) meta.stitches = props.stitches;
      if (props.colors) meta.colors = props.colors;
      if (props.width) meta.widthMm = props.width;
      if (props.height) meta.heightMm = props.height;

      // Mágica 2: Caso não ache as cores nas propriedades, tenta ler pelo texto cru
      if (!meta.colors) {
        const textContent = new TextDecoder('latin1').decode(contentArray);
        const colorMatches = textContent.match(/\.Default/g);
        if (colorMatches && colorMatches.length > 0) {
          meta.colors = colorMatches.length;
        }
      }
    }

    // Mágica 3: Extrair a imagem de Preview real (TRUEVIEW_ICON)
    const trueviewStream = CFB.find(cfbFile, 'TRUEVIEW_ICON');
    if (trueviewStream && trueviewStream.content) {
      try {
        // O Wilcom usa compressão zlib (Deflate) e os 4 primeiros bytes são o tamanho descompactado
        const compressed = new Uint8Array(trueviewStream.content.slice(4));
        const unzipped = unzlibSync(compressed);
        
        // Transforma o JPEG extraído em uma URL temporária para o navegador renderizar
        const blob = new Blob([unzipped], { type: 'image/jpeg' });
        meta.preview_url = URL.createObjectURL(blob);
      } catch (err) {
        console.error("Erro ao descomprimir preview", err);
      }
    }

  } catch (err) {
    console.warn("Não foi possível fazer o parse OLE do EMB", err);
  }

  return meta;
}

export async function parseEmbroideryFile(file: File): Promise<EmbroideryMetadata> {
  const buffer = await file.arrayBuffer();
  const ext = file.name.toLowerCase().split('.').pop();
  
  // Limpa o nome (ex: "Logo Marca.dst" -> "Logo Marca")
  const cleanName = file.name.replace(/\.[^/.]+$/, "");

  if (ext === 'dst') {
    return parseDST(buffer, cleanName);
  } else if (ext === 'emb') {
    return parseEMB(buffer, cleanName);
  } else {
    // Retorna basico
    return { name: cleanName, format: 'unknown' };
  }
}
