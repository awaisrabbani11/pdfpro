import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as authHandlers from '../src/api/handlers/auth';
import * as filesHandlers from '../src/api/handlers/files';
import * as notesHandlers from '../src/api/handlers/notes';
import * as tasksHandlers from '../src/api/handlers/tasks';
import * as canvasHandlers from '../src/api/handlers/canvas';
import * as pdfHandlers from '../src/api/handlers/pdf';

// Special config for file upload endpoint
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper to parse JSON body when bodyParser is disabled
async function parseBody(req: VercelRequest): Promise<any> {
  if (req.body) return req.body; // Already parsed

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const data = Buffer.concat(chunks).toString();

  if (!data) return {};

  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const path = url.pathname.replace(/^\/api/, '');

    // Parse JSON body for non-upload routes
    if (path !== '/files/upload' && (req.method === 'POST' || req.method === 'PUT')) {
      req.body = await parseBody(req);
    }

    // Auth routes
    if (path === '/auth/register') {
      return authHandlers.handleRegister(req, res);
    }
    if (path === '/auth/login') {
      return authHandlers.handleLogin(req, res);
    }
    if (path === '/auth/me') {
      return authHandlers.handleMe(req, res);
    }
    if (path === '/auth/logout') {
      return authHandlers.handleLogout(req, res);
    }
    if (path === '/auth/google/authorize') {
      return authHandlers.handleGoogleAuthorize(req, res);
    }
    if (path === '/auth/google/callback') {
      return authHandlers.handleGoogleCallback(req, res);
    }

    // Files routes
    if (path === '/files/upload') {
      return filesHandlers.handleUpload(req, res);
    }
    if (path === '/files/list') {
      return filesHandlers.handleList(req, res);
    }
    if (path.match(/^\/files\/[^\/]+\/download$/)) {
      const id = path.split('/')[2];
      return filesHandlers.handleDownload(req, res, id);
    }
    if (path.match(/^\/files\/[^\/]+\/delete$/)) {
      const id = path.split('/')[2];
      return filesHandlers.handleDelete(req, res, id);
    }

    // Notes routes
    if (path === '/notes/groups/create') {
      return notesHandlers.handleCreateGroup(req, res);
    }
    if (path === '/notes/groups/list') {
      return notesHandlers.handleListGroups(req, res);
    }
    if (path.match(/^\/notes\/groups\/[^\/]+\/delete$/)) {
      const id = path.split('/')[3];
      return notesHandlers.handleDeleteGroup(req, res, id);
    }
    if (path === '/notes/items/create') {
      return notesHandlers.handleCreateItem(req, res);
    }
    if (path.match(/^\/notes\/items\/[^\/]+\/update$/)) {
      const id = path.split('/')[3];
      return notesHandlers.handleUpdateItem(req, res, id);
    }
    if (path.match(/^\/notes\/items\/[^\/]+\/delete$/)) {
      const id = path.split('/')[3];
      return notesHandlers.handleDeleteItem(req, res, id);
    }

    // Tasks routes
    if (path === '/tasks/create') {
      return tasksHandlers.handleCreate(req, res);
    }
    if (path === '/tasks/list') {
      return tasksHandlers.handleList(req, res);
    }

    // Canvas routes
    if (path === '/canvas/layers/create') {
      return canvasHandlers.handleCreateLayer(req, res);
    }
    if (path === '/canvas/layers/list') {
      return canvasHandlers.handleListLayers(req, res);
    }
    if (path.match(/^\/canvas\/layers\/[^\/]+\/update$/)) {
      const id = path.split('/')[3];
      return canvasHandlers.handleUpdateLayer(req, res, id);
    }
    if (path.match(/^\/canvas\/layers\/[^\/]+\/delete$/)) {
      const id = path.split('/')[3];
      return canvasHandlers.handleDeleteLayer(req, res, id);
    }

    // PDF routes
    if (path === '/pdf/merge') {
      return pdfHandlers.handleMerge(req, res);
    }
    if (path === '/pdf/split') {
      return pdfHandlers.handleSplit(req, res);
    }
    if (path === '/pdf/extract-text') {
      return pdfHandlers.handleExtractText(req, res);
    }
    if (path === '/pdf/convert') {
      return pdfHandlers.handleConvert(req, res);
    }

    // No route matched
    return res.status(404).json({ error: 'Not found' });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
