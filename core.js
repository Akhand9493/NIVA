/* Niva — shared date, money, and CSV helpers (also used by tests). */
(function (root) {
  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function toLocalISO(d) {
    const dt = d instanceof Date ? d : new Date();
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  }

  function fromLocalISO(iso) {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return new Date();
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  }

  function shiftLocalISO(iso, period, delta) {
    const d = fromLocalISO(iso);
    if (period === "day") d.setDate(d.getDate() + delta);
    else if (period === "year") d.setFullYear(d.getFullYear() + delta);
    else d.setMonth(d.getMonth() + delta);
    return toLocalISO(d);
  }

  function roundMoney(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return Math.round(x * 100) / 100;
  }

  function parseAmount(v) {
    if (typeof v === "number") return roundMoney(v);
    const cleaned = String(v ?? "").replace(/[^0-9.-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? roundMoney(n) : 0;
  }

  function fingerprint(row) {
    const parts = [
      row.date || "",
      row.type || "",
      roundMoney(row.amount).toFixed(2),
      String(row.merchant || "")
        .trim()
        .toLowerCase(),
      String(row.account || "")
        .trim()
        .toLowerCase(),
    ];
    if (row.type === "transfer") {
      parts.push(
        String(row.transferTo || "")
          .trim()
          .toLowerCase()
      );
    }
    return parts.join("|");
  }

  function splitCsvLine(line) {
    const out = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = !q;
      } else if ((ch === "," || ch === "\t" || ch === ";") && !q) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim().replace(/^"|"$/g, ""));
  }

  function normalizeDate(raw, dayFirst) {
    const s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) {
      let [, a, b, c] = m;
      if (c.length === 2) c = `20${c}`;
      const preferDay = dayFirst !== false;
      let day;
      let month;
      if (Number(a) > 12) {
        day = a;
        month = b;
      } else if (Number(b) > 12) {
        month = a;
        day = b;
      } else if (preferDay) {
        day = a;
        month = b;
      } else {
        month = a;
        day = b;
      }
      return `${c.padStart(4, "0")}-${pad(month)}-${pad(day)}`;
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : toLocalISO(d);
  }

  const HEADER_ALIASES = {
    date: [
      "date",
      "txn date",
      "txn. date",
      "transaction date",
      "value date",
      "value dt",
      "posted date",
      "tran date",
      "transactiondate",
    ],
    description: [
      "description",
      "narration",
      "particulars",
      "merchant",
      "details",
      "remarks",
      "transaction remarks",
      "narration/description",
    ],
    amount: ["amount", "txn amount", "transaction amount", "amt"],
    debit: [
      "debit",
      "withdrawal",
      "debit amount",
      "withdrawals",
      "withdrawal amt",
      "withdrawal amt.",
      "dr",
      "debit amt",
    ],
    credit: ["credit", "deposit", "credit amount", "deposits", "deposit amt", "deposit amt.", "cr", "credit amt"],
    type: ["type", "dr/cr", "transaction type", "cr/dr"],
    account: ["account", "account name", "account number", "a/c no", "account no"],
    category: ["category"],
    balance: ["balance", "closing balance", "running balance"],
  };

  function findHeader(headers, aliases) {
    for (const a of aliases) {
      const i = headers.indexOf(a);
      if (i >= 0) return i;
    }
    return -1;
  }

  function detectCsvMapping(headerLine) {
    const headers = splitCsvLine(headerLine).map((h) => h.trim().toLowerCase());
    const idx = {};
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      idx[key] = findHeader(headers, aliases);
    }
    return { headers, idx };
  }

  function parseCsvRows(text, options) {
    const dayFirst = options?.dayFirst !== false;
    const defaultAccount = options?.defaultAccount || "Imported bank";
    const guessCategory = options?.guessCategory || (() => "Other");
    const categories = options?.categories || [];
    const uid = options?.uid || (() => `t_${Date.now()}`);
    const mapping = options?.mapping;

    const lines = text
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) throw new Error("CSV needs a header and rows.");
    const detected = detectCsvMapping(lines[0]);
    const idx = mapping || detected.idx;
    if (idx.date < 0) throw new Error("Could not find a Date column.");

    const imported = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i]);
      const date = normalizeDate(cols[idx.date] || "", dayFirst);
      if (!date) continue;
      const merchant = (idx.description >= 0 ? cols[idx.description] : "Imported")?.trim() || "Imported";
      let amount = 0;
      let type = "expense";
      if (idx.debit >= 0 || idx.credit >= 0) {
        const debit = parseAmount(cols[idx.debit] || 0);
        const credit = parseAmount(cols[idx.credit] || 0);
        if (credit > 0 && debit <= 0) {
          amount = credit;
          type = "income";
        } else {
          amount = debit || Math.abs(parseAmount(cols[idx.amount] || 0));
          type = "expense";
        }
      } else {
        const raw = parseAmount(cols[idx.amount] || 0);
        const typeRaw = (idx.type >= 0 ? cols[idx.type] : "").toLowerCase();
        amount = Math.abs(raw);
        type = /credit|cr|income|deposit/.test(typeRaw) ? "income" : "expense";
        if (raw < 0) type = "expense";
      }
      if (!amount) continue;
      const account = (idx.account >= 0 && cols[idx.account] ? cols[idx.account] : defaultAccount).trim();
      let category =
        idx.category >= 0 && cols[idx.category] ? cols[idx.category].trim() : guessCategory(merchant, type);
      if (categories.length && !categories.includes(category)) category = guessCategory(merchant, type);
      imported.push({
        id: uid(),
        date,
        merchant,
        amount,
        type,
        category,
        account,
        note: "CSV import",
        fingerprint: fingerprint({ date, type, amount, merchant, account }),
      });
    }
    if (!imported.length) throw new Error("No valid rows found.");
    return { rows: imported, headers: detected.headers, idx: detected.idx };
  }

  function defaultBudgets(currency) {
    const inr = {
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
    const scale = { INR: 1, USD: 0.012, EUR: 0.011, GBP: 0.0095 }[currency] || 1;
    if (scale === 1) return { ...inr };
    const out = {};
    for (const [k, v] of Object.entries(inr)) out[k] = Math.round(v * scale);
    return out;
  }

  function applyLedger(accounts, openingBalances, transactions) {
    const bal = {};
    for (const name of accounts) bal[name] = roundMoney(openingBalances[name] || 0);
    for (const t of transactions) {
      if (!bal[t.account] && bal[t.account] !== 0) bal[t.account] = roundMoney(openingBalances[t.account] || 0);
      if (t.type === "income") bal[t.account] = roundMoney(bal[t.account] + t.amount);
      else if (t.type === "transfer") {
        bal[t.account] = roundMoney(bal[t.account] - t.amount);
        const dest = t.transferTo;
        if (dest) {
          if (!bal[dest] && bal[dest] !== 0) bal[dest] = roundMoney(openingBalances[dest] || 0);
          bal[dest] = roundMoney(bal[dest] + t.amount);
        }
      } else bal[t.account] = roundMoney(bal[t.account] - t.amount);
    }
    return bal;
  }

  root.PMCore = {
    toLocalISO,
    fromLocalISO,
    shiftLocalISO,
    roundMoney,
    parseAmount,
    fingerprint,
    splitCsvLine,
    normalizeDate,
    detectCsvMapping,
    parseCsvRows,
    defaultBudgets,
    applyLedger,
    HEADER_ALIASES,
  };
})(typeof window !== "undefined" ? window : globalThis);
