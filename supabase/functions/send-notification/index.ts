// This runs in Supabase's Deno runtime, not Node. VS Code's built-in TS
// checker doesn't know `Deno`, `jsr:` or `npm:` imports and flags them as
// errors - they are valid here, and nothing in this project compiles this
// file with tsc. @ts-nocheck silences that editor-only noise.
// @ts-nocheck
//
// Sends a calendar-change notification email through a dedicated Gmail
// account over SMTP. Callable by any logged-in user (coach or athlete) -
// both directions go through this one function. The caller only says who
// the message is *for* ("coach" or a specific athleteId); this function
// looks up that person's notify_email itself with the service-role key.
//
// nodemailer (not denomailer): denomailer 1.6.0 with content:"auto"+html
// built a malformed multipart MIME that Gmail rendered as raw text. This
// sends ONE clean text/plain part; nodemailer encodes the UTF-8 subject as
// an RFC 2047 encoded-word. Messages are short plain prose, so no HTML part
// is needed - Gmail auto-links the bare URL.
//
// CORS: the browser's credential-less OPTIONS preflight carries no
// Authorization header, so this function must be deployed with "Verify JWT"
// OFF (it does its own auth via getUser below) and answer OPTIONS itself.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const DEFAULT_FROM_NAME = "Toma Komasa Sportistu Portāls";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { target, athleteId, subject, message } = await req.json();
    if (target !== "coach" && target !== "athlete")
      return json({ error: "target jābūt 'coach' vai 'athlete'" }, 400);
    if (target === "athlete" && !athleteId)
      return json({ error: "athleteId obligāts, ja target ir 'athlete'" }, 400);
    if (!subject || !message)
      return json({ error: "subject un message obligāti" }, 400);

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) return json({ error: "Nav autentificēts" }, 401);

    // Look up the recipient's own real address - never the synthetic
    // username@skmitauer.app login identity.
    let q = supabase.from("profiles").select("notify_email");
    q = target === "coach" ? q.eq("role", "coach") : q.eq("id", athleteId);
    const { data: recipient, error: recipientError } = await q.limit(1).maybeSingle();
    if (recipientError)
      return json({ error: "Neizdevās uzmeklēt saņēmēju: " + recipientError.message }, 500);

    // No address on file - not an error, just nothing to send.
    if (!recipient?.notify_email) return json({ success: true, skipped: true });

    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailPass = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!gmailUser || !gmailPass)
      return json({ error: "GMAIL_USER / GMAIL_APP_PASSWORD nav iestatīti" }, 500);

    const fromName = Deno.env.get("NOTIFY_FROM_NAME") || DEFAULT_FROM_NAME;
    const replyTo = target === "athlete" ? Deno.env.get("COACH_REPLY_TO") : undefined;

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPass },
    });

    await transporter.sendMail({
      from: { name: fromName, address: gmailUser },
      to: recipient.notify_email,
      ...(replyTo ? { replyTo } : {}),
      subject: String(subject),
      text: String(message),
    });

    return json({ success: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Nezināma kļūda" }, 500);
  }
});
