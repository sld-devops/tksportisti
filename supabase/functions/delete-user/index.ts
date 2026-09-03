// This runs in Supabase's Deno runtime, not Node. VS Code's built-in TS
// checker doesn't know `Deno`, `jsr:` or `https://` imports and flags them
// as errors - they are valid here, and nothing in this project compiles
// this file with tsc. @ts-nocheck silences that editor-only noise.
// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { userId } = await req.json();
    if (!userId) {
      return new Response(JSON.stringify({ error: "userId obligāts" }), {
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

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profileError || profile?.role !== "coach") {
      return new Response(JSON.stringify({ error: "Nav tiesību dzēst sportistus" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { error: deleteProfileError } = await supabase
      .from("profiles")
      .delete()
      .eq("id", userId);
    if (deleteProfileError) {
      return new Response(JSON.stringify({ error: "Neizdevās dzēst profilu: " + deleteProfileError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteAuthError) {
      return new Response(JSON.stringify({ error: "Neizdevās dzēst lietotāju: " + deleteAuthError.message }), {
        status: 500,
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
