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

  it('rejects a PNG whose IDAT is not reached inside the window (large iCCP before a late acTL)', () => {
    const bigIccp = pngChunk('iCCP', Array.from({ length: 70 * 1024 }, () => 0));
    const actl = pngChunk('acTL', [0, 0, 0, 2, 0, 0, 0, 0]);
    const full = Uint8Array.from([...PNG_SIG, ...IHDR, ...bigIccp, ...actl, ...pngChunk('IDAT', [1, 2, 3]), ...pngChunk('IEND', [])]);
    // what the route actually sees: only the first 64 KiB
    expect(sniffImage(full.slice(0, 64 * 1024))).toBeNull();
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

  it('refuses a PNG cut inside its first IDAT when the bytes are the whole object (BK-2443)', () => {
    const full = Uint8Array.from([...PNG_SIG, ...IHDR, ...pngChunk('IDAT', Array.from({ length: 200 }, () => 7)), ...pngChunk('IEND', [])]);
    const cut = full.slice(0, 100);
    expect(sniffImage(cut, cut.length)).toBeNull();
  });

  it('refuses a whole PNG that ends without IEND, or reaches IEND without any IDAT', () => {
    const noIend = Uint8Array.from([...PNG_SIG, ...IHDR, ...pngChunk('IDAT', [1, 2, 3])]);
    expect(sniffImage(noIend, noIend.length)).toBeNull();
    const halfIend = png().slice(0, png().length - 2);
    expect(sniffImage(halfIend, halfIend.length)).toBeNull();
    const noIdat = Uint8Array.from([...PNG_SIG, ...IHDR, ...pngChunk('IEND', [])]);
    expect(sniffImage(noIdat, noIdat.length)).toBeNull();
  });

  it('accepts a complete PNG, APNG detection included, when the bytes are the whole object', () => {
    expect(sniffImage(png(), png().length)).toEqual({ type: 'image/png', animated: false });
    const actl = pngChunk('acTL', [0, 0, 0, 2, 0, 0, 0, 0]);
    expect(sniffImage(png(actl), png(actl).length)).toEqual({ type: 'image/png', animated: true });
  });

  it('keeps trusting the first IDAT when the object is larger than the window it sees', () => {
    const full = Uint8Array.from([...PNG_SIG, ...IHDR, ...pngChunk('IDAT', Array.from({ length: 70 * 1024 }, () => 7)), ...pngChunk('IEND', [])]);
    expect(sniffImage(full.slice(0, 64 * 1024), full.length)).toEqual({ type: 'image/png', animated: false });
  });

  it('refuses a WebP whose RIFF header declares more bytes than the object holds', () => {
    const full = webp(webpChunk('VP8 ', Array.from({ length: 200 }, () => 7)));
    const cut = full.slice(0, 100);
    expect(sniffImage(cut, cut.length)).toBeNull();
    expect(sniffImage(full, full.length)?.type).toBe('image/webp');
    const big = webp(webpChunk('VP8 ', Array.from({ length: 70 * 1024 }, () => 7)));
    expect(sniffImage(big.slice(0, 64 * 1024), big.length)?.type).toBe('image/webp');
    expect(sniffImage(big.slice(0, 64 * 1024), big.length - 1)).toBeNull();
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
