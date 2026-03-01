const STORAGE_KEY = "swapkat-adventure-v4";
const DATA_KEY = "swapkat_main";

// Email whitelist: only these emails can access. Maps to user.
const ALLOWED_EMAILS = {
  "kumarswausc@gmail.com": "Swapnil",
  "tanguye1@gmail.com": "Kat"
};

const app = document.getElementById("app");
const loginTemplate = document.getElementById("login-template");
const dashboardTemplate = document.getElementById("dashboard-template");
const modalTemplate = document.getElementById("modal-template");

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function getThisWeekLabel() {
  const now = new Date();
  const start = new Date(now);
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1);
  start.setDate(diff);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  return `${fmt.format(start)} — ${fmt.format(end)}`;
}

function rollWeekIfNeeded(userData) {
  const currentWeek = getThisWeekLabel();
  if (userData.weekLabel === currentWeek) return false;
  // New week: pending from last week → this week; incomplete this week → "unfinished last week"; completed → remove
  const oldCarried = userData.tasks.filter((t) => t.carriedOver && !t.done);
  const newIncomplete = userData.tasks.filter((t) => !t.carriedOver && !t.done);
  userData.tasks = [
    ...oldCarried.map((t) => ({ ...t, carriedOver: false })),
    ...newIncomplete.map((t) => ({ ...t, carriedOver: true }))
  ];
  userData.weekLabel = currentWeek;
  return true;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createSeedData(name, context) {
  return {
    weekLabel: getThisWeekLabel(),
    tasks: [],
    outcomes: [],
    behaviors: [],
    behaviorLogs: [],
    history: [],
    name
  };
}

function isSupabaseConfigured() {
  return (
    window.SUPABASE_URL &&
    window.SUPABASE_ANON_KEY &&
    window.SUPABASE_URL.includes("supabase.co") &&
    window.SUPABASE_ANON_KEY.length > 20
  );
}

function getSupabase() {
  if (!window._supabaseClient) {
    window._supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }
  return window._supabaseClient;
}

function processState(state) {
  if (!state.currentContext) state.currentContext = "work";
  if (!state.sheetsExportUrl) state.sheetsExportUrl = "";
  if (!state.sheetsSecret) state.sheetsSecret = "";
  if (!state.users || !state.users.Swapnil || !state.users.Swapnil.work) {
    state.users = {
      Swapnil: { personal: createSeedData("Swapnil", "personal"), work: createSeedData("Swapnil", "work") },
      Kat: { personal: createSeedData("Kat", "personal"), work: createSeedData("Kat", "work") }
    };
  }
  let changed = false;
  Object.keys(state.users || {}).forEach((user) => {
    const u = state.users[user];
    if (u?.personal && rollWeekIfNeeded(u.personal)) changed = true;
    if (u?.work && rollWeekIfNeeded(u.work)) changed = true;
  });
  return changed;
}

function createSeedState() {
  return {
    currentUser: null,
    currentContext: "work",
    sheetsExportUrl: "",
    sheetsSecret: "",
    users: {
      Swapnil: { personal: createSeedData("Swapnil", "personal"), work: createSeedData("Swapnil", "work") },
      Kat: { personal: createSeedData("Kat", "personal"), work: createSeedData("Kat", "work") }
    }
  };
}

let memoryCache = null;

window.swapkatDbReady = (async function () {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await getSupabase().from("app_data").select("data").eq("key", DATA_KEY).single();
      if (error && error.code !== "PGRST116") throw error;
      memoryCache = data?.data ? data.data : createSeedState();
    } catch (e) {
      console.error("Supabase load failed, using localStorage", e);
      memoryCache = null;
    }
  }
  if (!memoryCache) {
    const saved = localStorage.getItem(STORAGE_KEY);
    memoryCache = saved ? JSON.parse(saved) : createSeedState();
  }
  if (processState(memoryCache)) {
    if (isSupabaseConfigured()) {
      try {
        await getSupabase().from("app_data").upsert({ key: DATA_KEY, data: memoryCache, updated_at: new Date().toISOString() }, { onConflict: "key" });
      } catch (e) {
        console.error("Supabase save failed", e);
      }
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryCache));
    }
  }
})();

function loadDB() {
  if (memoryCache) return memoryCache;
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? JSON.parse(saved) : createSeedState();
}

function saveDB(db) {
  memoryCache = db;
  if (isSupabaseConfigured()) {
    getSupabase()
      .from("app_data")
      .upsert({ key: DATA_KEY, data: db, updated_at: new Date().toISOString() }, { onConflict: "key" })
      .then(({ error }) => {
        if (error) console.error("Supabase save failed", error);
      });
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }
}

function getActiveUserData() {
  const state = loadDB();
  if (!state.currentUser) return null;
  const userData = state.users[state.currentUser];
  const ctx = state.currentContext || "work";
  return userData?.personal && userData?.work ? userData[ctx] : userData;
}

function withActiveUser(mutator) {
  const state = loadDB();
  const user = state.currentUser;
  const ctx = state.currentContext || "work";
  if (!user) return;
  const userData = state.users[user];
  if (userData?.personal && userData?.work) {
    mutator(userData[ctx], state, user);
  } else {
    mutator(userData, state, user);
  }
  saveDB(state);
}

function computeTaskProgress(tasks) {
  const currentWeek = tasks.filter((t) => !t.carriedOver);
  if (!currentWeek.length) return 0;
  return Math.round((currentWeek.filter((t) => t.done).length / currentWeek.length) * 100);
}

function linkedOutcomeProgress(outcome, data) {
  const linked = data.tasks.filter((t) => t.outcomeId === outcome.id && !t.carriedOver);
  if (!linked.length) return Math.max(0, Math.min(100, outcome.current));
  return Math.round((linked.filter((t) => t.done).length / linked.length) * 100);
}

function outcomeStatusText(pct) {
  if (pct >= 100) return "Goal met";
  if (pct >= 70) return "On track";
  return `${pct}% complete`;
}

// Topbar handlers - exposed globally for inline onclick (reliable across environments)
window.swapkatSetContext = function (ctx) {
  const next = loadDB();
  next.currentContext = ctx;
  saveDB(next);
  render();
};
window.swapkatSetUser = function (user) {
  const next = loadDB();
  next.currentUser = user;
  saveDB(next);
  render();
};
window.swapkatLogout = function () {
  const next = loadDB();
  next.currentUser = null;
  saveDB(next);
  render();
};

// Modal state via URL
function setModal(params = null) {
  const url = new URL(window.location.href);
  url.search = "";
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  }
  history.pushState({}, "", url);
  renderModal();
}

function getModalState() {
  const url = new URL(window.location.href);
  const modal = url.searchParams.get("modal");
  if (!modal) return null;
  return {
    modal,
    id: url.searchParams.get("id"),
    entity: url.searchParams.get("entity")
  };
}

function closeModal() {
  const url = new URL(window.location.href);
  url.search = "";
  history.pushState({}, "", url);
  renderModal();
}

// Render
function render() {
  const state = loadDB();
  if (!state.currentUser) renderLogin();
  else renderDashboard();
  renderModal();
}

function renderLogin() {
  app.innerHTML = "";
  app.appendChild(loginTemplate.content.cloneNode(true));

  const form = document.getElementById("login-form");
  const emailInput = document.getElementById("login-email");
  const errorEl = document.getElementById("login-error");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = String(emailInput?.value || "").trim().toLowerCase();
    errorEl.style.display = "none";
    errorEl.textContent = "";

    const user = ALLOWED_EMAILS[email];
    if (user) {
      const state = loadDB();
      state.currentUser = user;
      saveDB(state);
      render();
    } else {
      errorEl.textContent = "This email doesn't have access.";
      errorEl.style.display = "block";
    }
  });
}

function renderDashboard() {
  app.innerHTML = "";
  app.appendChild(dashboardTemplate.content.cloneNode(true));

  const state = loadDB();
  const active = state.currentUser;
  const data = getActiveUserData();

  document.querySelectorAll("[data-tab]").forEach((btn) => {
    const ctx = loadDB().currentContext || "work";
    if (btn.dataset.tab === ctx) btn.classList.add("active");
    else btn.classList.remove("active");
  });

  document.querySelectorAll("[data-user]").forEach((btn) => {
    if (btn.dataset.user === active) btn.classList.add("active");
    else btn.classList.remove("active");
  });

  renderGoalsCard(data);
  renderOutcomesCard(data);
  renderBehaviorsCard(data);
  renderHistoryCard(data);
  renderWeeklyReportCard(data);
}

function renderGoalsCard(data) {
  const el = document.getElementById("goals-card");
  const progress = computeTaskProgress(data.tasks);
  const normal = data.tasks.filter((t) => !t.carriedOver);
  const carried = data.tasks.filter((t) => t.carriedOver);

  el.innerHTML = `
    <div class="card-header">
      <div class="card-title">
        <h2>Weekly Goals</h2>
        <span class="badge-active">Active</span>
      </div>
      <button class="btn-add-circle" id="add-goal-btn" title="Add goal">+</button>
    </div>
    <div class="date-range">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      ${escapeHtml(data.weekLabel)}
    </div>
    <div class="progress-wrap">
      <div class="progress-num">${progress}<span>%</span></div>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${progress}%"></div></div>
    </div>
    <div class="task-list" id="task-list">
      ${normal.map((t) => taskRow(t, data)).join("")}
      ${carried.length ? `
        <div class="section-divider">
          <div class="section-label">Unfinished last week</div>
          ${carried.map((t) => taskRow(t, data, true)).join("")}
        </div>
      ` : ""}
    </div>
    <button class="btn-dashed" id="footer-add-task">+ Add Task</button>
  `;

  el.querySelector("#add-goal-btn").addEventListener("click", () => setModal({ modal: "add-task" }));
  el.querySelector("#footer-add-task").addEventListener("click", () => setModal({ modal: "add-task" }));

  el.querySelectorAll("[data-toggle-task]").forEach((node) => {
    node.addEventListener("click", () => {
      withActiveUser((userData) => {
        const t = userData.tasks.find((x) => x.id === node.dataset.toggleTask);
        if (t) t.done = !t.done;
      });
      render();
    });
  });

  el.querySelectorAll("[data-edit-task]").forEach((node) => {
    node.addEventListener("click", (e) => {
      e.stopPropagation();
      setModal({ modal: "add-task", id: node.dataset.editTask });
    });
  });

  el.querySelectorAll("[data-delete-task]").forEach((node) => {
    node.addEventListener("click", (e) => {
      e.stopPropagation();
      withActiveUser((userData) => {
        userData.tasks = userData.tasks.filter((t) => t.id !== node.dataset.deleteTask);
      });
      render();
    });
  });
}

function taskRow(t, data, carriedOver = false) {
  const outcome = t.outcomeId ? data.outcomes.find((o) => o.id === t.outcomeId) : null;
  const cls = (t.done ? "done " : "") + (carriedOver ? "carried-over" : "");
  return `
    <div class="task-item ${cls}" data-task-id="${t.id}">
      <div class="task-check ${t.done ? "checked" : ""}" data-toggle-task="${t.id}">
        ${t.done ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ""}
      </div>
      <div class="task-content">
        <div class="task-title">${escapeHtml(t.title)}</div>
        ${outcome ? `<div class="task-sub">Linked: ${escapeHtml(outcome.title)}</div>` : ""}
      </div>
      <div class="task-actions">
        <button data-edit-task="${t.id}">Edit</button>
        <button data-delete-task="${t.id}">Delete</button>
      </div>
    </div>
  `;
}

function renderOutcomesCard(data) {
  const el = document.getElementById("outcomes-card");
  const avgPct = data.outcomes.length
    ? Math.round(
        data.outcomes.reduce((sum, o) => sum + linkedOutcomeProgress(o, data), 0) / data.outcomes.length
      )
    : 0;
  el.innerHTML = `
    <div class="card-header">
      <div class="card-title">
        <h2>Important Outcomes</h2>
        <span class="badge-active">Active</span>
      </div>
      <button class="btn-add-circle" id="add-outcome-btn" title="Define outcome">+</button>
    </div>
    <div class="date-range">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      ${escapeHtml(data.weekLabel)}
    </div>
    <div class="progress-wrap">
      <div class="progress-num">${avgPct}<span>%</span></div>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${avgPct}%"></div></div>
    </div>
    <div class="task-list outcome-list">
      ${(data.outcomes || [])
        .map((o) => {
          const linked = data.tasks.filter((t) => t.outcomeId === o.id && !t.carriedOver);
          const doneCount = linked.filter((t) => t.done).length;
          const pct = linkedOutcomeProgress(o, data);
          const statusCls = pct >= 70 ? "updated" : "complete";
          const itemCls = pct >= 70 ? "updated" : "";
          const taskSummary = linked.length > 0 ? `${doneCount} of ${linked.length} tasks` : "No linked tasks";
          return `
          <div class="task-item outcome-item ${itemCls}">
            <div class="task-content" style="flex:1;">
              <div class="task-title">${escapeHtml(o.title)}</div>
              <div class="task-sub outcome-status ${statusCls}">${taskSummary} · ${pct}%</div>
              <div class="progress-bar" style="margin-top:6px; height:6px;"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
            </div>
            <div class="task-actions">
              <button data-edit-outcome="${o.id}">Edit</button>
              <button data-delete-outcome="${o.id}">Delete</button>
            </div>
          </div>
        `;
        })
        .join("")}
    </div>
    <button class="btn-dashed" id="define-outcome-btn">+ Define Outcome</button>
  `;

  el.querySelector("#add-outcome-btn").addEventListener("click", () => setModal({ modal: "define-outcome" }));
  el.querySelector("#define-outcome-btn").addEventListener("click", () => setModal({ modal: "define-outcome" }));

  el.querySelectorAll("[data-edit-outcome]").forEach((node) => {
    node.addEventListener("click", () => setModal({ modal: "edit-outcome", id: node.dataset.editOutcome }));
  });

  el.querySelectorAll("[data-delete-outcome]").forEach((node) => {
    node.addEventListener("click", () =>
      setModal({ modal: "delete-confirm", entity: "outcome", id: node.dataset.deleteOutcome })
    );
  });
}

function renderBehaviorsCard(data) {
  const el = document.getElementById("behaviors-card");
  const totalBreaches = (data.behaviorLogs || []).length;
  el.innerHTML = `
    <div class="card-header">
      <div class="card-title">
        <h2>Critical Behaviors</h2>
        <span class="badge-active">Active</span>
      </div>
      <button class="btn-add-circle" id="add-behavior-btn" title="Add behavior">+</button>
    </div>
    <div class="date-range">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      ${escapeHtml(data.weekLabel)}
    </div>
    <div class="progress-wrap progress-wrap-behaviors">
      <div class="progress-num">${totalBreaches}<span> breaches</span></div>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${Math.min(100, totalBreaches * 15)}%"></div></div>
    </div>
    <div class="task-list behavior-list">
      ${(data.behaviors || [])
        .map((b) => {
          const breachCount = (data.behaviorLogs || []).filter((l) => l.behaviorId === b.id).length;
          return `
          <div class="task-item behavior-item">
            <div class="task-content" style="flex:1;">
              <div class="task-title">${escapeHtml(b.title)}</div>
              <div class="task-sub behavior-goal">Goal: ${escapeHtml(b.goal)}</div>
              <div class="breach-control" style="margin-top:6px;">
                <button class="breach-btn breach-minus" data-remove-breach="${b.id}" title="Remove a breach" ${breachCount === 0 ? "disabled" : ""}>−</button>
                <span class="breach-badge" data-count="${breachCount}">${breachCount} breach${breachCount === 1 ? "" : "es"}</span>
                <button class="breach-btn breach-add-btn" data-add-breach="${b.id}" title="Mark a breach">+</button>
              </div>
            </div>
            <div class="task-actions">
              <button data-edit-behavior="${b.id}">Edit</button>
              <button data-delete-behavior="${b.id}">Delete</button>
            </div>
          </div>
        `;
        })
        .join("")}
    </div>
    <button class="btn-dashed" id="track-behavior-btn">+ Track Behavior</button>
  `;

  el.querySelector("#add-behavior-btn").addEventListener("click", () => setModal({ modal: "define-behavior" }));
  el.querySelector("#track-behavior-btn").addEventListener("click", () => setModal({ modal: "track-behavior" }));

  el.querySelectorAll("[data-edit-behavior]").forEach((node) => {
    node.addEventListener("click", () => setModal({ modal: "edit-behavior", id: node.dataset.editBehavior }));
  });

  el.querySelectorAll("[data-delete-behavior]").forEach((node) => {
    node.addEventListener("click", () => {
      withActiveUser((userData) => {
        userData.behaviors = userData.behaviors.filter((b) => b.id !== node.dataset.deleteBehavior);
        userData.behaviorLogs = userData.behaviorLogs.filter((l) => l.behaviorId !== node.dataset.deleteBehavior);
      });
      render();
    });
  });

  el.querySelectorAll("[data-add-breach]").forEach((node) => {
    node.addEventListener("click", () => {
      const behaviorId = node.dataset.addBreach;
      const now = new Date();
      withActiveUser((userData) => {
        userData.behaviorLogs.unshift({
          id: uid(),
          behaviorId,
          date: now.toISOString().slice(0, 10),
          time: now.toTimeString().slice(0, 5),
          notes: ""
        });
      });
      render();
    });
  });

  el.querySelectorAll("[data-remove-breach]").forEach((node) => {
    node.addEventListener("click", () => {
      const behaviorId = node.dataset.removeBreach;
      withActiveUser((userData) => {
        const idx = userData.behaviorLogs.findIndex((l) => l.behaviorId === behaviorId);
        if (idx >= 0) userData.behaviorLogs.splice(idx, 1);
      });
      render();
    });
  });
}

function renderHistoryCard(data) {
  const el = document.getElementById("history-card");
  const progress = computeTaskProgress(data.tasks);
  const now = new Date();
  const label = now.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
  const items = [{ label, score: progress }, ...data.history].slice(0, 8);

  el.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap;">
      <div>
        <h2>Historical Success</h2>
        <p class="subtitle">Goal completion performance across previous weeks</p>
      </div>
      <div class="history-nav">
        <button type="button" title="Previous">&lt;</button>
        <button type="button" title="Next">&gt;</button>
      </div>
    </div>
    <div class="history-row">
      ${items
        .map(
          (h, i) => `
        <div class="history-pill ${h.score === null ? "na" : ""} ${i === 0 ? "history-pill-current" : ""}" ${i === 0 ? 'data-append-sheet title="Click to append this week\'s report to Google Sheet"' : ""}>
          <div class="label">${escapeHtml(h.label)}</div>
          <div class="score">${h.score === null ? "N/A" : `${h.score}%`}</div>
        </div>
      `
        )
        .join("")}
    </div>
  `;

  el.querySelector("[data-append-sheet]")?.addEventListener("click", async () => {
    const state = loadDB();
    if (!state.sheetsExportUrl || !state.sheetsExportUrl.trim()) {
      setModal({ modal: "export-sheets" });
      return;
    }
    const pill = el.querySelector("[data-append-sheet]");
    const originalHtml = pill.innerHTML;
    pill.innerHTML = '<div class="label">Appending...</div><div class="score">–</div>';
    pill.classList.add("history-pill-loading");

    const result = await appendToGoogleSheet(data, "", "");

    if (result.success) {
      pill.innerHTML = '<div class="label">Done</div><div class="score">✓</div>';
      pill.classList.remove("history-pill-loading");
      pill.classList.add("history-pill-success");
      setTimeout(() => {
        pill.innerHTML = originalHtml;
        pill.classList.remove("history-pill-success");
      }, 1500);
    } else {
      pill.innerHTML = `<div class="label">${result.error || "Failed"}</div><div class="score">!</div>`;
      pill.classList.remove("history-pill-loading");
      pill.classList.add("history-pill-error");
      setTimeout(() => {
        pill.innerHTML = originalHtml;
        pill.classList.remove("history-pill-error");
      }, 2500);
    }
  });
}

async function appendToGoogleSheet(data, whatWentWell = "", whatToImprove = "") {
  const state = loadDB();
  const sheetsUrl = (state.sheetsExportUrl || "").trim();
  if (!sheetsUrl) return { success: false, configured: false, error: "Google Sheet URL not configured" };

  const payload = buildWeeklyReportPayload(data, whatWentWell, whatToImprove);

  try {
    const res = await fetch(sheetsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await res.json().catch(() => ({}));
    if (result.success) {
      return { success: true, configured: true };
    }
    return { success: false, configured: true, error: result.error || "Export failed" };
  } catch (err) {
    return { success: false, configured: true, error: "Could not connect" };
  }
}

function renderWeeklyReportCard(data) {
  const el = document.getElementById("report-card");
  const state = loadDB();
  el.innerHTML = `
    <div class="card-header">
      <div class="card-title">
        <h2>Weekly Report</h2>
      </div>
    </div>
    <p class="subtitle" style="margin-bottom:12px;">Export this week's summary to Google Sheets to track progress over time</p>
    <button class="btn-dashed" id="export-sheets-btn">Export to Google Sheets</button>
  `;
  el.querySelector("#export-sheets-btn").addEventListener("click", () => setModal({ modal: "export-sheets" }));
}

function buildWeeklyReportPayload(data, whatWentWell, whatToImprove) {
  const state = loadDB();
  const goalsAchievedPct = computeTaskProgress(data.tasks);
  const outcomes = data.outcomes || [];
  const outcomesAchievedPct =
    outcomes.length > 0
      ? Math.round(
          outcomes.reduce((sum, o) => sum + linkedOutcomeProgress(o, data), 0) / outcomes.length
        )
      : 0;
  const behaviorsBreached = {};
  (data.behaviors || []).forEach((b) => {
    const count = (data.behaviorLogs || []).filter((l) => l.behaviorId === b.id).length;
    behaviorsBreached[b.title] = count;
  });
  return {
    token: state.sheetsSecret || undefined,
    week: data.weekLabel,
    user: state.currentUser || "",
    context: state.currentContext || "work",
    goalsAchievedPct,
    outcomesAchievedPct,
    behaviorsBreached,
    whatWentWell: (whatWentWell || "").trim(),
    whatToImprove: (whatToImprove || "").trim()
  };
}

// Modals
function renderModal() {
  document.getElementById("modal-backdrop")?.remove();
  const state = getModalState();
  if (!state) return;

  const shell = modalTemplate.content.cloneNode(true);
  document.body.appendChild(shell);

  const backdrop = document.getElementById("modal-backdrop");
  const content = document.getElementById("modal-content");

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });

  const data = getActiveUserData();
  if (!data) return closeModal();

  const closeBtn = `<button class="modal-close" id="modal-close" type="button" aria-label="Close">&times;</button>`;

  // Add/Edit Task
  if (state.modal === "add-task") {
    const task = state.id ? data.tasks.find((t) => t.id === state.id) : null;
    const hasOutcomes = data.outcomes && data.outcomes.length > 0;
    content.innerHTML = `
      <div class="modal-head">
        <div>
          <div class="modal-icon outcome">+</div>
          <h3>${task ? "Edit Task" : "Add New Task"}</h3>
        </div>
        ${closeBtn}
      </div>
      <div class="modal-subhead">Each task must be linked to an outcome. Outcome progress is updated automatically when you complete tasks.</div>
      <form id="task-form">
        <label>
          <span class="label-text">Task description</span>
          <input name="title" required placeholder="e.g., Finalize project roadmap" value="${escapeHtml(task?.title || "")}" />
        </label>
        <label>
          <span class="label-text">Link to outcome <span class="required">*</span></span>
          <select name="outcomeId" required ${!hasOutcomes ? "disabled" : ""}>
            <option value="">${hasOutcomes ? "Choose an outcome..." : "Define an outcome first"}</option>
            ${(data.outcomes || []).map((o) => `<option value="${o.id}" ${task?.outcomeId === o.id ? "selected" : ""}>${escapeHtml(o.title)}</option>`).join("")}
          </select>
        </label>
        <div class="modal-actions">
          <button class="btn-primary" type="submit">${task ? "Save Task" : "Add Task"}</button>
          <button class="btn-ghost" type="button" id="cancel-task">Cancel</button>
        </div>
      </form>
    `;

    content.querySelector("#task-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const title = String(fd.get("title") || "").trim();
      const outcomeId = String(fd.get("outcomeId") || "").trim() || null;
      if (!title || !outcomeId) return;

      const taskId = task?.id;
      withActiveUser((userData) => {
        if (taskId) {
          const t = userData.tasks.find((x) => x.id === taskId);
          if (t) {
            t.title = title;
            t.outcomeId = outcomeId;
          }
        } else {
          userData.tasks.unshift({ id: uid(), title, done: false, outcomeId, carriedOver: false });
        }
      });
      closeModal();
      render();
    });
    content.querySelector("#cancel-task").addEventListener("click", closeModal);
  }

  // Define Outcome
  if (state.modal === "define-outcome") {
    content.innerHTML = `
      <div class="modal-head">
        <div>
          <div class="modal-icon outcome">★</div>
          <h3>Define New Outcome</h3>
        </div>
        ${closeBtn}
      </div>
      <div class="modal-subhead">Big picture goals</div>
      <form id="outcome-form">
        <label>
          <span class="label-text">Outcome name</span>
          <input name="title" required placeholder="e.g., Master the new design system" />
        </label>
        <label>
          <span class="label-text">Target goal (%)</span>
          <input type="number" name="current" min="0" max="100" value="0" />
        </label>
        <button class="btn-primary" type="submit">+ Add Outcome</button>
      </form>
    `;

    content.querySelector("#outcome-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const title = String(fd.get("title") || "").trim();
      const current = Number(fd.get("current") || 0);
      if (!title) return;

      withActiveUser((userData) => {
        userData.outcomes.unshift({ id: uid(), title, target: 100, current: Math.max(0, Math.min(100, current)) });
      });
      closeModal();
      render();
    });
  }

  // Edit Outcome
  if (state.modal === "edit-outcome") {
    const outcome = data.outcomes.find((o) => o.id === state.id);
    if (!outcome) return closeModal();

    const pct = linkedOutcomeProgress(outcome, data);
    content.innerHTML = `
      <div class="modal-head">
        <div>
          <div class="modal-icon outcome">★</div>
          <h3>Edit Outcome</h3>
        </div>
        ${closeBtn}
      </div>
      <div class="modal-subhead">Refine your targets</div>
      <form id="outcome-form">
        <label>
          <span class="label-text">Outcome name</span>
          <input name="title" required value="${escapeHtml(outcome.title)}" />
        </label>
        <label>
          <span class="label-text">Target goal (%)</span>
          <input type="number" name="current" min="0" max="100" value="${pct}" />
        </label>
        <button class="btn-primary" type="submit">Save Changes</button>
      </form>
    `;

    content.querySelector("#outcome-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const title = String(fd.get("title") || "").trim();
      const current = Number(fd.get("current") || 0);
      if (!title) return;

      const outcomeId = outcome.id;
      withActiveUser((userData) => {
        const o = userData.outcomes.find((x) => x.id === outcomeId);
        if (o) {
          o.title = title;
          o.current = Math.max(0, Math.min(100, current));
        }
      });
      closeModal();
      render();
    });
  }

  // Define Behavior
  if (state.modal === "define-behavior") {
    content.innerHTML = `
      <div class="modal-head">
        <div>
          <div class="modal-icon behavior">!</div>
          <h3>Add Critical Behavior</h3>
        </div>
        ${closeBtn}
      </div>
      <div class="modal-subhead">Behaviors you want to avoid or control</div>
      <form id="define-behavior-form">
        <label>
          <span class="label-text">Behavior description</span>
          <input name="title" required placeholder="e.g., Late-night screen time" />
        </label>
        <label>
          <span class="label-text">Refined goal</span>
          <textarea name="goal" required placeholder="e.g., No screens after 10pm"></textarea>
        </label>
        <button class="btn-primary" type="submit">+ Add Behavior</button>
      </form>
    `;

    content.querySelector("#define-behavior-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const title = String(fd.get("title") || "").trim();
      const goal = String(fd.get("goal") || "").trim();
      if (!title || !goal) return;

      withActiveUser((userData) => {
        if (!userData.behaviors) userData.behaviors = [];
        userData.behaviors.unshift({ id: uid(), title, goal });
      });
      closeModal();
      render();
    });
  }

  // Track Behavior
  if (state.modal === "track-behavior") {
    content.innerHTML = `
      <div class="modal-head">
        <div>
          <div class="modal-icon behavior">📊</div>
          <h3>Track Behavior Occurrence</h3>
        </div>
        ${closeBtn}
      </div>
      <div class="modal-subhead">Log an occurrence</div>
      <form id="track-form">
        <label>
          <span class="label-text">Select behavior</span>
          <select name="behaviorId" required>
            <option value="">Choose a critical behavior...</option>
            ${data.behaviors.map((b) => `<option value="${b.id}">${escapeHtml(b.title)}</option>`).join("")}
          </select>
        </label>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <label>
            <span class="label-text">Date</span>
            <input type="date" name="date" required value="${new Date().toISOString().slice(0, 10)}" />
          </label>
          <label>
            <span class="label-text">Time</span>
            <input type="time" name="time" required value="14:30" />
          </label>
        </div>
        <label>
          <span class="label-text">Notes / reflection</span>
          <textarea name="notes" placeholder="How did this happen? What can we improve?"></textarea>
        </label>
        <div class="modal-actions">
          <button class="btn-primary" type="submit">Log Occurrence</button>
          <button class="btn-ghost" type="button" id="cancel-track">Cancel</button>
        </div>
      </form>
    `;

    content.querySelector("#track-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const behaviorId = String(fd.get("behaviorId") || "");
      if (!behaviorId) return;

      withActiveUser((userData) => {
        userData.behaviorLogs.unshift({
          id: uid(),
          behaviorId,
          date: String(fd.get("date") || ""),
          time: String(fd.get("time") || ""),
          notes: String(fd.get("notes") || "")
        });
      });
      closeModal();
      render();
    });
    content.querySelector("#cancel-track")?.addEventListener("click", closeModal);
  }

  // Edit Behavior
  if (state.modal === "edit-behavior") {
    const behavior = data.behaviors.find((b) => b.id === state.id);
    if (!behavior) return closeModal();

    content.innerHTML = `
      <div class="modal-head">
        <div>
          <div class="modal-icon behavior">✎</div>
          <h3>Edit Critical Behavior</h3>
        </div>
        ${closeBtn}
      </div>
      <div class="modal-subhead">Adjust your habits</div>
      <form id="behavior-form">
        <label>
          <span class="label-text">Behavior description</span>
          <input name="title" required value="${escapeHtml(behavior.title)}" />
        </label>
        <label>
          <span class="label-text">Refined goal</span>
          <textarea name="goal" required>${escapeHtml(behavior.goal)}</textarea>
        </label>
        <p style="font-size:12px; color:var(--ink-muted); margin-top:-8px;">Make the goal specific and achievable</p>
        <button class="btn-primary" style="background:var(--lav)" type="submit">Update Behavior</button>
      </form>
    `;

    content.querySelector("#behavior-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const behaviorId = behavior.id;
      withActiveUser((userData) => {
        const b = userData.behaviors.find((x) => x.id === behaviorId);
        if (b) {
          b.title = String(fd.get("title") || "").trim();
          b.goal = String(fd.get("goal") || "").trim();
        }
      });
      closeModal();
      render();
    });
  }

  // Export to Google Sheets
  if (state.modal === "export-sheets") {
    const appState = loadDB();
    const url = appState.sheetsExportUrl || "";
    content.innerHTML = `
      <div class="modal-head">
        <div>
          <div class="modal-icon outcome">📊</div>
          <h3>Export Weekly Report</h3>
        </div>
        ${closeBtn}
      </div>
      <div class="modal-subhead">Send this week's summary to your Google Sheet</div>
      <form id="export-sheets-form">
        <label>
          <span class="label-text">Web App URL <span class="required">*</span></span>
          <input name="sheetsUrl" required placeholder="https://script.google.com/macros/s/.../exec" value="${escapeHtml(url)}" />
          <p style="font-size:11px; color:var(--ink-muted); margin-top:4px;">See SHEETS_SETUP.md for setup instructions</p>
        </label>
        <label>
          <span class="label-text">Secret token (optional)</span>
          <input name="sheetsSecret" type="password" placeholder="Leave empty if not set" value="${escapeHtml(appState.sheetsSecret || "")}" />
        </label>
        <label>
          <span class="label-text">What went well?</span>
          <textarea name="whatWentWell" placeholder="e.g., Completed 3 big tasks, stayed focused on outcomes"></textarea>
        </label>
        <label>
          <span class="label-text">What to improve?</span>
          <textarea name="whatToImprove" placeholder="e.g., Too many context switches, need better planning"></textarea>
        </label>
        <div class="modal-actions">
          <button class="btn-primary" type="submit" id="export-submit">Export to Sheet</button>
          <button class="btn-ghost" type="button" id="export-cancel">Cancel</button>
        </div>
      </form>
      <div id="export-status" style="display:none; margin-top:12px; font-size:13px; color:var(--mint);"></div>
    `;

    content.querySelector("#export-sheets-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const sheetsUrl = String(fd.get("sheetsUrl") || "").trim();
      const sheetsSecret = String(fd.get("sheetsSecret") || "").trim();
      const whatWentWell = String(fd.get("whatWentWell") || "");
      const whatToImprove = String(fd.get("whatToImprove") || "");
      if (!sheetsUrl) return;

      const state = loadDB();
      state.sheetsExportUrl = sheetsUrl;
      state.sheetsSecret = sheetsSecret;
      saveDB(state);

      const payload = buildWeeklyReportPayload(data, whatWentWell, whatToImprove);
      const statusEl = content.querySelector("#export-status");
      const submitBtn = content.querySelector("#export-submit");

      submitBtn.disabled = true;
      statusEl.style.display = "block";
      statusEl.textContent = "Exporting...";

      try {
        const res = await fetch(sheetsUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await res.json().catch(() => ({}));
        if (result.success) {
          statusEl.textContent = "✓ Exported! Check your Google Sheet.";
          statusEl.style.color = "var(--mint)";
        } else {
          statusEl.textContent = result.error || "Export failed. Check URL and try again.";
          statusEl.style.color = "var(--danger)";
        }
      } catch (err) {
        statusEl.textContent = "Could not connect. Try form export below.";
        statusEl.style.color = "var(--peach)";
        const form = document.createElement("form");
        form.method = "POST";
        form.action = sheetsUrl;
        form.target = "_blank";
        form.style.display = "none";
        const input = document.createElement("input");
        input.name = "data";
        input.value = JSON.stringify(payload);
        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
      }
      submitBtn.disabled = false;
    });

    content.querySelector("#export-cancel")?.addEventListener("click", closeModal);
  }

  // Delete Confirm
  if (state.modal === "delete-confirm") {
    const entityLabel = state.entity === "outcome" ? "Outcome" : "Item";
    content.innerHTML = `
      <div class="modal-delete-content">
        <div class="modal-icon trash">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </div>
        <h3>Delete ${entityLabel}?</h3>
        <p>Are you sure you want to remove this ${entityLabel.toLowerCase()}? All linked tasks will be unlinked.</p>
        <div class="modal-delete-actions">
          <button class="btn-ghost" id="cancel-delete">No, Keep it</button>
          <button class="btn-danger" id="confirm-delete">Yes, Delete</button>
        </div>
      </div>
    `;

    content.querySelector("#cancel-delete").addEventListener("click", closeModal);
    content.querySelector("#confirm-delete").addEventListener("click", () => {
      withActiveUser((userData) => {
        if (state.entity === "outcome") {
          userData.outcomes = userData.outcomes.filter((o) => o.id !== state.id);
          userData.tasks = userData.tasks.map((t) =>
            t.outcomeId === state.id ? { ...t, outcomeId: null } : t
          );
        }
      });
      closeModal();
      render();
    });
  }

  content.querySelector("#modal-close")?.addEventListener("click", closeModal);
}

window.addEventListener("popstate", () => renderModal());

// Topbar clicks: use CAPTURE phase so we receive events before any overlay/interceptor
function handleTopbarClick(e) {
  const el = e.target && e.target.nodeType === 1 ? e.target : (e.target && e.target.parentElement);
  if (!el || !el.closest) return;
  const tabBtn = el.closest("[data-tab]");
  if (tabBtn) {
    e.preventDefault();
    e.stopPropagation();
    window.swapkatSetContext(tabBtn.dataset.tab);
    return;
  }
  const userBtn = el.closest("[data-user]");
  if (userBtn) {
    e.preventDefault();
    e.stopPropagation();
    window.swapkatSetUser(userBtn.dataset.user);
    return;
  }
  if (el.closest("#logout-btn")) {
    e.preventDefault();
    e.stopPropagation();
    window.swapkatLogout();
  }
}
document.addEventListener("click", handleTopbarClick, true);
