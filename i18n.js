"use strict";

// English + Hebrew. Every user-facing string lives here; static HTML uses
// data-i18n / data-i18n-html / data-i18n-placeholder attributes and app.js
// calls t() for everything it builds at runtime.

const TRANSLATIONS = {
  en: {
    "loading": "Loading...",
    "login.subtitle": "Sign in to manage his PC remotely.",
    "email": "Email",
    "password": "Password",
    "login.btn": "Log in",
    "login.needAccount": "Need an account? Sign up",
    "signup.btn": "Create account",
    "signup.haveAccount": "Already have an account? Log in",
    "pairing.title": "Link a device",
    "logout": "Log out",
    "pairing.help": "On his PC: open the ChildControl console, go to <strong>Setup &rarr; Website</strong>, and click <strong>Generate pairing code</strong>. Enter it here within 15 minutes.",
    "pairing.codeLabel": "Pairing code",
    "pairing.codePlaceholder": "e.g. PLUM7X2Q",
    "pairing.btn": "Link device",
    "linkAnother": "+ Link another device",

    "err.invalidEmail": "That doesn't look like a valid email.",
    "err.userNotFound": "No account with that email.",
    "err.wrongPassword": "Wrong password.",
    "err.emailInUse": "An account already exists for that email.",
    "err.weakPassword": "Password should be at least 6 characters.",
    "err.invalidCredential": "Wrong email or password.",
    "err.generic": "Something went wrong.",
    "err.codeNotFound": "That code wasn't found, or it expired. Generate a new one on his PC.",
    "err.alreadyLinked": "This device is already linked to another account.",

    "day.0": "Mon", "day.1": "Tue", "day.2": "Wed", "day.3": "Thu",
    "day.4": "Fri", "day.5": "Sat", "day.6": "Sun",
    "state.F": "Free", "state.S": "Study", "state.L": "Locked",
    "state.unknown": "Unknown",
    "legend.F": "Everything allowed.",
    "legend.S": "Games and distracting sites blocked, computer usable.",
    "legend.L": "Computer not usable at all.",

    "rel.now": "just now",
    "rel.min": "{n} min ago",
    "rel.hour": "{n}h ago",
    "rel.day": "{n}d ago",
    "lastSeen": "Last seen {when}",
    "neverSeen": "Never seen yet - install and pair the console first.",

    "device.namePlaceholder": "Name this PC",
    "override.free30": "Free for 30 min",
    "override.free120": "Free for 2 hours",
    "override.study60": "Study now for 1 hour",
    "override.lock60": "Lock now for 1 hour",
    "override.back": "Back to schedule (clear override)",
    "pending.switch": "Pending: switching to {state}",
    "pending.back": "Pending: going back to the schedule",
    "pending.schedule": "Pending: waiting for the PC to apply your schedule",
    "pending.lists": "Pending: waiting for the PC to apply your block lists",

    "schedule.save": "Save schedule",
    "saving": "Saving...",
    "saved": "Saved",
    "sent": "Sent",
    "couldNotSend": "Could not send: {msg}",
    "couldNotSave": "Could not save: {msg}",
    "permissionHint": "The Firestore Security Rules probably don't allow the parent to edit these fields yet.",

    "lists.sites": "Blocked websites",
    "lists.apps": "Blocked programs and games",
    "lists.add": "Add",
    "lists.empty": "Nothing blocked.",
    "lists.remove": "Remove {item}",
    "lists.badDomain": "That doesn't look like a website address (example: youtube.com).",
    "lists.appExe": "Program names end in .exe (example: steam.exe).",
    "lists.appPath": "Enter just the file name, not a path.",
    "lists.waiting": "Waiting for the PC to report its current lists (needs the updated agent).",
    "lists.save": "Save block lists",

    "unlink.btn": "Unlink this device",
    "unlink.thisDevice": "this device",
    "unlink.confirm": "Are you sure you want to unlink \"{name}\" from your account? You can link it again later with a new pairing code.",
    "unlink.failed": "Could not unlink: {msg}",
  },

  he: {
    "loading": "טוען...",
    "login.subtitle": "התחברו כדי לנהל את המחשב שלו מרחוק.",
    "email": "אימייל",
    "password": "סיסמה",
    "login.btn": "התחברות",
    "login.needAccount": "אין לכם חשבון? הרשמה",
    "signup.btn": "יצירת חשבון",
    "signup.haveAccount": "כבר יש לכם חשבון? התחברות",
    "pairing.title": "חיבור מכשיר",
    "logout": "התנתקות",
    "pairing.help": "במחשב שלו: פתחו את הקונסולה של ChildControl, היכנסו ל-<strong>Setup &rarr; Website</strong> ולחצו על <strong>Generate pairing code</strong>. הזינו את הקוד כאן בתוך 15 דקות.",
    "pairing.codeLabel": "קוד חיבור",
    "pairing.codePlaceholder": "לדוגמה: PLUM7X2Q",
    "pairing.btn": "חיבור המכשיר",
    "linkAnother": "+ חיבור מכשיר נוסף",

    "err.invalidEmail": "כתובת האימייל אינה תקינה.",
    "err.userNotFound": "לא נמצא חשבון עם האימייל הזה.",
    "err.wrongPassword": "סיסמה שגויה.",
    "err.emailInUse": "כבר קיים חשבון עם האימייל הזה.",
    "err.weakPassword": "הסיסמה צריכה להכיל לפחות 6 תווים.",
    "err.invalidCredential": "אימייל או סיסמה שגויים.",
    "err.generic": "משהו השתבש.",
    "err.codeNotFound": "הקוד לא נמצא או שפג תוקפו. צרו קוד חדש במחשב שלו.",
    "err.alreadyLinked": "המכשיר הזה כבר מחובר לחשבון אחר.",

    "day.0": "ב׳", "day.1": "ג׳", "day.2": "ד׳", "day.3": "ה׳",
    "day.4": "ו׳", "day.5": "ש׳", "day.6": "א׳",
    "state.F": "חופשי", "state.S": "לימוד", "state.L": "נעול",
    "state.unknown": "לא ידוע",
    "legend.F": "הכול מותר.",
    "legend.S": "משחקים ואתרים מסיחי דעת חסומים, אפשר להשתמש במחשב.",
    "legend.L": "אי אפשר להשתמש במחשב בכלל.",

    "rel.now": "הרגע",
    "rel.min": "לפני {n} דק׳",
    "rel.hour": "לפני {n} שע׳",
    "rel.day": "לפני {n} ימים",
    "lastSeen": "נראה לאחרונה {when}",
    "neverSeen": "עדיין לא נראה - התקינו וחברו קודם את הקונסולה.",

    "device.namePlaceholder": "תנו שם למחשב",
    "override.free30": "חופשי ל-30 דקות",
    "override.free120": "חופשי לשעתיים",
    "override.study60": "מצב לימוד לשעה",
    "override.lock60": "נעילה לשעה",
    "override.back": "חזרה ללוח הזמנים (ביטול השינוי הזמני)",
    "pending.switch": "ממתין: עובר למצב {state}",
    "pending.back": "ממתין: חוזר ללוח הזמנים",
    "pending.schedule": "ממתין: מחכה שהמחשב יחיל את לוח הזמנים",
    "pending.lists": "ממתין: מחכה שהמחשב יחיל את רשימות החסימה",

    "schedule.save": "שמירת לוח זמנים",
    "saving": "שומר...",
    "saved": "נשמר",
    "sent": "נשלח",
    "couldNotSend": "השליחה נכשלה: {msg}",
    "couldNotSave": "השמירה נכשלה: {msg}",
    "permissionHint": "כנראה שכללי האבטחה של Firestore עדיין לא מאפשרים להורה לערוך את השדות האלה.",

    "lists.sites": "אתרים חסומים",
    "lists.apps": "תוכנות ומשחקים חסומים",
    "lists.add": "הוספה",
    "lists.empty": "אין פריטים חסומים.",
    "lists.remove": "הסרת {item}",
    "lists.badDomain": "זה לא נראה כמו כתובת אתר (לדוגמה: youtube.com).",
    "lists.appExe": "שמות תוכנות מסתיימים ב-.exe (לדוגמה: steam.exe).",
    "lists.appPath": "הזינו רק את שם הקובץ, בלי נתיב.",
    "lists.waiting": "מחכה שהמחשב ידווח על הרשימות הנוכחיות שלו (נדרש הסוכן המעודכן).",
    "lists.save": "שמירת רשימות החסימה",

    "unlink.btn": "ניתוק המכשיר הזה",
    "unlink.thisDevice": "המכשיר הזה",
    "unlink.confirm": "בטוחים שברצונכם לנתק את \"{name}\" מהחשבון? אפשר לחבר אותו שוב מאוחר יותר עם קוד חיבור חדש.",
    "unlink.failed": "הניתוק נכשל: {msg}",
  },
};

let currentLang = "en";
try {
  const saved = localStorage.getItem("lang");
  if (saved === "en" || saved === "he") currentLang = saved;
  else if ((navigator.language || "").toLowerCase().startsWith("he")) currentLang = "he";
} catch (e) {
  /* storage blocked: fall back to the browser language below */
  if ((navigator.language || "").toLowerCase().startsWith("he")) currentLang = "he";
}

function getLang() {
  return currentLang;
}

function t(key, vars) {
  let s = (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key]) || TRANSLATIONS.en[key] || key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) s = s.split(`{${name}}`).join(String(value));
  }
  return s;
}

function applyStaticTranslations() {
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === "he" ? "rtl" : "ltr";
  for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  // The dictionary is our own static text (never user data), so innerHTML is safe here.
  for (const el of document.querySelectorAll("[data-i18n-html]")) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of document.querySelectorAll("[data-i18n-placeholder]")) el.placeholder = t(el.dataset.i18nPlaceholder);
  const toggle = document.getElementById("lang-toggle");
  if (toggle) toggle.textContent = currentLang === "he" ? "English" : "עברית";
}

function setLang(lang) {
  currentLang = lang;
  try { localStorage.setItem("lang", lang); } catch (e) { /* not persisted */ }
  applyStaticTranslations();
  window.dispatchEvent(new Event("langchange"));
}
