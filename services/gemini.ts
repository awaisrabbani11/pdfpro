
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
    description: 'Converts current document content or user prompts into a structured visual infographic (mindmap, steps, comparison, flowchart) on the blank page editor.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        topic: { type: Type.STRING, description: 'The main subject or title of the infographic' },
        style: { type: Type.STRING, enum: ['flow', 'mindmap', 'comparison', 'steps'] },
        dataPoints: { 
          type: Type.ARRAY, 
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING, description: 'Title of this node' },
              description: { type: Type.STRING, description: 'A 1-2 sentence summary for this point' },
              color: { type: Type.STRING, description: 'Suggested hex color' }
            }
          },
          description: 'The extracted key information points to visualize'
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
        systemInstruction: `You are pdfpro.pro Agent.
        - You are an expert at document analysis, synthesis, and visual communication.
        - Infographics: When a user asks for a visual summary, a diagram, a mindmap, or to "show me what's in this file visually", use the 'generateInfographic' tool.
        - Use context: If a file is selected, analyze its metadata/content description provided in the context to generate the infographic.
        - Styles:
            * 'mindmap': Best for brainstorming and interconnected concepts.
            * 'steps': Best for processes, timelines, or sequential data.
            * 'comparison': Best for "pros vs cons" or contrasting two or more entities.
            * 'flow': General directional flow.
        - You also manage checklists and notes. Always be helpful and creative.`,
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
        systemInstruction: "You are pdfpro.pro assistant. Help users visualize their documents. You can trigger 'generateInfographic' based on their voice commands about document content.",
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
        },
        tools: [{ functionDeclarations: DOC_TOOLS }]
      }
    });
  }
}

export const gemini = new GeminiService();
