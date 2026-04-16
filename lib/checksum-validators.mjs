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

// ─── Checksum router ────────────────────────────────────────

function runChecksum(cc, num) {
  const validate = checksumValidators[cc];
  if (!validate)
    return { formatValid: false, valid: false, error: `Unknown country code: ${cc}` };
  return validate(num);
}

export { checksumValidators, runChecksum };
