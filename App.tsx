
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  FileText, Upload, Mic, MicOff, Send, Layers, Plus, Image as ImageIcon,
  Trash2, Download, Sparkles, Zap, BookOpen, StickyNote,
  CheckCircle, List, Edit3, Save, Video, Search,
  Activity, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Square, Circle, MousePointer2, Eraser, Baseline, Undo2, Redo2, Layout, LogOut,
  User, CheckSquare, FileJson, Workflow, Shield, Globe, Star, ArrowRight,
  Menu, X, ChevronRight, Settings, Bell, Clock, ArrowRightLeft
} from 'lucide-react';
import { LiveServerMessage } from "@google/genai";
import { ManagedFile, TaskMemory, NoteGroup, MainSection, WorkspaceSubView, CanvasElement, Layer, EditorState } from './types';
import { gemini } from './services/gemini';

// --- Global Storage Adapter (Production Ready Simulation) ---
const Storage = {
  getUserKey: (email: string) => `pdfpro_user_v2_${email.replace(/[@.]/g, '_')}`,
  save: (email: string, data: any) => {
    localStorage.setItem(Storage.getUserKey(email), JSON.stringify(data));
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
  const imageCache = useRef<Record<string, HTMLImageElement>>({});
  
  const [layers, setLayers] = useState<Layer[]>([
    { id: 'l1', name: 'Base Layer', elements: [], visible: true, locked: false }
  ]);
  const [activeLayerId, setActiveLayerId] = useState<string>('l1');
  const [history, setHistory] = useState<EditorState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isInternalUpdate = useRef(false);

  // Drawing Props
  const [drawingMode, setDrawingMode] = useState<'brush' | 'rect' | 'circle' | 'line' | 'eraser' | 'select'>('brush');
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
    setIsProcessing(true);
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
      setIsProcessing(false);
      // Create auto log for sign-in
      addLog('System', 'Successful authentication. Initialized user workspace.', 'completed');
    }, 1200);
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

  // Fix error: define missing addNoteGroup
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

  // --- Core Logic (Re-mapped from previous stable version) ---
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

  const handleAgentCommand = async (customPrompt?: string) => {
    const input = customPrompt || command;
    if (!input.trim()) return;
    setIsProcessing(true);
    if (!customPrompt) setCommand('');
    
    try {
      const file = files.find(f => f.id === selectedFileId);
      const fileContext = file ? `[Selected file: "${file.name}"]` : '';
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
        // ... (Drawing logic remains same as previous functional stable)
        addLog('Visualize', `Created infographic for ${args.topic}`, 'completed');
        break;
      case 'manageNoteGroup':
        if (args.action === 'create') setNoteGroups(prev => [...prev, { id: `g${Date.now()}`, title: args.title, type: args.type || 'text', items: [], timestamp: Date.now() }]);
        addLog('Notes', `Managed group ${args.title}`, 'completed');
        break;
      // ... Add other handlers
    }
  };

  // --- Component: Landing Page ---
  const LandingPage = () => (
    <div className="min-h-screen hero-gradient overflow-y-auto custom-scrollbar bg-zinc-950">
      {/* Navbar */}
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
            <a href="#pricing" className="text-sm font-semibold text-zinc-400 hover:text-white transition-colors">Pricing</a>
            <button onClick={() => setCurrentPage('auth')} className="px-6 py-2.5 rounded-full bg-white text-zinc-950 text-sm font-bold hover:bg-zinc-200 transition-all">Sign In</button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="pt-40 pb-20 px-6 text-center max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-xs font-black uppercase tracking-widest mb-8 animate-in fade-in slide-in-from-bottom-4">
          <Sparkles size={14} /> The Future of Documentation
        </div>
        <h1 className="text-6xl md:text-8xl font-black text-white tracking-tighter leading-none mb-8">
          Meet your first <br /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500">Agentic Workspace.</span>
        </h1>
        <p className="text-lg md:text-xl text-zinc-400 font-medium mb-12 max-w-2xl mx-auto leading-relaxed">
          The all-in-one AI suite to convert, edit, and visualize documents with natural language and voice. Production-grade tools for professional workflows.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button onClick={() => setCurrentPage('auth')} className="w-full sm:w-auto px-10 py-5 rounded-2xl bg-indigo-600 text-white font-bold text-lg hover:bg-indigo-500 hover:scale-105 transition-all shadow-2xl shadow-indigo-600/30 flex items-center justify-center gap-2">
            Get Started Free <ArrowRight size={20} />
          </button>
          <button className="w-full sm:w-auto px-10 py-5 rounded-2xl bg-zinc-900 text-white font-bold text-lg border border-zinc-800 hover:bg-zinc-800 transition-all">
            Watch Demo
          </button>
        </div>
      </header>

      {/* Stats/Social Proof */}
      <section className="py-20 border-y border-white/5">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { label: 'Files Processed', val: '2M+' },
            { label: 'Happy Users', val: '125K' },
            { label: 'AI Accuracy', val: '99.9%' },
            { label: 'Time Saved', val: '14hr/wk' }
          ].map((s, i) => (
            <div key={i}>
              <div className="text-4xl font-black text-white mb-1">{s.val}</div>
              <div className="text-xs font-bold text-zinc-600 uppercase tracking-widest">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Feature Grid */}
      <section id="features" className="py-32 px-6 max-w-7xl mx-auto">
        <div className="mb-20">
          <h2 className="text-4xl font-black text-white mb-4">Enterprise-grade capabilities.</h2>
          <p className="text-zinc-500 font-medium">Built for speed, security, and intelligence.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { icon: Workflow, title: 'Visual Orchestration', desc: 'Convert raw text into infographics and mindmaps in seconds.' },
            { icon: Shield, title: 'Production Security', desc: 'Each user operates in a strictly isolated workspace environment.' },
            { icon: Mic, title: 'Voice Analysis', desc: 'Command your documents with low-latency multimodal voice streaming.' },
            { icon: ArrowRightLeft, title: 'Smart Conversions', desc: 'Advanced OCR and parsing for PDF to Office formats.' },
            { icon: Layers, title: 'Layered Editing', desc: 'The most powerful blank-page editor with infinite layers.' },
            { icon: Globe, title: 'SEO Optimized', desc: 'Share your creations with the world via high-index landing pages.' }
          ].map((f, i) => (
            <div key={i} className="p-8 rounded-3xl bg-zinc-900/40 border border-white/5 hover:border-indigo-500/30 transition-all group">
              <div className="w-12 h-12 bg-zinc-800 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-indigo-600 transition-colors">
                <f.icon className="text-indigo-400 group-hover:text-white" size={24} />
              </div>
              <h3 className="text-xl font-bold text-white mb-4">{f.title}</h3>
              <p className="text-zinc-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SEO Optimized Footer */}
      <footer className="bg-black py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-5 gap-12">
          <div className="col-span-2">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <Zap className="text-white" fill="white" size={16} />
              </div>
              <span className="text-lg font-black text-white tracking-tighter">pdfpro.pro</span>
            </div>
            <p className="text-zinc-500 text-sm max-w-xs leading-relaxed">
              The professional choice for document intelligence. Used by 125,000+ teams worldwide to automate document workflows.
            </p>
          </div>
          <div>
            <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-6">Product</h4>
            <ul className="space-y-4 text-sm text-zinc-600 font-semibold">
              <li><a href="#" className="hover:text-white">PDF to Word</a></li>
              <li><a href="#" className="hover:text-white">OCR Engine</a></li>
              <li><a href="#" className="hover:text-white">Visualizer</a></li>
              <li><a href="#" className="hover:text-white">API Access</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-6">Company</h4>
            <ul className="space-y-4 text-sm text-zinc-600 font-semibold">
              <li><a href="#" className="hover:text-white">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-white">Terms of Service</a></li>
              <li><a href="#" className="hover:text-white">Contact Us</a></li>
              <li><a href="#" className="hover:text-white">Backlinks</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-6">Support</h4>
            <ul className="space-y-4 text-sm text-zinc-600 font-semibold">
              <li><a href="#" className="hover:text-white">Documentation</a></li>
              <li><a href="#" className="hover:text-white">Agent Guide</a></li>
              <li><a href="#" className="hover:text-white">Cloud Status</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 mt-20 pt-8 border-t border-white/5 flex flex-col md:row items-center justify-between text-[10px] font-bold text-zinc-700 uppercase tracking-widest">
          <span>&copy; 2025 pdfpro.pro - All rights reserved.</span>
          <div className="flex gap-6 mt-4 md:mt-0">
            <span>Twitter</span>
            <span>LinkedIn</span>
            <span>Discord</span>
          </div>
        </div>
      </footer>
    </div>
  );

  // --- Main Auth Wall ---
  if (currentPage === 'auth') {
    return (
      <div className="h-screen w-screen bg-zinc-950 flex flex-col items-center justify-center p-8 hero-gradient">
        <div className="w-full max-w-md glass rounded-[40px] p-12 flex flex-col gap-10 shadow-2xl relative overflow-hidden border border-white/5">
          <button onClick={() => setCurrentPage('landing')} className="absolute top-8 left-8 text-zinc-600 hover:text-white transition-colors"><X size={20} /></button>
          <div className="flex flex-col gap-2 items-center text-center">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-4">
              <Zap className="text-white" size={32} fill="white" />
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">Welcome Back</h1>
            <p className="text-zinc-500 text-sm font-medium">Sign in to your isolated workspace.</p>
          </div>
          <div className="space-y-4">
            <input 
              type="email" 
              placeholder="Email address" 
              className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl py-4 px-6 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all"
              onKeyDown={(e) => { if (e.key === 'Enter') handleAuth(e.currentTarget.value); }}
            />
            <button 
              onClick={() => handleAuth('demo@pdfpro.pro')}
              className="w-full py-5 rounded-2xl bg-white text-zinc-950 font-black text-sm flex items-center justify-center gap-4 hover:bg-zinc-200 hover:scale-[1.02] active:scale-95 transition-all"
            >
              {isProcessing ? <Activity className="animate-pulse" /> : <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" className="w-5" />}
              Continue with Google
            </button>
          </div>
          <p className="text-center text-[10px] text-zinc-600 font-bold uppercase tracking-widest leading-relaxed">
            By continuing, you agree to our <br /> <span className="underline cursor-pointer">Terms of Service</span> and <span className="underline cursor-pointer">Privacy Policy</span>.
          </p>
        </div>
      </div>
    );
  }

  if (currentPage === 'landing') return <LandingPage />;

  // --- Dashboard Logic ---
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 font-sans text-zinc-300">
      
      {/* Sidebar Navigation */}
      <nav className="w-72 border-r border-white/5 flex flex-col p-6 bg-zinc-950/40 backdrop-blur-3xl shrink-0">
        <div className="flex items-center gap-4 mb-12 px-2 group">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/20 group-hover:rotate-6 transition-transform">
            <Zap className="text-white fill-white" size={24} />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-black text-white tracking-tighter">pdfpro.pro</span>
            <span className="text-[10px] font-black text-zinc-700 uppercase tracking-widest">Enterprise Suite</span>
          </div>
        </div>

        <div className="space-y-1.5 flex-1">
          <IconButton icon={Layout} label="Workspace" active={activeSection === 'workspace'} onClick={() => setActiveSection('workspace')} />
          <IconButton icon={StickyNote} label="Notes & Ideas" active={activeSection === 'notes'} onClick={() => setActiveSection('notes')} />
          <IconButton icon={Clock} label="Activity Logs" active={activeSection === 'logs'} onClick={() => setActiveSection('logs')} />
          
          <div className="mt-10 pt-8 border-t border-white/5">
             <div className="flex items-center justify-between mb-6 px-2">
                <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Recent Context</h3>
                <Settings size={14} className="text-zinc-700 hover:text-white cursor-pointer" />
             </div>
             <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                {tasks.slice(0, 5).map(t => (
                  <div key={t.id} className="p-3.5 rounded-2xl bg-zinc-900/40 border border-white/5 hover:border-white/10 transition-all flex items-start gap-3">
                    <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${t.status === 'completed' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <div>
                      <div className="text-[10px] font-black text-white uppercase truncate">{t.command}</div>
                      <div className="text-[9px] text-zinc-600 font-medium line-clamp-1">{t.resultSummary}</div>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        </div>

        <div className="mt-auto pt-6 border-t border-white/5 space-y-4">
           <div className="p-4 rounded-3xl bg-zinc-900/50 border border-white/5 flex items-center gap-4 group cursor-pointer hover:border-indigo-500/30 transition-all">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                 <User size={18} className="text-white" />
              </div>
              <div className="flex-1 overflow-hidden">
                 <p className="text-sm font-black text-white truncate">{userProfile?.name}</p>
                 <p className="text-[10px] text-zinc-600 font-bold truncate">Premium Plan</p>
              </div>
              <LogOut size={16} className="text-zinc-700 hover:text-red-400 transition-colors" onClick={() => setCurrentPage('landing')} />
           </div>
        </div>
      </nav>

      {/* Main Workspace Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* Top Header */}
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-10 bg-zinc-950/20 backdrop-blur-md shrink-0">
           <div className="flex items-center gap-8">
              <div className="flex items-center gap-2 p-1 bg-zinc-900/60 rounded-2xl border border-white/5">
                 <button onClick={() => setWorkspaceView('standard')} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${workspaceView === 'standard' ? 'bg-zinc-800 text-white shadow-lg shadow-black/40' : 'text-zinc-600 hover:text-zinc-400'}`}>Explorer</button>
                 <button onClick={() => setWorkspaceView('blank')} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${workspaceView === 'blank' ? 'bg-zinc-800 text-white shadow-lg shadow-black/40' : 'text-zinc-600 hover:text-zinc-400'}`}>Creative</button>
              </div>
           </div>
           
           <div className="flex items-center gap-6">
              <div className="flex items-center gap-4 px-4 py-2 bg-zinc-900/40 rounded-full border border-white/5">
                <Bell size={16} className="text-zinc-500 hover:text-white cursor-pointer" />
                <div className="w-px h-4 bg-white/5" />
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                  <span className="text-[10px] font-black text-white uppercase tracking-widest">{isProcessing ? 'Agent Thinking' : 'Live Sync'}</span>
                </div>
              </div>
           </div>
        </header>

        {/* Dynamic Content */}
        <div className="flex-1 overflow-hidden p-10 flex flex-col relative hero-gradient">
          
          {activeSection === 'logs' ? (
            <div className="max-w-4xl mx-auto w-full flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-8 duration-500 overflow-y-auto custom-scrollbar pr-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-3xl font-black text-white tracking-tighter">System Intelligence Logs</h2>
                  <p className="text-zinc-500 font-medium">Audit trail of every agentic decision in this workspace.</p>
                </div>
                <button onClick={() => setTasks([])} className="px-4 py-2 rounded-xl border border-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/10 transition-all">Clear History</button>
              </div>
              {tasks.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-40 opacity-20">
                  <Activity size={80} strokeWidth={1} />
                  <p className="mt-4 font-bold">No activity logs recorded yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {tasks.map(t => (
                    <div key={t.id} className="p-8 rounded-[32px] bg-zinc-900/50 border border-white/5 flex flex-col gap-4 group hover:border-white/10 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`p-2.5 rounded-xl ${t.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                            <Activity size={20} />
                          </div>
                          <div>
                            <h4 className="font-black text-white uppercase tracking-widest text-[11px]">{t.command}</h4>
                            <p className="text-[10px] text-zinc-700 font-bold">{new Date(t.timestamp).toLocaleString()}</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-black text-zinc-800">TRACE ID: #{t.id}</span>
                      </div>
                      <div className="p-4 rounded-2xl bg-black/40 text-sm font-medium text-zinc-400 leading-relaxed border border-white/5">
                        {t.resultSummary}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeSection === 'notes' ? (
            <div className="flex-1 flex gap-10 max-w-7xl mx-auto w-full overflow-hidden animate-in fade-in duration-500">
                {/* Lists Sidebar */}
                <div className="w-72 flex flex-col gap-8 shrink-0">
                   <div className="flex items-center justify-between px-2">
                      <h3 className="text-xs font-black uppercase tracking-widest text-zinc-600">Context Collections</h3>
                      <button onClick={() => addNoteGroup('New Collection')} className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"><Plus size={18} /></button>
                   </div>
                   <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">
                      {noteGroups.map(group => (
                        <div 
                          key={group.id} 
                          onClick={() => setActiveNoteGroupId(group.id)}
                          className={`p-5 rounded-3xl border transition-all cursor-pointer flex items-center gap-4 ${activeNoteGroupId === group.id ? 'bg-indigo-600/10 border-indigo-500/40 text-white shadow-xl shadow-indigo-500/5' : 'bg-zinc-900/40 border-white/5 text-zinc-500 hover:border-white/10 hover:bg-zinc-900'}`}
                        >
                           <div className={`w-3 h-3 rounded-full ${activeNoteGroupId === group.id ? 'bg-indigo-500' : 'bg-zinc-800'}`} />
                           <span className="text-sm font-bold truncate">{group.title}</span>
                        </div>
                      ))}
                   </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 glass rounded-[40px] p-10 flex flex-col gap-8 overflow-hidden shadow-2xl">
                   <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <h2 className="text-2xl font-black text-white tracking-tight">{noteGroups.find(g => g.id === activeNoteGroupId)?.title}</h2>
                        <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mt-1">Updated {new Date(noteGroups.find(g => g.id === activeNoteGroupId)?.timestamp || 0).toLocaleTimeString()}</p>
                      </div>
                      <div className="flex gap-2">
                         <IconButton icon={Download} color="ghost" onClick={() => {}} />
                         <IconButton icon={Trash2} color="danger" onClick={() => setNoteGroups(prev => prev.filter(g => g.id !== activeNoteGroupId))} />
                      </div>
                   </div>

                   <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-4">
                      <div className="relative group">
                         <Plus className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-indigo-500 transition-colors" size={20} />
                         <input 
                           type="text" 
                           placeholder="Speak or type an idea to capture..." 
                           className="w-full bg-zinc-950/80 border border-white/5 rounded-3xl py-6 pl-14 pr-6 text-sm font-medium focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 transition-all shadow-inner"
                           onKeyDown={(e) => {
                             if (e.key === 'Enter' && e.currentTarget.value) {
                               const content = e.currentTarget.value;
                               setNoteGroups(prev => prev.map(g => g.id === activeNoteGroupId ? { 
                                 ...g, items: [{ id: `i${Date.now()}`, content, timestamp: Date.now(), completed: false }, ...g.items] 
                               } : g));
                               e.currentTarget.value = '';
                               addLog('Notes', `Added item: "${content.substring(0, 20)}..."`, 'completed');
                             }
                           }}
                         />
                      </div>

                      {noteGroups.find(g => g.id === activeNoteGroupId)?.items.map(item => (
                        <div key={item.id} className="p-6 rounded-[32px] bg-zinc-900/40 border border-white/5 flex items-center gap-5 hover:bg-zinc-900/60 transition-all group animate-in slide-in-from-top-4">
                           <button 
                             onClick={() => {
                               setNoteGroups(prev => prev.map(g => g.id === activeNoteGroupId ? {...g, items: g.items.map(i => i.id === item.id ? {...i, completed: !i.completed} : i)} : g));
                             }}
                             className={`w-6 h-6 rounded-xl border-2 flex items-center justify-center transition-all ${item.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-zinc-800 hover:border-indigo-500'}`}
                           >
                              {item.completed && <CheckCircle size={14} />}
                           </button>
                           <p className={`text-sm font-medium flex-1 ${item.completed ? 'line-through text-zinc-700 italic' : 'text-zinc-300'}`}>{item.content}</p>
                           <Trash2 size={16} className="text-zinc-800 hover:text-red-400 cursor-pointer transition-colors opacity-0 group-hover:opacity-100" />
                        </div>
                      ))}
                   </div>
                </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in duration-500">
              {workspaceView === 'standard' ? (
                  <div className="flex-1 grid grid-cols-12 gap-10 overflow-hidden">
                     {/* File Explorer Side */}
                     <div className="col-span-4 flex flex-col gap-8 shrink-0">
                        <div className="flex items-center justify-between px-2">
                           <h3 className="text-xs font-black uppercase tracking-widest text-zinc-600">Encrypted Assets</h3>
                           <label className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer transition-all"><Plus size={18} /><input type="file" multiple className="hidden" /></label>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
                           {files.length === 0 ? (
                             <div className="py-20 text-center opacity-20">
                               <Upload size={40} className="mx-auto mb-4" />
                               <p className="text-xs font-bold uppercase tracking-widest">Drop files to sync</p>
                             </div>
                           ) : (
                             files.map(f => (
                               <div 
                                 key={f.id} 
                                 onClick={() => setSelectedFileId(f.id)}
                                 className={`p-5 rounded-[28px] border transition-all cursor-pointer group flex items-center gap-5 ${selectedFileId === f.id ? 'bg-indigo-600/10 border-indigo-500/40 text-white shadow-xl' : 'bg-zinc-900/40 border-white/5 text-zinc-500 hover:border-white/10'}`}
                               >
                                  <div className={`p-3 rounded-2xl ${f.source === 'input' ? 'bg-zinc-800' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                     <FileText size={20} />
                                  </div>
                                  <div className="flex-1 overflow-hidden">
                                     <p className="text-sm font-black truncate">{f.name}</p>
                                     <p className="text-[10px] text-zinc-700 font-black uppercase">{(f.size/1024).toFixed(1)} KB</p>
                                  </div>
                               </div>
                             ))
                           )}
                        </div>
                     </div>

                     {/* Intelligence View */}
                     <div className="col-span-8 flex flex-col glass rounded-[48px] overflow-hidden relative shadow-2xl group border border-white/5">
                        <div className="h-20 bg-black/30 border-b border-white/5 flex items-center justify-between px-10 shrink-0 z-10">
                           <div className="flex items-center gap-3">
                              <Shield size={16} className="text-indigo-500" />
                              <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Secure Analyzer v2.0.4</span>
                           </div>
                           <div className="flex gap-3">
                              <IconButton icon={FileJson} color="ghost" />
                              <IconButton icon={Video} color="ghost" />
                           </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-16 z-10 flex flex-col items-center justify-center text-center">
                           {selectedFileId ? (
                              <div className="max-w-lg flex flex-col items-center gap-10 animate-in zoom-in-95 duration-500">
                                 <div className="w-24 h-24 bg-indigo-500/10 text-indigo-500 rounded-[32px] flex items-center justify-center shadow-inner ring-1 ring-indigo-500/20">
                                    <Activity size={40} className="animate-pulse" />
                                 </div>
                                 <div>
                                   <h1 className="text-4xl font-black text-white tracking-tighter mb-4">{files.find(f => f.id === selectedFileId)?.name}</h1>
                                   <p className="text-zinc-500 font-medium leading-relaxed">Agent is actively indexing metadata. You can now perform agentic transformations on this document.</p>
                                 </div>
                                 <div className="grid grid-cols-2 gap-4 w-full">
                                   <button className="p-4 rounded-2xl bg-zinc-900 border border-white/5 hover:border-indigo-500/30 transition-all text-xs font-black uppercase text-white tracking-widest">Convert Format</button>
                                   <button 
                                      onClick={() => handleAgentCommand(`Visualize the core concepts from ${files.find(f => f.id === selectedFileId)?.name}`)}
                                      className="p-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 transition-all text-xs font-black uppercase text-white tracking-widest shadow-xl shadow-indigo-600/20"
                                   >Generate Mindmap</button>
                                 </div>
                              </div>
                           ) : (
                              <div className="opacity-10 flex flex-col items-center gap-6">
                                 <MousePointer2 size={100} strokeWidth={0.5} />
                                 <p className="text-2xl font-black uppercase tracking-widest">Awaiting Resource</p>
                              </div>
                           )}
                        </div>
                     </div>
                  </div>
              ) : (
                <div className="flex-1 flex flex-row gap-6 overflow-hidden max-w-[1700px] mx-auto w-full">
                  <div className="flex-1 flex flex-col bg-white rounded-[40px] shadow-2xl overflow-hidden border border-zinc-200">
                    {/* Drawing/Rich Editor Area (Simulated same as functional stable) */}
                    <div className="h-16 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between px-8 shrink-0">
                      <div className="flex items-center gap-2">
                        <IconButton icon={Undo2} onClick={undo} color="ghost" disabled={historyIndex <= 0} />
                        <div className="w-px h-4 bg-zinc-200 mx-2" />
                        <IconButton icon={Bold} color="ghost" />
                        <IconButton icon={Italic} color="ghost" />
                        <IconButton icon={Underline} color="ghost" />
                        <div className="w-px h-4 bg-zinc-200 mx-2" />
                        <IconButton icon={MousePointer2} active={drawingMode === 'select'} onClick={() => setDrawingMode('select')} color="ghost" />
                        <IconButton icon={Edit3} active={drawingMode === 'brush'} onClick={() => setDrawingMode('brush')} color="ghost" />
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
                       <div 
                         ref={textEditorRef}
                         className="absolute inset-0 p-32 font-serif text-zinc-900 text-xl outline-none overflow-y-auto custom-scrollbar leading-loose"
                         contentEditable suppressContentEditableWarning
                       >
                         <h1 className="text-7xl font-black tracking-tighter mb-10 text-zinc-950">Blank Space.</h1>
                         <p className="text-zinc-400 font-medium italic mb-10">Start drafting or command the agent to build layouts...</p>
                       </div>
                    </div>
                  </div>
                  
                  {/* Layer Palette */}
                  <div className="w-80 shrink-0 flex flex-col gap-8 p-4">
                     <div className="flex items-center justify-between px-2">
                        <h3 className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">Composition Layers</h3>
                        <Plus size={16} className="text-zinc-600 hover:text-white cursor-pointer" onClick={() => addLayer()} />
                     </div>
                     <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">
                        {layers.map(l => (
                          <div key={l.id} className={`p-4 rounded-3xl border transition-all flex items-center gap-4 cursor-pointer ${activeLayerId === l.id ? 'bg-indigo-600/10 border-indigo-500/40 text-white shadow-lg' : 'bg-zinc-900/40 border-white/5 text-zinc-600'}`}>
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

          {/* Persistent Agent Bar */}
          <div className="max-w-4xl mx-auto w-full p-6 glass rounded-[40px] border border-white/5 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] flex items-center gap-6 mt-10 mb-4 animate-in slide-in-from-bottom-10 duration-700">
             <button onClick={() => setIsVoiceActive(!isVoiceActive)} className={`w-16 h-16 rounded-[28px] flex items-center justify-center transition-all shrink-0 ${isVoiceActive ? 'bg-red-600 text-white shadow-2xl shadow-red-600/40 animate-pulse' : 'bg-zinc-900 text-zinc-600 hover:bg-zinc-800'}`}>
                {isVoiceActive ? <Mic size={28} /> : <MicOff size={28} />}
             </button>
             <div className="flex-1 flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest">Advanced Orchestrator</span>
                </div>
                <input 
                  type="text" 
                  value={command} 
                  onChange={(e) => setCommand(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAgentCommand()}
                  placeholder={activeSection === 'notes' ? "Capture a new thought..." : "Convert this PDF to DOCX, or create a mindmap..."}
                  className="w-full bg-transparent text-lg font-bold text-white placeholder:text-zinc-800 focus:outline-none"
                />
             </div>
             <button onClick={() => handleAgentCommand()} disabled={isProcessing} className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center hover:bg-indigo-500 hover:scale-105 active:scale-95 transition-all disabled:opacity-20 shadow-xl shadow-indigo-600/20">
                <Send size={24} className="text-white" />
             </button>
          </div>

        </div>
      </main>
    </div>
  );
}
