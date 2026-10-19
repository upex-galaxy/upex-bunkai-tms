import type { EvidenceMimeType } from './evidence-policy';

// BK-593 - decide an image's type from its first bytes. The file name, the extension and the
// declared Content-Type are never trusted. No decoding and no native dependency: a signature
// check plus a bounded chunk walk to spot animation (APNG, animated WebP), which is refused
// in v1. The caller passes at most the first 64 KiB.

export interface SniffedImage {
  type: EvidenceMimeType
  animated: boolean
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (startsWith(bytes, 0, PNG_SIGNATURE)) {
    return sniffPng(bytes);
  }
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return { type: 'image/jpeg', animated: false };
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return sniffWebp(bytes);
  }
  return null;
}

// PNG: signature, then a well-formed IHDR chunk first. An `acTL` chunk before the first IDAT
// marks an APNG; bytes that merely spell "acTL" inside pixel data do not count because the
// walk stops at the first IDAT. A walk that never reaches IDAT/IEND inside the window is invalid.
function sniffPng(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length < 16 || readU32be(bytes, 8) !== 13 || ascii(bytes, 12, 4) !== 'IHDR') {
    return null;
  }
  let animated = false;
  let reachedImageData = false;
  let pos = 8;
  while (pos + 8 <= bytes.length) {
    const length = readU32be(bytes, pos);
    const type = ascii(bytes, pos + 4, 4);
    if (type === 'acTL') {
      animated = true;
    }
    if (type === 'IDAT' || type === 'IEND') {
      reachedImageData = true;
      break;
    }
    pos += 12 + length;
  }
  // The caller only passes a 64 KiB window. If the walk ran out of window before the first
  // IDAT/IEND (a huge iCCP or text chunk), an acTL further on cannot be ruled out, so the file
  // cannot be called static: treat it as invalid (an acTL already seen still answers animated).
  if (!reachedImageData && !animated) {
    return null;
  }
  return { type: 'image/png', animated };
}

// WebP: RIFF container whose first chunk is VP8 / VP8L / VP8X. Animated when the VP8X flags
// carry the animation bit or an ANIM / ANMF chunk is present.
function sniffWebp(bytes: Uint8Array): SniffedImage | null {
  const first = ascii(bytes, 12, 4);
  if (first !== 'VP8 ' && first !== 'VP8L' && first !== 'VP8X') {
    return null;
  }
  let animated = false;
  if (first === 'VP8X' && bytes.length > 20 && (bytes[20] & 0x02) !== 0) {
    animated = true;
  }
  let pos = 12;
  while (!animated && pos + 8 <= bytes.length) {
    const fourcc = ascii(bytes, pos, 4);
    if (fourcc === 'ANIM' || fourcc === 'ANMF') {
      animated = true;
      break;
    }
    const size = readU32le(bytes, pos + 4);
    pos += 8 + size + (size % 2);
  }
  return { type: 'image/webp', animated };
}

function startsWith(bytes: Uint8Array, offset: number, expected: number[]): boolean {
  if (bytes.length < offset + expected.length) { return false; }
  return expected.every((value, i) => bytes[offset + i] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length && offset + i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[offset + i]);
  }
  return out;
}

function readU32be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function readU32le(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset + 3] << 24) | (bytes[offset + 2] << 16) | (bytes[offset + 1] << 8) | bytes[offset]) >>> 0;
}
