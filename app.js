(() => {
  const STORAGE_KEY = "payment-modulator-v2";
  const LEGACY_KEYS = ["payment-modulator-v1", "spend-insight-v1"];

  const CATEGORIES = [
    "Food & Dining",
    "Groceries",
    "Transport",
    "Shopping",
    "Entertainment",
    "Bills & Utilities",
    "Rent / Housing",
    "Health",
    "Subscriptions",
    "Travel",
    "Education",
    "Transfers",
    "Income",
    "Other",
  ];

  const BUDGETABLE = CATEGORIES.filter((c) => c !== "Income" && c !== "Transfers");

  const CATEGORY_COLORS = {
    "Food & Dining": "#ff8b6a",
    Groceries: "#4ade80",
    Transport: "#5ec8f0",
    Shopping: "#f0b429",
    Entertainment: "#c084fc",
    "Bills & Utilities": "#fbbf24",
    "Rent / Housing": "#94a3b8",
    Health: "#34d399",
    Subscriptions: "#fb7185",
    Travel: "#38bdf8",
    Education: "#818cf8",
    Transfers: "#a8a29e",
    Income: "#6ee7b7",
    Other: "#cbd5e1",
  };

  const DEFAULT_BUDGETS = {
    "Food & Dining": 8000,
    Groceries: 6000,
    Transport: 4000,
    Shopping: 5000,
    Entertainment: 2500,
    "Bills & Utilities": 4000,
    "Rent / Housing": 22000,
    Health: 2000,
    Subscriptions: 1500,
    Travel: 3000,
    Education: 2000,
    Other: 2000,
  };

  const MERCHANT_HINTS = [
    { test: /swiggy|zomato|uber\s*eats|dominos|mcdonald|cafe|restaurant|dining/i, cat: "Food & Dining" },
    { test: /bigbasket|blinkit|zepto|dmart|grocery|supermarket/i, cat: "Groceries" },
    { test: /uber|ola|metro|irctc|petrol|fuel|rapido/i, cat: "Transport" },
    { test: /amazon|flipkart|myntra|ajio|meesho/i, cat: "Shopping" },
    { test: /netflix|spotify|prime|hotstar|youtube/i, cat: "Subscriptions" },
    { test: /electricity|broadband|airtel|jio|bill/i, cat: "Bills & Utilities" },
    { test: /rent|housing|society/i, cat: "Rent / Housing" },
    { test: /pharmacy|apollo|hospital|clinic/i, cat: "Health" },
    { test: /salary|payroll|payout|refund/i, cat: "Income" },
    { test: /bookmyshow|pvr|cinema/i, cat: "Entertainment" },
    { test: /makemytrip|goibibo|hotel|flight/i, cat: "Travel" },
  ];

  const CURRENCY_LOCALE = { INR: "en-IN", USD: "en-US", EUR: "de-DE", GBP: "en-GB" };

  const DEFAULT_SETTINGS = {
    name: "",
    currency: "INR",
    monthlyIncome: 85000,
    savingsGoal: 15000,
    photo: "",
    phone: "",
    email: "",
    city: "",
    occupation: "",
    dob: "",
    gender: "",
    notes: "",
    pinHash: "",
    mobile: "",
  };

  const PAGE_SIZE = 25;
  const SESSION_UNLOCK_KEY = "pm-unlocked";
  const SETUP_LAST_STEP = 5;
  const IDB_NAME = "payment-modulator";
  const IDB_STORE = "kv";

  const $ = (id) => document.getElementById(id);
  const Core = window.PMCore || {};

  function todayISO() {
    return Core.toLocalISO ? Core.toLocalISO(new Date()) : new Date().toISOString().slice(0, 10);
  }

  const state = {
    setupComplete: false,
    accounts: ["Primary account"],
    openingBalances: {},
    transactions: [],
    budgets: { ...DEFAULT_BUDGETS },
    settings: { ...DEFAULT_SETTINGS },
    setupStep: 1,
    setupBudgetsDraft: null,
    view: "track",
    demoMode: false,
    period: "month",
    anchor: todayISO(),
    account: "all",
    search: "",
    trackSearch: "",
    selected: new Set(),
    lastSavedAt: null,
    pinUnlocked: false,
    trackPage: 0,
    resultsPage: 0,
  };

  let demoCache = null;
  let pendingCsvText = "";
  let undoTimer = null;
  let undoPayload = null;
  let loginBusy = false;

  function uid() {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : `t_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function money(n) {
    const currency = activeSettings().currency || "INR";
    const value = Core.roundMoney ? Core.roundMoney(n) : Number(n) || 0;
    return new Intl.NumberFormat(CURRENCY_LOCALE[currency] || "en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  function parseAmount(v) {
    return Core.parseAmount ? Core.parseAmount(v) : Number(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0;
  }

  function txFingerprint(row) {
    if (Core.fingerprint) return Core.fingerprint(row);
    const parts = [
      row.date,
      row.type,
      Number(row.amount).toFixed(2),
      String(row.merchant || "").trim().toLowerCase(),
      String(row.account || "").trim().toLowerCase(),
    ];
    if (row.type === "transfer") {
      parts.push(String(row.transferTo || "").trim().toLowerCase());
    }
    return parts.join("|");
  }

  function signedDisplay(t) {
    return t.type === "income" ? t.amount : -t.amount;
  }

  function defaultBudgetsFor(currency) {
    return Core.defaultBudgets ? Core.defaultBudgets(currency || "INR") : { ...DEFAULT_BUDGETS };
  }

  function guessCategory(merchant, type) {
    if (type === "income") return "Income";
    if (type === "transfer") return "Transfers";
    for (const h of MERCHANT_HINTS) if (h.test.test(merchant)) return h.cat;
    return "Other";
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function digitsOnly(raw) {
    return String(raw || "").replace(/\D/g, "");
  }

  function normalizeMobile(raw) {
    const digits = digitsOnly(raw);
    if (digits.length === 10) return digits;
    if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
    if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
    return "";
  }

  function isValidMobile(raw) {
    return /^\d{10}$/.test(normalizeMobile(raw));
  }

  function mobilesMatch(a, b) {
    const na = normalizeMobile(a);
    const nb = normalizeMobile(b);
    return Boolean(na && nb && na === nb);
  }

  function formatMobile(raw) {
    const n = normalizeMobile(raw);
    if (!n) return String(raw || "").trim();
    return `+91 ${n.slice(0, 5)} ${n.slice(5)}`;
  }

  function maskMobile(raw) {
    const n = normalizeMobile(raw);
    if (!n) return "••••••••••";
    return `+91 ${n.slice(0, 2)}•• •••${n.slice(-3)}`;
  }

  function storedMobile() {
    return state.settings.mobile || state.settings.phone || "";
  }

  function isSessionUnlocked() {
    try {
      if (sessionStorage.getItem(SESSION_UNLOCK_KEY) === "1") return true;
    } catch {
      /* file:// or blocked storage */
    }
    return Boolean(state.pinUnlocked);
  }

  function setSessionUnlocked(on) {
    state.pinUnlocked = Boolean(on);
    try {
      if (on) sessionStorage.setItem(SESSION_UNLOCK_KEY, "1");
      else sessionStorage.removeItem(SESSION_UNLOCK_KEY);
    } catch {
      /* in-memory session only */
    }
  }

  function syncSettingsMobile(value) {
    const formatted = formatMobile(value);
    state.settings.phone = formatted;
    state.settings.mobile = formatted;
  }

  function activeTxs() {
    return state.demoMode ? getDemoData() : state.transactions;
  }

  function activeSettings() {
    if (!state.demoMode) return state.settings;
    return { name: "Demo User", currency: "INR", monthlyIncome: 85000, savingsGoal: 15000 };
  }

  function activeBudgets() {
    return state.demoMode ? { ...DEFAULT_BUDGETS } : state.budgets;
  }

  function activeAccounts() {
    if (!state.demoMode) return state.accounts;
    return ["HDFC ****4210", "SBI ****8821"];
  }

  function backupPayload() {
    const phone = state.settings.phone || state.settings.mobile || "";
    return {
      app: "Niva",
      version: 4,
      setupComplete: state.setupComplete,
      savedAt: new Date().toISOString(),
      settings: {
        ...state.settings,
        phone,
        mobile: state.settings.mobile || phone,
        pinHash: state.settings.pinHash || "",
      },
      accounts: state.accounts,
      openingBalances: state.openingBalances,
      budgets: state.budgets,
      transactions: state.transactions,
    };
  }

  function formatSavedAt(iso) {
    if (!iso) return "Not saved yet";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Saved on this device";
    return `Saved ${d.toLocaleString()}`;
  }

  function updateSaveStatus(flash) {
    const text = formatSavedAt(state.lastSavedAt);
    const status = $("save-status");
    const dialogStatus = $("save-dialog-status");
    if (status) {
      status.textContent = flash ? "Saved on this device" : text;
      status.classList.toggle("flash", Boolean(flash));
    }
    if (dialogStatus) dialogStatus.textContent = text;
  }

  function showToast(message, actionLabel, onAction) {
    const toast = $("toast");
    const text = $("toast-text");
    const btn = $("toast-action");
    if (!toast || !text) {
      if (message) alert(message);
      return;
    }
    text.textContent = message;
    toast.hidden = false;
    if (undoTimer) clearTimeout(undoTimer);
    if (actionLabel && onAction) {
      btn.hidden = false;
      btn.textContent = actionLabel;
      btn.onclick = () => {
        toast.hidden = true;
        onAction();
      };
    } else {
      btn.hidden = true;
      btn.onclick = null;
    }
    undoTimer = setTimeout(() => {
      toast.hidden = true;
      undoPayload = null;
    }, 8000);
  }

  function openIdb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbSet(payload) {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(payload, "snapshot");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbGet() {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get("snapshot");
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbClear() {
    try {
      const db = await openIdb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).delete("snapshot");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      /* ignore */
    }
  }

  function applyLoaded(data) {
    if (!data || typeof data !== "object") return;
    if (Array.isArray(data.transactions)) {
      state.transactions = data.transactions.map((t) => ({
        ...t,
        amount: parseAmount(t.amount),
        fingerprint: t.fingerprint || txFingerprint(t),
      }));
    }
    if (data.budgets) state.budgets = { ...DEFAULT_BUDGETS, ...data.budgets };
    if (data.settings) {
      state.settings = { ...DEFAULT_SETTINGS, ...data.settings };
      const m = state.settings.mobile || state.settings.phone || "";
      state.settings.phone = m;
      state.settings.mobile = m;
    }
    if (Array.isArray(data.accounts) && data.accounts.length) state.accounts = data.accounts;
    else if (state.transactions.length) {
      state.accounts = [...new Set(state.transactions.map((t) => t.account).filter(Boolean))];
    }
    if (data.openingBalances && typeof data.openingBalances === "object") {
      state.openingBalances = data.openingBalances;
    }
    state.lastSavedAt = data.savedAt || null;
    state.setupComplete = Boolean(data.setupComplete);
  }

  async function saveToBrowser() {
    const savedAt = new Date().toISOString();
    state.lastSavedAt = savedAt;
    const payload = { ...backupPayload(), savedAt };
    let stored = false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      stored = true;
    } catch (err) {
      const quota = err && (err.name === "QuotaExceededError" || err.code === 22);
      if (quota && payload.settings?.photo) {
        try {
          const slim = JSON.parse(JSON.stringify(payload));
          slim.settings.photo = "";
          localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
          stored = true;
          showToast("Storage is full — photo was not kept in browser storage. Download a file backup.");
        } catch {
          showToast("This browser is out of space. Download a JSON backup so you do not lose payments.");
        }
      } else {
        showToast("Could not save in this browser. Download a file backup.");
      }
    }
    try {
      await idbSet(payload);
      stored = true;
    } catch {
      /* localStorage may have worked */
    }
    if (stored) updateSaveStatus(true);
  }

  function save() {
    saveToBrowser();
  }

  function saveToFile(kind) {
    if (state.demoMode) {
      alert("Exit demo first — demo data is not your real list.");
      return;
    }
    if (kind === "csv") {
      download("niva-payments.csv", toCsv(state.transactions), "text/csv");
      return;
    }
    download(
      `niva-${todayISO()}.json`,
      JSON.stringify(backupPayload(), null, 2),
      "application/json"
    );
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
    ]);
  }

  function loadFromLocalStorage() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        for (const key of LEGACY_KEYS) {
          const legacy = localStorage.getItem(key);
          if (legacy) {
            raw = legacy;
            break;
          }
        }
      }
      if (raw) applyLoaded(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }

  async function loadFromIdb() {
    try {
      const data = await withTimeout(idbGet(), 600);
      if (data) {
        applyLoaded(data);
        return true;
      }
    } catch {
      /* file:// or slow IDB */
    }
    return false;
  }

  function getDemoData() {
    if (demoCache) return demoCache;
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    const prev = new Date();
    prev.setMonth(prev.getMonth() - 1);
    const pm = String(prev.getMonth() + 1).padStart(2, "0");
    const py = prev.getFullYear();
    const a = ["HDFC ****4210", "SBI ****8821"];
    const rows = [
      ["01", "Salary Credit", 85000, "income", "Income", a[0]],
      ["02", "House Rent", 22000, "expense", "Rent / Housing", a[0]],
      ["03", "BigBasket", 3200, "expense", "Groceries", a[0]],
      ["04", "Swiggy", 540, "expense", "Food & Dining", a[1]],
      ["05", "Uber", 280, "expense", "Transport", a[1]],
      ["06", "Netflix", 649, "expense", "Subscriptions", a[0]],
      ["07", "Amazon", 2499, "expense", "Shopping", a[0]],
      ["08", "Spotify", 119, "expense", "Subscriptions", a[0]],
      ["09", "Zomato", 780, "expense", "Food & Dining", a[1]],
      ["10", "Electricity Bill", 2100, "expense", "Bills & Utilities", a[0]],
      ["11", "To SBI pocket", 5000, "transfer", "Transfers", a[0], a[1]],
      ["12", "Petrol Pump", 2500, "expense", "Transport", a[0]],
      ["14", "Swiggy", 420, "expense", "Food & Dining", a[1]],
      ["16", "BookMyShow", 900, "expense", "Entertainment", a[1]],
      ["18", "Airtel Broadband", 999, "expense", "Bills & Utilities", a[0]],
      ["20", "Zomato", 560, "expense", "Food & Dining", a[1]],
      ["22", "Cafe Coffee Day", 370, "expense", "Food & Dining", a[1]],
      ["24", "DMart", 2750, "expense", "Groceries", a[0]],
      ["26", "Swiggy", 640, "expense", "Food & Dining", a[1]],
      ["28", "Freelance Payout", 15000, "income", "Income", a[1]],
    ];
    const last = [
      ["01", "Salary Credit", 85000, "income", "Income", a[0]],
      ["02", "House Rent", 22000, "expense", "Rent / Housing", a[0]],
      ["06", "Netflix", 649, "expense", "Subscriptions", a[0]],
      ["08", "Swiggy", 1100, "expense", "Food & Dining", a[1]],
      ["15", "Airtel Broadband", 999, "expense", "Bills & Utilities", a[0]],
    ];
    const map =
      (y, m) =>
      ([day, merchant, amount, type, category, account, transferTo]) => ({
        id: `demo_${y}${m}${day}_${merchant}`,
        date: `${y}-${m}-${day}`,
        merchant,
        amount,
        type,
        category,
        account,
        transferTo: transferTo || "",
        note: "Demo sample",
      });
    demoCache = [...rows.map(map(year, month)), ...last.map(map(py, pm))];
    return demoCache;
  }

  /* ---------- screens / navigation ---------- */

  function showScreen(name) {
    ["welcome", "setup", "login", "app"].forEach((n) => {
      const el = $(`screen-${n}`);
      if (!el) return;
      const show = n === name;
      el.hidden = !show;
      if (show) el.removeAttribute("hidden");
      else el.setAttribute("hidden", "");
    });
  }

  function setLoginStatus(message) {
    const status = $("login-status");
    if (status) status.textContent = message || "";
  }

  function prepareLoginScreen(message) {
    const hasPin = Boolean(state.settings.pinHash);
    const hasMobile = Boolean(normalizeMobile(storedMobile()));
    const btnLabel = $("login-btn-label");
    const sub = $("login-btn-sub");
    if (btnLabel) btnLabel.textContent = hasPin ? "Log in" : "Save PIN and enter";
    else if ($("btn-login")) $("btn-login").textContent = hasPin ? "Log in" : "Save PIN and enter";
    if (sub) {
      sub.textContent = hasPin
        ? "Stays signed in until you close this tab"
        : "Required to open this profile next time";
    }
    if ($("login-confirm-wrap")) $("login-confirm-wrap").hidden = hasPin;
    if ($("login-copy")) {
      $("login-copy").textContent = !hasPin
        ? "This device holds one profile. Set a mobile number and PIN before anyone can open it. Data stays here — not encrypted, not synced."
        : !hasMobile
          ? "Enter a mobile number and your PIN to continue."
          : "Enter the mobile number and PIN for the profile on this browser. New here? Use Create new profile below.";
    }
    if ($("login-reset-copy")) {
      $("login-reset-copy").textContent = hasMobile
        ? "Type the mobile number on this profile to erase everything on this device."
        : "Type RESET THIS DEVICE to erase everything on this browser.";
    }
    if ($("login-reset-confirm")) {
      $("login-reset-confirm").placeholder = hasMobile ? "Mobile number" : "RESET THIS DEVICE";
    }
    if ($("login-reset-panel")) $("login-reset-panel").hidden = true;
    if ($("login-reset-confirm")) $("login-reset-confirm").value = "";
    if ($("login-reset-status")) $("login-reset-status").textContent = "";
    const createSub = $("create-profile-sub");
    if (createSub) {
      createSub.textContent = hasPin
        ? "Erases the profile on this browser and starts fresh"
        : "First time on this browser — set up in about a minute";
    }
    setLoginStatus(message || "");
  }

  function showLogin(message) {
    showScreen("login");
    if ($("login-mobile")) $("login-mobile").value = "";
    if ($("login-pin")) $("login-pin").value = "";
    if ($("login-pin-confirm")) $("login-pin-confirm").value = "";
    prepareLoginScreen(message);
  }

  function logoutSession() {
    setSessionUnlocked(false);
    state.demoMode = false;
    showLogin();
  }

  async function wipeAllData() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      for (const key of LEGACY_KEYS) localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    await idbClear();
    setSessionUnlocked(false);
    state.setupComplete = false;
    state.transactions = [];
    state.accounts = ["Primary account"];
    state.openingBalances = {};
    state.budgets = { ...DEFAULT_BUDGETS };
    state.settings = { ...DEFAULT_SETTINGS };
    state.pinUnlocked = false;
    state.demoMode = false;
    state.selected = new Set();
    state.lastSavedAt = null;
  }

  async function submitLogin(e) {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    if (loginBusy) return;
    loginBusy = true;
    try {
      const mobileRaw = $("login-mobile")?.value || "";
      const pin = $("login-pin")?.value || "";
      const confirmPin = $("login-pin-confirm")?.value || "";
      const stored = storedMobile();
      const hasStoredMobile = Boolean(normalizeMobile(stored));
      const hasPin = Boolean(state.settings.pinHash);

      if (!isValidMobile(mobileRaw)) {
        setLoginStatus("Enter a valid 10-digit Indian mobile number (or +91).");
        return;
      }

      if (hasStoredMobile && !mobilesMatch(mobileRaw, stored)) {
        setLoginStatus(
          "This device already has a profile. Log in with that mobile and PIN, or reset the app from login."
        );
        if ($("login-pin")) $("login-pin").value = "";
        return;
      }

      if (hasPin) {
        if (!(await verifyPin(pin, mobileRaw))) {
          setLoginStatus("Wrong PIN. Try again.");
          if ($("login-pin")) $("login-pin").value = "";
          return;
        }
      } else {
        if (!/^\d{4,8}$/.test(pin)) {
          setLoginStatus("Create a 4–8 digit PIN.");
          return;
        }
        if (pin !== confirmPin) {
          setLoginStatus("PINs do not match.");
          return;
        }
        state.settings.pinHash = await hashPin(pin, mobileRaw);
      }

      syncSettingsMobile(mobileRaw);
      if (!hasStoredMobile || !hasPin) save();

      setSessionUnlocked(true);
      if ($("login-pin")) $("login-pin").value = "";
      if ($("login-pin-confirm")) $("login-pin-confirm").value = "";
      if ($("login-mobile")) $("login-mobile").value = "";
      setLoginStatus("");
      showScreen("app");
      setView("track");
    } catch (err) {
      console.error(err);
      setLoginStatus("Could not log in. Try again.");
    } finally {
      loginBusy = false;
    }
  }

  async function confirmDeviceReset() {
    const typed = $("login-reset-confirm")?.value || "";
    const stored = storedMobile();
    const status = $("login-reset-status");
    const hasMobile = Boolean(normalizeMobile(stored));
    const ok = hasMobile
      ? mobilesMatch(typed, stored)
      : String(typed).trim().toUpperCase() === "RESET THIS DEVICE";
    if (!ok) {
      if (status) {
        status.textContent = hasMobile
          ? "That number does not match this device’s profile."
          : "Type RESET THIS DEVICE to confirm.";
      }
      return;
    }
    if (!confirm("Erase all payments and the profile on this device? This cannot be undone.")) return;
    await wipeAllData();
    showScreen("welcome");
  }

  function personalizeChrome() {
    const name = state.settings.name?.trim();
    const first = name ? name.split(" ")[0] : "";
    if ($("app-subtitle")) {
      $("app-subtitle").textContent = state.demoMode
        ? "Demo tour"
        : first
          ? `Hi, ${first}`
          : "Know where it goes";
    }
    if ($("track-greet")) {
      $("track-greet").textContent = first ? `Hey ${first}` : "Welcome";
    }
    if ($("track-heading")) {
      $("track-heading").textContent = state.transactions.length ? "Log another payment" : "Add your first spending";
    }
    if ($("next-action")) {
      $("next-action").textContent = state.transactions.length
        ? "Keep logging as you spend. Tick several rows to fix them together, then check Insights."
        : "Tap Spent or Received, type the amount, then save. Insights unlocks after a few entries.";
    }
    applyPhoto(state.demoMode ? "" : state.settings.photo);
  }

  function applyPhoto(src) {
    const header = $("header-photo");
    const mark = header?.parentElement;
    const profile = $("profile-photo");
    const fallback = $("profile-photo-fallback");
    const has = Boolean(src);
    if (header) {
      header.hidden = !has;
      header.src = src || "";
      header.alt = has ? "Your photo" : "";
    }
    if (mark) mark.classList.toggle("has-photo", has);
    if (profile) {
      profile.hidden = !has;
      profile.src = src || "";
      profile.alt = has ? "Profile photo" : "";
    }
    if (fallback) fallback.hidden = has;
  }

  function resizePhoto(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith("image/")) {
        reject(new Error("Please choose a photo file."));
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        reject(new Error("Please use a photo smaller than 8 MB."));
        return;
      }
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const size = 320;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read that photo."));
      };
      img.src = url;
    });
  }

  function setView(view) {
    if (view !== "demo" && state.setupComplete && !isSessionUnlocked()) {
      showLogin();
      return;
    }
    const intro = $("view-results")?.querySelector(".intro-panel");

    if (view === "demo") {
      state.demoMode = true;
      state.view = "demo";
      document.querySelectorAll(".main-tabs .tab").forEach((tab) => {
        const on = tab.dataset.view === "results";
        tab.classList.toggle("active", on);
        tab.setAttribute("aria-selected", on ? "true" : "false");
      });
      $("view-track").hidden = true;
      $("view-setup-edit").hidden = true;
      $("view-demo").hidden = false;
      $("view-results").hidden = false;
      $("demo-banner").hidden = false;
      personalizeChrome();
      if (intro) intro.hidden = true;
      renderAllResults();
      return;
    }

    if (state.demoMode) {
      if (view === "results") {
        state.view = "results";
        document.querySelectorAll(".main-tabs .tab").forEach((tab) => {
          const on = tab.dataset.view === "results";
          tab.classList.toggle("active", on);
          tab.setAttribute("aria-selected", on ? "true" : "false");
        });
        $("view-track").hidden = true;
        $("view-setup-edit").hidden = true;
        $("view-demo").hidden = false;
        $("view-results").hidden = false;
        $("demo-banner").hidden = false;
        personalizeChrome();
        if (intro) intro.hidden = true;
        renderAllResults();
        return;
      }
      if (view === "track" || view === "setup-edit") {
        alert("Exit demo first — tap “Back to my money” on the banner.");
        return;
      }
    }

    state.demoMode = false;
    state.view = view;
    $("demo-banner").hidden = true;
    personalizeChrome();
    if (intro) intro.hidden = false;

    ["track", "results", "demo", "setup-edit"].forEach((v) => {
      const el = $(`view-${v}`);
      if (el) el.hidden = v !== view;
    });
    document.querySelectorAll(".main-tabs .tab").forEach((tab) => {
      const on = tab.dataset.view === view;
      tab.classList.toggle("active", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
    });

    if (view === "results") renderAllResults();
    if (view === "track") renderTrack();
    if (view === "setup-edit") {
      fillEditForm();
      syncAccountSecurityUI();
    }
  }

  function boot() {
    if (!state.setupComplete) {
      showScreen("welcome");
      return;
    }
    if (!isSessionUnlocked()) {
      showLogin();
      return;
    }
    showScreen("app");
    setView("track");
  }

  /* ---------- setup wizard ---------- */

  function renderAccountFields(containerId, values) {
    const box = $(containerId);
    box.innerHTML = "";
    const list = values.length ? values : [""];
    list.forEach((val, i) => {
      const name = typeof val === "string" ? val : val.name || "";
      const opening =
        typeof val === "object" && val && "opening" in val
          ? val.opening
          : state.openingBalances[name] || "";
      const row = document.createElement("div");
      row.className = "account-row";
      row.innerHTML = `
        <input type="text" data-account-input value="${escapeHtml(name)}" placeholder="e.g. HDFC ****4210" ${
          i === 0 ? "required" : ""
        } />
        <input type="number" data-opening step="0.01" min="0" inputmode="decimal" value="${
          opening === "" ? "" : escapeHtml(String(opening))
        }" placeholder="Opening ₹" title="Opening balance" />
        <button type="button" class="btn ghost tiny" data-remove-account ${list.length === 1 ? "disabled" : ""}>Remove</button>
      `;
      box.appendChild(row);
    });
  }

  function readAccountFields(containerId) {
    return [...$(containerId).querySelectorAll("[data-account-input]")]
      .map((i) => i.value.trim())
      .filter(Boolean);
  }

  function readOpeningBalances(containerId) {
    const out = {};
    $(containerId).querySelectorAll(".account-row").forEach((row) => {
      const name = row.querySelector("[data-account-input]")?.value.trim();
      if (!name) return;
      out[name] = parseAmount(row.querySelector("[data-opening]")?.value);
    });
    return out;
  }

  function snapshotAccountRows(containerId) {
    return [...$(containerId).querySelectorAll(".account-row")].map((row) => ({
      name: row.querySelector("[data-account-input]")?.value || "",
      opening: row.querySelector("[data-opening]")?.value ?? "",
    }));
  }

  function renderBudgetFields(containerId, budgets) {
    $(containerId).innerHTML = BUDGETABLE.map(
      (c) => `
      <label>
        <span>${escapeHtml(c)}</span>
        <input type="number" min="0" step="100" data-budget="${escapeHtml(c)}" value="${budgets[c] ?? 0}" />
      </label>`
    ).join("");
  }

  function readBudgets(containerId) {
    const out = { ...DEFAULT_BUDGETS };
    $(containerId).querySelectorAll("[data-budget]").forEach((input) => {
      out[input.getAttribute("data-budget")] = parseAmount(input.value) || 0;
    });
    return out;
  }

  function updateSetupUI() {
    const step = state.setupStep;
    const labels = {
      1: "Step 1 of 5 — about you",
      2: "Step 2 of 5 — mobile & PIN",
      3: "Step 3 of 5 — income & savings",
      4: "Step 4 of 5 — accounts",
      5: "Step 5 of 5 — budgets",
    };
    if ($("setup-step-label")) $("setup-step-label").textContent = labels[step] || `Step ${step} of 5`;
    if ($("setup-progress")) $("setup-progress").style.width = `${step * 20}%`;
    document.querySelectorAll(".step-pill").forEach((el) => {
      el.classList.toggle("on", Number(el.dataset.pill) === step);
    });
    document.querySelectorAll(".wizard-step").forEach((el) => {
      el.hidden = Number(el.dataset.step) !== step;
    });
    if ($("btn-setup-back")) $("btn-setup-back").hidden = step === 1;
    if ($("btn-setup-next")) {
      $("btn-setup-next").textContent = step === SETUP_LAST_STEP ? "Done — take me to Add spend" : "Continue";
    }
  }

  function beginSetupWizard() {
    state.setupStep = 1;
    state.setupBudgetsDraft = null;
    showScreen("setup");
    try {
      if ($("setup-name")) $("setup-name").value = state.settings.name || "";
      if ($("setup-currency")) $("setup-currency").value = state.settings.currency || "INR";
      if ($("setup-mobile")) $("setup-mobile").value = storedMobile();
      if ($("setup-pin")) $("setup-pin").value = "";
      if ($("setup-pin-confirm")) $("setup-pin-confirm").value = "";
      if ($("setup-income")) $("setup-income").value = state.settings.monthlyIncome || "";
      if ($("setup-savings")) $("setup-savings").value = state.settings.savingsGoal || "";
      renderAccountFields("setup-accounts", state.accounts.length ? state.accounts : ["Primary account"]);
      renderBudgetFields(
        "setup-budgets",
        state.budgets.Other != null ? state.budgets : defaultBudgetsFor($("setup-currency")?.value)
      );
      updateSetupUI();
    } catch (err) {
      console.error(err);
    }
  }

  function startSetup() {
    if (state.setupComplete) {
      showLogin(
        "This browser already has a profile. Log in with that mobile and PIN, or create a new profile below."
      );
      return;
    }
    beginSetupWizard();
  }

  async function createNewProfile() {
    if (state.setupComplete) {
      const ok = confirm(
        "This browser already has a profile. Creating a new one will erase all payments and settings on this device. Continue?"
      );
      if (!ok) return;
      await wipeAllData();
      state.settings = { ...DEFAULT_SETTINGS };
      state.accounts = ["Primary account"];
      state.openingBalances = {};
      state.budgets = { ...DEFAULT_BUDGETS };
      state.transactions = [];
      state.selected = new Set();
      state.demoMode = false;
    }
    beginSetupWizard();
  }

  function openDemo() {
    showScreen("app");
    setView("demo");
  }

  function validateSetupStep() {
    if (state.setupStep === 1) {
      if (!$("setup-name")?.value.trim()) {
        alert("Please enter your name.");
        return false;
      }
    }
    if (state.setupStep === 2) {
      if (!isValidMobile($("setup-mobile")?.value)) {
        alert("Enter a valid 10-digit mobile number (or +91).");
        return false;
      }
      const a = $("setup-pin")?.value || "";
      const b = $("setup-pin-confirm")?.value || "";
      if (!state.settings.pinHash || a || b) {
        if (!/^\d{4,8}$/.test(a)) {
          alert("Choose a 4–8 digit PIN.");
          return false;
        }
        if (a !== b) {
          alert("PINs do not match.");
          return false;
        }
      }
    }
    if (state.setupStep === 4) {
      const accounts = readAccountFields("setup-accounts");
      if (!accounts.length) {
        alert("Add at least one bank account name.");
        return false;
      }
    }
    return true;
  }

  async function finishSetup() {
    const mobileRaw = $("setup-mobile")?.value || storedMobile();
    if (!isValidMobile(mobileRaw)) {
      alert("Enter a valid mobile number.");
      state.setupStep = 2;
      updateSetupUI();
      return;
    }
    const pin = $("setup-pin")?.value || "";
    const confirmPin = $("setup-pin-confirm")?.value || "";
    if (pin) {
      if (!/^\d{4,8}$/.test(pin) || pin !== confirmPin) {
        alert("Check your PIN and confirmation.");
        state.setupStep = 2;
        updateSetupUI();
        return;
      }
      state.settings.pinHash = await hashPin(pin, mobileRaw);
      if ($("setup-pin")) $("setup-pin").value = "";
      if ($("setup-pin-confirm")) $("setup-pin-confirm").value = "";
    }
    if (!state.settings.pinHash) {
      alert("Set a 4–8 digit PIN to continue.");
      state.setupStep = 2;
      updateSetupUI();
      return;
    }
    syncSettingsMobile(mobileRaw);
    state.settings = {
      ...DEFAULT_SETTINGS,
      ...state.settings,
      name: $("setup-name")?.value.trim() || "",
      currency: $("setup-currency")?.value || "INR",
      monthlyIncome: parseAmount($("setup-income")?.value) || 0,
      savingsGoal: parseAmount($("setup-savings")?.value) || 0,
      phone: state.settings.phone,
      mobile: state.settings.mobile,
      pinHash: state.settings.pinHash,
    };
    state.accounts = readAccountFields("setup-accounts");
    state.openingBalances = readOpeningBalances("setup-accounts");
    state.budgets = readBudgets("setup-budgets");
    state.setupBudgetsDraft = null;
    state.setupComplete = true;
    state.demoMode = false;
    setSessionUnlocked(true);
    save();
    showScreen("app");
    setView("track");
    if ($("form-status")) $("form-status").textContent = "You're set. Add your first payment below.";
  }

  /* ---------- analytics helpers ---------- */

  function periodBounds(period, anchor) {
    const d = new Date(`${anchor}T12:00:00`);
    if (period === "day") {
      const start = new Date(d);
      start.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    if (period === "year") {
      return {
        start: new Date(d.getFullYear(), 0, 1),
        end: new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999),
      };
    }
    return {
      start: new Date(d.getFullYear(), d.getMonth(), 1),
      end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  }

  function shiftAnchor(delta) {
    state.anchor = Core.shiftLocalISO
      ? Core.shiftLocalISO(state.anchor, state.period, delta)
      : todayISO();
    $("anchor-date").value = state.anchor;
  }

  function previousAnchor() {
    return Core.shiftLocalISO ? Core.shiftLocalISO(state.anchor, state.period, -1) : state.anchor;
  }

  function inRange(iso, start, end) {
    const t = new Date(`${iso}T12:00:00`).getTime();
    return t >= start.getTime() && t <= end.getTime();
  }

  function filtered(extraAnchor = state.anchor) {
    const { start, end } = periodBounds(state.period, extraAnchor);
    const q = state.search.trim().toLowerCase();
    return activeTxs()
      .filter((t) => inRange(t.date, start, end))
      .filter((t) => (state.account === "all" ? true : t.account === state.account))
      .filter((t) => {
        if (!q) return true;
        return (
          t.merchant.toLowerCase().includes(q) ||
          (t.note || "").toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  function categoryTotals(txs) {
    const map = {};
    for (const t of txs) {
      if (t.type !== "expense") continue;
      map[t.category] = (map[t.category] || 0) + t.amount;
    }
    return Object.entries(map)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }

  function budgetCap(category) {
    const monthly = Number(activeBudgets()[category]) || 0;
    if (state.period === "year") return monthly * 12;
    if (state.period === "day") return monthly / 30;
    return monthly;
  }

  function scaleIncome(monthly) {
    if (state.period === "year") return monthly * 12;
    if (state.period === "day") return monthly / 30;
    return monthly;
  }

  function healthScore(txs) {
    const settings = activeSettings();
    const spent = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const income =
      txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0) ||
      scaleIncome(settings.monthlyIncome);
    let score = 100;
    if (income > 0) {
      const rate = spent / income;
      if (rate > 1) score -= 45;
      else if (rate > 0.85) score -= 30;
      else if (rate > 0.7) score -= 15;
    }
    for (const c of categoryTotals(txs)) {
      const cap = budgetCap(c.name);
      if (cap > 0 && c.amount > cap) score -= 8;
    }
    const savings = income - spent;
    const goal = scaleIncome(settings.savingsGoal || 0);
    if (goal && savings < goal) score -= 8;
    if (goal && savings >= goal) score += 6;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function trendBuckets(txs) {
    const { end } = periodBounds(state.period, state.anchor);
    const labels = [];
    if (state.period === "day") {
      // single day total as one bar for clarity
      labels.push("Day");
    } else if (state.period === "year") {
      for (let m = 0; m < 12; m++) labels.push(new Date(2024, m, 1).toLocaleString("en", { month: "short" }));
    } else {
      for (let i = 1; i <= end.getDate(); i++) labels.push(String(i));
    }
    const sums = Object.fromEntries(labels.map((l) => [l, 0]));
    for (const t of txs) {
      if (t.type !== "expense") continue;
      let key;
      if (state.period === "day") key = "Day";
      else if (state.period === "year") {
        key = new Date(`${t.date}T12:00:00`).toLocaleString("en", { month: "short" });
      } else key = String(new Date(`${t.date}T12:00:00`).getDate());
      if (key in sums) sums[key] += t.amount;
    }
    return labels.map((label) => ({ label, amount: sums[label] || 0 }));
  }

  function buildInsights(txs) {
    const settings = activeSettings();
    const expenses = txs.filter((t) => t.type === "expense");
    const spent = expenses.reduce((s, t) => s + t.amount, 0);
    const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const cats = categoryTotals(txs);
    const tips = [];
    if (!expenses.length) {
      return [
        {
          kind: "tip",
          icon: "i",
          title: "No expenses in this view",
          body: "Go to Track and add payments, then return here.",
        },
      ];
    }
    const prevSpent = filtered(previousAnchor())
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + t.amount, 0);
    if (prevSpent > 0) {
      const pct = Math.round(((spent - prevSpent) / prevSpent) * 100);
      tips.push({
        kind: pct > 10 ? "warn" : "tip",
        icon: "Δ",
        title: pct >= 0 ? `Spend up ${pct}% vs last ${state.period}` : `Spend down ${Math.abs(pct)}% vs last ${state.period}`,
        body: `Previous: ${money(prevSpent)}. Now: ${money(spent)}.`,
      });
    }
    if (cats[0]) {
      const share = Math.round((cats[0].amount / spent) * 100);
      tips.push({
        kind: share >= 35 ? "warn" : "tip",
        icon: "%",
        title: `${cats[0].name} is ${share}% of spending`,
        body: share >= 35 ? `Try capping this near 25% to free ~${money(cats[0].amount * 0.3)}.` : `${money(cats[0].amount)} went here.`,
      });
    }
    for (const c of cats) {
      const cap = budgetCap(c.name);
      if (cap && c.amount > cap) {
        tips.push({
          kind: "warn",
          icon: "B",
          title: `${c.name} over budget`,
          body: `Spent ${money(c.amount)} vs ${money(cap)}. Cut ${money(c.amount - cap)}.`,
        });
        break;
      }
    }
    const food = cats.find((c) => c.name === "Food & Dining");
    const foodCap = budgetCap("Food & Dining");
    const foodThreshold =
      foodCap > 0 ? foodCap * 0.75 : Math.max(scaleIncome(settings.monthlyIncome) * 0.08, 500);
    if (food && food.amount > foodThreshold) {
      tips.push({
        kind: "warn",
        icon: "F",
        title: "Dining looks high",
        body: `Food & dining is ${money(food.amount)}${foodCap ? ` (budget ${money(foodCap)})` : ""}. Cooking more meals could save ~${money(food.amount * 0.25)}.`,
      });
    }
    const effIncome = income || scaleIncome(settings.monthlyIncome);
    if (effIncome > 0) {
      const rate = spent / effIncome;
      tips.push({
        kind: rate > 0.8 ? "warn" : "ok",
        icon: "₹",
        title: "Income vs spend",
        body: `You used ${Math.round(rate * 100)}% of income capacity. Buffer: ${money(effIncome - spent)}.`,
      });
    }
    return tips.slice(0, 6);
  }

  function detectRecurring(txs) {
    const map = {};
    for (const t of txs.filter((x) => x.type === "expense")) {
      const k = t.merchant.trim().toLowerCase();
      if (!map[k]) map[k] = [];
      map[k].push(t);
    }
    const out = [];
    for (const list of Object.values(map)) {
      if (list.length < 2) continue;
      list.sort((a, b) => (a.date < b.date ? -1 : 1));
      const amounts = list.map((t) => t.amount);
      const avg = amounts.reduce((s, t) => s + t, 0) / amounts.length;
      const similar = amounts.every((a) => Math.abs(a - avg) / Math.max(avg, 1) <= 0.15);
      if (!similar) continue;
      let intervalOk = false;
      for (let i = 1; i < list.length; i++) {
        const prev = Core.fromLocalISO ? Core.fromLocalISO(list[i - 1].date) : new Date(list[i - 1].date);
        const cur = Core.fromLocalISO ? Core.fromLocalISO(list[i].date) : new Date(list[i].date);
        const days = Math.round((cur - prev) / 86400000);
        if (days >= 6 && days <= 35) intervalOk = true;
      }
      if (!intervalOk && list.length < 3) continue;
      out.push({
        merchant: list[0].merchant,
        amount: Math.round(avg),
        count: list.length,
        category: list[0].category,
      });
    }
    return out.sort((a, b) => b.count - a.count).slice(0, 5);
  }

  /* ---------- render track ---------- */

  function fillCategorySelect() {
    const opts = CATEGORIES.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    if ($("q-category")) $("q-category").innerHTML = opts;
    if ($("e-category")) $("e-category").innerHTML = opts;
    if ($("b-category")) $("b-category").innerHTML = `<option value="">Keep current</option>` + opts;
  }

  function fillAccountSelect() {
    const accounts = activeAccounts();
    const opts = accounts.map((a) => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join("");
    if ($("q-account")) $("q-account").innerHTML = opts;
    if ($("e-account")) $("e-account").innerHTML = opts;
    if ($("b-account")) $("b-account").innerHTML = `<option value="">Keep current</option>` + opts;
    if ($("q-transfer-to")) $("q-transfer-to").innerHTML = opts;
    if ($("e-transfer-to")) $("e-transfer-to").innerHTML = opts;
    if ($("b-transfer-to")) $("b-transfer-to").innerHTML = `<option value="">Keep current</option>` + opts;
  }

  function selectedType(name) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value || "expense";
  }

  function syncTransferFields() {
    const qType = selectedType("q-type");
    if ($("transfer-fields")) $("transfer-fields").hidden = qType !== "transfer";
    const eType = selectedType("e-type");
    if ($("e-transfer-fields")) $("e-transfer-fields").hidden = eType !== "transfer";
    const bType = $("b-type")?.value;
    if ($("b-transfer-fields")) $("b-transfer-fields").hidden = bType !== "transfer";
    if (qType === "income") $("q-category").value = "Income";
    if (qType === "transfer") $("q-category").value = "Transfers";
  }

  function pageSlice(list, page) {
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const safe = Math.min(Math.max(0, page), pages - 1);
    const start = safe * PAGE_SIZE;
    return { page: safe, pages, slice: list.slice(start, start + PAGE_SIZE), total: list.length };
  }

  function bindPager(prefix, info, onPage) {
    const pager = $(`${prefix}-pager`);
    const label = $(`${prefix}-page-label`);
    if (!pager) return;
    pager.hidden = info.total <= PAGE_SIZE;
    if (label) label.textContent = `Page ${info.page + 1} of ${info.pages}`;
    const prev = $(`${prefix}-prev`);
    const next = $(`${prefix}-next`);
    if (prev) prev.disabled = info.page <= 0;
    if (next) next.disabled = info.page >= info.pages - 1;
    pager._onPage = onPage;
  }

  function visibleTrackTxs() {
    const q = state.trackSearch.trim().toLowerCase();
    return [...state.transactions]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .filter((t) => {
        if (!q) return true;
        return (
          t.merchant.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.account.toLowerCase().includes(q) ||
          (t.note || "").toLowerCase().includes(q)
        );
      });
  }

  function pruneSelection() {
    const ids = new Set(state.transactions.map((t) => t.id));
    state.selected = new Set([...state.selected].filter((id) => ids.has(id)));
  }

  function selectedList() {
    pruneSelection();
    return state.transactions.filter((t) => state.selected.has(t.id));
  }

  function updateBulkBars() {
    const selected = selectedList();
    const n = selected.length;
    const trackVisible = visibleTrackTxs();
    const resultsVisible = filtered();

    $("bulk-bar").hidden = n === 0;
    $("bulk-count").textContent = n === 1 ? "1 selected" : `${n} selected`;
    const allTrack = $("select-all");
    if (allTrack) {
      const page = pageSlice(trackVisible, state.trackPage).slice;
      allTrack.checked = page.length > 0 && page.every((t) => state.selected.has(t.id));
      allTrack.indeterminate = page.some((t) => state.selected.has(t.id)) && !allTrack.checked;
    }

    $("results-bulk-bar").hidden = n === 0 || state.demoMode;
    $("results-bulk-count").textContent = n === 1 ? "1 selected" : `${n} selected`;
    const allRes = $("results-select-all");
    if (allRes) {
      const page = pageSlice(resultsVisible, state.resultsPage).slice;
      allRes.checked = page.length > 0 && page.every((t) => state.selected.has(t.id));
      allRes.indeterminate = page.some((t) => state.selected.has(t.id)) && !allRes.checked;
    }
  }

  function renderTrack() {
    fillAccountSelect();
    syncTransferFields();
    if (!$("q-date").value) $("q-date").value = todayISO();
    pruneSelection();
    const txs = visibleTrackTxs();
    const paged = pageSlice(txs, state.trackPage);
    state.trackPage = paged.page;
    $("track-count").textContent =
      state.transactions.length === 1 ? "1 payment saved" : `${state.transactions.length} payments saved`;
    $("track-empty").hidden = txs.length > 0;
    $("track-tx-body").innerHTML = paged.slice
      .map((t) => {
        const signed = signedDisplay(t);
        const on = state.selected.has(t.id);
        const extra =
          t.type === "transfer" && t.transferTo
            ? ` · to ${escapeHtml(t.transferTo)}`
            : "";
        return `<tr class="${on ? "selected" : ""}" data-row="${t.id}">
          <td class="check-col"><input type="checkbox" data-select="${t.id}" ${on ? "checked" : ""} aria-label="Select ${escapeHtml(t.merchant)}" /></td>
          <td>${escapeHtml(t.date)}</td>
          <td><strong>${escapeHtml(t.merchant)}</strong><div class="muted small">${escapeHtml(
          t.category
        )} · ${escapeHtml(t.account)}${extra}</div></td>
          <td class="num ${t.type}">${signed >= 0 ? "+" : "−"}${money(Math.abs(signed))}</td>
          <td>
            <button type="button" class="icon-btn" data-edit="${t.id}">Edit</button>
            <button type="button" class="icon-btn" data-del="${t.id}">Delete</button>
          </td>
        </tr>`;
      })
      .join("");
    bindPager("track", paged);
    updateBulkBars();
    personalizeChrome();
  }

  /* ---------- render results ---------- */

  function renderAllResults() {
    const txs = filtered();
    const settings = activeSettings();
    const score = txs.length ? healthScore(txs) : null;

    $("health-title").textContent = settings.name ? `${settings.name.split(" ")[0]}'s pulse` : "Your money pulse";
    if (score == null) {
      $("health-score").textContent = "—";
      $("health-ring").style.setProperty("--score", "0%");
      $("health-sub").textContent = "Add payments in Track to see your score.";
      $("health-label").textContent = "Score";
    } else {
      $("health-score").textContent = String(score);
      $("health-ring").style.setProperty("--score", `${score}%`);
      $("health-label").textContent = score >= 80 ? "Strong" : score >= 60 ? "Fair" : "Needs cut";
      $("health-sub").textContent =
        score >= 80 ? "Spending looks controlled." : "Check budgets and tips below.";
    }

    const spent = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const net = income - spent;
    const prevSpent = filtered(previousAnchor())
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + t.amount, 0);
    let deltaLabel = "vs prior period";
    let deltaClass = "";
    if (prevSpent > 0) {
      const pct = Math.round(((spent - prevSpent) / prevSpent) * 100);
      deltaLabel = `${pct >= 0 ? "+" : ""}${pct}% vs prior`;
      deltaClass = pct > 0 ? "up" : "down";
    }
    const days =
      state.period === "day" ? 1 : state.period === "year" ? 12 : Math.max(1, new Date(`${state.anchor}T12:00:00`).getDate());
    const avg = state.period === "year" ? spent / 12 : spent / days;
    const toward = Math.max(0, (income || scaleIncome(settings.monthlyIncome)) - spent);

    $("stats-row").innerHTML = `
      <article class="stat lift-card"><p class="stat-label">Spent</p><p class="stat-value expense">${money(spent)}</p><p class="stat-hint ${deltaClass}">${deltaLabel}</p></article>
      <article class="stat lift-card"><p class="stat-label">Income</p><p class="stat-value income">${money(income)}</p><p class="stat-hint">this view</p></article>
      <article class="stat lift-card"><p class="stat-label">Net</p><p class="stat-value ${net >= 0 ? "income" : "expense"}">${money(net)}</p><p class="stat-hint">income − expenses</p></article>
      <article class="stat lift-card"><p class="stat-label">Pace</p><p class="stat-value">${money(avg)}</p><p class="stat-hint">${state.period === "year" ? "avg / month" : "avg / day"}</p></article>
      <article class="stat lift-card"><p class="stat-label">Toward savings</p><p class="stat-value">${money(toward)}</p><p class="stat-hint">goal ${money(scaleIncome(settings.savingsGoal || 0))}</p></article>
    `;

    const buckets = trendBuckets(txs);
    const max = Math.max(...buckets.map((b) => b.amount), 1);
    $("chart-caption").textContent =
      state.period === "year" ? "Monthly totals" : state.period === "day" ? "Selected day" : "Daily totals";
    $("trend-chart").innerHTML = buckets
      .map((b) => {
        const h = Math.max(4, Math.round((b.amount / max) * 150));
        return `<div class="bar-col" title="${escapeHtml(b.label)}: ${money(b.amount)}"><div class="bar-3d" style="--h:${h}px"><span class="face front"></span><span class="face top"></span><span class="face side"></span></div><span class="bar-label">${escapeHtml(b.label)}</span></div>`;
      })
      .join("");

    const cats = categoryTotals(txs).slice(0, 8);
    const cmax = cats[0]?.amount || 1;
    $("category-bars").innerHTML = cats.length
      ? cats
          .map(
            (c) => `<div class="cat-row"><span class="cat-name">${escapeHtml(c.name)}</span><div class="track"><div class="fill" style="--cat:${CATEGORY_COLORS[c.name] || "#0f6b5c"};width:${Math.round((c.amount / cmax) * 100)}%"></div></div><span class="cat-amt">${money(c.amount)}</span></div>`
          )
          .join("")
      : `<p class="muted">No expenses in this view.</p>`;

    const totals = Object.fromEntries(categoryTotals(txs).map((c) => [c.name, c.amount]));
    $("budget-list").innerHTML = BUDGETABLE.map((name) => {
      const spentCat = totals[name] || 0;
      const cap = budgetCap(name);
      if (!cap && !spentCat) return "";
      const pct = cap ? Math.min(100, Math.round((spentCat / cap) * 100)) : 100;
      const over = cap > 0 && spentCat > cap;
      return `<div class="budget-row"><div class="budget-meta"><span>${escapeHtml(name)}</span><span class="${over ? "over" : ""}">${money(spentCat)} / ${money(cap)}</span></div><div class="track"><div class="fill ${over ? "warn" : ""}" style="width:${pct}%"></div></div></div>`;
    })
      .filter(Boolean)
      .join("") || `<p class="muted">No budget activity yet.</p>`;

    const merchants = {};
    for (const t of txs.filter((x) => x.type === "expense")) {
      merchants[t.merchant] = (merchants[t.merchant] || 0) + t.amount;
    }
    const topM = Object.entries(merchants)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
    const mmax = topM[0]?.amount || 1;
    $("merchant-list").innerHTML = topM.length
      ? topM
          .map(
            (m) => `<div class="merchant-row"><span class="merchant-name">${escapeHtml(m.name)}</span><div class="track"><div class="fill" style="width:${Math.round((m.amount / mmax) * 100)}%"></div></div><span class="merchant-amt">${money(m.amount)}</span></div>`
          )
          .join("")
      : `<p class="muted">No merchants yet.</p>`;

    $("insights-list").innerHTML = buildInsights(txs)
      .map(
        (t) => `<li class="insight ${t.kind}"><div class="insight-icon">${t.icon}</div><div><h3>${escapeHtml(t.title)}</h3><p>${escapeHtml(t.body)}</p></div></li>`
      )
      .join("");

    const bal = Core.applyLedger
      ? Core.applyLedger(activeAccounts(), state.demoMode ? {} : state.openingBalances, activeTxs())
      : (() => {
          const map = {};
          for (const t of activeTxs()) {
            map[t.account] = (map[t.account] || 0) + (t.type === "income" ? t.amount : -t.amount);
          }
          return map;
        })();
    const accounts = Object.entries(bal);
    $("accounts-list").innerHTML = accounts.length
      ? accounts
          .map(
            ([name, balance]) => `<div class="account"><div><strong>${escapeHtml(name)}</strong><span>Running balance</span></div><div class="bal">${money(balance)}</div></div>`
          )
          .join("")
      : `<p class="muted">No account activity yet.</p>`;

    const recurring = detectRecurring(activeTxs());
    $("recurring-list").innerHTML = recurring.length
      ? recurring
          .map(
            (r) => `<div class="recurring-item"><div><strong>${escapeHtml(r.merchant)}</strong><span>${escapeHtml(r.category)} · ${r.count}×</span></div><div class="bal">~${money(r.amount)}</div></div>`
          )
          .join("")
      : `<p class="muted">Recurring items appear after repeats.</p>`;

    if ($("forecast-list")) {
      $("forecast-list").innerHTML = renderForecast(recurring, txs);
    }

    // account filter options
    const names = [...new Set(activeTxs().map((t) => t.account))];
    const cur = state.account;
    $("account-filter").innerHTML =
      `<option value="all">All accounts</option>` +
      names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
    $("account-filter").value = cur === "all" || names.includes(cur) ? cur : "all";
    state.account = $("account-filter").value;

    $("tx-count").textContent = `${txs.length} item${txs.length === 1 ? "" : "s"}`;
    $("results-empty").hidden = txs.length > 0;
    const paged = pageSlice(txs, state.resultsPage);
    state.resultsPage = paged.page;
    $("results-tx-body").innerHTML = paged.slice
      .map((t) => {
        const signed = signedDisplay(t);
        const on = state.selected.has(t.id);
        const actions = state.demoMode
          ? ""
          : `<button type="button" class="icon-btn" data-edit="${t.id}">Edit</button>
             <button type="button" class="icon-btn" data-del="${t.id}">Delete</button>`;
        const dest = t.type === "transfer" && t.transferTo ? ` → ${t.transferTo}` : "";
        return `<tr class="${on ? "selected" : ""}" data-row="${t.id}">
          <td class="check-col">${
            state.demoMode
              ? ""
              : `<input type="checkbox" data-select="${t.id}" ${on ? "checked" : ""} aria-label="Select ${escapeHtml(t.merchant)}" />`
          }</td>
          <td>${escapeHtml(t.date)}</td>
          <td><strong>${escapeHtml(t.merchant)}</strong>${t.note ? `<div class="muted small">${escapeHtml(t.note)}</div>` : ""}</td>
          <td><span class="pill">${escapeHtml(t.category)}</span></td>
          <td>${escapeHtml(t.account)}${escapeHtml(dest)}</td>
          <td class="num ${t.type}">${signed >= 0 ? "+" : "−"}${money(Math.abs(signed))}</td>
          <td>${actions}</td>
        </tr>`;
      })
      .join("");
    bindPager("results", paged);
    updateBulkBars();
  }

  function renderForecast(recurring, periodTxs) {
    if (!recurring.length) return `<p class="muted">Add a few repeats and we will flag the next bill against budgets.</p>`;
    const totals = Object.fromEntries(categoryTotals(periodTxs).map((c) => [c.name, c.amount]));
    return recurring
      .map((r) => {
        const cap = budgetCap(r.category);
        const spentCat = totals[r.category] || 0;
        const projected = spentCat + r.amount;
        const over = cap > 0 && projected > cap;
        return `<div class="recurring-item"><div><strong>${escapeHtml(r.merchant)}</strong><span>${escapeHtml(r.category)} · next ~${money(r.amount)}${
          over ? " — may break budget" : cap ? " — still inside budget" : ""
        }</span></div><div class="bal">${over ? "Watch" : "OK"}</div></div>`;
      })
      .join("");
  }

  function fillEditForm() {
    $("edit-name").value = state.settings.name || "";
    $("edit-phone").value = state.settings.phone || "";
    $("edit-email").value = state.settings.email || "";
    $("edit-city").value = state.settings.city || "";
    $("edit-occupation").value = state.settings.occupation || "";
    $("edit-dob").value = state.settings.dob || "";
    $("edit-gender").value = state.settings.gender || "";
    $("edit-notes").value = state.settings.notes || "";
    $("edit-currency").value = state.settings.currency || "INR";
    $("edit-income").value = state.settings.monthlyIncome || "";
    $("edit-savings").value = state.settings.savingsGoal || "";
    applyPhoto(state.settings.photo);
    renderAccountFields("edit-accounts", state.accounts);
    renderBudgetFields("edit-budgets", state.budgets);
    syncAccountSecurityUI();
  }

  async function digestPin(raw) {
    try {
      if (crypto.subtle) {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
        return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
      }
    } catch {
      /* file:// fallback */
    }
    let h = 5381;
    for (let i = 0; i < raw.length; i++) h = ((h << 5) + h) ^ raw.charCodeAt(i);
    return `fb_${(h >>> 0).toString(16)}`;
  }

  async function hashPinLegacy(pin) {
    return digestPin(`pm-pin:${pin}`);
  }

  async function hashPin(pin, mobile) {
    const salt = normalizeMobile(mobile || storedMobile()) || "niva";
    return digestPin(`pm-pin-v2:${salt}:${pin}`);
  }

  async function verifyPin(pin, mobile) {
    const stored = state.settings.pinHash;
    if (!stored) return false;
    const salted = await hashPin(pin, mobile);
    if (salted === stored) return true;
    const legacy = await hashPinLegacy(pin);
    if (legacy === stored) {
      state.settings.pinHash = salted;
      save();
      return true;
    }
    return false;
  }

  function syncAccountSecurityUI() {
    if ($("profile-mobile-masked")) $("profile-mobile-masked").textContent = maskMobile(storedMobile());
    if ($("sensitive-wrap")) $("sensitive-wrap").hidden = false;
    if ($("pin-set-row")) $("pin-set-row").hidden = false;
    if ($("pin-copy")) {
      $("pin-copy").textContent =
        "Your mobile and PIN lock this profile on this device. Data is stored locally — not encrypted. Close the tab to log out.";
    }
    applyPhoto(state.demoMode ? "" : state.settings.photo);
  }

  /* ---------- CSV ---------- */

  function csvColSelects() {
    return {
      date: $("csv-col-date"),
      description: $("csv-col-description"),
      amount: $("csv-col-amount"),
      type: $("csv-col-type"),
      debit: $("csv-col-debit"),
      credit: $("csv-col-credit"),
      account: $("csv-col-account"),
      category: $("csv-col-category"),
    };
  }

  function fillCsvColumnSelects(headers, idx) {
    const none = `<option value="-1">(none)</option>`;
    const opts = headers.map((h, i) => `<option value="${i}">${escapeHtml(h || `Column ${i + 1}`)}</option>`).join("");
    const selects = csvColSelects();
    for (const [key, el] of Object.entries(selects)) {
      if (!el) continue;
      el.innerHTML = (key === "date" ? "" : none) + opts;
      const value = idx[key] ?? -1;
      el.value = String(value >= 0 ? value : -1);
    }
  }

  function mappingFromSelects() {
    const idx = {};
    for (const [key, el] of Object.entries(csvColSelects())) {
      idx[key] = el ? Number(el.value) : -1;
    }
    return idx;
  }

  function parseCsvWithOptions(text, mapping) {
    if (!Core.parseCsvRows) throw new Error("CSV helper missing.");
    return Core.parseCsvRows(text, {
      dayFirst: $("csv-day-first") ? $("csv-day-first").checked : true,
      defaultAccount: state.accounts[0] || "Imported bank",
      guessCategory,
      categories: CATEGORIES,
      uid,
      mapping,
    });
  }

  function existingFingerprints() {
    return new Set(state.transactions.map((t) => t.fingerprint || txFingerprint(t)));
  }

  function refreshCsvPreview() {
    const status = $("csv-status");
    const body = $("csv-preview-body");
    const meta = $("csv-preview-meta");
    if (!pendingCsvText) return;
    try {
      const parsed = parseCsvWithOptions(pendingCsvText, mappingFromSelects());
      const seen = existingFingerprints();
      const skip = $("csv-skip-dupes")?.checked !== false;
      let dupes = 0;
      const unique = [];
      for (const row of parsed.rows) {
        const fp = row.fingerprint || txFingerprint(row);
        if (skip && seen.has(fp)) dupes += 1;
        else unique.push(row);
      }
      if (body) {
        body.innerHTML = unique.slice(0, 8)
          .map(
            (t) =>
              `<tr><td>${escapeHtml(t.date)}</td><td><strong>${escapeHtml(t.merchant)}</strong><div class="muted small">${escapeHtml(t.account)} · ${escapeHtml(t.type)}</div></td><td class="num ${t.type}">${t.type === "income" ? "+" : "−"}${money(t.amount)}</td></tr>`
          )
          .join("") || `<tr><td colspan="3">No new rows with this mapping.</td></tr>`;
      }
      if (meta) {
        meta.textContent = `${parsed.rows.length} valid rows · ${unique.length} new${dupes ? ` · ${dupes} duplicates skipped` : ""}`;
      }
      if (status) status.textContent = "";
      return { parsed, unique, dupes };
    } catch (err) {
      if (body) body.innerHTML = "";
      if (status) status.textContent = err.message || "Could not parse this file.";
      return null;
    }
  }

  async function openCsvDialog(text) {
    pendingCsvText = text;
    const detected = Core.detectCsvMapping
      ? Core.detectCsvMapping(text.split(/\r?\n/).find((l) => l.trim()) || "")
      : { headers: [], idx: {} };
    fillCsvColumnSelects(detected.headers, detected.idx);
    refreshCsvPreview();
    $("csv-dialog").showModal();
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function guardLive() {
    if (state.demoMode) {
      alert("Exit demo first — demo data cannot be edited.");
      return false;
    }
    return true;
  }

  function openSingleEdit(id) {
    if (!guardLive()) return;
    const tx = state.transactions.find((t) => t.id === id);
    if (!tx) return;
    fillAccountSelect();
    $("edit-dialog-title").textContent = "Edit transaction";
    $("edit-dialog-hint").textContent = "Change any field, then save.";
    $("e-id").value = tx.id;
    $("e-date").value = tx.date;
    $("e-merchant").value = tx.merchant;
    $("e-amount").value = tx.amount;
    $("e-category").value = tx.category;
    $("e-account").value = tx.account;
    $("e-note").value = tx.note || "";
    const typeRadio = document.querySelector(`input[name="e-type"][value="${tx.type}"]`) || document.querySelector('input[name="e-type"][value="expense"]');
    if (typeRadio) typeRadio.checked = true;
    if ($("e-transfer-to") && tx.transferTo) $("e-transfer-to").value = tx.transferTo;
    syncTransferFields();
    $("edit-dialog").showModal();
  }

  function openBulkEdit() {
    if (!guardLive()) return;
    const n = selectedList().length;
    if (!n) {
      alert("Tick one or more transactions first.");
      return;
    }
    fillAccountSelect();
    $("bulk-edit-hint").textContent = `Apply to ${n} selected payment${n === 1 ? "" : "s"}. Leave a field blank to keep it.`;
    $("b-date").value = "";
    $("b-type").value = "";
    $("b-category").value = "";
    $("b-account").value = "";
    $("b-note").value = "";
    $("b-note-apply").checked = false;
    syncTransferFields();
    $("bulk-edit-dialog").showModal();
  }

  function deleteIds(ids) {
    if (!guardLive()) return;
    if (!ids.length) return;
    const drop = new Set(ids);
    const removed = state.transactions.filter((t) => drop.has(t.id));
    state.transactions = state.transactions.filter((t) => !drop.has(t.id));
    ids.forEach((id) => state.selected.delete(id));
    undoPayload = removed;
    save();
    renderTrack();
    if (state.view === "results" || state.view === "demo") renderAllResults();
    const label = removed.length === 1 ? "1 payment deleted" : `${removed.length} payments deleted`;
    showToast(label, "Undo", () => {
      if (!undoPayload?.length) return;
      state.transactions = state.transactions.concat(undoPayload);
      undoPayload = null;
      save();
      renderTrack();
      if (state.view === "results" || state.view === "demo") renderAllResults();
      showToast("Delete undone");
    });
  }

  function toggleSelect(id, checked) {
    if (checked) state.selected.add(id);
    else state.selected.delete(id);
    updateBulkBars();
    document.querySelectorAll(`tr[data-row="${id}"]`).forEach((row) => {
      row.classList.toggle("selected", checked);
      const box = row.querySelector("[data-select]");
      if (box) box.checked = checked;
    });
  }

  function handleTableClick(e) {
    const editId = e.target.getAttribute("data-edit");
    const delId = e.target.getAttribute("data-del");
    if (editId) {
      e.stopPropagation();
      openSingleEdit(editId);
      return;
    }
    if (delId) {
      e.stopPropagation();
      deleteIds([delId]);
      return;
    }
    if (e.target.matches("[data-select]")) {
      toggleSelect(e.target.getAttribute("data-select"), e.target.checked);
      return;
    }
    const row = e.target.closest("tr[data-row]");
    if (!row) return;
    const id = row.getAttribute("data-row");
    toggleSelect(id, !state.selected.has(id));
  }

  function toCsv(txs) {
    const header = "Date,Description,Amount,Type,Category,Account,TransferTo,Note";
    const rows = txs.map((t) =>
      [t.date, t.merchant, t.amount, t.type, t.category, t.account, t.transferTo || "", t.note || ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    return [header, ...rows].join("\n");
  }

  /* ---------- bind ---------- */

  function on(id, evt, fn) {
    const el = $(id);
    if (!el) return;
    el.addEventListener(evt, fn);
  }

  function bind() {
    on("btn-start-setup", "click", (e) => {
      e.preventDefault();
      startSetup();
    });
    on("btn-open-demo", "click", (e) => {
      e.preventDefault();
      openDemo();
    });
    on("btn-goto-login", "click", (e) => {
      e.preventDefault();
      showLogin();
    });
    on("btn-create-profile", "click", (e) => {
      e.preventDefault();
      createNewProfile();
    });
    on("login-form", "submit", (e) => {
      e.preventDefault();
      submitLogin(e);
    });
    on("btn-forgot-reset", "click", () => {
      const panel = $("login-reset-panel");
      if (!panel) return;
      panel.hidden = !panel.hidden;
    });
    on("btn-confirm-device-reset", "click", () => {
      confirmDeviceReset();
    });

    try {
    on("btn-setup-back", "click", () => {
      if (state.setupStep > 1) {
        if (state.setupStep === SETUP_LAST_STEP) {
          state.setupBudgetsDraft = readBudgets("setup-budgets");
        }
        state.setupStep -= 1;
        updateSetupUI();
      }
    });

    on("btn-setup-next", "click", async () => {
      if (!validateSetupStep()) return;
      if (state.setupStep < SETUP_LAST_STEP) {
        if (state.setupStep === 1) {
          state.settings.name = $("setup-name")?.value.trim() || "";
          state.settings.currency = $("setup-currency")?.value || "INR";
        }
        if (state.setupStep === 2) {
          syncSettingsMobile($("setup-mobile")?.value || "");
          const pin = $("setup-pin")?.value || "";
          if (pin) {
            state.settings.pinHash = await hashPin(pin, $("setup-mobile")?.value || "");
            if ($("setup-pin")) $("setup-pin").value = "";
            if ($("setup-pin-confirm")) $("setup-pin-confirm").value = "";
          }
        }
        if (state.setupStep === 3) {
          state.settings.monthlyIncome = parseAmount($("setup-income")?.value) || 0;
          state.settings.savingsGoal = parseAmount($("setup-savings")?.value) || 0;
        }
        if (state.setupStep === 4) {
          state.accounts = readAccountFields("setup-accounts");
          state.openingBalances = readOpeningBalances("setup-accounts");
        }
        state.setupStep += 1;
        if (state.setupStep === SETUP_LAST_STEP) {
          if (!state.setupBudgetsDraft) {
            state.setupBudgetsDraft = defaultBudgetsFor($("setup-currency")?.value || state.settings.currency);
          }
          renderBudgetFields("setup-budgets", state.setupBudgetsDraft);
        }
        updateSetupUI();
      } else {
        state.budgets = readBudgets("setup-budgets");
        await finishSetup();
      }
    });

    on("btn-add-account-field", "click", () => {
      const current = snapshotAccountRows("setup-accounts");
      current.push({ name: "", opening: "" });
      renderAccountFields("setup-accounts", current);
    });

    on("setup-accounts", "click", (e) => {
      if (!e.target.matches("[data-remove-account]")) return;
      const current = snapshotAccountRows("setup-accounts");
      const row = e.target.closest(".account-row");
      const inputs = [...$("setup-accounts").querySelectorAll(".account-row")];
      const idx = inputs.indexOf(row);
      if (idx >= 0 && current.length > 1) {
        current.splice(idx, 1);
        renderAccountFields("setup-accounts", current);
      }
    });

    document.querySelectorAll(".main-tabs .tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        if (state.setupComplete && !isSessionUnlocked() && tab.dataset.view !== "demo") {
          showLogin();
          return;
        }
        if (!state.setupComplete && tab.dataset.view !== "demo") {
          if (confirm("Finish the short setup first? It takes about a minute.")) {
            startSetup();
            return;
          }
        }
        setView(tab.dataset.view);
      });
    });

    on("btn-exit-demo", "click", () => {
      if (!state.setupComplete) {
        showScreen("welcome");
        return;
      }
      if (!isSessionUnlocked()) {
        showLogin();
        return;
      }
      setView("track");
    });

    on("btn-demo-to-setup", "click", startSetup);
    $("btn-goto-demo-from-profile")?.addEventListener("click", () => setView("demo"));
    on("btn-goto-track", "click", () => setView("track"));
    $("btn-jump-insights")?.addEventListener("click", () => setView("results"));

    fillCategorySelect();
    $("q-date").value = todayISO();

    document.querySelectorAll('input[name="q-type"], input[name="e-type"]').forEach((r) => {
      r.addEventListener("change", syncTransferFields);
    });
    $("b-type")?.addEventListener("change", syncTransferFields);

    on("q-merchant", "change", () => {
      const type = selectedType("q-type");
      $("q-category").value = guessCategory($("q-merchant").value, type);
    });

    on("quick-form", "submit", (e) => {
      e.preventDefault();
      if (state.demoMode) {
        alert("Exit demo first — demo cannot save into your real data.");
        return;
      }
      const type = selectedType("q-type");
      let category = $("q-category").value;
      if (type === "income") category = "Income";
      if (type === "transfer") category = "Transfers";
      const account = $("q-account").value;
      const transferTo = type === "transfer" ? $("q-transfer-to")?.value : "";
      if (type === "transfer" && (!transferTo || transferTo === account)) {
        alert("Pick a different account to send money to.");
        return;
      }
      const payload = {
        id: uid(),
        date: $("q-date").value,
        merchant: $("q-merchant").value.trim() || (type === "transfer" ? `To ${transferTo}` : ""),
        amount: parseAmount($("q-amount").value),
        type,
        category,
        account,
        transferTo: transferTo || "",
        note: $("q-note").value.trim(),
      };
      payload.fingerprint = txFingerprint(payload);
      if (!payload.merchant || !payload.amount || !payload.date) {
        alert("Please fill date, where/who, and amount.");
        return;
      }
      state.transactions.push(payload);
      if (!state.accounts.includes(account)) state.accounts.push(account);
      save();
      $("quick-form").reset();
      document.querySelector('input[name="q-type"][value="expense"]').checked = true;
      $("q-date").value = todayISO();
      fillAccountSelect();
      syncTransferFields();
      $("q-account").value = account;
      $("form-status").textContent = "Saved on this device. Add another, or tap See insights.";
      renderTrack();
    });

    on("track-tx-body", "click", handleTableClick);
    on("results-tx-body", "click", handleTableClick);

    on("select-all", "change", (e) => {
      pageSlice(visibleTrackTxs(), state.trackPage).slice.forEach((t) => {
        if (e.target.checked) state.selected.add(t.id);
        else state.selected.delete(t.id);
      });
      renderTrack();
    });

    on("results-select-all", "change", (e) => {
      if (!guardLive()) {
        e.target.checked = false;
        return;
      }
      pageSlice(filtered(), state.resultsPage).slice.forEach((t) => {
        if (e.target.checked) state.selected.add(t.id);
        else state.selected.delete(t.id);
      });
      renderAllResults();
    });

    on("track-search", "input", () => {
      state.trackSearch = $("track-search").value;
      state.trackPage = 0;
      renderTrack();
    });

    $("track-prev")?.addEventListener("click", () => {
      state.trackPage = Math.max(0, state.trackPage - 1);
      renderTrack();
    });
    $("track-next")?.addEventListener("click", () => {
      state.trackPage += 1;
      renderTrack();
    });
    $("results-prev")?.addEventListener("click", () => {
      state.resultsPage = Math.max(0, state.resultsPage - 1);
      renderAllResults();
    });
    $("results-next")?.addEventListener("click", () => {
      state.resultsPage += 1;
      renderAllResults();
    });

    const clearTicks = () => {
      state.selected.clear();
      renderTrack();
      if (!$("view-results").hidden) renderAllResults();
    };

    on("btn-bulk-clear", "click", clearTicks);
    on("btn-results-bulk-clear", "click", clearTicks);
    on("btn-bulk-edit", "click", openBulkEdit);
    on("btn-results-bulk-edit", "click", openBulkEdit);
    on("btn-bulk-delete", "click", () => deleteIds(selectedList().map((t) => t.id)));
    on("btn-results-bulk-delete", "click", () => deleteIds(selectedList().map((t) => t.id)));

    on("btn-edit-cancel", "click", () => $("edit-dialog").close());
    on("btn-bulk-edit-cancel", "click", () => $("bulk-edit-dialog").close());

    on("edit-form", "submit", (e) => {
      e.preventDefault();
      if (!guardLive()) return;
      const id = $("e-id").value;
      const tx = state.transactions.find((t) => t.id === id);
      if (!tx) return;
      const type = selectedType("e-type");
      tx.date = $("e-date").value;
      tx.merchant = $("e-merchant").value.trim();
      tx.amount = parseAmount($("e-amount").value);
      tx.type = type;
      tx.category = type === "income" ? "Income" : type === "transfer" ? "Transfers" : $("e-category").value;
      tx.account = $("e-account").value;
      tx.transferTo = type === "transfer" ? $("e-transfer-to")?.value || "" : "";
      tx.note = $("e-note").value.trim();
      tx.fingerprint = txFingerprint(tx);
      if (type === "transfer" && (!tx.transferTo || tx.transferTo === tx.account)) {
        alert("Pick a different account to send money to.");
        return;
      }
      if (!state.accounts.includes(tx.account)) state.accounts.push(tx.account);
      save();
      $("edit-dialog").close();
      $("form-status").textContent = "Transaction updated.";
      renderTrack();
      if (!$("view-results").hidden) renderAllResults();
    });

    on("bulk-edit-form", "submit", (e) => {
      e.preventDefault();
      if (!guardLive()) return;
      const list = selectedList();
      if (!list.length) return;
      const date = $("b-date").value;
      const type = $("b-type").value;
      const category = $("b-category").value;
      const account = $("b-account").value;
      const note = $("b-note").value;
      const applyNote = $("b-note-apply").checked;
      const transferTo = $("b-transfer-to")?.value;
      if (!date && !type && !category && !account && !applyNote && !(type === "transfer" && transferTo)) {
        alert("Fill at least one field to change.");
        return;
      }
      for (const tx of list) {
        if (date) tx.date = date;
        if (type) {
          tx.type = type;
          if (type === "income") tx.category = "Income";
          if (type === "transfer") tx.category = "Transfers";
        }
        if (category) tx.category = category;
        if (account) {
          tx.account = account;
          if (!state.accounts.includes(account)) state.accounts.push(account);
        }
        if (type === "transfer" && transferTo) tx.transferTo = transferTo;
        if (applyNote) tx.note = note.trim();
        tx.fingerprint = txFingerprint(tx);
      }
      save();
      $("bulk-edit-dialog").close();
      $("form-status").textContent = `Updated ${list.length} payment${list.length === 1 ? "" : "s"}.`;
      renderTrack();
      if (!$("view-results").hidden) renderAllResults();
    });

    document.querySelectorAll(".seg").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".seg").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.period = btn.dataset.period;
        state.resultsPage = 0;
        renderAllResults();
      });
    });

    $("anchor-date").value = state.anchor;
    on("anchor-date", "change", () => {
      state.anchor = $("anchor-date").value || todayISO();
      renderAllResults();
    });
    on("btn-prev", "click", () => {
      shiftAnchor(-1);
      renderAllResults();
    });
    on("btn-next", "click", () => {
      shiftAnchor(1);
      renderAllResults();
    });
    on("btn-today", "click", () => {
      state.anchor = todayISO();
      $("anchor-date").value = state.anchor;
      renderAllResults();
    });
    on("account-filter", "change", () => {
      state.account = $("account-filter").value;
      state.resultsPage = 0;
      renderAllResults();
    });
    on("search", "input", () => {
      state.search = $("search").value;
      state.resultsPage = 0;
      renderAllResults();
    });
    on("btn-print", "click", () => window.print());

    on("csv-input", "change", async () => {
      const file = $("csv-input").files?.[0];
      $("csv-input").value = "";
      if (!file) return;
      try {
        await openCsvDialog(await file.text());
      } catch (err) {
        alert(err.message || "Import failed");
      }
    });
    ["csv-col-date", "csv-col-description", "csv-col-amount", "csv-col-type", "csv-col-debit", "csv-col-credit", "csv-col-account", "csv-col-category", "csv-day-first", "csv-skip-dupes"].forEach((id) => {
      $(id)?.addEventListener("change", refreshCsvPreview);
    });
    $("btn-csv-cancel")?.addEventListener("click", () => {
      pendingCsvText = "";
      $("csv-dialog").close();
    });
    $("btn-csv-confirm")?.addEventListener("click", () => {
      const preview = refreshCsvPreview();
      if (!preview?.unique?.length) {
        alert("Nothing new to import with this mapping.");
        return;
      }
      for (const row of preview.unique) {
        if (!state.accounts.includes(row.account)) state.accounts.push(row.account);
      }
      state.transactions = state.transactions.concat(preview.unique);
      save();
      pendingCsvText = "";
      $("csv-dialog").close();
      renderTrack();
      $("form-status").textContent = `Imported ${preview.unique.length} rows${preview.dupes ? ` (${preview.dupes} duplicates skipped)` : ""}.`;
      showToast(`Imported ${preview.unique.length} payments`);
    });

    on("btn-export", "click", () => {
      if (state.demoMode) {
        alert("Exit demo first — demo data is not your real list.");
        return;
      }
      $("export-dialog").showModal();
    });
    on("btn-export-close", "click", () => $("export-dialog").close());
    on("btn-save-local", "click", () => {
      saveToBrowser();
      $("save-dialog").showModal();
    });
    on("btn-save-dialog-close", "click", () => $("save-dialog").close());
    on("btn-save-json-file", "click", () => saveToFile("json"));
    on("btn-save-csv-file", "click", () => saveToFile("csv"));
    on("btn-save-file", "click", () => saveToFile("json"));
    on("btn-export-csv", "click", () => {
      if (state.demoMode) {
        alert("Exit demo first — demo data is not your real list.");
        return;
      }
      download(`niva-${state.anchor}.csv`, toCsv(filtered()), "text/csv");
      $("export-dialog").close();
    });
    on("btn-export-all-csv", "click", () => {
      saveToFile("csv");
      $("export-dialog").close();
    });
    on("btn-export-json", "click", () => {
      saveToFile("json");
      $("export-dialog").close();
    });

    on("btn-edit-add-account", "click", () => {
      const current = snapshotAccountRows("edit-accounts");
      current.push({ name: "", opening: "" });
      renderAccountFields("edit-accounts", current);
    });
    on("edit-accounts", "click", (e) => {
      if (!e.target.matches("[data-remove-account]")) return;
      const rows = [...$("edit-accounts").querySelectorAll(".account-row")];
      const vals = snapshotAccountRows("edit-accounts");
      const idx = rows.indexOf(e.target.closest(".account-row"));
      if (idx >= 0 && vals.length > 1) {
        vals.splice(idx, 1);
        renderAccountFields("edit-accounts", vals);
      }
    });

    on("photo-input", "change", async () => {
      const file = $("photo-input").files?.[0];
      $("photo-input").value = "";
      if (!file) return;
      try {
        state.settings.photo = await resizePhoto(file);
        applyPhoto(state.settings.photo);
        save();
        $("edit-status").textContent = "Photo saved on this device.";
        personalizeChrome();
      } catch (err) {
        alert(err.message || "Could not upload photo.");
      }
    });

    on("btn-remove-photo", "click", () => {
      state.settings.photo = "";
      applyPhoto("");
      save();
      $("edit-status").textContent = "Photo removed.";
      personalizeChrome();
    });

    $("setup-currency")?.addEventListener("change", () => {
      if (state.setupStep === SETUP_LAST_STEP) {
        state.setupBudgetsDraft = defaultBudgetsFor($("setup-currency").value);
        renderBudgetFields("setup-budgets", state.setupBudgetsDraft);
      }
    });

    $("btn-change-pin")?.addEventListener("click", async () => {
      const status = $("pin-status");
      const current = $("pin-current")?.value || "";
      const a = $("pin-new")?.value || "";
      const b = $("pin-confirm")?.value || "";
      if (!state.settings.pinHash) {
        if (status) status.textContent = "No PIN is set on this profile.";
        return;
      }
      if (!(await verifyPin(current, storedMobile()))) {
        if (status) status.textContent = "Current PIN is wrong.";
        return;
      }
      if (!/^\d{4,8}$/.test(a)) {
        if (status) status.textContent = "Use 4 to 8 digits.";
        return;
      }
      if (a !== b) {
        if (status) status.textContent = "New PINs do not match.";
        return;
      }
      state.settings.pinHash = await hashPin(a, storedMobile());
      if ($("pin-current")) $("pin-current").value = "";
      if ($("pin-new")) $("pin-new").value = "";
      if ($("pin-confirm")) $("pin-confirm").value = "";
      save();
      if (status) status.textContent = "PIN updated on this device.";
    });

    $("btn-logout")?.addEventListener("click", (e) => {
      e.preventDefault();
      logoutSession();
    });

    on("btn-save-details", "click", () => {
      const accounts = readAccountFields("edit-accounts");
      if (!accounts.length) {
        alert("Keep at least one account.");
        return;
      }
      const phoneRaw = $("edit-phone")?.value.trim() || "";
      if (!isValidMobile(phoneRaw)) {
        alert("Keep a valid 10-digit mobile number (or +91) — it is used to log in.");
        return;
      }
      syncSettingsMobile(phoneRaw);
      state.settings = {
        ...state.settings,
        name: $("edit-name")?.value.trim() || "",
        phone: state.settings.phone,
        mobile: state.settings.mobile,
        email: $("edit-email")?.value.trim() || "",
        city: $("edit-city")?.value.trim() || "",
        occupation: $("edit-occupation")?.value.trim() || "",
        dob: $("edit-dob")?.value || "",
        gender: $("edit-gender")?.value || "",
        notes: $("edit-notes")?.value.trim() || "",
        currency: $("edit-currency")?.value || "INR",
        monthlyIncome: parseAmount($("edit-income")?.value) || 0,
        savingsGoal: parseAmount($("edit-savings")?.value) || 0,
      };
      state.accounts = accounts;
      state.openingBalances = readOpeningBalances("edit-accounts");
      state.budgets = readBudgets("edit-budgets");
      state.setupComplete = true;
      save();
      if ($("edit-status")) $("edit-status").textContent = "Profile saved.";
      syncAccountSecurityUI();
      personalizeChrome();
    });

    on("btn-reset-all", "click", async () => {
      if (!confirm("Clear all data and return to welcome screen?")) return;
      await wipeAllData();
      showScreen("welcome");
    });

    on("backup-input", "change", async () => {
      const file = $("backup-input").files?.[0];
      if ($("backup-input")) $("backup-input").value = "";
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.transactions)) throw new Error("Invalid backup.");
        if (!confirm(`Restore ${data.transactions.length} payments?`)) return;
        applyLoaded({ ...data, setupComplete: true });
        save();
        setSessionUnlocked(false);
        showLogin("Backup restored. Log in with that profile’s mobile and PIN.");
      } catch (err) {
        alert(err.message || "Restore failed");
      }
    });
    } catch (err) {
      console.error("bindApp failed", err);
    }
  }

  window.startSetup = startSetup;
  window.openDemo = openDemo;
  window.submitLogin = submitLogin;
  window.showLogin = showLogin;
  window.createNewProfile = createNewProfile;
  window.logoutSession = logoutSession;

  try {
    loadFromLocalStorage();
    updateSaveStatus();
    bind();
    boot();
  } catch (err) {
    console.error(err);
    showScreen("welcome");
  }

  loadFromIdb().then((updated) => {
    if (!updated) return;
    updateSaveStatus();
    if (state.demoMode) return;
    if (state.setupComplete && !isSessionUnlocked()) {
      const appOpen = $("screen-app") && !$("screen-app").hidden;
      const welcomeOpen = $("screen-welcome") && !$("screen-welcome").hidden;
      if (appOpen || welcomeOpen) showLogin();
      return;
    }
    if (state.setupComplete && $("screen-app") && !$("screen-app").hidden) {
      personalizeChrome();
      if (state.view === "results") renderAllResults();
      else renderTrack();
    }
  });

  if (location.protocol !== "file:" && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
