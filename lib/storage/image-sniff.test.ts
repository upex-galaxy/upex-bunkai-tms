import { describe, expect, it } from 'bun:test';
import { sniffImage } from './image-sniff';

// BK-593 - magic-byte sniffing. The type is decided by the CONTENT, never by a name or an
// extension, and animated images (APNG, animated WebP) are recognised so they can be refused.

const PNG_SIG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

function u32be(n: number): number[] {
  return [(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF];
}
function u32le(n: number): number[] {
  return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];
}
function ascii(s: string): number[] {
  return [...s].map(c => c.charCodeAt(0));
}
function pngChunk(type: string, data: number[]): number[] {
  return [...u32be(data.length), ...ascii(type), ...data, 0, 0, 0, 0];
}
const IHDR = pngChunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);

function png(extraBeforeIdat: number[] = []): Uint8Array {
  return Uint8Array.from([...PNG_SIG, ...IHDR, ...extraBeforeIdat, ...pngChunk('IDAT', [1, 2, 3]), ...pngChunk('IEND', [])]);
}
function webpChunk(fourcc: string, data: number[]): number[] {
  const padded = data.length % 2 === 1 ? [...data, 0] : data;
  return [...ascii(fourcc), ...u32le(data.length), ...padded];
}
function webp(chunks: number[]): Uint8Array {
  return Uint8Array.from([...ascii('RIFF'), ...u32le(chunks.length + 4), ...ascii('WEBP'), ...chunks]);
}

describe('sniffImage', () => {
  it('recognises a PNG by its signature and IHDR chunk', () => {
    expect(sniffImage(png())).toEqual({ type: 'image/png', animated: false });
  });

  it('flags an APNG (acTL chunk before the first IDAT) as animated', () => {
    const actl = pngChunk('acTL', [0, 0, 0, 2, 0, 0, 0, 0]);
    expect(sniffImage(png(actl))).toEqual({ type: 'image/png', animated: true });
  });

  it('does not call a PNG animated because the bytes "acTL" appear later in pixel data', () => {
    const bytes = Uint8Array.from([...PNG_SIG, ...IHDR, ...pngChunk('IDAT', ascii('acTLacTL')), ...pngChunk('IEND', [])]);
    expect(sniffImage(bytes)).toEqual({ type: 'image/png', animated: false });
  });

  it('rejects a PNG signature that is not followed by an IHDR chunk', () => {
    expect(sniffImage(Uint8Array.from([...PNG_SIG, ...pngChunk('tEXt', [1, 2, 3])]))).toBeNull();
    expect(sniffImage(Uint8Array.from(PNG_SIG))).toBeNull();
  });

  it('recognises a JPEG by its SOI marker', () => {
    expect(sniffImage(Uint8Array.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 0x4A, 0x46, 0x49, 0x46]))).toEqual({ type: 'image/jpeg', animated: false });
  });

  it('recognises lossy, lossless and extended WebP', () => {
    expect(sniffImage(webp(webpChunk('VP8 ', [1, 2, 3, 4])))?.type).toBe('image/webp');
    expect(sniffImage(webp(webpChunk('VP8L', [0x2F, 1, 2, 3])))?.type).toBe('image/webp');
    const vp8x = webpChunk('VP8X', [0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffImage(webp([...vp8x, ...webpChunk('VP8 ', [1, 2])]))).toEqual({ type: 'image/webp', animated: false });
  });

  it('flags an animated WebP: the VP8X animation flag, or ANIM / ANMF chunks', () => {
    const animatedFlag = webpChunk('VP8X', [0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffImage(webp(animatedFlag))).toEqual({ type: 'image/webp', animated: true });
    const plainFlag = webpChunk('VP8X', [0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffImage(webp([...plainFlag, ...webpChunk('ANIM', [0, 0, 0, 0, 0, 0])]))?.animated).toBe(true);
    expect(sniffImage(webp([...plainFlag, ...webpChunk('ANMF', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])]))?.animated).toBe(true);
  });

  it('rejects RIFF containers that are not WebP and WebP with an unknown first chunk', () => {
    expect(sniffImage(Uint8Array.from([...ascii('RIFF'), ...u32le(8), ...ascii('WAVE'), ...ascii('fmt '), 0, 0, 0, 0]))).toBeNull();
    expect(sniffImage(webp(webpChunk('JUNK', [1, 2])))).toBeNull();
  });

  it('rejects other image formats, text, empty and truncated input', () => {
    expect(sniffImage(Uint8Array.from([...ascii('GIF89a'), 1, 0, 1, 0]))).toBeNull();
    expect(sniffImage(Uint8Array.from(ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>')))).toBeNull();
    expect(sniffImage(Uint8Array.from(ascii('plain text log line')))).toBeNull();
    expect(sniffImage(new Uint8Array(0))).toBeNull();
    expect(sniffImage(Uint8Array.from([0xFF, 0xD8]))).toBeNull();
    expect(sniffImage(Uint8Array.from(ascii('RIFF')))).toBeNull();
  });
});
