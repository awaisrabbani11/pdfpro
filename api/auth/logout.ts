import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // JWT tokens are stateless, so logout is handled client-side
  // This endpoint exists for consistency and potential future use

  return res.status(200).json({ message: 'Logged out successfully' });
}
