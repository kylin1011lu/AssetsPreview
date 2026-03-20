/**
 * plistParser.ts
 *
 * Parses plist files to extract sprite frame information.
 *
 * Supports:
 *  1. Apple Plist XML format  (<!DOCTYPE plist)
 *  2. TexturePacker JSON format  { frames: {...}, meta: {...} }
 */

import type { SpriteFrame, AtlasData } from '@/types'
import { parseRect, parsePoint, parseSize } from './geometryParser'

// ---------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------

export function parsePlist(content: string, fallbackImageName = 'texture.png'): AtlasData {
  const trimmed = content.trimStart()
  if (trimmed.startsWith('<') || trimmed.startsWith('<?')) {
    return parsePlistXml(content, fallbackImageName)
  }
  try {
    const json = JSON.parse(content)
    return parsePlistJson(json, fallbackImageName)
  } catch {
    throw new Error('Unrecognized plist format (not XML or JSON)')
  }
}

// ---------------------------------------------------------------
// XML (Apple Plist) parser
// ---------------------------------------------------------------

function parsePlistXml(xml: string, fallbackImageName: string): AtlasData {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')
  const plistEl = doc.querySelector('plist')
  if (!plistEl) throw new Error('Invalid plist XML: missing <plist> element')
  const dictEl = plistEl.querySelector(':scope > dict')
  if (!dictEl) throw new Error('Invalid plist XML: missing root dict')

  const root = parseXmlDict(dictEl)

  // Structure: { metadata: {...}, frames: { "name": {...}, ... } }
  const framesDict = root['frames'] as Record<string, Record<string, string>>
  const metadata = root['metadata'] as Record<string, string> | undefined

  const imageName = (metadata?.['textureFileName'] as string) || fallbackImageName
  const atlasWidth  = parseFloat((metadata?.['size'] ? parseSize(metadata['size'] as string).width  : 0).toString()) || 0
  const atlasHeight = parseFloat((metadata?.['size'] ? parseSize(metadata['size'] as string).height : 0).toString()) || 0

  const frames: SpriteFrame[] = []

  for (const [name, fd] of Object.entries(framesDict || {})) {
    frames.push(parseXmlFrameData(name, fd))
  }

  return { imageName, imageWidth: atlasWidth, imageHeight: atlasHeight, frames }
}

function parseXmlFrameData(name: string, fd: Record<string, string>): SpriteFrame {
  // Plist XML stores geometry as string values
  const textureRect    = parseRect(fd['textureRect'] || fd['frame'] || '{{0,0},{0,0}}')
  const spriteOffset   = parsePoint(fd['spriteOffset'] || fd['offset'] || '{0,0}')
  const spriteSize     = parseSize(fd['spriteSize'] || fd['sourceColorRect']?.split(',')?.[1] || `{${textureRect.width},${textureRect.height}}`)
  const spriteSourceSize = parseSize(fd['spriteSourceSize'] || fd['sourceSize'] || `{${textureRect.width},${textureRect.height}}`)
  const rotated = fd['textureRotated'] === 'true' || fd['rotated'] === 'true'

  return {
    name: stripExtension(name),
    x: textureRect.x,
    y: textureRect.y,
    width:  rotated ? textureRect.height : textureRect.width,
    height: rotated ? textureRect.width  : textureRect.height,
    sourceWidth:  spriteSourceSize.width,
    sourceHeight: spriteSourceSize.height,
    offsetX: spriteOffset.x,
    offsetY: spriteOffset.y,
    rotated,
  }
}

function parseXmlDict(el: Element): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const children = Array.from(el.children)
  for (let i = 0; i + 1 < children.length; i += 2) {
    const key = children[i].textContent || ''
    result[key] = parseXmlValue(children[i + 1])
  }
  return result
}

function parseXmlValue(el: Element): unknown {
  switch (el.tagName) {
    case 'dict':    return parseXmlDict(el)
    case 'array':   return Array.from(el.children).map(parseXmlValue)
    case 'string':  return el.textContent || ''
    case 'integer': return parseInt(el.textContent || '0', 10)
    case 'real':    return parseFloat(el.textContent || '0')
    case 'true':    return true
    case 'false':   return false
    default:        return el.textContent || ''
  }
}

// ---------------------------------------------------------------
// JSON (TexturePacker) parser
// ---------------------------------------------------------------

interface TPJsonFrame {
  frame:            { x: number; y: number; w: number; h: number }
  rotated:          boolean
  trimmed:          boolean
  spriteSourceSize: { x: number; y: number; w: number; h: number }
  sourceSize:       { w: number; h: number }
  pivot?:           { x: number; y: number }
}

interface TPJson {
  frames: Record<string, TPJsonFrame> | TPJsonFrame[]
  meta: {
    image:  string
    size:   { w: number; h: number }
    format: string
  }
}

function parsePlistJson(json: TPJson, fallbackImageName: string): AtlasData {
  const meta = json.meta || {}
  const imageName = (meta as any).image || fallbackImageName
  const imageWidth  = (meta as any).size?.w || 0
  const imageHeight = (meta as any).size?.h || 0

  const framesData = json.frames
  const frames: SpriteFrame[] = []

  if (Array.isArray(framesData)) {
    // Array format (some exporters)
    for (const fd of framesData) {
      frames.push(parseTpFrame((fd as any).filename || '', fd))
    }
  } else {
    // Object format
    for (const [name, fd] of Object.entries(framesData)) {
      frames.push(parseTpFrame(name, fd))
    }
  }

  return { imageName, imageWidth, imageHeight, frames }
}

function parseTpFrame(name: string, fd: TPJsonFrame): SpriteFrame {
  const { x, y, w, h } = fd.frame
  const sw = fd.sourceSize?.w || w
  const sh = fd.sourceSize?.h || h
  const ox = fd.spriteSourceSize?.x || 0
  const oy = fd.spriteSourceSize?.y || 0

  return {
    name: stripExtension(name),
    x,
    y,
    width:  fd.rotated ? h : w,
    height: fd.rotated ? w : h,
    sourceWidth:  sw,
    sourceHeight: sh,
    offsetX: ox,
    offsetY: oy,
    rotated: !!fd.rotated,
  }
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function stripExtension(name: string): string {
  return name.replace(/\.[^/.]+$/, '')
}
