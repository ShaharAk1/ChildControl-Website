"use strict";

// Public by design - a Firebase Web API key isn't a secret. Access control
// is enforced by the Firestore Security Rules on the backend, not by
// hiding this value (same reasoning as childcontrol/cloud.py on the
// Python side).
const firebaseConfig = {
  apiKey: "AIzaSyBaE0ixwC5MArO1EqHbfbegnJxx19BA1oE",
  authDomain: "childcontrol-fae4f.firebaseapp.com",
  projectId: "childcontrol-fae4f",
  storageBucket: "childcontrol-fae4f.firebasestorage.app",
  messagingSenderId: "695856159095",
  appId: "1:695856159095:web:c9430b13623121c5c36972",
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// --- schedule constants, mirrored from childcontrol/schedule.py ---------------

const SLOTS_PER_DAY = 48;
// Grid rows top-to-bottom as day indices (Monday=0): shown Sunday-first, but
// stored and synced Monday-first like childcontrol/schedule.py.
const ROW_DAYS = [6, 0, 1, 2, 3, 4, 5];
const STATES = ["F", "S", "L"];
const stateName = (code) => (["F", "S", "L"].includes(code) ? t("state." + code) : t("state.unknown"));
const STATE_COLORS = { F: "#3fa579", S: "#e0982f", L: "#dd6b7f" };
// Darker shades for white text on the status pill (the grid keeps the lighter ones).
const PILL_COLORS = { F: "#2b8a5f", S: "#b56b0a", L: "#c4425a" };

function blankWeek(state) {
  return Array.from({ length: 7 }, () => (state || "F").repeat(SLOTS_PER_DAY));
}

function normalizeWeek(week) {
  if (!Array.isArray(week)) return blankWeek();
  const fixed = [];
  for (let day = 0; day < 7; day++) {
    let row = typeof week[day] === "string" ? week[day] : "";
    row = [...row].map((c) => (STATES.includes(c) ? c : "F")).join("");
    row = (row + "F".repeat(SLOTS_PER_DAY)).slice(0, SLOTS_PER_DAY);
    fixed.push(row);
  }
  return fixed;
}

function relativeTime(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return t("rel.now");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("rel.min", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("rel.hour", { n: hours });
  return t("rel.day", { n: Math.floor(hours / 24) });
}

function friendlyAuthError(err) {
  const map = {
    "auth/invalid-email": "err.invalidEmail",
    "auth/user-not-found": "err.userNotFound",
    "auth/wrong-password": "err.wrongPassword",
    "auth/email-already-in-use": "err.emailInUse",
    "auth/weak-password": "err.weakPassword",
    "auth/invalid-credential": "err.invalidCredential",
  };
  return map[err.code] ? t(map[err.code]) : err.message || t("err.generic");
}

// --- view switching -------------------------------------------------------------
// Only ever changed by explicit user actions (login, a successful pairing,
// "link another device", logout) - never reactively from a Firestore
// snapshot, or a background heartbeat update would yank the parent out of
// whatever they're doing (e.g. mid-pairing-code-entry).

const views = {
  login: document.getElementById("view-login"),
  pairing: document.getElementById("view-pairing"),
  dashboard: document.getElementById("view-dashboard"),
};
const loadingEl = document.getElementById("loading");

function setView(name) {
  loadingEl.hidden = true;
  for (const [key, el] of Object.entries(views)) el.hidden = key !== name;
}

// --- login / sign up -------------------------------------------------------------

document.getElementById("show-signup").addEventListener("click", () => {
  document.getElementById("login-form").hidden = true;
  document.getElementById("signup-form").hidden = false;
});
document.getElementById("show-login").addEventListener("click", () => {
  document.getElementById("signup-form").hidden = true;
  document.getElementById("login-form").hidden = false;
});

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");
  errorEl.hidden = true;
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    errorEl.textContent = friendlyAuthError(err);
    errorEl.hidden = false;
  }
});

document.getElementById("signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const errorEl = document.getElementById("signup-error");
  errorEl.hidden = true;
  try {
    await auth.createUserWithEmailAndPassword(email, password);
  } catch (err) {
    errorEl.textContent = friendlyAuthError(err);
    errorEl.hidden = false;
  }
});

document.getElementById("pairing-logout").addEventListener("click", () => auth.signOut());
document.getElementById("dashboard-logout").addEventListener("click", () => auth.signOut());
document.getElementById("link-another").addEventListener("click", () => setView("pairing"));

// --- pairing ----------------------------------------------------------------------

document.getElementById("pairing-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const codeInput = document.getElementById("pairing-code");
  const code = codeInput.value.trim().toUpperCase();
  const errorEl = document.getElementById("pairing-error");
  errorEl.hidden = true;

  let codeDoc;
  try {
    codeDoc = await db.collection("pairing_codes").doc(code).get();
  } catch (err) {
    // A denied read (expired past the rule's 15-minute window) looks the
    // same to the parent as a code that never existed.
    errorEl.textContent = t("err.codeNotFound");
    errorEl.hidden = false;
    return;
  }
  if (!codeDoc.exists) {
    errorEl.textContent = t("err.codeNotFound");
    errorEl.hidden = false;
    return;
  }

  const deviceUid = codeDoc.data().deviceUid;
  try {
    await db.collection("devices").doc(deviceUid).update({ ownerUid: auth.currentUser.uid });
  } catch (err) {
    errorEl.textContent = t("err.alreadyLinked");
    errorEl.hidden = false;
    return;
  }
  codeDoc.ref.delete().catch(() => {}); // best-effort cleanup, not security-relevant

  codeInput.value = "";
  setView("dashboard");
});

// --- dashboard: schedule grid (mirrors childcontrol/gui.py's ScheduleGrid) --------

function buildScheduleGrid(container, initialWeek, onDirty) {
  const CELL_W = 12;
  const CELL_H = 20;
  const LABEL_W = 68;
  const HEADER_H = 18;

  const canvas = document.createElement("canvas");
  canvas.className = "schedule-canvas";
  canvas.width = LABEL_W + SLOTS_PER_DAY * CELL_W + 2;
  canvas.height = HEADER_H + 7 * CELL_H + 2;
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  let week = initialWeek.slice();
  let brush = "S";

  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#5f6b86";
    ctx.font = "9px Segoe UI, sans-serif";
    ctx.textAlign = "left";
    for (let slot = 0; slot < SLOTS_PER_DAY; slot += 4) {
      const x = LABEL_W + slot * CELL_W;
      const hh = String(Math.floor(slot / 2)).padStart(2, "0");
      ctx.fillText(`${hh}:00`, x + 2, HEADER_H - 5);
    }
    for (let rowIndex = 0; rowIndex < 7; rowIndex++) {
      const day = ROW_DAYS[rowIndex];
      const y = HEADER_H + rowIndex * CELL_H;
      ctx.fillStyle = "#20263a";
      ctx.font = "10px Segoe UI, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(t("day." + day), LABEL_W - 8, y + CELL_H / 2 + 4);
      for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
        const x = LABEL_W + slot * CELL_W;
        ctx.fillStyle = STATE_COLORS[week[day][slot]];
        roundRectPath(x + 1, y + 1, CELL_W - 1, CELL_H - 1, 3);
        ctx.fill();
      }
    }
  }

  function cellAt(x, y) {
    const rowIndex = Math.floor((y - HEADER_H) / CELL_H);
    const slot = Math.floor((x - LABEL_W) / CELL_W);
    if (rowIndex < 0 || rowIndex > 6 || slot < 0 || slot >= SLOTS_PER_DAY) return null;
    return [ROW_DAYS[rowIndex], slot];
  }

  function paint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    const cell = cellAt(x, y);
    if (!cell) return;
    const [day, slot] = cell;
    if (week[day][slot] === brush) return;
    week[day] = week[day].slice(0, slot) + brush + week[day].slice(slot + 1);
    draw();
    onDirty();
  }

  let painting = false;
  canvas.addEventListener("mousedown", (e) => { painting = true; paint(e.clientX, e.clientY); });
  canvas.addEventListener("mousemove", (e) => { if (painting) paint(e.clientX, e.clientY); });
  window.addEventListener("mouseup", () => { painting = false; });
  canvas.addEventListener("touchstart", (e) => {
    painting = true;
    const t = e.touches[0];
    paint(t.clientX, t.clientY);
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener("touchmove", (e) => {
    if (!painting) return;
    const t = e.touches[0];
    paint(t.clientX, t.clientY);
    e.preventDefault();
  }, { passive: false });
  window.addEventListener("touchend", () => { painting = false; });

  draw();

  return {
    setBrush: (b) => { brush = b; },
    getWeek: () => week.slice(),
    setWeek: (w) => { week = normalizeWeek(w); draw(); },
  };
}

// --- dashboard: per-device card --------------------------------------------------

function pushOverride(deviceId, state, minutes) {
  const until = new Date(Date.now() + minutes * 60000).toISOString();
  return db.collection("devices").doc(deviceId).update({
    override: { state, until },
    overrideUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

function clearOverride(deviceId) {
  return db.collection("devices").doc(deviceId).update({
    override: null,
    overrideUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

// --- blocked sites / apps editors ------------------------------------------------

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const LISTS_PENDING_MAX_MS = 5 * 60 * 1000;

// Mirrors the agent's normalisation (hosts_block.normalize_domain) so what
// you see here is exactly what the PC will store.
function normalizeDomain(raw) {
  let d = raw.trim().toLowerCase().replace(/^https?:\/\//, "");
  d = d.split("/")[0].split("?")[0];
  if (d.startsWith("www.")) d = d.slice(4);
  return d;
}

function normalizeApp(raw) {
  return raw.trim();
}

function checkDomain(d) {
  return d.length <= 253 && DOMAIN_RE.test(d) ? "" : t("lists.badDomain");
}

function checkApp(a) {
  if (!a.toLowerCase().endsWith(".exe")) return t("lists.appExe");
  if (a.length > 100 || /[\\/:*?"<>|]/.test(a)) return t("lists.appPath");
  return "";
}

function sameList(a, b) {
  const key = (l) => l.map((x) => x.toLowerCase()).sort().join("\n");
  return key(a) === key(b);
}

function createListEditor(title, hint, normalize, check, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "list-editor";
  const h = document.createElement("h3");
  h.textContent = title;
  wrap.appendChild(h);
  const chips = document.createElement("div");
  chips.className = "chips";
  wrap.appendChild(chips);
  const row = document.createElement("form");
  row.className = "list-add-row";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = hint;
  input.autocomplete = "off";
  const addBtn = document.createElement("button");
  addBtn.type = "submit";
  addBtn.className = "pill-btn small";
  addBtn.textContent = t("lists.add");
  row.append(input, addBtn);
  wrap.appendChild(row);
  const err = document.createElement("p");
  err.className = "error";
  wrap.appendChild(err);

  let items = [];
  function render() {
    chips.textContent = "";
    if (!items.length) {
      const empty = document.createElement("span");
      empty.className = "muted";
      empty.textContent = t("lists.empty");
      chips.appendChild(empty);
    }
    for (const item of items) {
      const chip = document.createElement("span");
      chip.className = "chip";
      const label = document.createElement("bdi");
      label.textContent = item;
      chip.appendChild(label);
      const x = document.createElement("button");
      x.type = "button";
      x.setAttribute("aria-label", t("lists.remove", { item }));
      x.textContent = "×";
      x.addEventListener("click", () => {
        items = items.filter((i) => i !== item);
        render();
        onChange();
      });
      chip.appendChild(x);
      chips.appendChild(chip);
    }
  }
  row.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = normalize(input.value);
    if (!value) return;
    const problem = check(value);
    if (problem) { err.textContent = problem; return; }
    err.textContent = "";
    if (!items.some((i) => i.toLowerCase() === value.toLowerCase())) {
      items = [...items, value];
      render();
      onChange();
    }
    input.value = "";
  });
  render();
  return {
    el: wrap,
    get: () => items.slice(),
    set: (list) => { items = list.slice(); render(); },
  };
}

function createPendingBadge() {
  const el = document.createElement("div");
  el.className = "pending-badge";
  el.hidden = true;
  const spinner = document.createElement("span");
  spinner.className = "pending-spinner";
  const text = document.createElement("span");
  text.className = "pending-text";
  el.append(spinner, text);
  return { el, text };
}

function createDeviceCard(deviceId, data) {
  const el = document.createElement("div");
  el.className = "card device-card";

  const header = document.createElement("div");
  header.className = "device-header";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "device-name";
  nameInput.value = data.name || "";
  nameInput.placeholder = t("device.namePlaceholder");
  nameInput.addEventListener("change", () => {
    db.collection("devices").doc(deviceId)
      .update({ name: nameInput.value.trim() })
      .catch((err) => console.error("name update failed", err));
  });
  header.appendChild(nameInput);
  const statusPill = document.createElement("span");
  statusPill.className = "status-pill";
  header.appendChild(statusPill);
  el.appendChild(header);

  const lastSeenEl = document.createElement("p");
  lastSeenEl.className = "muted last-seen";
  el.appendChild(lastSeenEl);

  const overrideRow = document.createElement("div");
  overrideRow.className = "override-row";
  const overrideButtons = [
    [t("override.free30"), "F", 30],
    [t("override.free120"), "F", 120],
    [t("override.study60"), "S", 60],
    [t("override.lock60"), "L", 60],
  ];
  for (const [label, state, minutes] of overrideButtons) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pill-btn small";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      pushOverride(deviceId, state, minutes)
        .then(() => startPending(state))
        .catch((err) => alert(t("couldNotSend", { msg: err.message })));
    });
    overrideRow.appendChild(btn);
  }
  el.appendChild(overrideRow);
  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "link-btn";
  backBtn.textContent = t("override.back");
  backBtn.addEventListener("click", () => {
    clearOverride(deviceId)
      .then(() => startPending(null))
      .catch((err) => alert(t("couldNotSend", { msg: err.message })));
  });
  el.appendChild(backBtn);

  const overridePending = createPendingBadge();
  const pendingBadge = overridePending.el;
  const pendingText = overridePending.text;
  el.appendChild(pendingBadge);

  const brushRow = document.createElement("div");
  brushRow.className = "brush-row";
  brushRow.style.marginTop = "16px";
  const gridSection = document.createElement("div");
  gridSection.className = "grid-section";
  gridSection.dir = "ltr";

  let dirty = false;
  const grid = buildScheduleGrid(gridSection, normalizeWeek(data.schedule), () => {
    dirty = true;
    saveBtn.disabled = false;
    saveBtn.textContent = t("schedule.save");
  });

  for (const state of STATES) {
    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = `brush-${deviceId}`;
    radio.value = state;
    if (state === "S") radio.checked = true;
    radio.addEventListener("change", () => grid.setBrush(state));
    label.appendChild(radio);
    label.append(` ${stateName(state)}`);
    brushRow.appendChild(label);
  }
  el.appendChild(brushRow);

  const legend = document.createElement("div");
  legend.className = "state-legend";
  const legendItems = [
    ["F", t("legend.F")],
    ["S", t("legend.S")],
    ["L", t("legend.L")],
  ];
  for (const [state, text] of legendItems) {
    const item = document.createElement("span");
    item.className = "legend-item";
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = STATE_COLORS[state];
    item.append(swatch, text);
    legend.appendChild(item);
  }
  el.appendChild(legend);
  el.appendChild(gridSection);

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "pill-btn";
  saveBtn.textContent = t("schedule.save");
  saveBtn.disabled = true;
  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = t("saving");
    try {
      await db.collection("devices").doc(deviceId).update({
        schedule: grid.getWeek(),
        scheduleUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      dirty = false;
      saveBtn.textContent = t("saved");
      setTimeout(() => { if (!dirty) saveBtn.textContent = t("schedule.save"); }, 1500);
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.textContent = t("schedule.save");
      alert(t("couldNotSave", { msg: err.message }));
    }
  });
  el.appendChild(saveBtn);
  const schedulePending = createPendingBadge();
  el.appendChild(schedulePending.el);

  // --- blocked sites / apps (the PC's own lists are the source of truth) ---
  const listsSection = document.createElement("div");
  listsSection.className = "lists-section";
  let listsDirty = false;
  const markListsDirty = () => {
    listsDirty = true;
    saveListsBtn.disabled = false;
    saveListsBtn.textContent = t("lists.save");
  };
  const sitesEditor = createListEditor(t("lists.sites"), "youtube.com", normalizeDomain, checkDomain, markListsDirty);
  const appsEditor = createListEditor(t("lists.apps"), "steam.exe", normalizeApp, checkApp, markListsDirty);
  const listsNote = document.createElement("p");
  listsNote.className = "muted";
  const saveListsBtn = document.createElement("button");
  saveListsBtn.type = "button";
  saveListsBtn.className = "pill-btn";
  saveListsBtn.textContent = t("lists.save");
  saveListsBtn.disabled = true;
  const listsPending = createPendingBadge();
  saveListsBtn.addEventListener("click", async () => {
    saveListsBtn.disabled = true;
    saveListsBtn.textContent = t("saving");
    try {
      await db.collection("devices").doc(deviceId).update({
        blockedSites: sitesEditor.get(),
        blockedApps: appsEditor.get(),
        blockedUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      listsDirty = false;
      saveListsBtn.textContent = t("sent");
      setTimeout(() => { if (!listsDirty) saveListsBtn.textContent = t("lists.save"); }, 1500);
    } catch (err) {
      saveListsBtn.disabled = false;
      saveListsBtn.textContent = t("lists.save");
      alert(t("couldNotSave", { msg: err.message }) +
        (err.code === "permission-denied" ? "\n\n" + t("permissionHint") : ""));
    }
  });
  listsSection.append(sitesEditor.el, appsEditor.el, listsNote, saveListsBtn, listsPending.el);
  el.appendChild(listsSection);

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "link-btn";
  removeBtn.textContent = t("unlink.btn");
  removeBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim() || t("unlink.thisDevice");
    if (!confirm(t("unlink.confirm", { name }))) return;
    try {
      await db.collection("devices").doc(deviceId).update({ ownerUid: null });
    } catch (err) {
      alert(t("unlink.failed", { msg: err.message }));
    }
  });
  el.appendChild(removeBtn);

  // The PC only checks in about once a minute, and the status it reports
  // lags one more heartbeat behind, so show a "Pending" badge next to the
  // (possibly stale) status. Persisted so a page reload doesn't lose it.
  const PENDING_MAX_MS = 3 * 60 * 1000;
  const PENDING_KEY = `pending:${deviceId}`;
  let pending = loadPending(); // { target, startedAt, heartbeats, lastSeenMs }
  let lastData = data;
  let pendingTimer = null;

  function loadPending() {
    try {
      const p = JSON.parse(localStorage.getItem(PENDING_KEY));
      return p && typeof p.startedAt === "number" ? p : null;
    } catch (e) { return null; }
  }

  function savePending() {
    try {
      if (pending) localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      else localStorage.removeItem(PENDING_KEY);
    } catch (e) { /* storage unavailable: pending just won't survive a reload */ }
  }

  function lastSeenMs(docData) {
    return docData.lastSeen && docData.lastSeen.toMillis ? docData.lastSeen.toMillis() : 0;
  }

  function schedulePendingExpiry() {
    clearTimeout(pendingTimer);
    if (!pending) return;
    pendingTimer = setTimeout(() => updateStatus(lastData), Math.max(0, pending.startedAt + PENDING_MAX_MS - Date.now()) + 500);
  }

  function startPending(target) {
    pending = { target, startedAt: Date.now(), heartbeats: 0, lastSeenMs: lastSeenMs(lastData) };
    savePending();
    schedulePendingExpiry();
    updateStatus(lastData);
  }

  // The grid mirrors the schedule the PC itself reports; while a saved
  // schedule is still on its way, show what was sent instead of the old one.
  let scheduleTimer = null;
  function updateSchedule(docData) {
    const reportedRaw = (docData.status || {}).schedule;
    const reported = Array.isArray(reportedRaw) && reportedRaw.length === 7 ? reportedRaw : null;
    const requested = Array.isArray(docData.schedule) && docData.schedule.length === 7 ? docData.schedule : null;
    const sentAt = docData.scheduleUpdatedAt && docData.scheduleUpdatedAt.toMillis ? docData.scheduleUpdatedAt.toMillis() : 0;
    const recent = sentAt && Date.now() - sentAt < LISTS_PENDING_MAX_MS;
    const waiting = !!(recent && requested && !dirty && (!reported || reported.join() !== requested.join()));
    schedulePending.el.hidden = !waiting;
    if (waiting) schedulePending.text.textContent = t("pending.schedule");
    if (!dirty) grid.setWeek(waiting ? requested : (reported || docData.schedule));
    clearTimeout(scheduleTimer);
    if (recent) scheduleTimer = setTimeout(() => updateSchedule(lastData), sentAt + LISTS_PENDING_MAX_MS - Date.now() + 500);
  }

  let listsTimer = null;
  function updateLists(docData) {
    const reported = docData.status || {};
    const hasReport = Array.isArray(reported.blockedSites) && Array.isArray(reported.blockedApps);

    const sentAt = docData.blockedUpdatedAt && docData.blockedUpdatedAt.toMillis ? docData.blockedUpdatedAt.toMillis() : 0;
    const recent = sentAt && Date.now() - sentAt < LISTS_PENDING_MAX_MS;
    const requestedSites = Array.isArray(docData.blockedSites) ? docData.blockedSites : [];
    const requestedApps = Array.isArray(docData.blockedApps) ? docData.blockedApps : [];
    const waiting = recent && !listsDirty && (!hasReport ||
      !sameList(requestedSites, reported.blockedSites) || !sameList(requestedApps, reported.blockedApps));

    // The grid mirrors the schedule the PC itself reports; while a saved
    // list is still on its way, show what was sent instead of the old one -
    // otherwise a pending change flashes back to the stale reported list
    // until the next heartbeat catches up (or gets overwritten by a Save
    // that unknowingly re-sends that stale list).
    if (!listsDirty) {
      if (waiting) {
        sitesEditor.set(requestedSites);
        appsEditor.set(requestedApps);
      } else if (hasReport) {
        sitesEditor.set(reported.blockedSites);
        appsEditor.set(reported.blockedApps);
      }
    }
    listsNote.textContent = hasReport ? "" : t("lists.waiting");

    listsPending.el.hidden = !waiting;
    if (waiting) listsPending.text.textContent = t("pending.lists");
    clearTimeout(listsTimer);
    if (recent) listsTimer = setTimeout(() => updateLists(lastData), sentAt + LISTS_PENDING_MAX_MS - Date.now() + 500);
  }

  function updateStatus(docData) {
    lastData = docData;
    const status = docData.status || {};
    const stateCode = status.state || "";

    if (pending) {
      const seen = lastSeenMs(docData);
      if (seen > pending.lastSeenMs) {
        pending.heartbeats += 1;
        pending.lastSeenMs = seen;
        savePending();
      }
      const applied = pending.target ? stateCode === pending.target : pending.heartbeats >= 2;
      if (applied || Date.now() > pending.startedAt + PENDING_MAX_MS) {
        pending = null;
        savePending();
      }
    }

    statusPill.textContent = stateName(stateCode);
    statusPill.style.background = PILL_COLORS[stateCode] || "#66708a";
    pendingBadge.hidden = !pending;
    if (pending) {
      pendingText.textContent = pending.target
        ? t("pending.switch", { state: stateName(pending.target) })
        : t("pending.back");
    }
    updateLists(docData);
    updateSchedule(docData);
    const lastSeen = docData.lastSeen;
    lastSeenEl.textContent = lastSeen && lastSeen.toDate
      ? t("lastSeen", { when: relativeTime(lastSeen.toDate()) })
      : t("neverSeen");
  }
  schedulePendingExpiry();
  updateStatus(data);

  const unsubscribe = db.collection("devices").doc(deviceId).onSnapshot((doc) => {
    if (!doc.exists) return;
    const docData = doc.data();
    updateStatus(docData);
  }, (err) => console.error("device watch failed", err));

  return { el, unsubscribe };
}

// --- dashboard: device list -------------------------------------------------------

const deviceCards = new Map(); // deviceId -> { el, unsubscribe }

function renderDeviceList(docs) {
  const container = document.getElementById("device-container");
  const seen = new Set();
  for (const doc of docs) {
    seen.add(doc.id);
    if (!deviceCards.has(doc.id)) {
      const card = createDeviceCard(doc.id, doc.data());
      deviceCards.set(doc.id, card);
      container.appendChild(card.el);
    }
  }
  for (const [id, card] of deviceCards) {
    if (!seen.has(id)) {
      card.unsubscribe();
      card.el.remove();
      deviceCards.delete(id);
    }
  }
}

let lastDeviceDocs = [];

window.addEventListener("langchange", () => {
  const docs = lastDeviceDocs;
  clearDeviceCards();
  renderDeviceList(docs);
});

function clearDeviceCards() {
  for (const card of deviceCards.values()) card.unsubscribe();
  deviceCards.clear();
  document.getElementById("device-container").innerHTML = "";
}

// --- auth state -> which view --------------------------------------------------

let unsubscribeList = null;

auth.onAuthStateChanged((user) => {
  if (unsubscribeList) { unsubscribeList(); unsubscribeList = null; }
  clearDeviceCards();
  lastDeviceDocs = [];

  if (!user) {
    setView("login");
    return;
  }

  let firstSnapshot = true;
  unsubscribeList = db.collection("devices").where("ownerUid", "==", user.uid)
    .onSnapshot((snapshot) => {
      lastDeviceDocs = snapshot.docs;
      renderDeviceList(snapshot.docs);
      if (firstSnapshot) {
        firstSnapshot = false;
        setView(snapshot.empty ? "pairing" : "dashboard");
      }
    }, (err) => console.error("device list watch failed", err));
});

// --- language ---------------------------------------------------------------------

document.getElementById("lang-toggle").addEventListener("click", () => setLang(getLang() === "he" ? "en" : "he"));
applyStaticTranslations();
