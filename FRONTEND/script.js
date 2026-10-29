const state = { token: localStorage.getItem("lf_token"), user: null };

const $ = (id) => document.getElementById(id);

function message(el, text = "", type = "") {
  el.textContent = text;
  el.className = `message ${type}`.trim();
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function showAuth() {
  $("authSection").classList.remove("hidden");
  $("appSection").classList.add("hidden");
  $("logoutBtn").classList.add("hidden");
  $("userGreeting").classList.add("hidden");
}

function showApp() {
  $("authSection").classList.add("hidden");
  $("appSection").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");
  $("userGreeting").classList.remove("hidden");
  $("userGreeting").textContent = state.user?.name ? `Hi, ${state.user.name}` : "";
}

function authErrorText(error) {
  const text = String(error.message || "").toLowerCase();
  if (text.includes("rate") || text.includes("too many") || text.includes("email rate")) {
    return "Supabase has temporarily rate-limited email authentication. Please wait before trying again; this app will not repeatedly retry the request.";
  }
  if (text.includes("invalid api key") || text.includes("apikey")) {
    return "The Supabase API key configuration is invalid. Check the backend .env values and restart the server.";
  }
  return error.message || "Something went wrong.";
}

async function loadSession() {
  if (!state.token) return showAuth();
  try {
    const data = await api("/api/auth/me");
    state.user = data.user;
    showApp();
    await loadItems();
    await loadMyPosts();
  } catch {
    localStorage.removeItem("lf_token");
    state.token = null;
    showAuth();
  }
}

$("loginTab").addEventListener("click", () => {
  $("loginTab").classList.add("active"); $("signupTab").classList.remove("active");
  $("loginForm").classList.remove("hidden"); $("signupForm").classList.add("hidden");
});
$("signupTab").addEventListener("click", () => {
  $("signupTab").classList.add("active"); $("loginTab").classList.remove("active");
  $("signupForm").classList.remove("hidden"); $("loginForm").classList.add("hidden");
});

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("loginBtn"); btn.disabled = true; message($("loginMessage"), "Signing in...", "info");
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: $("loginEmail").value.trim(), password: $("loginPassword").value })
    });
    state.token = data.session.access_token;
    state.user = data.user;
    localStorage.setItem("lf_token", state.token);
    message($("loginMessage"), "Login successful.", "success");
    showApp(); await loadItems(); await loadMyPosts();
  } catch (error) {
    message($("loginMessage"), authErrorText(error), "error");
  } finally { btn.disabled = false; }
});

$("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("signupBtn"); btn.disabled = true;
  const password = $("signupPassword").value;
  const confirm = $("signupConfirm").value;
  if (password !== confirm) {
    message($("signupMessage"), "Passwords do not match.", "error");
    btn.disabled = false; return;
  }
  message($("signupMessage"), "Creating your account...", "info");
  try {
    const data = await api("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        name: $("signupName").value.trim(),
        email: $("signupEmail").value.trim(),
        password
      })
    });
    if (data.session) {
      state.token = data.session.access_token;
      state.user = data.user;
      localStorage.setItem("lf_token", state.token);
      message($("signupMessage"), "Account created successfully.", "success");
      showApp(); await loadItems(); await loadMyPosts();
    } else {
      message($("signupMessage"), data.message || "Account created. Check your email if confirmation is required, then log in.", "success");
      $("loginTab").click();
      $("loginEmail").value = $("signupEmail").value.trim();
    }
  } catch (error) {
    message($("signupMessage"), authErrorText(error), "error");
  } finally { btn.disabled = false; }
});

$("logoutBtn").addEventListener("click", async () => {
  try { await api("/api/auth/logout", { method: "POST" }); } catch {}
  localStorage.removeItem("lf_token"); state.token = null; state.user = null; showAuth();
});

async function loadItems() {
  message($("itemsMessage"), "Loading items...", "info");
  try {
    const params = new URLSearchParams();
    const search = $("searchInput").value.trim();
    const type = $("typeFilter").value;
    if (search) params.set("search", search);
    if (type) params.set("type", type);
    const data = await api(`/api/items?${params.toString()}`);
    renderItems(data.items);
    message($("itemsMessage"), `${data.items.length} item(s) found.`, "info");
  } catch (error) { message($("itemsMessage"), error.message, "error"); }
}

function renderItems(items) {
  const grid = $("itemsGrid");
  if (!items.length) { grid.innerHTML = "<div class='card' style='padding:22px'>No matching posts yet.</div>"; return; }
  grid.innerHTML = items.map(item => `
    <article class="item-card">
      ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.item_name)}">` : ""}
      <div class="item-body">
        <span class="pill ${item.item_type === "LOST" ? "lost" : "found"}">${item.item_type}</span>
        <h3>${escapeHtml(item.item_name)}</h3>
        <div class="meta">
          <strong>Category:</strong> ${escapeHtml(item.category)}<br>
          <strong>Location:</strong> ${escapeHtml(item.location)}<br>
          <strong>Date:</strong> ${escapeHtml(item.item_date)}<br>
          <strong>Status:</strong> ${escapeHtml(item.status)}
        </div>
        <p>${escapeHtml(item.description)}</p>
        ${item.user_id !== state.user?.id ? `<button class="btn secondary claim-btn" data-id="${item.id}">Report/Claim</button>` : ""}
      </div>
    </article>
  `).join("");
  document.querySelectorAll(".claim-btn").forEach(btn => btn.addEventListener("click", () => submitClaim(btn.dataset.id)));
}

async function submitClaim(itemId) {
  const msg = prompt("Enter a short message explaining why you are reporting/claiming this item:");
  if (!msg?.trim()) return;
  try {
    await api(`/api/items/${itemId}/claims`, { method: "POST", body: JSON.stringify({ message: msg.trim() }) });
    alert("Your claim/report was submitted.");
  } catch (error) { alert(error.message); }
}

async function loadMyPosts() {
  try {
    const data = await api("/api/my-items");
    $("myPosts").innerHTML = data.items.length ? data.items.map(item => `
      <div class="my-post">
        <div><strong>${escapeHtml(item.item_name)}</strong> — ${escapeHtml(item.item_type)} — ${escapeHtml(item.status)}</div>
        <button class="btn secondary delete-btn" data-id="${item.id}">Delete</button>
      </div>`).join("") : "<p>No posts yet.</p>";
    document.querySelectorAll(".delete-btn").forEach(btn => btn.addEventListener("click", () => deleteItem(btn.dataset.id)));
  } catch (error) { $("myPosts").innerHTML = `<p class="message error">${escapeHtml(error.message)}</p>`; }
}

async function deleteItem(id) {
  if (!confirm("Delete this post?")) return;
  try { await api(`/api/items/${id}`, { method: "DELETE" }); await loadItems(); await loadMyPosts(); }
  catch (error) { alert(error.message); }
}

$("openPostBtn").addEventListener("click", () => $("postModal").classList.remove("hidden"));
$("closePostBtn").addEventListener("click", () => $("postModal").classList.add("hidden"));
$("postModal").addEventListener("click", e => { if (e.target === $("postModal")) $("postModal").classList.add("hidden"); });
$("refreshBtn").addEventListener("click", loadItems);
$("refreshMyPostsBtn").addEventListener("click", loadMyPosts);
$("searchInput").addEventListener("input", debounce(loadItems, 350));
$("typeFilter").addEventListener("change", loadItems);

$("itemForm").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = $("itemSubmitBtn"); btn.disabled = true; message($("itemMessage"), "Publishing...", "info");
  try {
    await api("/api/items", {
      method: "POST",
      body: JSON.stringify({
        item_type: $("itemType").value,
        item_name: $("itemName").value.trim(),
        category: $("itemCategory").value.trim(),
        description: $("itemDescription").value.trim(),
        location: $("itemLocation").value.trim(),
        item_date: $("itemDate").value,
        image_url: $("itemImage").value.trim() || null
      })
    });
    message($("itemMessage"), "Post published successfully.", "success");
    $("itemForm").reset();
    setTimeout(() => $("postModal").classList.add("hidden"), 500);
    await loadItems(); await loadMyPosts();
  } catch (error) { message($("itemMessage"), error.message, "error"); }
  finally { btn.disabled = false; }
});

function debounce(fn, wait) {
  let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[ch]));
}

loadSession();
