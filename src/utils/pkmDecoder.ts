/**
 * pkmDecoder.ts
 *
 * Decodes PKM files (ETC1/ETC2 compressed GPU textures used on Android).
 * ETC1 (format type 0) is decoded on the CPU.
 * ETC2 (types 1/3/4) falls back to WebGL with WEBGL_compressed_texture_etc.
 */

// ETC1 modifier table: [+small, +large] for each of the 8 codewords
const MODIFIERS: [number, number][] = [
  [2, 8], [5, 17], [9, 29], [13, 42],
  [18, 60], [24, 80], [33, 106], [47, 183],
]

function ext4(n: number) { return (n << 4) | n }          // 4-bit → 8-bit
function ext5(n: number) { return (n << 3) | (n >> 2) }  // 5-bit → 8-bit
function clamp8(v: number) { return v < 0 ? 0 : v > 255 ? 255 : v }

function decodeEtc1Block(
  src: Uint8Array, blkOff: number,
  dst: Uint8ClampedArray, imgW: number, imgH: number,
  bx: number, by: number,
): void {
  const b0 = src[blkOff], b1 = src[blkOff + 1]
  const b2 = src[blkOff + 2], b3 = src[blkOff + 3]

  const diff = (b3 >> 1) & 1
  const flip = b3 & 1
  const cw1  = (b3 >> 5) & 7
  const cw2  = (b3 >> 2) & 7

  let r1: number, g1: number, z1: number  // z = blue (avoid naming collision)
  let r2: number, g2: number, z2: number

  if (diff === 0) {
    // Individual mode: each subblock has its own 4-bit base color
    r1 = ext4(b0 >> 4);  r2 = ext4(b0 & 0xF)
    g1 = ext4(b1 >> 4);  g2 = ext4(b1 & 0xF)
    z1 = ext4(b2 >> 4);  z2 = ext4(b2 & 0xF)
  } else {
    // Differential mode: subblock 2 is base + signed 3-bit delta
    const rb = b0 >> 3;  let dr = b0 & 7; if (dr >= 4) dr -= 8
    const gb = b1 >> 3;  let dg = b1 & 7; if (dg >= 4) dg -= 8
    const bb = b2 >> 3;  let db = b2 & 7; if (db >= 4) db -= 8
    r1 = ext5(rb);     r2 = ext5(rb + dr)
    g1 = ext5(gb);     g2 = ext5(gb + dg)
    z1 = ext5(bb);     z2 = ext5(bb + db)
  }

  // Bytes 4-5: MSB plane, bytes 6-7: LSB plane (column-major pixel order)
  const msb16 = (src[blkOff + 4] << 8) | src[blkOff + 5]
  const lsb16 = (src[blkOff + 6] << 8) | src[blkOff + 7]

  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      const px = bx * 4 + col
      const py = by * 4 + row
      if (px >= imgW || py >= imgH) continue

      const li = col * 4 + row          // linear pixel index (column-major)
      const bp = 15 - li                // bit position in the 16-bit plane
      const msbBit = (msb16 >> bp) & 1
      const lsbBit = (lsb16 >> bp) & 1
      const pixIdx = (msbBit << 1) | lsbBit  // 0=+small, 1=+large, 2=-small, 3=-large

      const sub = flip ? (row >= 2 ? 1 : 0) : (col >= 2 ? 1 : 0)
      const [small, large] = MODIFIERS[sub === 0 ? cw1 : cw2]
      const mods = [small, large, -small, -large]
      const mod  = mods[pixIdx]

      const i = (py * imgW + px) * 4
      dst[i]     = clamp8((sub === 0 ? r1 : r2) + mod)
      dst[i + 1] = clamp8((sub === 0 ? g1 : g2) + mod)
      dst[i + 2] = clamp8((sub === 0 ? z1 : z2) + mod)
      dst[i + 3] = 255
    }
  }
}

function etc2ViaWebGL(
  buffer: ArrayBuffer, fmtType: number,
  extW: number, extH: number, origW: number, origH: number,
): string {
  // ETC2 GL format constants
  const fmtMap: Record<number, number> = {
    1: 0x9274,  // GL_COMPRESSED_RGB8_ETC2
    3: 0x9278,  // GL_COMPRESSED_RGBA8_ETC2_EAC
    4: 0x9276,  // GL_COMPRESSED_RGB8_PUNCHTHROUGH_ALPHA1_ETC2
  }
  const glFmt = fmtMap[fmtType]
  if (!glFmt) throw new Error(`ETC2 formatType ${fmtType} 未知`)

  const canvas = document.createElement('canvas')
  canvas.width = origW; canvas.height = origH
  const gl = canvas.getContext('webgl') as WebGLRenderingContext | null
  if (!gl) throw new Error('WebGL 不可用')
  if (!gl.getExtension('WEBGL_compressed_texture_etc')) throw new Error('当前设备不支持 ETC2 压缩纹理')

  const mkShader = (type: number, src: string) => {
    const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s
  }
  const prog = gl.createProgram()!
  gl.attachShader(prog, mkShader(gl.VERTEX_SHADER,
    'attribute vec2 a;varying vec2 v;void main(){gl_Position=vec4(a,0,1);v=a*.5+.5;v.y=1.-v.y;}'))
  gl.attachShader(prog, mkShader(gl.FRAGMENT_SHADER,
    'precision mediump float;uniform sampler2D t;varying vec2 v;void main(){gl_FragColor=texture2D(t,v);}'))
  gl.linkProgram(prog); gl.useProgram(prog)

  const vbuf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, vbuf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'a')
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.compressedTexImage2D(gl.TEXTURE_2D, 0, glFmt, extW, extH, 0, new Uint8Array(buffer, 16))

  gl.viewport(0, 0, origW, origH)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  return canvas.toDataURL()
}

export interface PkmInfo {
  width: number
  height: number
  formatType: number
  formatName: string
}

export function parsePkmInfo(buffer: ArrayBuffer): PkmInfo {
  const view  = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  if (!magic.startsWith('PKM')) throw new Error('Not a PKM file')
  const formatType = view.getUint16(6, false)
  const nameMap: Record<number, string> = { 0: 'ETC1', 1: 'ETC2 RGB', 3: 'ETC2 RGBA', 4: 'ETC2 RGBA1' }
  return {
    formatType,
    formatName: nameMap[formatType] ?? `Unknown(${formatType})`,
    width:  view.getUint16(12, false),
    height: view.getUint16(14, false),
  }
}

/**
 * Decode a PKM buffer to a PNG data URL.
 * ETC1 is decoded on CPU; ETC2 uses WebGL.
 */
export function pkmToDataUrl(buffer: ArrayBuffer): string {
  const view  = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  if (!magic.startsWith('PKM')) throw new Error('Not a PKM file')

  const fmtType = view.getUint16(6, false)
  const extW    = view.getUint16(8, false)
  const extH    = view.getUint16(10, false)
  const origW   = view.getUint16(12, false)
  const origH   = view.getUint16(14, false)

  if (fmtType !== 0) {
    return etc2ViaWebGL(buffer, fmtType, extW, extH, origW, origH)
  }

  // ETC1 CPU decode
  const src     = new Uint8Array(buffer, 16)
  const dst     = new Uint8ClampedArray(origW * origH * 4)
  const bxCount = extW >> 2
  const byCount = extH >> 2
  for (let by = 0; by < byCount; by++) {
    for (let bx = 0; bx < bxCount; bx++) {
      decodeEtc1Block(src, (by * bxCount + bx) * 8, dst, origW, origH, bx, by)
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = origW; canvas.height = origH
  canvas.getContext('2d')!.putImageData(new ImageData(dst, origW, origH), 0, 0)
  return canvas.toDataURL()
}
