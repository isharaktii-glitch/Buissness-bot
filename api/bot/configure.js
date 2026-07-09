import sql from '../../lib/db.js';
import jwt from 'jsonwebtoken';

function verifyToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.split(' ')[1];
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const decoded = verifyToken(req);
  if (!decoded) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'POST') {
    try {
      const {
        templateId,
        botName,
        botAddressName,
        businessName,
        businessLogoUrl,
        businessDescription
      } = req.body;

      const existing = await sql`
        SELECT id FROM bot_configs WHERE user_id = ${decoded.userId}
      `;

      let result;
      if (existing.length > 0) {
        result = await sql`
          UPDATE bot_configs SET
            template_id = ${templateId},
            bot_name = ${botName},
            bot_address_name = ${botAddressName},
            business_name = ${businessName},
            business_logo_url = ${businessLogoUrl},
            business_description = ${businessDescription}
          WHERE user_id = ${decoded.userId}
          RETURNING *
        `;
      } else {
        result = await sql`
          INSERT INTO bot_configs
            (user_id, template_id, bot_name, bot_address_name, business_name, business_logo_url, business_description)
          VALUES
            (${decoded.userId}, ${templateId}, ${botName}, ${botAddressName}, ${businessName}, ${businessLogoUrl}, ${businessDescription})
          RETURNING *
        `;
      }

      return res.status(200).json({ message: 'Bot configured successfully', config: result[0] });

    } catch (error) {
      console.error('Configure error:', error);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  if (req.method === 'GET') {
    try {
      const result = await sql`
        SELECT * FROM bot_configs WHERE user_id = ${decoded.userId}
      `;
      return res.status(200).json({ config: result[0] || null });
    } catch (error) {
      return res.status(500).json({ error: 'Server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
