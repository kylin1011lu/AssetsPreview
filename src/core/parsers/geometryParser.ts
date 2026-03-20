/**
 * geometryParser.ts
 *
 * Parses TexturePacker / Cocos Creator plist geometry strings.
 *
 * Supported formats:
 *   rect:  {{x,y},{w,h}}
 *   point: {x,y}
 *   size:  {w,h}
 */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

/** Parses "{{x,y},{w,h}}" */
export function parseRect(str: string): Rect {
  const m = str.match(/\{\s*\{\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\}\s*,\s*\{\s*([\d.]+)\s*,\s*([\d.]+)\s*\}\s*\}/)
  if (m) {
    return {
      x: parseFloat(m[1]),
      y: parseFloat(m[2]),
      width: parseFloat(m[3]),
      height: parseFloat(m[4]),
    }
  }
  return { x: 0, y: 0, width: 0, height: 0 }
}

/** Parses "{x,y}" */
export function parsePoint(str: string): Point {
  const m = str.match(/\{\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\}/)
  if (m) return { x: parseFloat(m[1]), y: parseFloat(m[2]) }
  return { x: 0, y: 0 }
}

/** Parses "{w,h}" */
export function parseSize(str: string): Size {
  const m = str.match(/\{\s*([\d.]+)\s*,\s*([\d.]+)\s*\}/)
  if (m) return { width: parseFloat(m[1]), height: parseFloat(m[2]) }
  return { width: 0, height: 0 }
}
