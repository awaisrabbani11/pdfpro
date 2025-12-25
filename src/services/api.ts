// API Service Layer for PDFPro
// Handles all backend API communication with authentication

const API_BASE = import.meta.env.VITE_API_BASE || '';

// Helper to get auth token
function getAuthToken(): string | null {
  return localStorage.getItem('pdfpro_auth_token');
}

// Helper to create authenticated headers
function getAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

// Auth API
export const authAPI = {
  // Google OAuth
  async getAuthorizeUrl(): Promise<{ authUrl: string }> {
    const res = await fetch(`${API_BASE}/api/auth/google/authorize`);
    if (!res.ok) throw new Error('Failed to get auth URL');
    return res.json();
  },

  // Email/Password Auth
  async register(email: string, password: string, name: string): Promise<{ token: string; user: any }> {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Registration failed');
    }
    return res.json();
  },

  async login(email: string, password: string): Promise<{ token: string; user: any }> {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Login failed');
    }
    return res.json();
  },

  // Session Management
  async getMe(): Promise<{ id: string; email: string; name: string; avatarUrl: string }> {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Authentication failed');
    return res.json();
  },

  async logout(): Promise<void> {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    localStorage.removeItem('pdfpro_auth_token');
  },
};

// Files API
export const filesAPI = {
  async upload(fileData: { fileName: string; fileType: string; fileData: string; fileSize: number }): Promise<any> {
    const res = await fetch(`${API_BASE}/api/files/upload`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(fileData),
    });
    if (!res.ok) throw new Error('File upload failed');
    return res.json();
  },

  async list(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/api/files/list`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch files');
    return res.json();
  },

  async download(fileId: string): Promise<{ downloadUrl: string }> {
    const res = await fetch(`${API_BASE}/api/files/${fileId}/download`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to get download URL');
    return res.json();
  },

  async delete(fileId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/files/${fileId}/delete`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete file');
  },
};

// Notes API
export const notesAPI = {
  async listGroups(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/api/notes/groups/list`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch note groups');
    return res.json();
  },

  async createGroup(title: string, type: 'text' | 'todo'): Promise<any> {
    const res = await fetch(`${API_BASE}/api/notes/groups/create`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ title, type }),
    });
    if (!res.ok) throw new Error('Failed to create note group');
    return res.json();
  },

  async deleteGroup(groupId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/notes/groups/${groupId}/delete`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete note group');
  },

  async createItem(groupId: string, content: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/notes/items/create`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ groupId, content }),
    });
    if (!res.ok) throw new Error('Failed to create note item');
    return res.json();
  },

  async updateItem(itemId: string, updates: { content?: string; completed?: boolean }): Promise<any> {
    const res = await fetch(`${API_BASE}/api/notes/items/${itemId}/update`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update note item');
    return res.json();
  },

  async deleteItem(itemId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/notes/items/${itemId}/delete`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete note item');
  },
};

// Tasks API
export const tasksAPI = {
  async list(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/api/tasks/list`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch tasks');
    return res.json();
  },

  async create(type: string, description: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/tasks/create`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ type, description }),
    });
    if (!res.ok) throw new Error('Failed to create task');
    return res.json();
  },
};

// Canvas Layers API
export const layersAPI = {
  async list(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/api/canvas/layers/list`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch layers');
    return res.json();
  },

  async create(name: string, data: any): Promise<any> {
    const res = await fetch(`${API_BASE}/api/canvas/layers/create`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, data }),
    });
    if (!res.ok) throw new Error('Failed to create layer');
    return res.json();
  },

  async update(layerId: string, updates: any): Promise<any> {
    const res = await fetch(`${API_BASE}/api/canvas/layers/${layerId}/update`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update layer');
    return res.json();
  },

  async delete(layerId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/canvas/layers/${layerId}/delete`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete layer');
  },
};

// PDF Operations API
export const pdfAPI = {
  async extractText(fileId: string, pageNumbers?: number[]): Promise<{ text: string; pages: any[] }> {
    const res = await fetch(`${API_BASE}/api/pdf/extract-text`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ fileId, pageNumbers }),
    });
    if (!res.ok) throw new Error('Failed to extract text');
    return res.json();
  },

  async merge(fileIds: string[]): Promise<any> {
    const res = await fetch(`${API_BASE}/api/pdf/merge`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ fileIds }),
    });
    if (!res.ok) throw new Error('Failed to merge PDFs');
    return res.json();
  },

  async split(fileId: string, ranges: { start: number; end: number }[]): Promise<any[]> {
    const res = await fetch(`${API_BASE}/api/pdf/split`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ fileId, ranges }),
    });
    if (!res.ok) throw new Error('Failed to split PDF');
    return res.json();
  },

  async convert(fileId: string, targetFormat: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/pdf/convert`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ fileId, targetFormat }),
    });
    if (!res.ok) throw new Error('Failed to convert file');
    return res.json();
  },
};
