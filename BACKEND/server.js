require("dotenv").config();

const path = require("path");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SECRET_KEY"];
const missing = required.filter((key) => !process.env[key] || process.env[key].startsWith("YOUR_"));
if (missing.length) {
  console.error(`Missing Supabase configuration: ${missing.join(", ")}`);
  console.error("Create BACKEND/.env from BACKEND/.env.example and fill in the values from your Supabase project.");
  process.exit(1);
}

const app = express();
const port = Number(process.env.PORT || 3000);

const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "FRONTEND")));

function getToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

async function requireUser(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: "Authentication required." });

    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: "Your session is invalid or expired. Please log in again." });

    req.user = data.user;
    next();
  } catch (error) {
    console.error("Auth verification error:", error.message);
    res.status(500).json({ error: "Unable to verify your session." });
  }
}

function clean(value, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function supabaseFriendlyError(error) {
  const text = String(error?.message || "");
  const lower = text.toLowerCase();
  if (lower.includes("invalid api key") || lower.includes("apikey")) {
    return "Supabase API key configuration is invalid. Check BACKEND/.env and use credentials from this Supabase project.";
  }
  if (lower.includes("rate") || lower.includes("too many") || lower.includes("email rate")) {
    return "Supabase email authentication is temporarily rate-limited. Please wait before trying again.";
  }
  if (lower.includes("email not confirmed")) {
    return "Please confirm your email address before logging in.";
  }
  return text || "Supabase request failed.";
}

app.post("/api/auth/signup", async (req, res) => {
  try {
    const name = clean(req.body.name, 100);
    const email = clean(req.body.email, 254).toLowerCase();
    const password = typeof req.body.password === "string" ? req.body.password : "";

    if (!name || !email || password.length < 6) {
      return res.status(400).json({ error: "Name, a valid email, and a password of at least 6 characters are required." });
    }

    const { data, error } = await supabaseAuth.auth.signUp({ email, password });
    if (error) return res.status(400).json({ error: supabaseFriendlyError(error) });

    if (data.user) {
      const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        id: data.user.id, name, email, created_at: new Date().toISOString()
      }, { onConflict: "id" });
      if (profileError) console.error("Profile creation warning:", profileError.message);
    }

    if (!data.session) {
      return res.status(201).json({
        session: null,
        user: data.user,
        message: "Account created. Supabase requires email confirmation for this project. Check your email, confirm the account, then log in."
      });
    }

    res.status(201).json({
      session: data.session,
      user: { id: data.user.id, email, name }
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ error: supabaseFriendlyError(error) });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = clean(req.body.email, 254).toLowerCase();
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: supabaseFriendlyError(error) });

    const { data: profile } = await supabaseAdmin.from("profiles").select("name,email").eq("id", data.user.id).maybeSingle();
    res.json({
      session: data.session,
      user: { id: data.user.id, email: data.user.email, name: profile?.name || data.user.email?.split("@")[0] }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: supabaseFriendlyError(error) });
  }
});

app.get("/api/auth/me", requireUser, async (req, res) => {
  const { data: profile } = await supabaseAdmin.from("profiles").select("name,email").eq("id", req.user.id).maybeSingle();
  res.json({ user: { id: req.user.id, email: req.user.email, name: profile?.name || req.user.email?.split("@")[0] } });
});

app.post("/api/auth/logout", requireUser, async (_req, res) => {
  // Supabase access tokens are stateless; the browser removes its token on logout.
  res.json({ message: "Logged out." });
});

app.get("/api/items", requireUser, async (req, res) => {
  try {
    const search = clean(req.query.search, 100);
    const type = clean(req.query.type, 10).toUpperCase();

    let query = supabaseAdmin
      .from("items")
      .select("id,user_id,item_type,item_name,category,description,location,item_date,image_url,status,created_at")
      .order("created_at", { ascending: false });

    if (type === "LOST" || type === "FOUND") query = query.eq("item_type", type);
    if (search) query = query.or(`item_name.ilike.%${search}%,category.ilike.%${search}%,location.ilike.%${search}%`);

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: supabaseFriendlyError(error) });
    res.json({ items: data || [] });
  } catch (error) {
    console.error("List items error:", error);
    res.status(500).json({ error: "Unable to load items." });
  }
});

app.get("/api/my-items", requireUser, async (req, res) => {
  const { data, error } = await supabaseAdmin.from("items")
    .select("id,user_id,item_type,item_name,status,created_at")
    .eq("user_id", req.user.id).order("created_at", { ascending: false });
  if (error) return res.status(400).json({ error: supabaseFriendlyError(error) });
  res.json({ items: data || [] });
});

app.post("/api/items", requireUser, async (req, res) => {
  try {
    const itemType = clean(req.body.item_type, 10).toUpperCase();
    const item = {
      user_id: req.user.id,
      item_type: itemType,
      item_name: clean(req.body.item_name, 120),
      category: clean(req.body.category, 80),
      description: clean(req.body.description, 1000),
      location: clean(req.body.location, 160),
      item_date: clean(req.body.item_date, 20),
      image_url: clean(req.body.image_url, 500) || null,
      status: "ACTIVE"
    };
    if (!["LOST", "FOUND"].includes(itemType)) return res.status(400).json({ error: "Item type must be LOST or FOUND." });
    if (!item.item_name || !item.category || !item.description || !item.location || !item.item_date) {
      return res.status(400).json({ error: "Please complete all required item fields." });
    }

    const { data, error } = await supabaseAdmin.from("items").insert(item).select().single();
    if (error) return res.status(400).json({ error: supabaseFriendlyError(error) });
    res.status(201).json({ item: data });
  } catch (error) {
    console.error("Create item error:", error);
    res.status(500).json({ error: "Unable to create the post." });
  }
});

app.get("/api/items/:id", requireUser, async (req, res) => {
  const { data, error } = await supabaseAdmin.from("items").select("*").eq("id", req.params.id).maybeSingle();
  if (error) return res.status(400).json({ error: supabaseFriendlyError(error) });
  if (!data) return res.status(404).json({ error: "Item not found." });
  res.json({ item: data });
});

app.put("/api/items/:id", requireUser, async (req, res) => {
  const updates = {};
  for (const key of ["item_type","item_name","category","description","location","item_date","image_url","status"]) {
    if (req.body[key] !== undefined) updates[key] = key === "item_type" || key === "status" ? clean(req.body[key], 20).toUpperCase() : clean(req.body[key], 1000);
  }
  const { data, error } = await supabaseAdmin.from("items").update(updates).eq("id", req.params.id).eq("user_id", req.user.id).select().maybeSingle();
  if (error) return res.status(400).json({ error: supabaseFriendlyError(error) });
  if (!data) return res.status(404).json({ error: "Post not found or you do not own it." });
  res.json({ item: data });
});

app.delete("/api/items/:id", requireUser, async (req, res) => {
  const { data, error } = await supabaseAdmin.from("items").delete().eq("id", req.params.id).eq("user_id", req.user.id).select().maybeSingle();
  if (error) return res.status(400).json({ error: supabaseFriendlyError(error) });
  if (!data) return res.status(404).json({ error: "Post not found or you do not own it." });
  res.json({ message: "Post deleted." });
});

app.post("/api/items/:id/claims", requireUser, async (req, res) => {
  const message = clean(req.body.message, 1000);
  if (!message) return res.status(400).json({ error: "Claim/report message is required." });

  const { data: item } = await supabaseAdmin.from("items").select("id,user_id").eq("id", req.params.id).maybeSingle();
  if (!item) return res.status(404).json({ error: "Item not found." });
  if (item.user_id === req.user.id) return res.status(400).json({ error: "You cannot claim your own post." });

  const { data, error } = await supabaseAdmin.from("claims").insert({
    item_id: item.id, user_id: req.user.id, message, status: "PENDING"
  }).select().single();
  if (error) return res.status(400).json({ error: supabaseFriendlyError(error) });
  res.status(201).json({ claim: data });
});

app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "FRONTEND", "index.html"));
});

app.listen(port, () => {
  console.log(`College Lost & Found Portal running at http://localhost:${port}`);
});
