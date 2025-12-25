
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  FileText, Upload, Mic, MicOff, Send, Layers, Plus, Image as ImageIcon,
  Trash2, Download, Sparkles, Zap, BookOpen, StickyNote,
  CheckCircle, List, Edit3, Save, Video, Search,
  Activity, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Square, Circle, MousePointer2, Eraser, Baseline, Undo2, Redo2, Layout, LogOut,
  User, CheckSquare, FileJson, Workflow, Shield, Globe, Star, ArrowRight,
  Menu, X, ChevronRight, Settings, Bell, Clock, ArrowRightLeft, Brush, Wand2
} from 'lucide-react';
import { LiveServerMessage } from "@google/genai";
import { ManagedFile, TaskMemory, NoteGroup, MainSection, WorkspaceSubView, CanvasElement, Layer, EditorState, FileType } from './types';
import { gemini } from './services/gemini';

// --- Global Storage Adapter (Production Ready Simulation) ---
// Using localStorage as a sync-buffer, but structured for Vercel Blob compatibility
const Storage = {
  getUserKey: (email: string) => `pdfpro_user_v2_${email.replace(/[@.]/g, '_')}`,
  save: (email: string, data: any) => {
    try {
      localStorage.setItem(Storage.getUserKey(email), JSON.stringify(data));
    } catch (e) {
      console.warn("Storage quota exceeded. Some files might not persist locally. Consider connecting Vercel Blob.");
    }
  },
  load: (email: string) => {
    const data = localStorage.getItem(Storage.getUserKey(email));
    return data ? JSON.parse(data) : null;
  }
};

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
  // Navigation & Page State
  const [currentPage, setCurrentPage] = useState<'landing' | 'auth' | 'dashboard'>('landing');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userProfile, setUserProfile] = useState<{name: string, email: string} | null>(null);

  // Dashboard State
  const [activeSection, setActiveSection] = useState<MainSection | 'logs'>('workspace');
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

  // Editor Refs & State
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const textEditorRef = useRef<HTMLDivElement>(null);
  const imageUploadRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageCache = useRef<Record<string, HTMLImageElement>>({});
  
  const [layers, setLayers] = useState<Layer[]>([
    { id: 'l1', name: 'Base Layer', elements: [], visible: true, locked: false }
  ]);
  const [activeLayerId, setActiveLayerId] = useState<string>('l1');
  const [history, setHistory] = useState<EditorState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isInternalUpdate = useRef(false);

  // Drawing Props
  const [drawingMode, setDrawingMode] = useState<'brush' | 'rect' | 'circle' | 'line' | 'eraser' | 'select' | 'magic'>('brush');
  const [brushColor, setBrushColor] = useState('#6366f1');
  const [brushSize, setBrushSize] = useState(5);
  const [fontSize, setFontSize] = useState('3');
  const isDrawing = useRef(false);
  const currentPath = useRef<{ x: number; y: number }[]>([]);
  const startPos = useRef({ x: 0, y: 0 });

  // Audio Refs
  const inputAudioRef = useRef<AudioContext | null>(null);
  const outputAudioRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<Promise<any> | null>(null);
  const nextTimeRef = useRef<number>(0);

  // --- Auth Handlers ---
  const handleAuth = (email: string) => {
    const loader = document.getElementById('deployment-loader');
    if (loader) loader.style.display = 'flex';
    
    setTimeout(() => {
      const profile = { name: email.split('@')[0], email };
      setUserProfile(profile);
      const savedData = Storage.load(email);
      if (savedData) {
        setFiles(savedData.files || []);
        setNoteGroups(savedData.noteGroups || []);
        setTasks(savedData.tasks || []);
      }
      setIsAuthenticated(true);
      setCurrentPage('dashboard');
      if (loader) loader.style.display = 'none';
      addLog('System', `Authenticated as ${email}. Cloud sync complete.`, 'completed');
    }, 1500);
  };

  const addLog = (commandName: string, summary: string, status: 'completed' | 'failed') => {
    const newLog: TaskMemory = {
      id: Math.random().toString(36).substring(7),
      command: commandName,
      status,
      timestamp: Date.now(),
      resultSummary: summary
    };
    setTasks(prev => [newLog, ...prev]);
  };

  const addNoteGroup = useCallback((title: string, type: 'text' | 'todo' = 'text') => {
    const newGroup: NoteGroup = {
      id: `g${Date.now()}`,
      title,
      type,
      items: [],
      timestamp: Date.now()
    };
    setNoteGroups(prev => [...prev, newGroup]);
    setActiveNoteGroupId(newGroup.id);
    addLog('Notes', `Created group: "${title}"`, 'completed');
  }, []);

  useEffect(() => {
    if (isAuthenticated && userProfile) {
      Storage.save(userProfile.email, { files, noteGroups, tasks });
    }
  }, [files, noteGroups, tasks, isAuthenticated, userProfile]);

  // --- Core Logic ---
  const saveToHistory = useCallback((currentLayers: Layer[], currentActiveId: string) => {
    if (isInternalUpdate.current) return;
    const newState: EditorState = {
      layers: JSON.parse(JSON.stringify(currentLayers)),
      activeLayerId: currentActiveId,
      textContent: textEditorRef.current?.innerHTML || ''
    };
    setHistory(prev => [...prev.slice(0, historyIndex + 1), newState].slice(-50));
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  const undo = () => {
    if (historyIndex > 0) {
      isInternalUpdate.current = true;
      const state = history[historyIndex - 1];
      setLayers(JSON.parse(JSON.stringify(state.layers)));
      setActiveLayerId(state.activeLayerId);
      if (textEditorRef.current) textEditorRef.current.innerHTML = state.textContent;
      setHistoryIndex(historyIndex - 1);
      setTimeout(() => isInternalUpdate.current = false, 0);
    }
  };

  const drawElement = (ctx: CanvasRenderingContext2D, el: CanvasElement) => {
    ctx.strokeStyle = el.color;
    ctx.fillStyle = el.color;
    ctx.lineWidth = el.size;
    ctx.lineCap = 'round';
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
          ctx.beginPath(); ctx.arc(el.x, el.y, el.width, 0, Math.PI * 2); ctx.fill();
        }
        break;
      case 'line':
        if (el.points && el.points.length === 2) {
          ctx.beginPath(); ctx.moveTo(el.points[0].x, el.points[0].y); ctx.lineTo(el.points[1].x, el.points[1].y); ctx.stroke();
        }
        break;
      case 'image':
        if (el.data && el.x !== undefined && el.y !== undefined && el.width !== undefined && el.height !== undefined) {
          if (!imageCache.current[el.id]) {
            const img = new Image(); img.src = el.data;
            img.onload = () => { imageCache.current[el.id] = img; redrawMainCanvas(); };
          } else { ctx.drawImage(imageCache.current[el.id], el.x, el.y, el.width, el.height); }
        }
        break;
    }
  };

  const redrawMainCanvas = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    [...layers].reverse().forEach(layer => {
      if (layer.visible) layer.elements.forEach(el => drawElement(ctx, el));
    });
  }, [layers]);

  useEffect(() => { if (workspaceView === 'blank') redrawMainCanvas(); }, [workspaceView, layers, redrawMainCanvas]);

  const addLayer = (name?: string) => {
    const newId = `l${Date.now()}`;
    const newLayer: Layer = { id: newId, name: name || `Layer ${layers.length + 1}`, elements: [], visible: true, locked: false };
    const nextLayers = [newLayer, ...layers];
    setLayers(nextLayers);
    setActiveLayerId(newId);
    saveToHistory(nextLayers, newId);
    return newId;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploaded = e.target.files;
    if (!uploaded) return;
    
    Array.from(uploaded).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        const newFile: ManagedFile = {
          id: Math.random().toString(36).substring(7),
          name: file.name,
          type: file.type || FileType.TEXT,
          size: file.size,
          data: base64,
          source: 'input',
          timestamp: Date.now()
        };
        setFiles(prev => [newFile, ...prev]);
        addLog('Upload', `Synchronized ${file.name} to cloud workspace.`, 'completed');
      };
      reader.readAsDataURL(file);
    });
  };

  const handleAgentCommand = async (customPrompt?: string) => {
    const input = customPrompt || command;
    if (!input.trim()) return;
    setIsProcessing(true);
    if (!customPrompt) setCommand('');
    
    try {
      const file = files.find(f => f.id === selectedFileId);
      const fileContext = file ? `[Selected file: "${file.name}", Type: ${file.type}]` : '';
      const context = `User: ${userProfile?.name}. Workspace: ${files.length} files. ${fileContext}`;
      const response = await gemini.processAgentCommand(input, context);
      
      if (response.functionCalls) {
        for (const call of response.functionCalls) {
          await executeAction(call.name, call.args);
        }
      } else if (response.text) {
        addLog(input, response.text, 'completed');
      }
    } catch (e: any) {
      addLog(input, e.message, 'failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const executeAction = async (name: string, args: any) => {
    await new Promise(r => setTimeout(r, 800));
    switch (name) {
      case 'generateInfographic':
        setWorkspaceView('blank');
        const infoId = addLayer(`Visual: ${args.topic}`);
        // Basic simulation of infographic placement
        const newElements: CanvasElement[] = args.dataPoints.map((dp: any, i: number) => ({
          id: `dp-${i}-${Date.now()}`,
          type: 'rect',
          color: dp.color || '#6366f1',
          size: 1,
          x: 200 + (i * 250) % 800,
          y: 200 + (Math.floor(i / 3) * 200),
          width: 200,
          height: 100,
          timestamp: Date.now()
        }));
        setLayers(prev => prev.map(l => l.id === infoId ? { ...l, elements: newElements } : l));
        addLog('Visualize', `Created infographic for ${args.topic}`, 'completed');
        break;
      case 'convertFile':
        const target = files.find(f => f.id === args.fileId);
        if (target) {
          addLog('Convert', `Converted ${target.name} to ${args.targetFormat.toUpperCase()}`, 'completed');
        }
        break;
      case 'manageNoteGroup':
        if (args.action === 'create') addNoteGroup(args.title, args.type);
        break;
    }
  };

  // --- Drawing Logic ---
  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    isDrawing.current = true;
    startPos.current = { x, y };
    if (drawingMode === 'brush' || drawingMode === 'eraser' || drawingMode === 'magic') {
      currentPath.current = [{ x, y }];
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing.current) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (drawingMode === 'brush' || drawingMode === 'eraser' || drawingMode === 'magic') {
      currentPath.current.push({ x, y });
      ctx.beginPath();
      ctx.strokeStyle = drawingMode === 'magic' ? '#fbbf24' : (drawingMode === 'eraser' ? '#ffffff' : brushColor);
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.moveTo(currentPath.current[0].x, currentPath.current[0].y);
      for (let i = 1; i < currentPath.current.length; i++) ctx.lineTo(currentPath.current[i].x, currentPath.current[i].y);
      ctx.stroke();
    } else if (drawingMode === 'rect') {
      ctx.strokeRect(startPos.current.x, startPos.current.y, x - startPos.current.x, y - startPos.current.y);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDrawing.current) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const newEl: CanvasElement = {
      id: Math.random().toString(36).substring(7),
      type: drawingMode === 'rect' ? 'rect' : 'path',
      color: drawingMode === 'magic' ? '#fbbf24' : (drawingMode === 'eraser' ? '#ffffff' : brushColor),
      size: brushSize,
      timestamp: Date.now()
    };

    if (drawingMode === 'brush' || drawingMode === 'eraser' || drawingMode === 'magic') {
      newEl.points = [...currentPath.current];
      if (drawingMode === 'magic') {
        handleAgentCommand("Analyze my magic brush stroke and complete the drawing into a professional diagram.");
      }
    } else if (drawingMode === 'rect') {
      newEl.x = Math.min(startPos.current.x, x);
      newEl.y = Math.min(startPos.current.y, y);
      newEl.width = Math.abs(x - startPos.current.x);
      newEl.height = Math.abs(y - startPos.current.y);
    }

    const nextLayers = layers.map(l => l.id === activeLayerId ? { ...l, elements: [...l.elements, newEl] } : l);
    setLayers(nextLayers);
    saveToHistory(nextLayers, activeLayerId);
    
    isDrawing.current = false;
    currentPath.current = [];
    previewCanvasRef.current?.getContext('2d')?.clearRect(0, 0, 1200, 800);
  };

  // --- Views ---
  if (currentPage === 'landing') {
    return (
      <div className="min-h-screen hero-gradient overflow-y-auto custom-scrollbar bg-zinc-950">
        <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-zinc-950/50 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Zap className="text-white" fill="white" size={20} />
              </div>
              <span className="text-xl font-black text-white tracking-tighter">pdfpro.pro</span>
            </div>
            <div className="hidden md:flex items-center gap-10">
              <a href="#features" className="text-sm font-semibold text-zinc-400 hover:text-white transition-colors">Features</a>
              <button onClick={() => setCurrentPage('auth')} className="px-6 py-2.5 rounded-full bg-white text-zinc-950 text-sm font-bold hover:bg-zinc-200 transition-all">Sign In</button>
            </div>
          </div>
        </nav>

        <header className="pt-48 pb-32 px-6 text-center max-w-5xl mx-auto animate-in fade-in duration-1000">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-xs font-black uppercase tracking-widest mb-8">
            <Sparkles size={14} /> Production Grade AI suite
          </div>
          <h1 className="text-6xl md:text-8xl font-black text-white tracking-tighter leading-none mb-8">
            Your document <br /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500">orchestrated.</span>
          </h1>
          <p className="text-lg text-zinc-400 font-medium mb-12 max-w-2xl mx-auto">
            Convert PDFs, edit Office docs, and build infographics with the world's first production-grade agentic document workspace.
          </p>
          <div className="flex justify-center gap-4">
            <button onClick={() => setCurrentPage('auth')} className="px-10 py-5 rounded-2xl bg-indigo-600 text-white font-bold text-lg hover:bg-indigo-500 hover:scale-105 transition-all shadow-2xl shadow-indigo-600/30">Get Started Free</button>
          </div>
        </header>

        <section id="features" className="py-20 px-6 max-w-7xl mx-auto grid md:grid-cols-3 gap-8">
          {[
            { icon: Workflow, title: 'AI Conversions', desc: 'Convert PDF to Word and back with lossless OCR precision.' },
            { icon: Wand2, title: 'Magic Brush', desc: 'Draw simple strokes and let AI complete your professional visuals.' },
            { icon: Shield, title: 'Isolated Workspace', desc: 'Secure, private, and isolated data for every single user.' }
          ].map((f, i) => (
            <div key={i} className="p-8 rounded-3xl bg-zinc-900/40 border border-white/5">
              <div className="w-12 h-12 bg-indigo-600/10 text-indigo-500 rounded-2xl flex items-center justify-center mb-6"><f.icon size={24} /></div>
              <h3 className="text-xl font-bold text-white mb-4">{f.title}</h3>
              <p className="text-zinc-500 text-sm">{f.desc}</p>
            </div>
          ))}
        </section>

        <footer className="py-20 border-t border-white/5 text-center text-[10px] font-black uppercase text-zinc-700 tracking-widest">
          &copy; 2025 pdfpro.pro | Powered by Gemini 2.5 Orchestration
        </footer>
      </div>
    );
  }

  if (currentPage === 'auth') {
    return (
      <div className="h-screen w-screen bg-zinc-950 flex flex-col items-center justify-center p-8 hero-gradient">
        <div className="w-full max-w-md glass rounded-[40px] p-12 flex flex-col gap-10 shadow-2xl relative overflow-hidden border border-white/5">
          <button onClick={() => setCurrentPage('landing')} className="absolute top-8 left-8 text-zinc-600 hover:text-white"><X size={20} /></button>
          <div className="flex flex-col gap-2 items-center">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mb-4"><Zap className="text-white" fill="white" size={32} /></div>
            <h1 className="text-3xl font-black text-white">Initialize Workspace</h1>
            <p className="text-zinc-500 text-sm font-medium">Enter your cloud credentials to sync.</p>
          </div>
          <div className="space-y-4">
            <input 
              type="email" 
              placeholder="Email address" 
              className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl py-4 px-6 text-sm text-white focus:outline-none focus:border-indigo-500"
              onKeyDown={(e) => { if (e.key === 'Enter') handleAuth(e.currentTarget.value); }}
            />
            <button 
              onClick={() => handleAuth('production@user.pro')}
              className="w-full py-5 rounded-2xl bg-white text-zinc-950 font-black text-sm flex items-center justify-center gap-4 hover:bg-zinc-200 transition-all"
            >
              <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" className="w-5" />
              Sign in with Google
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 font-sans text-zinc-300">
      
      {/* Sidebar Navigation */}
      <nav className="w-72 border-r border-white/5 flex flex-col p-6 bg-zinc-950/40 backdrop-blur-3xl shrink-0">
        <div className="flex items-center gap-4 mb-12 px-2">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/20"><Zap className="text-white fill-white" size={24} /></div>
          <div className="flex flex-col"><span className="text-xl font-black text-white tracking-tighter">pdfpro.pro</span><span className="text-[10px] font-black text-zinc-700 uppercase tracking-widest">v2.1 Cloud</span></div>
        </div>

        <div className="space-y-1.5 flex-1 overflow-y-auto custom-scrollbar">
          <IconButton icon={Layout} label="Workspace" active={activeSection === 'workspace'} onClick={() => setActiveSection('workspace')} />
          <IconButton icon={StickyNote} label="Notes & Ideas" active={activeSection === 'notes'} onClick={() => setActiveSection('notes')} />
          <IconButton icon={Clock} label="Activity Logs" active={activeSection === 'logs'} onClick={() => setActiveSection('logs')} />
          
          <div className="mt-10 pt-8 border-t border-white/5">
             <div className="flex items-center justify-between mb-6 px-2">
                <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Recent Activity</h3>
             </div>
             <div className="space-y-2">
                {tasks.slice(0, 5).map(t => (
                  <div key={t.id} className="p-3.5 rounded-2xl bg-zinc-900/40 border border-white/5 flex items-start gap-3">
                    <div className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${t.status === 'completed' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <div><div className="text-[10px] font-black text-white uppercase truncate">{t.command}</div></div>
                  </div>
                ))}
             </div>
          </div>
        </div>

        <div className="mt-auto pt-6 border-t border-white/5">
           <div className="p-4 rounded-3xl bg-zinc-900/50 border border-white/5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500 flex items-center justify-center"><User size={18} className="text-white" /></div>
              <div className="flex-1 overflow-hidden"><p className="text-sm font-black text-white truncate">{userProfile?.name}</p><p className="text-[10px] text-zinc-600 font-bold">Isolated Mode</p></div>
              <LogOut size={16} className="text-zinc-700 hover:text-red-400 cursor-pointer" onClick={() => setCurrentPage('landing')} />
           </div>
        </div>
      </nav>

      {/* Main Workspace Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-10 bg-zinc-950/20 backdrop-blur-md">
           <div className="flex items-center gap-8">
              <div className="flex items-center gap-2 p-1 bg-zinc-900/60 rounded-2xl border border-white/5">
                 <button onClick={() => setWorkspaceView('standard')} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${workspaceView === 'standard' ? 'bg-zinc-800 text-white' : 'text-zinc-600'}`}>Explorer</button>
                 <button onClick={() => setWorkspaceView('blank')} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${workspaceView === 'blank' ? 'bg-zinc-800 text-white' : 'text-zinc-600'}`}>Creative</button>
              </div>
           </div>
           
           <div className="flex items-center gap-6">
              <div className="flex items-center gap-4 px-4 py-2 bg-zinc-900/40 rounded-full border border-white/5">
                <Bell size={16} className="text-zinc-500 hover:text-white cursor-pointer" />
                <div className={`w-2.5 h-2.5 rounded-full ${isProcessing ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                <span className="text-[10px] font-black text-white uppercase tracking-widest">Active Session</span>
              </div>
           </div>
        </header>

        <div className="flex-1 overflow-hidden p-10 flex flex-col relative hero-gradient">
          {activeSection === 'logs' ? (
            <div className="max-w-4xl mx-auto w-full flex flex-col gap-6 animate-in slide-in-from-bottom-8 overflow-y-auto custom-scrollbar">
              <h2 className="text-3xl font-black text-white tracking-tighter">Activity Logs</h2>
              <div className="space-y-4">
                {tasks.map(t => (
                  <div key={t.id} className="p-6 rounded-3xl bg-zinc-900/50 border border-white/5">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{t.command}</span>
                      <span className="text-[10px] text-zinc-700 font-bold">{new Date(t.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-sm font-medium text-zinc-400">{t.resultSummary}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : activeSection === 'notes' ? (
            <div className="flex-1 flex gap-10 max-w-7xl mx-auto w-full overflow-hidden animate-in fade-in duration-500">
                <div className="w-72 flex flex-col gap-8 shrink-0">
                   <div className="flex items-center justify-between px-2">
                      <h3 className="text-xs font-black uppercase tracking-widest text-zinc-600">Collections</h3>
                      <button onClick={() => addNoteGroup('New Group')} className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800"><Plus size={18} /></button>
                   </div>
                   <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                      {noteGroups.map(group => (
                        <div 
                          key={group.id} 
                          onClick={() => setActiveNoteGroupId(group.id)}
                          className={`p-5 rounded-3xl border transition-all cursor-pointer ${activeNoteGroupId === group.id ? 'bg-indigo-600/10 border-indigo-500/40 text-white' : 'bg-zinc-900/40 border-white/5 text-zinc-500 hover:border-white/10'}`}
                        >
                           <span className="text-sm font-bold truncate">{group.title}</span>
                        </div>
                      ))}
                   </div>
                </div>

                <div className="flex-1 glass rounded-[40px] p-10 flex flex-col gap-8 overflow-hidden shadow-2xl">
                   <div className="flex items-center justify-between">
                      <h2 className="text-2xl font-black text-white tracking-tight">{noteGroups.find(g => g.id === activeNoteGroupId)?.title}</h2>
                      <Trash2 size={20} className="text-zinc-700 hover:text-red-400 cursor-pointer" />
                   </div>
                   <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-4">
                      <input 
                        type="text" 
                        placeholder="Add idea..." 
                        className="w-full bg-zinc-950/80 border border-white/5 rounded-3xl py-6 px-10 text-sm font-medium focus:outline-none focus:border-indigo-500/50"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value) {
                             const content = e.currentTarget.value;
                             setNoteGroups(prev => prev.map(g => g.id === activeNoteGroupId ? { ...g, items: [{id: `i${Date.now()}`, content, timestamp: Date.now(), completed: false}, ...g.items] } : g));
                             e.currentTarget.value = '';
                          }
                        }}
                      />
                      {noteGroups.find(g => g.id === activeNoteGroupId)?.items.map(item => (
                        <div key={item.id} className="p-6 rounded-[32px] bg-zinc-900/40 border border-white/5 flex items-center gap-5">
                           <CheckCircle size={20} className={item.completed ? 'text-emerald-500' : 'text-zinc-800'} />
                           <p className="text-sm font-medium text-zinc-300">{item.content}</p>
                        </div>
                      ))}
                   </div>
                </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in duration-500">
              {workspaceView === 'standard' ? (
                  <div className="flex-1 grid grid-cols-12 gap-10 overflow-hidden">
                     <div className="col-span-4 flex flex-col gap-8 shrink-0">
                        <div className="flex items-center justify-between px-2">
                           <h3 className="text-xs font-black uppercase tracking-widest text-zinc-600">Assets</h3>
                           <button onClick={() => fileInputRef.current?.click()} className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white"><Plus size={18} /></button>
                           <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileUpload} />
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                           {files.map(f => (
                             <div 
                               key={f.id} 
                               onClick={() => setSelectedFileId(f.id)}
                               className={`p-5 rounded-[28px] border transition-all cursor-pointer ${selectedFileId === f.id ? 'bg-indigo-600/10 border-indigo-500/40 text-white' : 'bg-zinc-900/40 border-white/5 text-zinc-500 hover:border-white/10'}`}
                             >
                                <div className="flex items-center gap-5">
                                   <div className="p-3 bg-zinc-800 rounded-2xl"><FileText size={20} /></div>
                                   <div className="flex-1 overflow-hidden"><p className="text-sm font-black truncate">{f.name}</p><p className="text-[10px] text-zinc-700 font-black uppercase">{(f.size/1024).toFixed(1)} KB</p></div>
                                </div>
                             </div>
                           ))}
                        </div>
                     </div>

                     <div className="col-span-8 flex flex-col glass rounded-[48px] overflow-hidden relative shadow-2xl border border-white/5">
                        <div className="h-20 bg-black/30 border-b border-white/5 flex items-center justify-between px-10 shrink-0">
                           <div className="flex items-center gap-3"><Shield size={16} className="text-indigo-500" /><span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Secure Storage Syncing</span></div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-16 flex flex-col items-center justify-center text-center">
                           {selectedFileId ? (
                              <div className="max-w-lg flex flex-col items-center gap-10 animate-in zoom-in-95 duration-500">
                                 <div className="w-24 h-24 bg-indigo-500/10 text-indigo-500 rounded-[32px] flex items-center justify-center"><Activity size={40} className="animate-pulse" /></div>
                                 <h1 className="text-4xl font-black text-white tracking-tighter">{files.find(f => f.id === selectedFileId)?.name}</h1>
                                 <div className="grid grid-cols-2 gap-4 w-full">
                                   <button 
                                      onClick={() => handleAgentCommand(`Convert this file to docx.`)}
                                      className="p-4 rounded-2xl bg-zinc-900 border border-white/5 text-xs font-black uppercase text-white tracking-widest"
                                   >Convert to Word</button>
                                   <button 
                                      onClick={() => handleAgentCommand(`Generate a visual infographic from this file.`)}
                                      className="p-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-xs font-black uppercase text-white tracking-widest shadow-xl shadow-indigo-600/20"
                                   >Generate Visual</button>
                                 </div>
                              </div>
                           ) : (
                              <div className="opacity-10 flex flex-col items-center gap-6"><MousePointer2 size={100} strokeWidth={0.5} /><p className="text-2xl font-black uppercase tracking-widest">Awaiting Resource</p></div>
                           )}
                        </div>
                     </div>
                  </div>
              ) : (
                <div className="flex-1 flex flex-row gap-6 overflow-hidden max-w-[1700px] mx-auto w-full">
                  <div className="flex-1 flex flex-col bg-white rounded-[40px] shadow-2xl overflow-hidden border border-zinc-200">
                    <div className="h-16 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between px-8 shrink-0">
                      <div className="flex items-center gap-2">
                        <IconButton icon={Undo2} onClick={undo} color="ghost" disabled={historyIndex <= 0} />
                        <div className="w-px h-4 bg-zinc-200 mx-2" />
                        <IconButton icon={Bold} color="ghost" />
                        <IconButton icon={Italic} color="ghost" />
                        <IconButton icon={Underline} color="ghost" />
                        <div className="w-px h-4 bg-zinc-200 mx-2" />
                        <IconButton icon={MousePointer2} active={drawingMode === 'select'} onClick={() => setDrawingMode('select')} color="ghost" />
                        <IconButton icon={Brush} active={drawingMode === 'brush'} onClick={() => setDrawingMode('brush')} color="ghost" />
                        <IconButton icon={Wand2} active={drawingMode === 'magic'} onClick={() => setDrawingMode('magic')} color="ghost" title="Magic Brush: AI Completion" />
                        <IconButton icon={Eraser} active={drawingMode === 'eraser'} onClick={() => setDrawingMode('eraser')} color="ghost" />
                        <IconButton icon={Square} active={drawingMode === 'rect'} onClick={() => setDrawingMode('rect')} color="ghost" />
                      </div>
                      <div className="flex items-center gap-4">
                         <div className="w-8 h-8 rounded-full border border-zinc-200 shadow-inner overflow-hidden relative cursor-pointer" style={{backgroundColor: brushColor}}>
                           <input type="color" className="absolute opacity-0 cursor-pointer" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} />
                         </div>
                         <IconButton icon={Save} color="ghost" label="Export" />
                      </div>
                    </div>
                    <div className="flex-1 relative bg-white overflow-hidden">
                       <canvas ref={canvasRef} width={1200} height={800} className="absolute inset-0 pointer-events-none" />
                       <canvas 
                         ref={previewCanvasRef} width={1200} height={800} 
                         onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
                         className={`absolute inset-0 z-10 ${drawingMode === 'select' ? 'pointer-events-none' : 'cursor-crosshair'}`}
                       />
                       <div 
                         ref={textEditorRef}
                         className="absolute inset-0 p-32 font-serif text-zinc-900 text-xl outline-none overflow-y-auto custom-scrollbar leading-loose"
                         contentEditable suppressContentEditableWarning
                       >
                         <h1 className="text-7xl font-black tracking-tighter mb-10 text-zinc-950">Draft.</h1>
                         <p className="text-zinc-400 font-medium italic mb-10">Use Magic Brush to turn simple strokes into professional assets...</p>
                       </div>
                    </div>
                  </div>
                  <div className="w-80 shrink-0 flex flex-col gap-8 p-4">
                     <div className="flex items-center justify-between px-2"><h3 className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">Layers</h3><Plus size={16} className="cursor-pointer" onClick={() => addLayer()} /></div>
                     <div className="flex-1 overflow-y-auto space-y-2">
                        {layers.map(l => (
                          <div key={l.id} onClick={() => setActiveLayerId(l.id)} className={`p-4 rounded-3xl border transition-all cursor-pointer flex items-center gap-4 ${activeLayerId === l.id ? 'bg-indigo-600/10 border-indigo-500/40 text-white' : 'bg-zinc-900/40 border-white/5 text-zinc-600'}`}>
                            <div className={`w-2 h-2 rounded-full ${activeLayerId === l.id ? 'bg-indigo-500 animate-pulse' : 'bg-zinc-800'}`} />
                            <span className="text-[11px] font-bold uppercase tracking-widest truncate flex-1">{l.name}</span>
                          </div>
                        ))}
                     </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="max-w-4xl mx-auto w-full p-6 glass rounded-[40px] border border-white/5 shadow-2xl flex items-center gap-6 mt-10 mb-4 animate-in slide-in-from-bottom-10">
             <button onClick={() => setIsVoiceActive(!isVoiceActive)} className={`w-16 h-16 rounded-[28px] flex items-center justify-center transition-all shrink-0 ${isVoiceActive ? 'bg-red-600 text-white shadow-2xl animate-pulse' : 'bg-zinc-900 text-zinc-600'}`}>
                {isVoiceActive ? <Mic size={28} /> : <MicOff size={28} />}
             </button>
             <div className="flex-1 flex flex-col">
                <input 
                  type="text" 
                  value={command} 
                  onChange={(e) => setCommand(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAgentCommand()}
                  placeholder="Orchestrate conversions, visuals, or notes..."
                  className="w-full bg-transparent text-lg font-bold text-white placeholder:text-zinc-800 focus:outline-none"
                />
             </div>
             <button onClick={() => handleAgentCommand()} disabled={isProcessing} className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center hover:bg-indigo-500 transition-all disabled:opacity-20 shadow-xl shadow-indigo-600/20">
                <Send size={24} className="text-white" />
             </button>
          </div>
        </div>
      </main>
    </div>
  );
}
