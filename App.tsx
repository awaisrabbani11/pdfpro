
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  FileText, Upload, Mic, MicOff, Send, Layers, Plus, Image as ImageIcon,
  Type as TypeIcon, Trash2, Download, Terminal as TerminalIcon, ChevronRight,
  Sparkles, Zap, History, FilePlus, ArrowRightLeft, BookOpen, StickyNote,
  CheckCircle, List, Edit3, Palette, Save, Video, Search, Lock, MoreHorizontal,
  Activity, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Square, Circle, Minus, MousePointer2, Eraser, Type, Strikethrough, Subscript, Superscript, Highlighter,
  Eye, EyeOff, Lock as LockIcon, Unlock, ChevronUp, ChevronDown, Baseline, Undo2, Redo2, Layout, LogOut,
  User, CheckSquare, FileJson, X, Workflow
} from 'lucide-react';
import { LiveServerMessage } from "@google/genai";
import { ManagedFile, FileType, TaskMemory, NoteItem, NoteGroup, MainSection, WorkspaceSubView, CanvasElement, Layer, EditorState } from './types';
import { gemini } from './services/gemini';

// --- Audio Helpers ---
function encode(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number) {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}

// --- Components ---

const IconButton = ({ icon: Icon, onClick, active, label, className = "", color = "default", disabled = false, title = "" }: any) => {
  const colors: any = {
    default: active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300',
    ghost: 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50',
    danger: 'text-zinc-500 hover:text-red-400 hover:bg-red-500/10'
  };
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      className={`p-2 rounded-lg transition-all flex items-center gap-3 ${colors[color]} ${className} ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
    >
      <Icon size={18} />
      {label && <span className="text-sm font-semibold truncate">{label}</span>}
    </button>
  );
};

export default function App() {
  // Auth & Profile
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userProfile, setUserProfile] = useState<{name: string, email: string} | null>(null);

  // Core State
  const [activeSection, setActiveSection] = useState<MainSection>('workspace');
  const [workspaceView, setWorkspaceView] = useState<WorkspaceSubView>('blank');
  const [files, setFiles] = useState<ManagedFile[]>([]);
  const [noteGroups, setNoteGroups] = useState<NoteGroup[]>([
    { id: 'g1', title: 'Quick Notes', type: 'text', items: [], timestamp: Date.now() },
    { id: 'g2', title: 'Daily Tasks', type: 'todo', items: [], timestamp: Date.now() }
  ]);
  const [activeNoteGroupId, setActiveNoteGroupId] = useState<string>('g1');
  const [tasks, setTasks] = useState<TaskMemory[]>([]);
  const [command, setCommand] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

  // Editor State
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const textEditorRef = useRef<HTMLDivElement>(null);
  const imageUploadRef = useRef<HTMLInputElement>(null);
  const imageCache = useRef<Record<string, HTMLImageElement>>({});
  
  const [layers, setLayers] = useState<Layer[]>([
    { id: 'l1', name: 'Base Layer', elements: [], visible: true, locked: false }
  ]);
  const [activeLayerId, setActiveLayerId] = useState<string>('l1');
  const [showLayersPanel, setShowLayersPanel] = useState(true);

  // Undo/Redo History
  const [history, setHistory] = useState<EditorState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isInternalUpdate = useRef(false);

  // Drawing Props
  const [drawingMode, setDrawingMode] = useState<'brush' | 'rect' | 'circle' | 'line' | 'eraser' | 'select'>('brush');
  const [brushColor, setBrushColor] = useState('#6366f1');
  const [highlightColor, setHighlightColor] = useState('#fef08a');
  const [brushSize, setBrushSize] = useState(5);
  const [fontSize, setFontSize] = useState('3');
  
  const isDrawing = useRef(false);
  const currentPath = useRef<{ x: number; y: number }[]>([]);
  const startPos = useRef({ x: 0, y: 0 });

  // Audio Refs
  const inputAudioRef = useRef<AudioContext | null>(null);
  const outputAudioRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<Promise<any> | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextTimeRef = useRef<number>(0);

  // --- Persistence ---
  useEffect(() => {
    const saved = localStorage.getItem('pdfpro_state');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setNoteGroups(data.noteGroups || []);
        setFiles(data.files || []);
        setUserProfile(data.user || null);
        setIsAuthenticated(!!data.user);
      } catch(e) {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('pdfpro_state', JSON.stringify({ noteGroups, files, user: userProfile }));
  }, [noteGroups, files, userProfile]);

  // --- Auth Simulation ---
  const handleGoogleSignIn = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setUserProfile({ name: 'Alpha User', email: 'user@pdfpro.ai' });
      setIsAuthenticated(true);
      setIsProcessing(false);
    }, 1500);
  };

  const handleSignOut = () => {
    setIsAuthenticated(false);
    setUserProfile(null);
  };

  // --- History Management ---
  const saveToHistory = useCallback((currentLayers: Layer[], currentActiveId: string) => {
    if (isInternalUpdate.current) return;
    const newState: EditorState = {
      layers: JSON.parse(JSON.stringify(currentLayers)),
      activeLayerId: currentActiveId,
      textContent: textEditorRef.current?.innerHTML || ''
    };
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      return [...newHistory, newState].slice(-50);
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  useEffect(() => {
    if (history.length === 0 && workspaceView === 'blank') {
      saveToHistory(layers, activeLayerId);
    }
  }, [workspaceView, layers, activeLayerId, saveToHistory, history.length]);

  const undo = () => {
    if (historyIndex > 0) {
      isInternalUpdate.current = true;
      const prevIndex = historyIndex - 1;
      const state = history[prevIndex];
      setLayers(JSON.parse(JSON.stringify(state.layers)));
      setActiveLayerId(state.activeLayerId);
      if (textEditorRef.current) textEditorRef.current.innerHTML = state.textContent;
      setHistoryIndex(prevIndex);
      setTimeout(() => isInternalUpdate.current = false, 0);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      isInternalUpdate.current = true;
      const nextIndex = historyIndex + 1;
      const state = history[nextIndex];
      setLayers(JSON.parse(JSON.stringify(state.layers)));
      setActiveLayerId(state.activeLayerId);
      if (textEditorRef.current) textEditorRef.current.innerHTML = state.textContent;
      setHistoryIndex(nextIndex);
      setTimeout(() => isInternalUpdate.current = false, 0);
    }
  };

  // --- Rendering Logic ---
  const drawElement = (ctx: CanvasRenderingContext2D, el: CanvasElement) => {
    ctx.strokeStyle = el.color;
    ctx.fillStyle = el.color;
    ctx.lineWidth = el.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (el.type) {
      case 'path':
        if (!el.points || el.points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(el.points[0].x, el.points[0].y);
        for (let i = 1; i < el.points.length; i++) ctx.lineTo(el.points[i].x, el.points[i].y);
        ctx.stroke();
        break;
      case 'rect':
        if (el.x !== undefined && el.y !== undefined && el.width !== undefined && el.height !== undefined) {
          ctx.fillRect(el.x, el.y, el.width, el.height);
        }
        break;
      case 'circle':
        if (el.x !== undefined && el.y !== undefined && el.width !== undefined) {
          ctx.beginPath();
          ctx.arc(el.x, el.y, el.width, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'line':
        if (el.points && el.points.length === 2) {
          ctx.beginPath();
          ctx.moveTo(el.points[0].x, el.points[0].y);
          ctx.lineTo(el.points[1].x, el.points[1].y);
          ctx.stroke();
        }
        break;
      case 'image':
        if (el.data && el.x !== undefined && el.y !== undefined && el.width !== undefined && el.height !== undefined) {
          if (!imageCache.current[el.id]) {
            const img = new Image();
            img.src = el.data;
            img.onload = () => {
              imageCache.current[el.id] = img;
              redrawMainCanvas();
            };
          } else {
            ctx.drawImage(imageCache.current[el.id], el.x, el.y, el.width, el.height);
          }
        }
        break;
    }
  };

  const redrawMainCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    [...layers].reverse().forEach(layer => {
      if (layer.visible) layer.elements.forEach(el => drawElement(ctx, el));
    });
  }, [layers]);

  useEffect(() => { redrawMainCanvas(); }, [redrawMainCanvas]);

  // Layer Management
  const addLayer = (name?: string) => {
    const newId = `l${Date.now()}`;
    const newLayer: Layer = { id: newId, name: name || `Layer ${layers.length + 1}`, elements: [], visible: true, locked: false };
    const nextLayers = [newLayer, ...layers];
    setLayers(nextLayers);
    setActiveLayerId(newId);
    saveToHistory(nextLayers, newId);
    return newId;
  };

  // Notes Management
  const addNoteGroup = (title: string, type: 'text' | 'todo' = 'text') => {
    const newGroup: NoteGroup = { id: `g${Date.now()}`, title, type, items: [], timestamp: Date.now() };
    setNoteGroups(prev => [...prev, newGroup]);
    setActiveNoteGroupId(newGroup.id);
  };

  const addNoteItem = (groupId: string, content: string) => {
    setNoteGroups(prev => prev.map(g => g.id === groupId ? { 
      ...g, 
      items: [{ id: `i${Date.now()}`, content, timestamp: Date.now(), completed: false }, ...g.items] 
    } : g));
  };

  const toggleNoteItem = (groupId: string, itemId: string) => {
    setNoteGroups(prev => prev.map(g => g.id === groupId ? {
      ...g,
      items: g.items.map(i => i.id === itemId ? { ...i, completed: !i.completed } : i)
    } : g));
  };

  // Actions Execution
  const executeAction = async (name: string, args: any) => {
    await new Promise(r => setTimeout(r, 600));
    switch (name) {
      case 'manageNoteGroup':
        if (args.action === 'create') addNoteGroup(args.title || 'New List', args.type || 'text');
        if (args.action === 'delete') setNoteGroups(prev => prev.filter(g => g.id !== args.groupId));
        setTasks(prev => [{ id: Date.now().toString().slice(-4), command: `List ${args.action}`, status: 'completed', timestamp: Date.now(), resultSummary: `Managed group ${args.title}` }, ...prev]);
        break;
      case 'manageNoteItem':
        if (args.action === 'add') addNoteItem(args.groupId, args.content);
        if (args.action === 'toggle') toggleNoteItem(args.groupId, args.itemId);
        setTasks(prev => [{ id: Date.now().toString().slice(-4), command: `Item ${args.action}`, status: 'completed', timestamp: Date.now(), resultSummary: `Item updated in ${args.groupId}` }, ...prev]);
        break;
      case 'generateInfographic':
        const infoId = addLayer(`Infographic: ${args.topic}`);
        const newElements: CanvasElement[] = [];
        const canvasWidth = 1200;
        const centerX = canvasWidth / 2;
        const startY = 150;
        
        // Header
        newElements.push({ 
          id: `h-${Date.now()}`, type: 'rect', color: '#6366f1', size: 1, 
          x: centerX - 200, y: 50, width: 400, height: 60, timestamp: Date.now() 
        });

        if (args.style === 'mindmap') {
           const radius = 250;
           args.dataPoints.forEach((pt: any, idx: number) => {
             const angle = (idx / args.dataPoints.length) * Math.PI * 2;
             const x = centerX + radius * Math.cos(angle);
             const y = 400 + radius * Math.sin(angle);
             newElements.push({ id: `line-${idx}`, type: 'line', color: '#94a3b8', size: 2, points: [{ x: centerX, y: 400 }, { x, y }], timestamp: Date.now() });
             newElements.push({ id: `pt-${idx}`, type: 'circle', color: pt.color || '#3b82f6', size: 1, x, y, width: 50, timestamp: Date.now() });
           });
           newElements.push({ id: 'center', type: 'circle', color: '#6366f1', size: 1, x: centerX, y: 400, width: 70, timestamp: Date.now() });
        } else if (args.style === 'comparison') {
           const colWidth = 400;
           args.dataPoints.forEach((pt: any, idx: number) => {
             const isLeft = idx % 2 === 0;
             const x = isLeft ? centerX - colWidth : centerX + 50;
             const y = startY + (Math.floor(idx / 2) * 120);
             newElements.push({ id: `pt-${idx}`, type: 'rect', color: pt.color || '#3b82f6', size: 1, x, y, width: 350, height: 80, timestamp: Date.now() });
           });
        } else {
           // Flow or Steps
           const spacing = 180;
           args.dataPoints.forEach((pt: any, idx: number) => {
             const y = startY + spacing * idx;
             if (idx > 0) newElements.push({ id: `line-${idx}`, type: 'line', color: '#94a3b8', size: 2, points: [{ x: centerX, y: y - spacing + 60 }, { x: centerX, y: y }], timestamp: Date.now() });
             newElements.push({ id: `pt-${idx}`, type: 'rect', color: pt.color || '#3b82f6', size: 1, x: centerX - 150, y: y, width: 300, height: 80, timestamp: Date.now() });
           });
        }

        setLayers(prev => prev.map(l => l.id === infoId ? { ...l, elements: newElements } : l));
        
        // Update Rich Text with description
        if (textEditorRef.current) {
          const summary = `
            <div class="mt-20 p-8 border-l-8 border-indigo-600 bg-indigo-50/50 rounded-r-3xl">
              <h2 class="text-4xl font-black mb-4">${args.topic}</h2>
              <div class="space-y-4">
                ${args.dataPoints.map((p: any) => `<div><strong style="color: ${p.color || '#4f46e5'}">${p.label}</strong>: ${p.description}</div>`).join('')}
              </div>
            </div>
          `;
          textEditorRef.current.innerHTML += summary;
        }

        setTasks(prev => [{ id: Date.now().toString().slice(-4), command: 'Visualize', status: 'completed', timestamp: Date.now(), resultSummary: `Created ${args.style} infographic for ${args.topic}` }, ...prev]);
        break;
    }
  };

  const handleAgentCommand = async () => {
    if (!command.trim()) return;
    setIsProcessing(true);
    const input = command;
    setCommand('');
    try {
      const context = `Notes Groups: ${noteGroups.map(g => g.title).join(',')}, Files: ${files.length}, Layers: ${layers.length}`;
      const response = await gemini.processAgentCommand(input, context);
      if (response.functionCalls) {
        for (const call of response.functionCalls) await executeAction(call.name, call.args);
      } else if (response.text) {
        setTasks(prev => [{ id: Date.now().toString().slice(-4), command: input, status: 'completed', timestamp: Date.now(), resultSummary: response.text || 'Done' }, ...prev]);
      }
    } catch (e: any) {
      setTasks(prev => [{ id: 'err', command: input, status: 'failed', timestamp: Date.now(), resultSummary: e.message }, ...prev]);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleVoice = async () => {
    if (isVoiceActive) { setIsVoiceActive(false); inputAudioRef.current?.close(); outputAudioRef.current?.close(); return; }
    try {
      setIsVoiceActive(true);
      inputAudioRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      sessionRef.current = gemini.connectVoiceAgent({
        onopen: () => {
          const source = inputAudioRef.current!.createMediaStreamSource(stream);
          const processor = inputAudioRef.current!.createScriptProcessor(4096, 1, 1);
          processor.onaudioprocess = (e: any) => {
            const input = e.inputBuffer.getChannelData(0);
            const int16 = new Int16Array(input.length);
            for (let i = 0; i < input.length; i++) int16[i] = input[i] * 32768;
            sessionRef.current?.then(s => s.sendRealtimeInput({ media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' } }));
          };
          source.connect(processor);
          processor.connect(inputAudioRef.current!.destination);
        },
        onmessage: async (msg: LiveServerMessage) => {
          if (msg.toolCall) for (const fc of msg.toolCall.functionCalls) await executeAction(fc.name, fc.args);
          const audio = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (audio && outputAudioRef.current) {
            const buffer = await decodeAudioData(decode(audio), outputAudioRef.current, 24000, 1);
            const source = outputAudioRef.current.createBufferSource();
            source.buffer = buffer;
            source.connect(outputAudioRef.current.destination);
            const now = outputAudioRef.current.currentTime;
            nextTimeRef.current = Math.max(nextTimeRef.current, now);
            source.start(nextTimeRef.current);
            nextTimeRef.current += buffer.duration;
          }
        }
      });
    } catch (e) { setIsVoiceActive(false); }
  };

  // Drawing Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (drawingMode === 'select') return;
    const currentLayer = layers.find(l => l.id === activeLayerId);
    if (!currentLayer || !currentLayer.visible || currentLayer.locked) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    isDrawing.current = true;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    startPos.current = { x, y };
    if (drawingMode === 'brush' || drawingMode === 'eraser') currentPath.current = [{ x, y }];
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing.current || drawingMode === 'select') return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    requestAnimationFrame(() => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (drawingMode === 'brush' || drawingMode === 'eraser') {
        currentPath.current.push({ x, y });
        ctx.beginPath();
        ctx.strokeStyle = drawingMode === 'eraser' ? '#ffffff' : brushColor;
        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.moveTo(currentPath.current[0].x, currentPath.current[0].y);
        for (let i = 1; i < currentPath.current.length; i++) ctx.lineTo(currentPath.current[i].x, currentPath.current[i].y);
        ctx.stroke();
      } else if (drawingMode === 'rect') {
        ctx.fillStyle = brushColor + '44';
        ctx.strokeStyle = brushColor;
        ctx.fillRect(startPos.current.x, startPos.current.y, x - startPos.current.x, y - startPos.current.y);
        ctx.strokeRect(startPos.current.x, startPos.current.y, x - startPos.current.x, y - startPos.current.y);
      } else if (drawingMode === 'circle') {
        const radius = Math.sqrt(Math.pow(x - startPos.current.x, 2) + Math.pow(y - startPos.current.y, 2));
        ctx.beginPath(); ctx.arc(startPos.current.x, startPos.current.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = brushColor + '44'; ctx.strokeStyle = brushColor;
        ctx.fill(); ctx.stroke();
      }
    });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDrawing.current || drawingMode === 'select') return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const newEl: CanvasElement = { id: Math.random().toString(36).slice(2, 9), type: drawingMode === 'eraser' ? 'path' : (drawingMode as any), color: drawingMode === 'eraser' ? '#ffffff' : brushColor, size: brushSize, timestamp: Date.now() };
    if (drawingMode === 'brush' || drawingMode === 'eraser') { newEl.type = 'path'; newEl.points = [...currentPath.current]; }
    else if (drawingMode === 'rect') { newEl.x = Math.min(startPos.current.x, x); newEl.y = Math.min(startPos.current.y, y); newEl.width = Math.abs(x - startPos.current.x); newEl.height = Math.abs(y - startPos.current.y); }
    else if (drawingMode === 'circle') { newEl.x = startPos.current.x; newEl.y = startPos.current.y; newEl.width = Math.sqrt(Math.pow(x - startPos.current.x, 2) + Math.pow(y - startPos.current.y, 2)); }
    const nextLayers = layers.map(l => l.id === activeLayerId ? { ...l, elements: [...l.elements, newEl] } : l);
    setLayers(nextLayers);
    saveToHistory(nextLayers, activeLayerId);
    isDrawing.current = false; currentPath.current = [];
    previewCanvasRef.current?.getContext('2d')?.clearRect(0, 0, 1200, 800);
  };

  const exportCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'pdfpro-export.png';
    link.href = canvas.toDataURL();
    link.click();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles) return;

    Array.from(uploadedFiles).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        const newFile: ManagedFile = {
          id: Math.random().toString(36).slice(2, 9),
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          data: base64,
          source: 'input',
          timestamp: Date.now()
        };
        setFiles(prev => [newFile, ...prev]);
      };
      reader.readAsDataURL(file);
    });
  };

  const applyFormatting = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    textEditorRef.current?.focus();
  };

  const handleCanvasImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      const newEl: CanvasElement = {
        id: `img-${Date.now()}`,
        type: 'image',
        data: base64,
        x: 100,
        y: 100,
        width: 300,
        height: 300,
        color: 'transparent',
        size: 1,
        timestamp: Date.now()
      };
      
      // Changed: Add image as a brand new layer
      const newLayerId = `l-img-${Date.now()}`;
      const newLayer: Layer = {
        id: newLayerId,
        name: `Image: ${file.name}`,
        elements: [newEl],
        visible: true,
        locked: false
      };
      
      const nextLayers = [newLayer, ...layers];
      setLayers(nextLayers);
      setActiveLayerId(newLayerId);
      saveToHistory(nextLayers, newLayerId);
    };
    reader.readAsDataURL(file);
  };

  const downloadFile = (file: ManagedFile) => {
    const link = document.createElement('a');
    link.href = file.data;
    link.download = file.name;
    link.click();
  };

  // --- Auth Wall ---
  if (!isAuthenticated) {
    return (
      <div className="h-screen w-screen bg-zinc-950 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-md bg-zinc-900/50 border border-zinc-800 rounded-3xl p-10 flex flex-col gap-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500" />
          <div className="flex flex-col gap-2 items-center text-center">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-4">
              <Zap className="text-white" size={32} fill="white" />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">pdfpro.pro</h1>
            <p className="text-zinc-500 text-sm">Professional Agentic Document Intelligence</p>
          </div>
          <button 
            onClick={handleGoogleSignIn}
            disabled={isProcessing}
            className="w-full py-4 rounded-2xl bg-white text-zinc-950 font-bold flex items-center justify-center gap-4 hover:bg-zinc-200 transition-all disabled:opacity-50"
          >
            {isProcessing ? <Activity className="animate-pulse" /> : <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" className="w-5" />}
            Continue with Google
          </button>
          <div className="text-center text-[10px] text-zinc-600 uppercase font-bold tracking-widest">Personal Use Edition</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 font-sans text-zinc-300">
      
      {/* Main Navigation Sidebar */}
      <nav className="w-64 border-r border-zinc-900 flex flex-col p-5 bg-zinc-950/80 backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-10 px-2 group">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30 group-hover:scale-105 transition-transform">
            <Zap className="text-white fill-white" size={20} />
          </div>
          <span className="text-xl font-black text-white tracking-tighter">pdfpro.pro</span>
        </div>

        <div className="space-y-1 flex-1">
          <IconButton icon={Layout} label="Workspace" active={activeSection === 'workspace'} onClick={() => setActiveSection('workspace')} />
          <IconButton icon={StickyNote} label="Notes & Ideas" active={activeSection === 'notes'} onClick={() => setActiveSection('notes')} />
          
          <div className="mt-8 pt-6 border-t border-zinc-900">
             <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-4 px-2">Recent Logs</div>
             <div className="space-y-2 overflow-y-auto max-h-60 custom-scrollbar pr-2">
                {tasks.map(t => (
                  <div key={t.id} className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/50 hover:border-zinc-700 transition-all">
                    <div className="flex justify-between items-center mb-1">
                       <span className={`text-[9px] font-bold uppercase ${t.status === 'completed' ? 'text-emerald-500' : 'text-red-500'}`}>{t.command}</span>
                       <span className="text-[8px] text-zinc-700">#{t.id}</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 line-clamp-1">{t.resultSummary}</p>
                  </div>
                ))}
             </div>
          </div>
        </div>

        <div className="mt-auto pt-6 border-t border-zinc-900 space-y-4">
           <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-zinc-900 transition-all cursor-pointer">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                 <User size={14} className="text-white" />
              </div>
              <div className="flex-1 overflow-hidden">
                 <p className="text-xs font-bold text-white truncate">{userProfile?.name}</p>
                 <p className="text-[9px] text-zinc-600 truncate">{userProfile?.email}</p>
              </div>
              <LogOut size={14} className="text-zinc-700 hover:text-red-400" onClick={handleSignOut} />
           </div>
        </div>
      </nav>

      {/* Primary Interface Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        
        <header className="h-16 border-b border-zinc-900 flex items-center justify-between px-8 bg-zinc-950/40 backdrop-blur-md">
           <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 p-1 bg-zinc-900 rounded-xl">
                 <button onClick={() => setWorkspaceView('standard')} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${workspaceView === 'standard' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-600 hover:text-zinc-400'}`}>File Explorer</button>
                 <button onClick={() => setWorkspaceView('blank')} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${workspaceView === 'blank' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-600 hover:text-zinc-400'}`}>Canvas Editor</button>
              </div>
           </div>
           
           <div className="flex items-center gap-4">
              <div className={`px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${isProcessing ? 'border-amber-500/30 text-amber-500 bg-amber-500/5' : 'border-emerald-500/30 text-emerald-500 bg-emerald-500/5'}`}>
                 <div className={`w-1.5 h-1.5 rounded-full ${isProcessing ? 'bg-amber-500 animate-ping' : 'bg-emerald-500'}`} />
                 {isProcessing ? 'Agent Thinking' : 'Live Orchestration'}
              </div>
           </div>
        </header>

        <div className="flex-1 overflow-hidden p-8 flex flex-col relative">
          
          {activeSection === 'notes' ? (
             <div className="flex-1 flex gap-8 max-w-6xl mx-auto w-full overflow-hidden">
                {/* Lists Sidebar */}
                <div className="w-64 flex flex-col gap-6">
                   <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase tracking-widest text-zinc-600">My Collections</h3>
                      <button onClick={() => addNoteGroup('New Collection')} className="p-1 hover:text-white transition-all"><Plus size={16} /></button>
                   </div>
                   <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                      {noteGroups.map(group => (
                        <div 
                          key={group.id} 
                          onClick={() => setActiveNoteGroupId(group.id)}
                          className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 ${activeNoteGroupId === group.id ? 'bg-indigo-600/10 border-indigo-500/40 text-white' : 'bg-zinc-900/40 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
                        >
                           {group.type === 'todo' ? <CheckSquare size={16} /> : <FileText size={16} />}
                           <span className="text-xs font-bold truncate">{group.title}</span>
                        </div>
                      ))}
                   </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 bg-zinc-900/30 border border-zinc-800 rounded-3xl p-8 flex flex-col gap-6 overflow-hidden">
                   <div className="flex items-center justify-between">
                      <h2 className="text-xl font-bold text-white">{noteGroups.find(g => g.id === activeNoteGroupId)?.title}</h2>
                      <div className="flex gap-2">
                         <IconButton icon={Download} color="ghost" title="Export as JSON" onClick={() => {
                           const data = noteGroups.find(g => g.id === activeNoteGroupId);
                           const blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
                           const url = URL.createObjectURL(blob);
                           const a = document.createElement('a'); a.href = url; a.download = `${data?.title}.json`; a.click();
                         }} />
                         <IconButton icon={Trash2} color="danger" title="Delete Group" onClick={() => setNoteGroups(prev => prev.filter(g => g.id !== activeNoteGroupId))} />
                      </div>
                   </div>

                   <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-2">
                      <div className="relative group">
                         <Plus className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-indigo-500 transition-colors" size={16} />
                         <input 
                           type="text" 
                           placeholder="Add an item to this group..." 
                           className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:border-indigo-500 transition-all"
                           onKeyDown={(e) => {
                             if (e.key === 'Enter' && e.currentTarget.value) {
                               addNoteItem(activeNoteGroupId, e.currentTarget.value);
                               e.currentTarget.value = '';
                             }
                           }}
                         />
                      </div>

                      {noteGroups.find(g => g.id === activeNoteGroupId)?.items.map(item => (
                        <div key={item.id} className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800 flex items-center gap-4 animate-in slide-in-from-top-2">
                           <button 
                             onClick={() => toggleNoteItem(activeNoteGroupId, item.id)}
                             className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${item.completed ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-zinc-700 hover:border-indigo-500'}`}
                           >
                              {item.completed && <CheckCircle size={12} />}
                           </button>
                           <p className={`text-sm flex-1 ${item.completed ? 'line-through text-zinc-600 italic' : 'text-zinc-300'}`}>{item.content}</p>
                           <Trash2 size={14} className="text-zinc-800 hover:text-red-400 cursor-pointer" onClick={() => setNoteGroups(prev => prev.map(g => g.id === activeNoteGroupId ? {...g, items: g.items.filter(i => i.id !== item.id)} : g))} />
                        </div>
                      ))}
                   </div>
                </div>
             </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
               {workspaceView === 'standard' ? (
                  <div className="flex-1 grid grid-cols-12 gap-8 overflow-hidden">
                     {/* Explorer */}
                     <div className="col-span-4 flex flex-col gap-6">
                        <div className="flex items-center justify-between">
                           <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Files & Assets</h3>
                           <label className="cursor-pointer hover:text-white transition-colors"><Plus size={16} /><input type="file" multiple className="hidden" onChange={handleFileUpload} /></label>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
                           {files.map(f => (
                             <div 
                               key={f.id} 
                               onClick={() => setSelectedFileId(f.id)}
                               className={`p-4 rounded-2xl border transition-all cursor-pointer group flex items-center gap-4 ${selectedFileId === f.id ? 'bg-indigo-600/10 border-indigo-500/40 text-white' : 'bg-zinc-900/40 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
                             >
                                <div className={`p-2 rounded-xl ${f.source === 'input' ? 'bg-zinc-800' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                   {f.source === 'input' ? <FileText size={18} /> : <Sparkles size={18} />}
                                </div>
                                <div className="flex-1 overflow-hidden">
                                   <p className="text-xs font-bold truncate">{f.name}</p>
                                   <p className="text-[9px] text-zinc-600 uppercase font-bold">{(f.size/1024).toFixed(1)} KB</p>
                                </div>
                                <Download size={14} className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-white" onClick={(e) => { e.stopPropagation(); downloadFile(f); }} />
                             </div>
                           ))}
                        </div>
                     </div>

                     {/* Document Viewer */}
                     <div className="col-span-8 flex flex-col bg-zinc-900/20 border border-zinc-900 rounded-3xl overflow-hidden relative group">
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20 transition-opacity group-hover:opacity-40">
                           <Search size={120} strokeWidth={0.5} />
                        </div>
                        <div className="h-14 bg-zinc-950/50 border-b border-zinc-900 flex items-center justify-between px-6 shrink-0 z-10">
                           <span className="text-xs font-bold text-zinc-500">Document Intelligence Engine v1.4</span>
                           <div className="flex gap-2">
                              <IconButton icon={Video} color="ghost" title="Summarize as Video Script" />
                              <IconButton icon={FileJson} color="ghost" title="Extract Data as JSON" />
                           </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-12 z-10">
                           {selectedFileId ? (
                              <div className="max-w-2xl mx-auto flex flex-col gap-8 animate-in fade-in zoom-in-95">
                                 <h1 className="text-3xl font-black text-white tracking-tight">{files.find(f => f.id === selectedFileId)?.name}</h1>
                                 <div className="w-full aspect-[4/3] bg-zinc-950/80 rounded-3xl border border-zinc-800 flex flex-col items-center justify-center p-10 text-center gap-4">
                                    <div className="w-20 h-20 bg-indigo-500/10 text-indigo-500 rounded-3xl flex items-center justify-center">
                                       <Activity size={32} />
                                    </div>
                                    <h4 className="font-bold text-zinc-300">Analysis Complete</h4>
                                    <p className="text-sm text-zinc-600">The agent is ready to transform or convert this document. Use prompts like "convert to docx" or "make a visual overview".</p>
                                 </div>
                              </div>
                           ) : (
                              <div className="h-full flex flex-col items-center justify-center text-center gap-4 text-zinc-700">
                                 <MousePointer2 size={48} />
                                 <p className="text-sm font-medium">Select a resource to initialize analysis</p>
                              </div>
                           )}
                        </div>
                     </div>
                  </div>
               ) : (
                  <div className="flex-1 flex flex-row gap-4 overflow-hidden max-w-[1600px] mx-auto w-full">
                     <div className="flex-1 flex flex-col bg-white rounded-t-3xl shadow-2xl overflow-hidden border border-zinc-200">
                        {/* Editor Toolbar */}
                        <div className="h-14 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between px-6 shrink-0 text-zinc-900">
                           <div className="flex items-center gap-1 bg-zinc-200/50 p-1 rounded-xl">
                              <IconButton icon={Undo2} onClick={undo} disabled={historyIndex <= 0} color="ghost" title="Undo" />
                              <IconButton icon={Redo2} onClick={redo} disabled={historyIndex >= history.length - 1} color="ghost" title="Redo" />
                              <div className="w-px h-4 bg-zinc-300 mx-1" />
                              <IconButton icon={Bold} onClick={() => applyFormatting('bold')} color="ghost" />
                              <IconButton icon={Italic} onClick={() => applyFormatting('italic')} color="ghost" />
                              <IconButton icon={Underline} onClick={() => applyFormatting('underline')} color="ghost" />
                              <div className="w-px h-4 bg-zinc-300 mx-1" />
                              <IconButton icon={AlignLeft} onClick={() => applyFormatting('justifyLeft')} color="ghost" />
                              <IconButton icon={AlignCenter} onClick={() => applyFormatting('justifyCenter')} color="ghost" />
                              <IconButton icon={AlignRight} onClick={() => applyFormatting('justifyRight')} color="ghost" />
                              <div className="w-px h-4 bg-zinc-300 mx-1" />
                              <div className="flex items-center gap-2 px-2">
                                 <Baseline size={14} className="text-zinc-500" />
                                 <select value={fontSize} onChange={(e) => { setFontSize(e.target.value); applyFormatting('fontSize', e.target.value); }} className="bg-transparent text-[11px] font-bold border-b border-zinc-300 outline-none">
                                    {[1,2,3,4,5,6,7].map(v => <option key={v} value={v}>{v}</option>)}
                                 </select>
                              </div>
                           </div>
                           <div className="flex items-center gap-1 bg-zinc-200/50 p-1 rounded-xl">
                              <IconButton icon={MousePointer2} active={drawingMode === 'select'} onClick={() => setDrawingMode('select')} color="ghost" />
                              <IconButton icon={Edit3} active={drawingMode === 'brush'} onClick={() => setDrawingMode('brush')} color="ghost" />
                              <IconButton icon={Eraser} active={drawingMode === 'eraser'} onClick={() => setDrawingMode('eraser')} color="ghost" />
                              <IconButton icon={Square} active={drawingMode === 'rect'} onClick={() => setDrawingMode('rect')} color="ghost" />
                              <IconButton icon={Circle} active={drawingMode === 'circle'} onClick={() => setDrawingMode('circle')} color="ghost" />
                              <div className="w-px h-4 bg-zinc-300 mx-1" />
                              <IconButton icon={ImageIcon} onClick={() => imageUploadRef.current?.click()} color="ghost" title="Insert Image as New Layer" />
                              <input type="file" ref={imageUploadRef} className="hidden" accept="image/*" onChange={handleCanvasImageUpload} />
                              <IconButton icon={Workflow} onClick={() => { setCommand('Generate a mindmap infographic about '); textEditorRef.current?.focus(); }} color="ghost" title="Magic Infographic" />
                           </div>
                           <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2">
                                 <div className="w-6 h-6 rounded-full border border-zinc-300 overflow-hidden cursor-pointer" style={{backgroundColor: brushColor}}>
                                    <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} className="opacity-0 w-full h-full cursor-pointer" />
                                 </div>
                                 <input type="range" min="1" max="20" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="w-16 accent-indigo-600" />
                              </div>
                              <IconButton icon={Save} color="ghost" onClick={exportCanvas} title="Export Canvas" />
                           </div>
                        </div>

                        {/* Creative Surface */}
                        <div className="flex-1 relative overflow-hidden bg-white">
                           <canvas ref={canvasRef} width={1200} height={800} className="absolute inset-0 z-0 w-full h-full pointer-events-none" />
                           <canvas 
                             ref={previewCanvasRef} width={1200} height={800}
                             onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
                             className={`absolute inset-0 z-10 w-full h-full ${drawingMode === 'select' ? 'pointer-events-none' : 'cursor-crosshair'}`}
                           />
                           <div 
                             ref={textEditorRef}
                             className="absolute inset-0 z-20 p-20 font-serif text-zinc-900 text-xl leading-relaxed outline-none overflow-y-auto custom-scrollbar"
                             contentEditable suppressContentEditableWarning onBlur={() => saveToHistory(layers, activeLayerId)}
                           >
                              <h1 className="text-5xl font-black mb-8 text-zinc-950">Creative Canvas</h1>
                              <p className="text-zinc-400 italic">Start typing or use the agent to orchestrate visual layouts...</p>
                           </div>
                        </div>
                     </div>

                     {/* Layer & Control Panel */}
                     {showLayersPanel && (
                        <div className="w-72 bg-zinc-900/50 border border-zinc-800 rounded-t-3xl p-6 flex flex-col gap-6">
                           <div className="flex items-center justify-between">
                              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-600">Layer Stack</h3>
                              <button onClick={() => addLayer()} className="p-1 hover:text-white transition-all"><Plus size={16} /></button>
                           </div>
                           <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                              {layers.map((l, idx) => (
                                <div 
                                  key={l.id} 
                                  onClick={() => setActiveLayerId(l.id)}
                                  className={`p-3 rounded-xl border transition-all cursor-pointer group flex items-center gap-3 ${activeLayerId === l.id ? 'bg-indigo-600/10 border-indigo-500/40' : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'}`}
                                >
                                   <div className={`w-1.5 h-1.5 rounded-full ${activeLayerId === l.id ? 'bg-indigo-500' : 'bg-zinc-700'}`} />
                                   <span className="text-[11px] font-bold truncate flex-1">{l.name}</span>
                                   <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      {l.visible ? <Eye size={12} onClick={(e) => { e.stopPropagation(); setLayers(prev => prev.map(ly => ly.id === l.id ? {...ly, visible: false} : ly)); }} /> : <EyeOff size={12} className="text-red-400" onClick={(e) => { e.stopPropagation(); setLayers(prev => prev.map(ly => ly.id === l.id ? {...ly, visible: true} : ly)); }} />}
                                      <Trash2 size={12} className="text-zinc-700 hover:text-red-400" onClick={(e) => { e.stopPropagation(); setLayers(prev => prev.filter(ly => ly.id !== l.id)); }} />
                                   </div>
                                </div>
                              ))}
                           </div>
                        </div>
                     )}
                  </div>
               )}
            </div>
          )}

          {/* Agent Control Bar */}
          <div className="max-w-4xl mx-auto w-full p-4 glass rounded-3xl border border-zinc-800 shadow-2xl flex items-center gap-4 mt-auto mb-2 animate-in slide-in-from-bottom-4">
             <button onClick={toggleVoice} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shrink-0 ${isVoiceActive ? 'bg-red-600 text-white animate-pulse shadow-lg shadow-red-500/20' : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'}`}>
                {isVoiceActive ? <Mic size={24} /> : <MicOff size={24} />}
             </button>
             <div className="flex-1">
                <input 
                  type="text" 
                  value={command} 
                  onChange={(e) => setCommand(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAgentCommand()}
                  placeholder={activeSection === 'notes' ? "Add a checklist item or create a new group..." : "Convert this PDF to docx, or add a mindmap about AI..."}
                  className="w-full bg-transparent text-sm font-medium text-white placeholder:text-zinc-700 focus:outline-none py-2"
                />
             </div>
             <button onClick={handleAgentCommand} disabled={isProcessing} className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center hover:bg-indigo-500 transition-all disabled:opacity-20 shadow-lg shadow-indigo-600/20">
                <Send size={18} className="text-white" />
             </button>
          </div>

        </div>
      </main>
    </div>
  );
}
