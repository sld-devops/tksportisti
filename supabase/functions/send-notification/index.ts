// Sends an email notification about a calendar change (a plan edited, a
// restriction/health entry added) via Resend. Same shape as the other three
// functions in this folder, but callable by *any* logged-in user (coach or
// athlete) - both directions of notification go through this one function.
//
// The caller never picks the recipient's address directly - it only says
// who the message is *for* ("coach" or a specific athleteId), and this
// function (using the service-role key, same as create-user/delete-user)
// looks up that person's notify_email itself. That way an athlete's session
// never needs read access to the coach's profile row (or vice versa) just
// to send a notification.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const DEFAULT_FROM = "SK Mitauer Treniņu Portāls <onboarding@resend.dev>";

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

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY nav iestatīts" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const html = String(message)
      .split("\n")
      .map((line: string) => line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))
      .join("<br>");

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: Deno.env.get("RESEND_FROM_EMAIL") || DEFAULT_FROM,
        to: [recipient.notify_email],
        subject,
        html,
      }),
    });

    if (!resendRes.ok) {
      const detail = await resendRes.text();
      return new Response(JSON.stringify({ error: "Resend kļūda: " + detail }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
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
