import { fileURLToPath } from "url";
import { readFileSync, writeFileSync } from "fs";
import { basename, dirname, join } from "path";

// ─── Constants ───────────────────────────────────────────────

const VIES_URL =
  "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number";

const HMRC_BASE =
  "https://www.tax.service.gov.uk/check-vat-number";

const RATE_LIMIT_MS = 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sanitize = (s) => s.replace(/[\s\-._,/\\]+/g, "");

// ─── Result constructors ────────────────────────────────────

const cross = (v) => (v >= 10 ? Math.floor(v / 10) + (v % 10) : v);

function formatFail(error) {
  return { formatValid: false, valid: false, error };
}

function checksumPass() {
  return { formatValid: true, valid: true };
}

function checksumFail() {
  return { formatValid: true, valid: false };
}

function formatOnlyPass() {
  return { formatValid: true, valid: true, formatOnly: true };
}

// ─── Checksum validators per country ────────────────────────

const checksumValidators = {
  AT(num) {
    const n = num.startsWith("U") ? num.slice(1) : num;
    if (!/^\d{8}$/.test(n)) return formatFail("Must be U + 8 digits");
    const d = n.split("").map(Number);
    const s =
      d[0] + cross(d[1] * 2) + d[2] + cross(d[3] * 2) +
      d[4] + cross(d[5] * 2) + d[6];
    return (96 - s) % 10 === d[7] ? checksumPass() : checksumFail();
  },

  BE(num) {
    if (!/^[01]\d{9}$/.test(num))
      return formatFail("Must be 10 digits starting with 0 or 1");
    const first8 = parseInt(num.slice(0, 8));
    const last2 = parseInt(num.slice(8));
    return 97 - (first8 % 97) === last2 ? checksumPass() : checksumFail();
  },

  BG(num) {
    if (!/^\d{9,10}$/.test(num))
      return formatFail("Must be 9 or 10 digits");
    const d = num.split("").map(Number);

    if (d.length === 9) {
      let sum = [1, 2, 3, 4, 5, 6, 7, 8].reduce((s, w, i) => s + d[i] * w, 0);
      let r = sum % 11;
      if (r === 10) {
        sum = [3, 4, 5, 6, 7, 8, 9, 10].reduce((s, w, i) => s + d[i] * w, 0);
        r = sum % 11;
        if (r === 10) r = 0;
      }
      return r === d[8] ? checksumPass() : checksumFail();
    }

    const personW = [2, 4, 8, 5, 10, 9, 7, 3, 6];
    const month = d[2] * 10 + d[3];
    const day = d[4] * 10 + d[5];
    const validMonth =
      (month >= 1 && month <= 12) ||
      (month >= 21 && month <= 32) ||
      (month >= 41 && month <= 52);
    const validDate = validMonth && day >= 1 && day <= 31;
    const isPerson =
      validDate &&
      personW.reduce((s, w, i) => s + d[i] * w, 0) % 11 % 10 === d[9];

    const foreignW = [21, 19, 17, 13, 11, 9, 7, 3, 1];
    const isForeigner =
      foreignW.reduce((s, w, i) => s + d[i] * w, 0) % 10 === d[9];

    const miscW = [4, 3, 2, 7, 6, 5, 4, 3, 2];
    const miscR = 11 - miscW.reduce((s, w, i) => s + d[i] * w, 0) % 11;
    const isMisc = (miscR === 11 ? 0 : miscR) === d[9] && miscR !== 10;

    return isPerson || isForeigner || isMisc
      ? checksumPass() : checksumFail();
  },

  CY(num) {
    if (!/^[0-59]\d{7}[A-Z]$/.test(num))
      return formatFail("Must be 8 digits (first 0-5 or 9) + 1 letter");
    if (num.startsWith("12")) return checksumFail();

    const lookup = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21];
    const digits = num.slice(0, 8);
    let sum = 0;
    for (let i = 0; i < 8; i++) {
      sum += i % 2 === 0 ? lookup[Number(digits[i])] : Number(digits[i]);
    }
    const expected = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[sum % 26];
    return expected === num[8] ? checksumPass() : checksumFail();
  },

  CZ(num) {
    if (!/^\d{8,10}$/.test(num))
      return formatFail("Must be 8-10 digits");
    const d = num.split("").map(Number);

    if (num.length === 8) {
      if (d[0] === 9) return checksumFail();
      const a1 = [8, 7, 6, 5, 4, 3, 2].reduce((s, w, i) => s + d[i] * w, 0);
      const a2 = a1 % 11 === 0 ? a1 + 11 : Math.ceil(a1 / 11) * 11;
      return (a2 - a1) % 10 === d[7] ? checksumPass() : checksumFail();
    }

    if (num.length === 9 && d[0] === 6) {
      const inner = num.slice(1, 8).split("").map(Number);
      const a1 = [8, 7, 6, 5, 4, 3, 2].reduce((s, w, i) => s + inner[i] * w, 0);
      const a2 = a1 % 11 === 0 ? a1 + 11 : Math.ceil(a1 / 11) * 11;
      const expected = [0, 8, 7, 6, 5, 4, 3, 2, 1, 0, 9, 8][a2 - a1];
      return expected === d[8] ? checksumPass() : checksumFail();
    }

    if (num.length === 10) {
      const r1 = parseInt(num) % 11 === 0;
      const pairSum =
        d[0] * 10 + d[1] + d[2] * 10 + d[3] + d[4] * 10 + d[5] +
        d[6] * 10 + d[7] + d[8] * 10 + d[9];
      const r2 = pairSum % 11 === 0;
      return r1 && r2 ? checksumPass() : checksumFail();
    }

    return formatOnlyPass();
  },

  DE(num) {
    if (!/^\d{9}$/.test(num)) return formatFail("Must be 9 digits");
    const d = num.split("").map(Number);
    if (d[0] === 0) return checksumFail();
    let product = 10;
    for (let i = 0; i < 8; i++) {
      let sum = (d[i] + product) % 10;
      if (sum === 0) sum = 10;
      product = (sum * 2) % 11;
    }
    const check = (11 - product) % 10;
    return check === d[8] ? checksumPass() : checksumFail();
  },

  DK(num) {
    if (!/^\d{8}$/.test(num)) return formatFail("Must be 8 digits");
    const d = num.split("").map(Number);
    if (d[0] === 0) return checksumFail();
    const sum = [2, 7, 6, 5, 4, 3, 2, 1].reduce((s, w, i) => s + d[i] * w, 0);
    return sum % 11 === 0 ? checksumPass() : checksumFail();
  },

  EE(num) {
    if (!/^10\d{7}$/.test(num))
      return formatFail("Must be 9 digits starting with 10");
    const d = num.split("").map(Number);
    const sum = [3, 7, 1, 3, 7, 1, 3, 7].reduce((s, w, i) => s + d[i] * w, 0);
    let check = 10 - (sum % 10);
    if (check === 10) check = 0;
    return check === d[8] ? checksumPass() : checksumFail();
  },

  EL(num) {
    if (!/^\d{9}$/.test(num)) return formatFail("Must be 9 digits");
    const d = num.split("").map(Number);
    const sum =
      [256, 128, 64, 32, 16, 8, 4, 2].reduce((s, w, i) => s + d[i] * w, 0);
    return (sum % 11) % 10 === d[8] ? checksumPass() : checksumFail();
  },

  ES(num) {
    if (!/^[A-Z0-9]\d{7}[A-Z0-9]$/.test(num))
      return formatFail("Must be 1 letter/digit + 7 digits + 1 check char");

    const first = num[0];
    const last = num[8];
    const mid = num.slice(1, 8);
    const dniLetters = "TRWAGMYFPDXBNJZSQVHLCKE";

    if (/^\d$/.test(first)) {
      const n = parseInt(first + mid);
      return last === dniLetters[n % 23] ? checksumPass() : checksumFail();
    }

    if ("XYZ".includes(first)) {
      const prefix = { X: "0", Y: "1", Z: "2" };
      const n = parseInt(prefix[first] + mid);
      return last === dniLetters[n % 23] ? checksumPass() : checksumFail();
    }

    if (/^[A-HJ-NP-SUVW]$/.test(first)) {
      const d = mid.split("").map(Number);
      let sumOdd = 0;
      let sumEven = 0;
      for (let i = 0; i < 7; i++) {
        if (i % 2 === 0) {
          sumOdd += cross(d[i] * 2);
        } else {
          sumEven += d[i];
        }
      }
      let check = 10 - ((sumOdd + sumEven) % 10);
      if (check === 10) check = 0;
      const checkLetter = "JABCDEFGHI"[check];
      return last === String(check) || last === checkLetter
        ? checksumPass() : checksumFail();
    }

    return formatOnlyPass();
  },

  FI(num) {
    if (!/^\d{8}$/.test(num)) return formatFail("Must be 8 digits");
    const d = num.split("").map(Number);
    const sum = [7, 9, 10, 5, 8, 4, 2].reduce((s, w, i) => s + d[i] * w, 0);
    const r = sum % 11;
    if (r === 1) return checksumFail();
    const check = r === 0 ? 0 : 11 - r;
    return check === d[7] ? checksumPass() : checksumFail();
  },

  FR(num) {
    if (!/^[0-9A-HJ-NP-Z]{2}\d{9}$/.test(num))
      return formatFail("Must be 2 check chars + 9 SIREN digits");
    const key = num.slice(0, 2);
    const siren = num.slice(2);
    if (/^\d{2}$/.test(key)) {
      const k = parseInt(key);
      const s = parseInt(siren);
      const expected = (s * 100 + 12) % 97;
      return k === expected ? checksumPass() : checksumFail();
    }
    return formatOnlyPass();
  },

  HR(num) {
    if (!/^\d{11}$/.test(num)) return formatFail("Must be 11 digits");
    const d = num.split("").map(Number);
    let product = 10;
    for (let i = 0; i < 10; i++) {
      let sum = (d[i] + product) % 10;
      if (sum === 0) sum = 10;
      product = (sum * 2) % 11;
    }
    return (product + d[10]) % 10 === 1 ? checksumPass() : checksumFail();
  },

  HU(num) {
    if (!/^\d{8}$/.test(num)) return formatFail("Must be 8 digits");
    const d = num.split("").map(Number);
    const r = [9, 7, 3, 1, 9, 7, 3].reduce((s, w, i) => s + d[i] * w, 0);
    const check = r % 10 === 0 ? 0 : 10 - (r % 10);
    return check === d[7] ? checksumPass() : checksumFail();
  },

  IE(num) {
    const checkChars = "WABCDEFGHIJKLMNOPQRSTUV";
    const secondLetterMap = "WABCDEFGHI";

    if (/^\d([A-Z+*])\d{5}[A-W]$/.test(num)) {
      const c1 = Number(num[0]);
      const mid = num.slice(2, 7).split("").map(Number);
      const r =
        (7 * mid[0] + 6 * mid[1] + 5 * mid[2] +
         4 * mid[3] + 3 * mid[4] + 2 * c1) % 23;
      return num[7] === checkChars[r] ? checksumPass() : checksumFail();
    }

    if (/^\d{7}[A-W]([A-IW])?$/.test(num)) {
      const d = num.slice(0, 7).split("").map(Number);
      const c9val = num[8] ? secondLetterMap.indexOf(num[8]) : 0;
      const r =
        (9 * c9val + 8 * d[0] + 7 * d[1] + 6 * d[2] +
         5 * d[3] + 4 * d[4] + 3 * d[5] + 2 * d[6]) % 23;
      return num[7] === checkChars[r] ? checksumPass() : checksumFail();
    }

    return formatFail("Must be 7 digits + 1-2 letters");
  },

  IT(num) {
    if (!/^\d{11}$/.test(num)) return formatFail("Must be 11 digits");
    const d = num.split("").map(Number);
    if (num.slice(0, 7) === "0000000") return checksumFail();
    const province = parseInt(num.slice(7, 10));
    if (province === 0 || (province > 201 && province !== 888 && province !== 999))
      return checksumFail();
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += i % 2 === 0 ? d[i] : cross(d[i] * 2);
    }
    return d[10] === (10 - (sum % 10)) % 10 ? checksumPass() : checksumFail();
  },

  LT(num) {
    if (!/^\d{9}$/.test(num) && !/^\d{12}$/.test(num))
      return formatFail("Must be 9 or 12 digits");
    if (num[num.length - 2] !== "1")
      return formatFail("Penultimate digit must be 1");

    const d = num.split("").map(Number);
    const n = d.length;
    const w1 = n === 9
      ? [1, 2, 3, 4, 5, 6, 7, 8]
      : [1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2];
    const w2 = n === 9
      ? [3, 4, 5, 6, 7, 8, 9, 1]
      : [3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4];

    const r1 = w1.reduce((s, w, i) => s + d[i] * w, 0) % 11;
    if (r1 % 10 !== 0) {
      return r1 === d[n - 1] ? checksumPass() : checksumFail();
    }
    const r2 = w2.reduce((s, w, i) => s + d[i] * w, 0) % 11;
    const check = r2 === 10 ? 0 : r2;
    return check === d[n - 1] ? checksumPass() : checksumFail();
  },

  LU(num) {
    if (!/^\d{8}$/.test(num)) return formatFail("Must be 8 digits");
    const first6 = parseInt(num.slice(0, 6));
    const last2 = parseInt(num.slice(6));
    return first6 % 89 === last2 ? checksumPass() : checksumFail();
  },

  LV(num) {
    if (!/^\d{11}$/.test(num)) return formatFail("Must be 11 digits");
    const d = num.split("").map(Number);

    if (d[0] > 3) {
      const weights = [9, 1, 4, 8, 3, 10, 2, 5, 7, 6];
      const r = 3 - weights.reduce((s, w, i) => s + d[i] * w, 0) % 11;
      if (r === -1) return checksumFail();
      const expected = r < -1 ? r + 11 : r;
      return d[10] === expected ? checksumPass() : checksumFail();
    }

    if (num.startsWith("32")) return formatOnlyPass();
    const day = parseInt(num.slice(0, 2));
    const month = parseInt(num.slice(2, 4));
    if (day > 31 || month > 12) return checksumFail();
    return formatOnlyPass();
  },

  MT(num) {
    if (!/^[1-9]\d{7}$/.test(num))
      return formatFail("Must be 8 digits, first non-zero");
    const d = num.split("").map(Number);
    const sum = [3, 4, 6, 7, 8, 9].reduce((s, w, i) => s + d[i] * w, 0);
    const check = 37 - (sum % 37);
    return check === d[6] * 10 + d[7] ? checksumPass() : checksumFail();
  },

  NL(num) {
    if (!/^\d{9}B\d{2}$/.test(num))
      return formatFail("Must be 9 digits + B + 2 digits (e.g. 123456789B01)");
    const rearranged = num + "NL";
    const numeric = rearranged.replace(
      /[A-Z]/g,
      (c) => (c.charCodeAt(0) - 55).toString(),
    );
    return BigInt(numeric) % 97n === 1n ? checksumPass() : checksumFail();
  },

  PL(num) {
    if (!/^\d{10}$/.test(num)) return formatFail("Must be 10 digits");
    const d = num.split("").map(Number);
    const sum = [6, 5, 7, 2, 3, 4, 5, 6, 7].reduce((s, w, i) => s + d[i] * w, 0);
    const r = sum % 11;
    return r !== 10 && r === d[9] ? checksumPass() : checksumFail();
  },

  PT(num) {
    if (!/^\d{9}$/.test(num)) return formatFail("Must be 9 digits");
    const d = num.split("").map(Number);
    if (d[0] === 0) return checksumFail();
    const sum = [9, 8, 7, 6, 5, 4, 3, 2].reduce((s, w, i) => s + d[i] * w, 0);
    const check = (11 - sum % 11) % 11 % 10;
    return check === d[8] ? checksumPass() : checksumFail();
  },

  RO(num) {
    if (!/^[1-9]\d{1,9}$/.test(num))
      return formatFail("Must be 2-10 digits, first non-zero");
    const idx = 10 - num.length;
    const weights = [7, 5, 3, 2, 1, 7, 5, 3, 2].slice(idx);
    const d = num.split("").map(Number);
    const sum = weights.reduce((s, w, i) => s + d[i] * w, 0);
    let check = (sum * 10) % 11;
    if (check === 10) check = 0;
    return check === d[d.length - 1] ? checksumPass() : checksumFail();
  },

  SE(num) {
    if (!/^\d{12}$/.test(num)) return formatFail("Must be 12 digits");
    if (num.slice(10) !== "01") return formatFail("Last 2 digits must be 01");
    const d = num.slice(0, 10).split("").map(Number);
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      const v = d[i] * (i % 2 === 0 ? 2 : 1);
      sum += v > 9 ? v - 9 : v;
    }
    return sum % 10 === 0 ? checksumPass() : checksumFail();
  },

  SI(num) {
    if (!/^[1-9]\d{7}$/.test(num))
      return formatFail("Must be 8 digits, first non-zero");
    const d = num.split("").map(Number);
    const r = 11 - [8, 7, 6, 5, 4, 3, 2].reduce((s, w, i) => s + d[i] * w, 0) % 11;
    if (r === 11) return checksumFail();
    return (r === 10 && d[7] === 0) || d[7] === r
      ? checksumPass() : checksumFail();
  },

  SK(num) {
    if (!/^[1-9]\d[2346-9]\d{7}$/.test(num))
      return formatFail("Must be 10 digits matching DIČ structure");
    return BigInt(num) % 11n === 0n ? checksumPass() : checksumFail();
  },

  XI(num) {
    return checksumValidators.GB(num);
  },

  GB(num) {
    if (/^GD\d{3}$/.test(num)) {
      return parseInt(num.slice(2)) < 500 ? checksumPass() : checksumFail();
    }
    if (/^HA\d{3}$/.test(num)) {
      return parseInt(num.slice(2)) >= 500 ? checksumPass() : checksumFail();
    }
    if (/^\d{12}$/.test(num)) {
      return checksumValidators.GB(num.slice(0, 9));
    }
    if (!/^\d{9}$/.test(num))
      return formatFail("Must be 9 or 12 digits, or GD/HA + 3 digits");

    const d = num.split("").map(Number);
    const no = parseInt(num.slice(0, 7));

    const invalidRange =
      no === 0 ||
      (no >= 100000 && no <= 999999) ||
      (no >= 9490001 && no <= 9700000) ||
      no >= 9990001;
    if (invalidRange) return checksumFail();

    const weighted =
      d[0] * 8 + d[1] * 7 + d[2] * 6 + d[3] * 5 +
      d[4] * 4 + d[5] * 3 + d[6] * 2;
    const checkDigits = d[7] * 10 + d[8];
    const check1 = (97 - (weighted % 97)) % 97;
    const check2 = (97 - ((weighted + 55) % 97)) % 97;
    const valid = checkDigits === check1 || (no > 1000000 && checkDigits === check2);
    return valid ? checksumPass() : checksumFail();
  },
};

// ─── Transient VIES error detection ─────────────────────────

const TRANSIENT_ERRORS = [
  "MS_MAX_CONCURRENT_REQ",
  "MS_UNAVAILABLE",
  "TIMEOUT",
  "SERVICE_UNAVAILABLE",
];

function isTransientError(result) {
  if (!result || !result.error) return false;
  return TRANSIENT_ERRORS.some((e) => result.error.includes(e));
}

// ─── Checksum router ────────────────────────────────────────

function runChecksum(cc, num) {
  const validate = checksumValidators[cc];
  if (!validate)
    return { formatValid: false, valid: false, error: `Unknown country code: ${cc}` };
  return validate(num);
}

// ─── VIES SOAP query (EU countries) ─────────────────────────

async function queryVIES(countryCode, vatNumber) {
  countryCode = sanitize(countryCode).toUpperCase();
  vatNumber = sanitize(vatNumber);
  await sleep(RATE_LIMIT_MS);

  try {
    const res = await fetch(VIES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countryCode, vatNumber }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { error: `VIES HTTP ${res.status}: ${text}` };
    }

    const data = await res.json();

    if (data.errorWrappers?.length > 0) {
      return { error: data.errorWrappers.map((e) => e.error).join("; ") };
    }

    const clean = (s) =>
      !s || s === "---" ? "N/A" : s.replace(/\n/g, ", ").replace(/,\s*$/, "").trim();

    return {
      registered: data.valid,
      vatNumber: `${countryCode}${vatNumber}`,
      name: clean(data.name),
      address: clean(data.address),
      country: countryCode,
    };
  } catch (err) {
    return { error: err.message };
  }
}

// ─── GOV.UK form query (GB/XI) ──────────────────────────────

function collectCookies(res, existing = "") {
  const raw = res.headers.getSetCookie?.() || [];
  const prev = existing ? existing.split("; ").filter(Boolean) : [];
  const map = new Map(prev.map((c) => [c.split("=")[0], c]));
  for (const h of raw) {
    const pair = h.split(";")[0];
    map.set(pair.split("=")[0], pair);
  }
  return [...map.values()].join("; ");
}

async function queryHMRC(vatNumber) {
  vatNumber = sanitize(vatNumber);
  await sleep(RATE_LIMIT_MS);

  try {
    const formUrl = `${HMRC_BASE}/enter-vat-details`;

    const getRes = await fetch(formUrl, { redirect: "follow" });
    if (!getRes.ok) throw new Error(`GET form failed: ${getRes.status}`);
    const html = await getRes.text();
    let cookies = collectCookies(getRes);

    const csrfMatch = html.match(/name="csrfToken"\s+value="([^"]+)"/);
    if (!csrfMatch) throw new Error("CSRF token not found on form page");

    await sleep(RATE_LIMIT_MS);

    const body = new URLSearchParams({
      csrfToken: csrfMatch[1],
      target: vatNumber,
    });
    const postRes = await fetch(formUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookies,
        Referer: formUrl,
      },
      body: body.toString(),
      redirect: "manual",
    });
    cookies = collectCookies(postRes, cookies);

    let resultHtml;
    if (postRes.status >= 300 && postRes.status < 400) {
      const location = postRes.headers.get("location");
      const resultUrl = location.startsWith("http")
        ? location
        : `${HMRC_BASE}${location.replace("/check-vat-number", "")}`;

      await sleep(300);
      const resultRes = await fetch(resultUrl, {
        headers: { Cookie: cookies },
        redirect: "follow",
      });
      cookies = collectCookies(resultRes, cookies);
      resultHtml = await resultRes.text();
    } else {
      resultHtml = await postRes.text();
    }

    if (!resultHtml.includes("govuk-panel--confirmation")) {
      return {
        registered: false,
        vatNumber: `GB${vatNumber}`,
        country: "GB",
        reason: "Does not match any UK VAT-registered business",
      };
    }

    let name = "N/A";
    const nameMatch = resultHtml.match(
      /Registered business name<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/i,
    );
    if (nameMatch)
      name = nameMatch[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();

    let address = "N/A";
    const addrMatch = resultHtml.match(
      /Registered business address<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/i,
    );
    if (addrMatch) {
      address = addrMatch[1]
        .replace(/<br\s*\/?>/gi, ",")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .replace(/\s*,\s*/g, ", ")
        .replace(/,\s*$/, "")
        .trim();
    }

    return {
      registered: true,
      vatNumber: `GB${vatNumber}`,
      name,
      address,
      country: "GB",
    };
  } catch (err) {
    return { error: err.message };
  }
}

// ─── Console output ─────────────────────────────────────────

function printLookupResult({ service, label, registered, vatNumber, name, address, country, reason }) {
  const heading = label ? `${service} Result (${label})` : `${service} Result`;
  console.log(`  ${heading}`);
  console.log(`  ${"-".repeat(heading.length)}`);
  console.log(`  Registered:  ${registered ? "Yes" : "No"}`);
  console.log(`  VAT Number:  ${vatNumber}`);
  if (reason) {
    console.log(`  Reason:      ${reason}`);
  } else {
    console.log(`  Name:        ${name}`);
    console.log(`  Address:     ${address}`);
    console.log(`  Country:     ${country}`);
  }
  console.log();
}

function printChecksumResult(cc, num, result) {
  console.log(`\n  Validation`);
  console.log(`  ----------`);
  console.log(`  VAT Number:  ${cc}${num}`);
  console.log(`  Format:      ${result.formatValid ? "Valid" : "Invalid — " + result.error}`);
  if (result.formatValid) {
    if (result.formatOnly) {
      console.log(`  Checksum:    N/A (format-only check for ${cc})`);
    } else {
      console.log(`  Checksum:    ${result.valid ? "Pass" : "Fail"}`);
    }
  }
  console.log();
}

// ─── validateOne — structured result for a single VAT ───────

async function validateOne(rawVat) {
  const clean = sanitize(rawVat);
  const countryCode = clean.slice(0, 2).toUpperCase();
  const vatNumber = clean.slice(2);

  const checksumResult = runChecksum(countryCode, vatNumber);

  const result = {
    input: rawVat,
    countryCode,
    vatNumber,
    formatValid: checksumResult.formatValid,
    checksumValid: checksumResult.valid,
    checksumNote: checksumResult.formatOnly ? "N/A" : null,
    formatError: checksumResult.error || null,
    registered: null,
    name: null,
    address: null,
    country: countryCode,
    reason: null,
    error: null,
  };

  if (!checksumResult.formatValid) return result;

  const isUK = countryCode === "GB" || countryCode === "XI";
  const shouldSkip =
    !checksumResult.valid && (isUK || !checksumResult.formatOnly);
  if (shouldSkip) return result;

  let apiResult;
  for (let attempt = 1; attempt <= 3; attempt++) {
    apiResult = isUK
      ? await queryHMRC(vatNumber)
      : await queryVIES(countryCode, vatNumber);

    if (!isTransientError(apiResult)) break;
    if (attempt < 3) {
      await sleep(RATE_LIMIT_MS * Math.pow(2, attempt));
    }
  }

  if (apiResult) {
    if (apiResult.error) {
      result.error = apiResult.error;
    } else {
      result.registered = apiResult.registered;
      result.name = apiResult.name || null;
      result.address = apiResult.address || null;
      result.country = apiResult.country || countryCode;
      result.reason = apiResult.reason || null;
    }
  }

  return result;
}

// ─── Single-VAT console mode ────────────────────────────────

async function runSingle(rawVat, suggest = false) {
  const clean = sanitize(rawVat);
  const countryCode = clean.slice(0, 2).toUpperCase();
  const vatNumber = clean.slice(2);

  const checksumResult = runChecksum(countryCode, vatNumber);
  printChecksumResult(countryCode, vatNumber, checksumResult);

  if (!checksumResult.formatValid) return;

  const isUK = countryCode === "GB" || countryCode === "XI";
  const serviceName = isUK ? "HMRC" : "VIES";
  const shouldSkip =
    !checksumResult.valid && (isUK || !checksumResult.formatOnly);

  if (shouldSkip) {
    console.log(`  Skipping ${serviceName} — checksum failed.\n`);

    if (suggest) {
      console.log(`  Generating suggestions...\n`);
      const { getSuggestions } = await import("./suggest-vat.mjs");
      const { candidates, confidence, verified, apiErrors } = await getSuggestions(
        countryCode,
        vatNumber,
      );

      console.log(`  Candidates:  ${candidates.length} (checksum-valid)`);
      console.log(`  Verified:    ${verified.length} (registered)`);
      if (apiErrors.length > 0) {
        console.log(`  Failed:      ${apiErrors.length} (API errors — could not verify)`);
      }
      console.log(`  Confidence:  ${confidence}\n`);

      if (verified.length > 0) {
        for (const v of verified) {
          printLookupResult({
            service: serviceName,
            label: "Suggestion",
            registered: true,
            vatNumber: v.vatSuggestion,
            name: v.name,
            address: v.address || "N/A",
            country: v.country,
          });
        }
      } else {
        console.log(`  No registered corrections found.\n`);
      }

      if (apiErrors.length > 0) {
        console.log(`  Candidates that could not be verified (API errors):`);
        for (const e of apiErrors) {
          console.log(`    ${e.vatSuggestion} — ${e.error}`);
        }
        console.log();
      }
    }

    return;
  }

  console.log(`  Querying ${serviceName}...\n`);
  const apiResult = isUK
    ? await queryHMRC(vatNumber)
    : await queryVIES(countryCode, vatNumber);

  if (apiResult && !apiResult.error) {
    printLookupResult({ service: serviceName, ...apiResult });
  } else if (apiResult?.error) {
    console.error(`  ${serviceName} Error: ${apiResult.error}\n`);
  }
}

// ─── TSV parsing & writing ──────────────────────────────────

function parseTsv(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("#"));
  if (lines.length === 0) {
    console.error("Error: Input file is empty.");
    process.exit(1);
  }

  const headers = lines[0].split("\t").map((h) => h.trim().toLowerCase());
  const vatIdx = headers.findIndex((h) => h === "vat");
  const carrierIdx = headers.findIndex((h) => h === "carrier");

  if (vatIdx === -1) {
    console.error("Error: Input TSV must have a 'VAT' column header.");
    process.exit(1);
  }

  return lines
    .slice(1)
    .map((line) => {
      const cols = line.split("\t");
      return {
        carrier: carrierIdx >= 0 ? (cols[carrierIdx] || "").trim() : "",
        vat: (cols[vatIdx] || "").trim(),
      };
    })
    .filter((r) => r.vat);
}

function deriveOutputPath(inputPath, suffix) {
  const dir = dirname(inputPath);
  const base = basename(inputPath, ".tsv");
  return join(dir, `${base}-${suffix}.tsv`);
}

const esc = (s) => (s ?? "").toString().replace(/\t/g, " ");

function writeResultsTsv(results, filePath) {
  const header = [
    "Carrier", "VAT", "Format", "Checksum",
    "Registered", "Name", "Address", "Country",
  ].join("\t");

  const lines = results.map((r) => {
    const fmt = r.formatValid ? "Valid" : "Invalid";
    const chk = !r.formatValid
      ? ""
      : r.checksumNote === "N/A"
        ? "N/A"
        : r.checksumValid ? "Pass" : "Fail";
    const reg =
      r.registered === true
        ? "Yes"
        : r.registered === false
          ? "No"
          : r.seeSuggestions
            ? "See suggestions"
            : "";

    return [
      esc(r.carrier),
      esc(`${r.countryCode}${r.vatNumber}`),
      fmt,
      chk,
      reg,
      r.registered === true ? esc(r.name) : "",
      r.registered === true ? esc(r.address) : "",
      r.registered === true ? esc(r.country) : "",
    ].join("\t");
  });

  writeFileSync(filePath, [header, ...lines].join("\n") + "\n", "utf-8");
}

function writeSuggestionsTsv(rows, filePath) {
  const header = [
    "Carrier", "VAT", "VAT_Suggestion", "Format",
    "Checksum", "Registered", "Name", "Address", "Country",
  ].join("\t");

  const lines = rows.map((r) =>
    [
      esc(r.carrier), esc(r.vat), esc(r.vatSuggestion),
      esc(r.format), esc(r.checksum), esc(r.registered),
      esc(r.name), esc(r.address), esc(r.country),
    ].join("\t"),
  );

  writeFileSync(filePath, [header, ...lines].join("\n") + "\n", "utf-8");
}

// ─── Batch mode ─────────────────────────────────────────────

async function runBatch(inputPath, suggest, range) {
  let rows = parseTsv(inputPath);
  const totalRows = rows.length;

  if (range) {
    const start = range.from - 1;
    const end = Math.min(range.to, totalRows);
    rows = rows.slice(start, end);
    console.log(`\n  Range ${range.from}-${end} of ${totalRows} rows (processing ${rows.length})\n`);
  } else {
    console.log(`\n  Processing ${rows.length} VAT numbers...\n`);
  }

  const results = [];

  for (let i = 0; i < rows.length; i++) {
    const { carrier, vat } = rows[i];
    process.stdout.write(`  [${i + 1}/${rows.length}] ${vat}...`);

    const result = await validateOne(vat);
    result.carrier = carrier;
    results.push(result);

    const status = result.error
      ? "error"
      : !result.formatValid
        ? "invalid format"
        : !result.checksumValid
          ? "checksum fail"
          : result.registered === true
            ? "registered"
            : result.registered === false
              ? "not registered"
              : "unknown";
    console.log(` ${status}`);
  }

  const resultsPath = deriveOutputPath(inputPath, "results");
  writeResultsTsv(results, resultsPath);
  console.log(`\n  Results written to ${resultsPath}`);

  if (suggest) {
    const failed = results.filter(
      (r) => r.formatValid && !r.checksumValid,
    );

    if (failed.length > 0) {
      console.log(
        `\n  Generating suggestions for ${failed.length} failed VAT(s)...\n`,
      );
      const { getSuggestions } = await import("./suggest-vat.mjs");
      const suggestionRows = [];

      for (const r of failed) {
        process.stdout.write(
          `  Suggesting for ${r.countryCode}${r.vatNumber}...`,
        );
        const { confidence, verified, apiErrors } = await getSuggestions(
          r.countryCode,
          r.vatNumber,
        );

        if (apiErrors.length > 0) {
          for (const e of apiErrors) {
            suggestionRows.push({
              carrier: r.carrier,
              vat: `${r.countryCode}${r.vatNumber}`,
              vatSuggestion: e.vatSuggestion,
              format: "",
              checksum: "",
              registered: "",
              name: `API error: ${e.error}`,
              address: "",
              country: "",
            });
          }
        }

        if (verified.length === 0) {
          suggestionRows.push({
            carrier: r.carrier,
            vat: `${r.countryCode}${r.vatNumber}`,
            vatSuggestion: "",
            format: "",
            checksum: "",
            registered: "",
            name: "No registered corrections found",
            country: "",
          });
          const errCount = apiErrors.length;
          console.log(errCount > 0
            ? ` no matches (${errCount} API error${errCount > 1 ? "s" : ""})`
            : " no matches");
        } else {
          for (const v of verified) {
            suggestionRows.push({
              carrier: r.carrier,
              vat: `${r.countryCode}${r.vatNumber}`,
              vatSuggestion: v.vatSuggestion,
              format: "Valid",
              checksum: "Pass",
              registered: "Yes",
              name: v.name,
              address: v.address || "N/A",
              country: v.country,
            });
          }
          const errCount = apiErrors.length;
          console.log(` ${verified.length} registered match(es)${errCount > 0 ? `, ${errCount} API error(s)` : ""}`);
        }
      }

      for (const r of failed) {
        r.seeSuggestions = true;
      }

      const suggestPath = deriveOutputPath(inputPath, "suggestions");
      writeSuggestionsTsv(suggestionRows, suggestPath);
      console.log(`\n  Suggestions written to ${suggestPath}`);

      const resultsPathUpdate = deriveOutputPath(inputPath, "results");
      writeResultsTsv(results, resultsPathUpdate);
      console.log(`  Results updated with suggestion references.`);
    } else {
      console.log(`\n  No checksum failures — no suggestions needed.`);
    }
  }

  const valid = results.filter((r) => r.registered === true).length;
  const notReg = results.filter((r) => r.registered === false).length;
  const fmtFail = results.filter((r) => !r.formatValid).length;
  const chkFail = results.filter(
    (r) => r.formatValid && !r.checksumValid,
  ).length;
  const errors = results.filter((r) => r.error).length;

  console.log(`\n  Summary`);
  console.log(`  -------`);
  console.log(`  Total:            ${results.length}`);
  console.log(`  Registered:       ${valid}`);
  console.log(`  Not registered:   ${notReg}`);
  if (errors > 0) console.log(`  Failed:           ${errors} (API errors — could not verify)`);
  console.log(`  Format invalid:   ${fmtFail}`);
  console.log(`  Checksum failed:  ${chkFail}`);
  console.log();
}

// ─── Range parser ───────────────────────────────────────────

function parseRange(rangeStr) {
  const m = rangeStr.match(/^(\d+)?-(\d+)?$/);
  if (!m || (!m[1] && !m[2])) {
    console.error("Error: Invalid --range format. Use: 1-10, -5, or 50-");
    process.exit(1);
  }
  const from = m[1] ? parseInt(m[1]) : 1;
  const to = m[2] ? parseInt(m[2]) : Infinity;
  if (from < 1) {
    console.error("Error: --range start must be >= 1");
    process.exit(1);
  }
  if (from > to) {
    console.error("Error: --range start must be <= end");
    process.exit(1);
  }
  return { from, to };
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  let filePath = null;
  let suggest = false;
  let test = false;
  let rangeStr = null;
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && i + 1 < args.length) {
      filePath = args[++i];
    } else if (args[i] === "--range" && i + 1 < args.length) {
      rangeStr = args[++i];
    } else if (args[i] === "--suggest") {
      suggest = true;
    } else if (args[i] === "--test") {
      test = true;
    } else if (!args[i].startsWith("--")) {
      positional.push(args[i]);
    }
  }

  const range = rangeStr ? parseRange(rangeStr) : null;

  if (range && !filePath) {
    console.error("Error: --range can only be used with --file (batch mode).");
    process.exit(1);
  }

  if (test) {
    const { runTests } = await import("./test/test-vat.mjs");
    runTests();
    const { runApiTests } = await import("./test/test-api.mjs");
    const ok = await runApiTests();
    if (!ok) process.exit(1);
  } else if (filePath) {
    await runBatch(filePath, suggest, range);
  } else if (positional.length > 0) {
    await runSingle(positional.join(""), suggest);
  } else {
    console.error("Usage:");
    console.error("  Single:   node validate-vat.mjs <VAT_NUMBER>");
    console.error("  Suggest:  node validate-vat.mjs <VAT_NUMBER> --suggest");
    console.error("  Batch:    node validate-vat.mjs --file input.tsv");
    console.error("  Range:    node validate-vat.mjs --file input.tsv --range 1-10");
    console.error("  Batch+S:  node validate-vat.mjs --file input.tsv --suggest");
    console.error("  Test:     node validate-vat.mjs --test");
    process.exit(1);
  }
}

// ─── Exports & entry point ──────────────────────────────────

export {
  sanitize, checksumValidators, runChecksum,
  queryVIES, queryHMRC, validateOne,
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
