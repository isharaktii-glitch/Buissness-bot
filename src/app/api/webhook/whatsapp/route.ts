import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - Meta calls this to verify the webhook
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token) {
    // Check if this verify token matches ANY user's bot config
    const config = await prisma.botConfig.findFirst({
      where: { verifyToken: token },
    });

    if (config) {
      return new NextResponse(challenge, { status: 200 });
    }
  }

  return new NextResponse("Forbidden", { status: 403 });
}

// POST - Meta sends incoming messages here
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    const phoneNumberId = value?.metadata?.phone_number_id;
    const message = value?.messages?.[0];

    if (!phoneNumberId || !message) {
      // Not a message event (could be status update) - just acknowledge
      return NextResponse.json({ success: true });
    }

    const from = message.from; // customer's WhatsApp number
    const messageText = message.text?.body || "";

    // Find which user's bot this phoneNumberId belongs to
    const botConfig = await prisma.botConfig.findFirst({
      where: { phoneNumberId },
      include: { user: true },
    });

    if (!botConfig || !botConfig.isActive || !botConfig.accessToken) {
      // Bot not found or turned off - do nothing
      return NextResponse.json({ success: true });
    }

    // Check if user account is approved
    if (!botConfig.user.isApproved) {
      return NextResponse.json({ success: true });
    }

    const replyText =
      botConfig.welcomeMessage ||
      "Hi! Thanks for messaging us. We'll get back to you shortly.";

    // Send reply via WhatsApp Cloud API
    await fetch(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${botConfig.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: from,
          type: "text",
          text: { body: replyText },
        }),
      }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ success: true }); // Always 200 so Meta doesn't retry endlessly
  }
}
