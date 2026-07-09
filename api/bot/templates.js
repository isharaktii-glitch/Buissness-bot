import sql from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const templates = await sql`SELECT * FROM bot_templates ORDER BY id`;
    return res.status(200).json({ templates });
  } catch (error) {
    console.error('Fetch templates error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
}
