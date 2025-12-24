
export enum FileType {
  PDF = 'application/pdf',
  DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  PNG = 'image/png',
  JPEG = 'image/jpeg',
  TEXT = 'text/plain'
}

export interface ManagedFile {
  id: string;
  name: string;
  type: FileType | string;
  size: number;
  data: string; // base64 or source
  source: 'input' | 'output';
  timestamp: number;
}

export interface TaskMemory {
  id: string;
  command: string;
  status: 'completed' | 'failed';
  timestamp: number;
  resultSummary: string;
}

export interface NoteItem {
  id: string;
  content: string;
  completed?: boolean;
  timestamp: number;
}

export interface NoteGroup {
  id: string;
  title: string;
  type: 'text' | 'todo';
  items: NoteItem[];
  timestamp: number;
}

export interface CanvasElement {
  id: string;
  type: 'path' | 'rect' | 'circle' | 'line' | 'image';
  points?: { x: number; y: number }[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color: string;
  size: number;
  timestamp: number;
  data?: string; // Store base64 image data
}

export interface Layer {
  id: string;
  name: string;
  elements: CanvasElement[];
  visible: boolean;
  locked: boolean;
}

export interface EditorState {
  layers: Layer[];
  activeLayerId: string;
  textContent: string;
}

export type MainSection = 'notes' | 'workspace';
export type WorkspaceSubView = 'standard' | 'blank';
