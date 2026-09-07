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

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SLOTS_PER_DAY = 48;
const STATES = ["F", "S", "L"];
const STATE_NAMES = { F: "Free", S: "Study", L: "Locked" };
const STATE_COLORS = { F: "#3fa579", S: "#e0982f", L: "#dd6b7f" };

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
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function friendlyAuthError(err) {
  const map = {
    "auth/invalid-email": "That doesn't look like a valid email.",
    "auth/user-not-found": "No account with that email.",
    "auth/wrong-password": "Wrong password.",
    "auth/email-already-in-use": "An account already exists for that email.",
    "auth/weak-password": "Password should be at least 6 characters.",
    "auth/invalid-credential": "Wrong email or password.",
  };
  return map[err.code] || err.message || "Something went wrong.";
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
    errorEl.textContent = "That code wasn't found, or it expired. Generate a new one on his PC.";
    errorEl.hidden = false;
    return;
  }
  if (!codeDoc.exists) {
    errorEl.textContent = "That code wasn't found, or it expired. Generate a new one on his PC.";
    errorEl.hidden = false;
    return;
  }

  const deviceUid = codeDoc.data().deviceUid;
  try {
    await db.collection("devices").doc(deviceUid).update({ ownerUid: auth.currentUser.uid });
  } catch (err) {
    errorEl.textContent = "This device is already linked to another account.";
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
    for (let day = 0; day < 7; day++) {
      const y = HEADER_H + day * CELL_H;
      ctx.fillStyle = "#20263a";
      ctx.font = "10px Segoe UI, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(DAYS[day].slice(0, 3), LABEL_W - 8, y + CELL_H / 2 + 4);
      for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
        const x = LABEL_W + slot * CELL_W;
        ctx.fillStyle = STATE_COLORS[week[day][slot]];
        roundRectPath(x + 1, y + 1, CELL_W - 1, CELL_H - 1, 3);
        ctx.fill();
      }
    }
  }

  function cellAt(x, y) {
    const day = Math.floor((y - HEADER_H) / CELL_H);
    const slot = Math.floor((x - LABEL_W) / CELL_W);
    if (day < 0 || day > 6 || slot < 0 || slot >= SLOTS_PER_DAY) return null;
    return [day, slot];
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

function createDeviceCard(deviceId, data) {
  const el = document.createElement("div");
  el.className = "card device-card";

  const header = document.createElement("div");
  header.className = "device-header";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "device-name";
  nameInput.value = data.name || "";
  nameInput.placeholder = "Name this PC";
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
    ["Free for 30 min", "F", 30],
    ["Free for 2 hours", "F", 120],
    ["Study now for 1 hour", "S", 60],
    ["Lock now for 1 hour", "L", 60],
  ];
  for (const [label, state, minutes] of overrideButtons) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pill-btn small";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      pushOverride(deviceId, state, minutes).catch((err) => alert("Could not send: " + err.message));
    });
    overrideRow.appendChild(btn);
  }
  el.appendChild(overrideRow);
  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "link-btn";
  backBtn.textContent = "Back to schedule (clear override)";
  backBtn.addEventListener("click", () => {
    clearOverride(deviceId).catch((err) => alert("Could not send: " + err.message));
  });
  el.appendChild(backBtn);

  const brushRow = document.createElement("div");
  brushRow.className = "brush-row";
  brushRow.style.marginTop = "16px";
  const gridSection = document.createElement("div");
  gridSection.className = "grid-section";

  let dirty = false;
  const grid = buildScheduleGrid(gridSection, normalizeWeek(data.schedule), () => {
    dirty = true;
    saveBtn.disabled = false;
    saveBtn.textContent = "Save schedule";
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
    label.append(` ${STATE_NAMES[state]}`);
    brushRow.appendChild(label);
  }
  el.appendChild(brushRow);
  el.appendChild(gridSection);

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "pill-btn";
  saveBtn.textContent = "Save schedule";
  saveBtn.disabled = true;
  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    try {
      await db.collection("devices").doc(deviceId).update({
        schedule: grid.getWeek(),
        scheduleUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      dirty = false;
      saveBtn.textContent = "Saved";
      setTimeout(() => { if (!dirty) saveBtn.textContent = "Save schedule"; }, 1500);
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save schedule";
      alert("Could not save: " + err.message);
    }
  });
  el.appendChild(saveBtn);

  function updateStatus(docData) {
    const status = docData.status || {};
    const stateCode = status.state || "";
    statusPill.textContent = STATE_NAMES[stateCode] || "Unknown";
    statusPill.style.background = STATE_COLORS[stateCode] || "#8a94ac";
    const lastSeen = docData.lastSeen;
    lastSeenEl.textContent = lastSeen && lastSeen.toDate
      ? `Last seen ${relativeTime(lastSeen.toDate())}`
      : "Never seen yet - install and pair the console first.";
  }
  updateStatus(data);

  const unsubscribe = db.collection("devices").doc(deviceId).onSnapshot((doc) => {
    if (!doc.exists) return;
    const docData = doc.data();
    updateStatus(docData);
    if (!dirty) grid.setWeek(docData.schedule);
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

  if (!user) {
    setView("login");
    return;
  }

  let firstSnapshot = true;
  unsubscribeList = db.collection("devices").where("ownerUid", "==", user.uid)
    .onSnapshot((snapshot) => {
      renderDeviceList(snapshot.docs);
      if (firstSnapshot) {
        firstSnapshot = false;
        setView(snapshot.empty ? "pairing" : "dashboard");
      }
    }, (err) => console.error("device list watch failed", err));
});
