import sql from '../../lib/db.js';
import Anthropic from '@anthropic-ai/sdk';
import twilio from 'twilio';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const config = {
  api: { bodyParser: true }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  try {
    const incomingMsg = req.body.Body;
    const fromNumber = req.body.From; // e.g. "whatsapp:+94771234567"
    const toNumber = req.body.To;     // the business's Twilio WhatsApp number

    if (!incomingMsg || !fromNumber || !toNumber) {
      return res.status(400).send('Missing message data');
    }

    // 1. Find which business this WhatsApp number belongs to
    const configResult = await sql`
      SELECT * FROM bot_configs WHERE whatsapp_number = ${toNumber} AND is_active = true
    `;

    if (configResult.length === 0) {
      console.error('No bot config found for number:', toNumber);
      return res.status(200).send('No bot configured for this number');
    }

    const botConfig = configResult[0];

    // 2. Save incoming customer message
    await sql`
      INSERT INTO conversations (bot_config_id, customer_phone, message_from, message_text)
      VALUES (${botConfig.id}, ${fromNumber}, 'customer', ${incomingMsg})
    `;

    // 3. Get recent conversation history for context (last 10 messages)
    const history = await sql`
      SELECT message_from, message_text FROM conversations
      WHERE bot_config_id = ${botConfig.id} AND customer_phone = ${fromNumber}
      ORDER BY created_at DESC LIMIT 10
    `;

    const conversationHistory = history.reverse().map(msg => ({
      role: msg.message_from === 'customer' ? 'user' : 'assistant',
      content: msg.message_text
    }));

    // 4. Build system prompt with business context
    const systemPrompt = `ඔබ "${botConfig.bot_name}" කියන AI assistant කෙනෙක්, "${botConfig.business_name}" කියන business එකේ WhatsApp customer support bot එක විදිහට වැඩ කරන්නේ.

Business විස්තරය: ${botConfig.business_description}

ඔබේ මෙහෙවර:
- Customer ලාගේ messages වලට friendly, helpful, සහ professional විදිහට reply කරන්න
- Business එකේ services/products ගැන customer ලා අහන ප්‍රශ්නවලට උදව් කරන්න
- පිළිතුරු කෙටියෙන්, WhatsApp chat style එකට ගැලපෙන විදිහට දෙන්න (paragraphs දිග අරින්න එපා)
- ඔබට උත්තර දෙන්න බැරි specific ප්‍රශ්නයක් (price, order status වගේ) ආවොත්, business owner ට contact කරන්න කියලා politely කියන්න
- Customer කතා කරන භාෂාවෙන්ම (සිංහල, English, හෝ මිශ්‍ර) reply කරන්න`;

    // 5. Call Claude API for intelligent reply
    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: 'user', content: incomingMsg }
      ]
    });

    const replyText = aiResponse.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    // 6. Save bot's reply
    await sql`
      INSERT INTO conversations (bot_config_id, customer_phone, message_from, message_text)
      VALUES (${botConfig.id}, ${fromNumber}, 'bot', ${replyText})
    `;

    // 7. Send reply back via Twilio WhatsApp
    const twimlResponse = new twilio.twiml.MessagingResponse();
    twimlResponse.message(replyText);

    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(twimlResponse.toString());

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).send('Server error');
  }
}
