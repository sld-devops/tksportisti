// This runs in Supabase's Deno runtime, not Node. VS Code's built-in TS
// checker doesn't know `Deno`, `jsr:` or `https://` imports and flags them
// as errors - they are valid here, and nothing in this project compiles
// this file with tsc. @ts-nocheck silences that editor-only noise.
// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const DIACRITICS: Record<string, string> = {
  ā: "a", Ā: "A", č: "c", Č: "C", ē: "e", Ē: "E",
  ģ: "g", Ģ: "G", ī: "i", Ī: "I", ķ: "k", Ķ: "K",
  ļ: "l", Ļ: "L", ņ: "n", Ņ: "N", ō: "o", Ō: "O",
  ŗ: "r", Ŗ: "R", š: "s", Š: "S", ū: "u", Ū: "U",
  ž: "z", Ž: "Z",
};

function normalize(s: string): string {
  return s
    .split("")
    .map((c) => DIACRITICS[c] ?? c)
    .join("")
    .toLowerCase();
}

function generatePassword(length = 12): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let pwd = "";
  for (let i = 0; i < length; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { firstName, lastName } = await req.json();

    if (!firstName || !lastName) {
      return new Response(JSON.stringify({ error: "firstName un lastName obligāti" }), {
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
      return new Response(JSON.stringify({ error: "Nav tiesību veidot lietotājus" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const username = `${normalize(firstName)}.${normalize(lastName)}`;
    const email = `${username}@skmitauer.app`;
    const password = generatePassword();

    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `${firstName} ${lastName}` },
    });
    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { error: updateError } = await supabase.from("profiles").update({
      full_name: `${firstName} ${lastName}`,
      role: "athlete",
    }).eq("id", newUser.user.id);
    if (updateError) {
      await supabase.auth.admin.deleteUser(newUser.user.id);
      return new Response(JSON.stringify({ error: "Neizdevās atjaunināt profilu: " + updateError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, username, password, email }), {
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
