// Sends an email notification about a calendar change (a plan edited, moved
// or deleted; a restriction/health entry added) via a plain Gmail account
// over SMTP. Same shape as the other three functions in this folder, but
// callable by *any* logged-in user (coach or athlete) - both directions of
// notification go through this one function.
//
// The caller never picks the recipient's address directly - it only says
// who the message is *for* ("coach" or a specific athleteId), and this
// function (using the service-role key, same as create-user/delete-user)
// looks up that person's notify_email itself. That way an athlete's session
// never needs read access to the coach's profile row (or vice versa) just
// to send a notification.
//
// Why Gmail SMTP and not a transactional-email API: sending from a verified
// domain needs DNS records the project owner cannot add (a third party
// manages the domain). A dedicated Gmail account + an App Password needs no
// DNS at all - Google already publishes SPF/DKIM for gmail.com. Set these
// Edge Function secrets: GMAIL_USER, GMAIL_APP_PASSWORD, and optionally
// NOTIFY_FROM_NAME (display name) and COACH_REPLY_TO (Reply-To on the mails
// that go to athletes, so a reply reaches the coach).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const DEFAULT_FROM_NAME = "Toma Komasa Sportistu Portāls";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { target, athleteId, subject, message } = await req.json();

    if (target !== "coach" && target !== "athlete") {
      return new Response(JSON.stringify({ error: "target jābūt 'coach' vai 'athlete'" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (target === "athlete" && !athleteId) {
      return new Response(JSON.stringify({ error: "athleteId obligāts, ja target ir 'athlete'" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!subject || !message) {
      return new Response(JSON.stringify({ error: "subject un message obligāti" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization")!;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Nav autentificēts" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Look up the recipient's own real address - never the synthetic
    // username@skmitauer.app login identity.
    let recipientQuery = supabase.from("profiles").select("notify_email");
    recipientQuery = target === "coach"
      ? recipientQuery.eq("role", "coach")
      : recipientQuery.eq("id", athleteId);
    const { data: recipient, error: recipientError } = await recipientQuery.limit(1).maybeSingle();

    if (recipientError) {
      return new Response(JSON.stringify({ error: "Neizdevās uzmeklēt saņēmēju: " + recipientError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // No address on file (or notifications turned off) - not an error, just
    // nothing to send. The person simply hasn't filled in "Paziņojumu e-pasts".
    if (!recipient?.notify_email) {
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailPass = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!gmailUser || !gmailPass) {
      return new Response(JSON.stringify({ error: "GMAIL_USER / GMAIL_APP_PASSWORD nav iestatīti" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const html = String(message)
      .split("\n")
      .map((line: string) => line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))
      .join("<br>");

    const fromName = Deno.env.get("NOTIFY_FROM_NAME") || DEFAULT_FROM_NAME;
    const replyTo = target === "athlete" ? Deno.env.get("COACH_REPLY_TO") : undefined;

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: { username: gmailUser, password: gmailPass },
      },
    });

    try {
      await client.send({
        from: `${fromName} <${gmailUser}>`,
        to: recipient.notify_email,
        ...(replyTo ? { replyTo } : {}),
        subject,
        content: "auto",
        html,
      });
    } finally {
      await client.close();
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Nezināma kļūda" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
