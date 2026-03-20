/// <reference types="vite/client" />

// File System Access API types
interface FileSystemDirectoryHandle {
  name: string
  kind: 'directory'
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>
  resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null>
  [Symbol.asyncIterator](): AsyncIterableIterator<[string, FileSystemHandle]>
  values(): AsyncIterableIterator<FileSystemHandle>
}

interface FileSystemFileHandle {
  name: string
  kind: 'file'
  getFile(): Promise<File>
}

interface Window {
  showDirectoryPicker(options?: {
    id?: string
    mode?: 'read' | 'readwrite'
    startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | FileSystemHandle
  }): Promise<FileSystemDirectoryHandle>
}
