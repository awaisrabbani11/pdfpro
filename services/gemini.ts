
import { GoogleGenAI, Type, FunctionDeclaration, LiveServerMessage, Modality } from "@google/genai";

export const DOC_TOOLS: FunctionDeclaration[] = [
  {
    name: 'convertFile',
    description: 'Convert a file between PDF, Word, Excel, PowerPoint, and Images.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        fileId: { type: Type.STRING, description: 'ID of file' },
        targetFormat: { type: Type.STRING, enum: ['pdf', 'docx', 'xlsx', 'pptx', 'png', 'jpeg'] }
      },
      required: ['fileId', 'targetFormat']
    }
  },
  {
    name: 'manageNoteGroup',
    description: 'Create, delete or update a note list/checklist group.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, enum: ['create', 'delete', 'rename'] },
        title: { type: Type.STRING },
        type: { type: Type.STRING, enum: ['text', 'todo'] },
        groupId: { type: Type.STRING }
      },
      required: ['action']
    }
  },
  {
    name: 'manageNoteItem',
    description: 'Add, update, toggle or delete items within a specific note group.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, enum: ['add', 'delete', 'toggle', 'update'] },
        groupId: { type: Type.STRING },
        content: { type: Type.STRING },
        itemId: { type: Type.STRING }
      },
      required: ['action', 'groupId']
    }
  },
  {
    name: 'editor_insertElement',
    description: 'Insert text, shapes, or images into the active layer of the creative blank page editor.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING, enum: ['text', 'rect', 'circle', 'line', 'image'] },
        content: { type: Type.STRING, description: 'Text content or image description' },
        style: { 
          type: Type.OBJECT, 
          properties: {
            color: { type: Type.STRING },
            fontSize: { type: Type.STRING },
            fontWeight: { type: Type.STRING },
            textDecoration: { type: Type.STRING, description: 'e.g., line-through' },
            backgroundColor: { type: Type.STRING, description: 'e.g., #ffff00 for highlighting' }
          }
        }
      },
      required: ['type']
    }
  },
  {
    name: 'generateInfographic',
    description: 'Decompose a topic or document content into a visual infographic layout (shapes + text) on the blank page.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        topic: { type: Type.STRING, description: 'The main subject of the infographic' },
        style: { type: Type.STRING, enum: ['flow', 'mindmap', 'comparison', 'steps'] },
        dataPoints: { 
          type: Type.ARRAY, 
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              description: { type: Type.STRING },
              color: { type: Type.STRING }
            }
          },
          description: 'Key points to visualize'
        }
      },
      required: ['topic', 'style', 'dataPoints']
    }
  }
];

export class GeminiService {
  async processAgentCommand(prompt: string, context: string) {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    return await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `User: ${prompt}\nContext: ${context}`,
      config: {
        systemInstruction: `You are PDFPRO Ultra Agent.
        - Infographics: Use 'generateInfographic' whenever a user asks to "summarize visually", "make an infographic", or "create a diagram".
        - Choose styles wisely: 'mindmap' for brainstorming, 'steps' for processes, 'comparison' for contrasting items.
        - Multiple Note Lists: Users can have multiple checklists and note groups. Use 'manageNoteGroup' to create them and 'manageNoteItem' to edit items.
        - Creative Editor: Use 'editor_insertElement' for manual additions.
        Always identify the group or layer you are acting on.`,
        tools: [{ functionDeclarations: DOC_TOOLS }]
      }
    });
  }

  connectVoiceAgent(callbacks: any) {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    return ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      callbacks,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: "You are PDFPRO assistant. Help design pages, draw shapes, and generate visual infographics using the generateInfographic tool.",
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
        },
        tools: [{ functionDeclarations: DOC_TOOLS }]
      }
    });
  }
}

export const gemini = new GeminiService();
