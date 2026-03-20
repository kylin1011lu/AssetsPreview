/**
 * fileReader.ts
 *
 * Abstracts file system access:
 *  - Primary: File System Access API (showDirectoryPicker) — Chrome/Edge 86+
 *  - Fallback: <input type="file" webkitdirectory> — Firefox/Safari
 *
 * Both paths expose the same FileEntry shape.
 */

import type { FileEntry } from '@/types'

// ---------------------------------------------------------------
// Feature detection
// ---------------------------------------------------------------

export const supportsFileSystemAccessAPI = (): boolean =>
  typeof window !== 'undefined' && 'showDirectoryPicker' in window

// ---------------------------------------------------------------
// File System Access API path
// ---------------------------------------------------------------

/**
 * Open a directory picker and recursively collect all FileEntry objects.
 * The dirHandle is returned so callers can persist it for re-open.
 */
export async function openDirectoryPicker(
  onProgress?: (count: number) => void
): Promise<{ handle: FileSystemDirectoryHandle; entries: FileEntry[] }> {
  const handle = await window.showDirectoryPicker({ mode: 'read' })
  const entries: FileEntry[] = []
  await collectEntries(handle, '', '', entries, onProgress)
  return { handle, entries }
}

/**
 * Re-open a previously stored handle (after user re-grants permission).
 */
export async function reopenDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  onProgress?: (count: number) => void
): Promise<FileEntry[]> {
  const perm = await (handle as any).requestPermission?.({ mode: 'read' })
  if (perm === 'denied') throw new Error('Permission denied')
  const entries: FileEntry[] = []
  await collectEntries(handle, '', '', entries, onProgress)
  return entries
}

async function collectEntries(
  dirHandle: FileSystemDirectoryHandle,
  parentPath: string,
  parentRelPath: string,
  out: FileEntry[],
  onProgress?: (count: number) => void
): Promise<void> {
  for await (const [, entry] of dirHandle) {
    if (entry.kind === 'file') {
      const fh = entry as FileSystemFileHandle
      const file = await fh.getFile()
      const filePath = parentPath ? `${parentPath}/${fh.name}` : fh.name
      const relPath = parentRelPath ? `${parentRelPath}/${fh.name}` : fh.name
      const dirPath = parentPath || '/'
      const relDirPath = parentRelPath || ''
      out.push({
        name: fh.name,
        path: filePath,
        relPath,
        dirPath,
        size: file.size,
        lastModified: file.lastModified,
        handle: fh,
      })
      onProgress?.(out.length)
    } else if (entry.kind === 'directory') {
      const dh = entry as FileSystemDirectoryHandle
      const subPath = parentPath ? `${parentPath}/${dh.name}` : dh.name
      const subRelPath = parentRelPath ? `${parentRelPath}/${dh.name}` : dh.name
      await collectEntries(dh, subPath, subRelPath, out, onProgress)
    }
  }
}

// ---------------------------------------------------------------
// webkitdirectory fallback path
// ---------------------------------------------------------------

/**
 * Convert a FileList from <input webkitdirectory> to FileEntry[].
 * The virtual root is the common prefix of all file.webkitRelativePath values.
 */
export function fromFileList(files: FileList): FileEntry[] {
  const entries: FileEntry[] = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    // webkitRelativePath = "folderName/sub/file.ext"
    const relPath = file.webkitRelativePath || file.name
    const parts = relPath.split('/')
    const name = parts[parts.length - 1]
    // strip the root folder prefix to get a path relative to the root
    const relPathFromRoot = parts.slice(1).join('/')
    const dirPath = parts.slice(0, -1).join('/') || '/'
    const relDirPath = parts.slice(1, -1).join('/') || ''
    entries.push({
      name,
      path: relPath,
      relPath: relPathFromRoot || name,
      dirPath,
      size: file.size,
      lastModified: file.lastModified,
      file,
    })
  }
  return entries
}

// ---------------------------------------------------------------
// Read file content helpers
// ---------------------------------------------------------------

export async function readFileAsText(entry: FileEntry): Promise<string> {
  const file = await resolveFile(entry)
  return file.text()
}

export async function readFileAsArrayBuffer(entry: FileEntry): Promise<ArrayBuffer> {
  const file = await resolveFile(entry)
  return file.arrayBuffer()
}

export async function readFileAsBlob(entry: FileEntry): Promise<Blob> {
  return resolveFile(entry)
}

export async function createObjectURL(entry: FileEntry): Promise<string> {
  const blob = await readFileAsBlob(entry)
  return URL.createObjectURL(blob)
}

async function resolveFile(entry: FileEntry): Promise<File> {
  if (entry.file) return entry.file
  if (entry.handle) return entry.handle.getFile()
  throw new Error(`No file source for entry: ${entry.path}`)
}

// ---------------------------------------------------------------
// History (LocalStorage)
// ---------------------------------------------------------------

const HISTORY_KEY = 'gav_folder_history'
const HISTORY_MAX = 5

export interface HistoryEntry {
  path: string
  handle?: FileSystemDirectoryHandle
  lastOpened: number
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as HistoryEntry[]
    // handles don't survive JSON round-trip; they are stored separately in IDB
    // for now just restore path/timestamp
    return parsed.map(e => ({ path: e.path, lastOpened: e.lastOpened }))
  } catch {
    return []
  }
}

export function saveHistory(path: string): void {
  const history = loadHistory().filter(e => e.path !== path)
  history.unshift({ path, lastOpened: Date.now() })
  const trimmed = history.slice(0, HISTORY_MAX)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed))
}
