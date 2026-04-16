import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ═══════════════════════════════════════════════════════════════
// n8n Workflow Generator — VAT Checker
// ═══════════════════════════════════════════════════════════════
//
// Run:   node n8n/n8n-workflow-generator.mjs
// Out:   n8n-vat-checker-workflow.json  (import into n8n)
//
// Prerequisites on your n8n instance:
//   1. Google Sheets OAuth2 credentials configured
//   2. A Google Sheet with:
//        - Sheet1 "VAT Input":  columns  Carrier | VAT | Format | Checksum | Registered | Name | Address | Country | Error
//        - Sheet2 "Suggestions": columns  Carrier | VAT | Suggestion | Registered | Name | Country | LLM_Analysis
//   3. If Code-node HTTP calls fail, ask your n8n admin to set:
//        NODE_FUNCTION_ALLOW_BUILTIN=*
//      (enables fetch / https inside Code nodes)
// ═══════════════════════════════════════════════════════════════

// ─── Code Node 1: Validate All VAT Numbers ──────────────────

const validateAllCode = `
// ─── Config ──────────────────────────────────────────────────
const VIES_URL = 'https://ec.europa.eu/taxation_customs/vies/services/checkVatService';
const HMRC_BASE = 'https://www.tax.service.gov.uk/check-vat-number';
const RATE_MS = 1200;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const sanitize = (s) => s.replace(/[\\s\\-._,/\\\\]+/g, '');
const cross = (v) => (v >= 10 ? Math.floor(v / 10) + (v % 10) : v);

function formatFail(error) { return { formatValid: false, valid: false, error }; }
function checksumPass()     { return { formatValid: true,  valid: true }; }
function checksumFail()     { return { formatValid: true,  valid: false }; }
function formatOnlyPass()   { return { formatValid: true,  valid: true, formatOnly: true }; }

// ─── Checksum validators ────────────────────────────────────
const V = {
  AT(num) {
    const n = num.startsWith('U') ? num.slice(1) : num;
    if (!/^\\d{8}$/.test(n)) return formatFail('Must be U + 8 digits');
    const d = n.split('').map(Number);
    const s = d[0] + cross(d[1]*2) + d[2] + cross(d[3]*2) + d[4] + cross(d[5]*2) + d[6];
    return (96 - s) % 10 === d[7] ? checksumPass() : checksumFail();
  },

  BE(num) {
    if (!/^[01]\\d{9}$/.test(num)) return formatFail('Must be 10 digits starting with 0 or 1');
    const first8 = parseInt(num.slice(0, 8));
    const last2 = parseInt(num.slice(8));
    return 97 - (first8 % 97) === last2 ? checksumPass() : checksumFail();
  },

  BG(num) {
    if (!/^\\d{9,10}$/.test(num)) return formatFail('Must be 9 or 10 digits');
    const d = num.split('').map(Number);
    if (d.length === 9) {
      let sum = [1,2,3,4,5,6,7,8].reduce((s,w,i) => s + d[i]*w, 0);
      let r = sum % 11;
      if (r === 10) {
        sum = [3,4,5,6,7,8,9,10].reduce((s,w,i) => s + d[i]*w, 0);
        r = sum % 11;
        if (r === 10) r = 0;
      }
      return r === d[8] ? checksumPass() : checksumFail();
    }
    const personW = [2,4,8,5,10,9,7,3,6];
    const month = d[2]*10 + d[3];
    const day = d[4]*10 + d[5];
    const validMonth = (month >= 1 && month <= 12) || (month >= 21 && month <= 32) || (month >= 41 && month <= 52);
    const validDate = validMonth && day >= 1 && day <= 31;
    const isPerson = validDate && personW.reduce((s,w,i) => s + d[i]*w, 0) % 11 % 10 === d[9];
    const foreignW = [21,19,17,13,11,9,7,3,1];
    const isForeigner = foreignW.reduce((s,w,i) => s + d[i]*w, 0) % 10 === d[9];
    const miscW = [4,3,2,7,6,5,4,3,2];
    const miscR = 11 - miscW.reduce((s,w,i) => s + d[i]*w, 0) % 11;
    const isMisc = (miscR === 11 ? 0 : miscR) === d[9] && miscR !== 10;
    return isPerson || isForeigner || isMisc ? checksumPass() : checksumFail();
  },

  CY(num) {
    if (!/^[0-59]\\d{7}[A-Z]$/.test(num)) return formatFail('Must be 8 digits + 1 letter');
    if (num.startsWith('12')) return checksumFail();
    const lookup = [1,0,5,7,9,13,15,17,19,21];
    const digits = num.slice(0, 8);
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += i % 2 === 0 ? lookup[Number(digits[i])] : Number(digits[i]);
    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[sum % 26] === num[8] ? checksumPass() : checksumFail();
  },

  CZ(num) {
    if (!/^\\d{8,10}$/.test(num)) return formatFail('Must be 8-10 digits');
    const d = num.split('').map(Number);
    if (num.length === 8) {
      if (d[0] === 9) return checksumFail();
      const a1 = [8,7,6,5,4,3,2].reduce((s,w,i) => s + d[i]*w, 0);
      const a2 = a1 % 11 === 0 ? a1 + 11 : Math.ceil(a1/11)*11;
      return (a2 - a1) % 10 === d[7] ? checksumPass() : checksumFail();
    }
    if (num.length === 9 && d[0] === 6) {
      const inner = num.slice(1,8).split('').map(Number);
      const a1 = [8,7,6,5,4,3,2].reduce((s,w,i) => s + inner[i]*w, 0);
      const a2 = a1 % 11 === 0 ? a1 + 11 : Math.ceil(a1/11)*11;
      const expected = [0,8,7,6,5,4,3,2,1,0,9,8][a2 - a1];
      return expected === d[8] ? checksumPass() : checksumFail();
    }
    if (num.length === 10) {
      const r1 = parseInt(num) % 11 === 0;
      const pairSum = d[0]*10+d[1] + d[2]*10+d[3] + d[4]*10+d[5] + d[6]*10+d[7] + d[8]*10+d[9];
      return r1 && pairSum % 11 === 0 ? checksumPass() : checksumFail();
    }
    return formatOnlyPass();
  },

  DE(num) {
    if (!/^\\d{9}$/.test(num)) return formatFail('Must be 9 digits');
    const d = num.split('').map(Number);
    if (d[0] === 0) return checksumFail();
    let product = 10;
    for (let i = 0; i < 8; i++) {
      let sum = (d[i] + product) % 10;
      if (sum === 0) sum = 10;
      product = (sum * 2) % 11;
    }
    return (11 - product) % 10 === d[8] ? checksumPass() : checksumFail();
  },

  DK(num) {
    if (!/^\\d{8}$/.test(num)) return formatFail('Must be 8 digits');
    const d = num.split('').map(Number);
    if (d[0] === 0) return checksumFail();
    return [2,7,6,5,4,3,2,1].reduce((s,w,i) => s + d[i]*w, 0) % 11 === 0 ? checksumPass() : checksumFail();
  },

  EE(num) {
    if (!/^10\\d{7}$/.test(num)) return formatFail('Must be 9 digits starting with 10');
    const d = num.split('').map(Number);
    const sum = [3,7,1,3,7,1,3,7].reduce((s,w,i) => s + d[i]*w, 0);
    let check = 10 - (sum % 10);
    if (check === 10) check = 0;
    return check === d[8] ? checksumPass() : checksumFail();
  },

  EL(num) {
    if (!/^\\d{9}$/.test(num)) return formatFail('Must be 9 digits');
    const d = num.split('').map(Number);
    return ([256,128,64,32,16,8,4,2].reduce((s,w,i) => s + d[i]*w, 0) % 11) % 10 === d[8] ? checksumPass() : checksumFail();
  },

  ES(num) {
    if (!/^[A-Z0-9]\\d{7}[A-Z0-9]$/.test(num)) return formatFail('Must be 1 char + 7 digits + 1 check char');
    const first = num[0], last = num[8], mid = num.slice(1, 8);
    const dniLetters = 'TRWAGMYFPDXBNJZSQVHLCKE';
    if (/^\\d$/.test(first)) {
      return last === dniLetters[parseInt(first + mid) % 23] ? checksumPass() : checksumFail();
    }
    if ('XYZ'.includes(first)) {
      const prefix = { X:'0', Y:'1', Z:'2' };
      return last === dniLetters[parseInt(prefix[first] + mid) % 23] ? checksumPass() : checksumFail();
    }
    if (/^[A-HJ-NP-SUVW]$/.test(first)) {
      const d = mid.split('').map(Number);
      let sumOdd = 0, sumEven = 0;
      for (let i = 0; i < 7; i++) {
        if (i % 2 === 0) sumOdd += cross(d[i]*2);
        else sumEven += d[i];
      }
      let check = 10 - ((sumOdd + sumEven) % 10);
      if (check === 10) check = 0;
      return last === String(check) || last === 'JABCDEFGHI'[check] ? checksumPass() : checksumFail();
    }
    return formatOnlyPass();
  },

  FI(num) {
    if (!/^\\d{8}$/.test(num)) return formatFail('Must be 8 digits');
    const d = num.split('').map(Number);
    const sum = [7,9,10,5,8,4,2].reduce((s,w,i) => s + d[i]*w, 0);
    const r = sum % 11;
    if (r === 1) return checksumFail();
    return (r === 0 ? 0 : 11 - r) === d[7] ? checksumPass() : checksumFail();
  },

  FR(num) {
    if (!/^[0-9A-HJ-NP-Z]{2}\\d{9}$/.test(num)) return formatFail('Must be 2 check chars + 9 SIREN digits');
    const key = num.slice(0, 2), siren = num.slice(2);
    if (/^\\d{2}$/.test(key)) {
      return parseInt(key) === (parseInt(siren) * 100 + 12) % 97 ? checksumPass() : checksumFail();
    }
    return formatOnlyPass();
  },

  HR(num) {
    if (!/^\\d{11}$/.test(num)) return formatFail('Must be 11 digits');
    const d = num.split('').map(Number);
    let product = 10;
    for (let i = 0; i < 10; i++) {
      let sum = (d[i] + product) % 10;
      if (sum === 0) sum = 10;
      product = (sum * 2) % 11;
    }
    return (product + d[10]) % 10 === 1 ? checksumPass() : checksumFail();
  },

  HU(num) {
    if (!/^\\d{8}$/.test(num)) return formatFail('Must be 8 digits');
    const d = num.split('').map(Number);
    const r = [9,7,3,1,9,7,3].reduce((s,w,i) => s + d[i]*w, 0);
    const check = r % 10 === 0 ? 0 : 10 - (r % 10);
    return check === d[7] ? checksumPass() : checksumFail();
  },

  IE(num) {
    const checkChars = 'WABCDEFGHIJKLMNOPQRSTUV';
    const secondLetterMap = 'WABCDEFGHI';
    if (/^\\d([A-Z+*])\\d{5}[A-W]$/.test(num)) {
      const c1 = Number(num[0]);
      const mid = num.slice(2,7).split('').map(Number);
      const r = (7*mid[0] + 6*mid[1] + 5*mid[2] + 4*mid[3] + 3*mid[4] + 2*c1) % 23;
      return num[7] === checkChars[r] ? checksumPass() : checksumFail();
    }
    if (/^\\d{7}[A-W]([A-IW])?$/.test(num)) {
      const d = num.slice(0,7).split('').map(Number);
      const c9val = num[8] ? secondLetterMap.indexOf(num[8]) : 0;
      const r = (9*c9val + 8*d[0] + 7*d[1] + 6*d[2] + 5*d[3] + 4*d[4] + 3*d[5] + 2*d[6]) % 23;
      return num[7] === checkChars[r] ? checksumPass() : checksumFail();
    }
    return formatFail('Must be 7 digits + 1-2 letters');
  },

  IT(num) {
    if (!/^\\d{11}$/.test(num)) return formatFail('Must be 11 digits');
    const d = num.split('').map(Number);
    if (num.slice(0,7) === '0000000') return checksumFail();
    const province = parseInt(num.slice(7,10));
    if (province === 0 || (province > 201 && province !== 888 && province !== 999)) return checksumFail();
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += i % 2 === 0 ? d[i] : cross(d[i]*2);
    return d[10] === (10 - (sum % 10)) % 10 ? checksumPass() : checksumFail();
  },

  LT(num) {
    if (!/^\\d{9}$/.test(num) && !/^\\d{12}$/.test(num)) return formatFail('Must be 9 or 12 digits');
    if (num[num.length - 2] !== '1') return formatFail('Penultimate digit must be 1');
    const d = num.split('').map(Number);
    const n = d.length;
    const w1 = n === 9 ? [1,2,3,4,5,6,7,8] : [1,2,3,4,5,6,7,8,9,1,2];
    const w2 = n === 9 ? [3,4,5,6,7,8,9,1] : [3,4,5,6,7,8,9,1,2,3,4];
    const r1 = w1.reduce((s,w,i) => s + d[i]*w, 0) % 11;
    if (r1 % 10 !== 0) return r1 === d[n-1] ? checksumPass() : checksumFail();
    const r2 = w2.reduce((s,w,i) => s + d[i]*w, 0) % 11;
    return (r2 === 10 ? 0 : r2) === d[n-1] ? checksumPass() : checksumFail();
  },

  LU(num) {
    if (!/^\\d{8}$/.test(num)) return formatFail('Must be 8 digits');
    return parseInt(num.slice(0,6)) % 89 === parseInt(num.slice(6)) ? checksumPass() : checksumFail();
  },

  LV(num) {
    if (!/^\\d{11}$/.test(num)) return formatFail('Must be 11 digits');
    const d = num.split('').map(Number);
    if (d[0] > 3) {
      const weights = [9,1,4,8,3,10,2,5,7,6];
      const r = 3 - weights.reduce((s,w,i) => s + d[i]*w, 0) % 11;
      if (r === -1) return checksumFail();
      return d[10] === (r < -1 ? r + 11 : r) ? checksumPass() : checksumFail();
    }
    if (num.startsWith('32')) return formatOnlyPass();
    const day = parseInt(num.slice(0,2)), month = parseInt(num.slice(2,4));
    if (day > 31 || month > 12) return checksumFail();
    return formatOnlyPass();
  },

  MT(num) {
    if (!/^[1-9]\\d{7}$/.test(num)) return formatFail('Must be 8 digits, first non-zero');
    const d = num.split('').map(Number);
    const sum = [3,4,6,7,8,9].reduce((s,w,i) => s + d[i]*w, 0);
    return 37 - (sum % 37) === d[6]*10 + d[7] ? checksumPass() : checksumFail();
  },

  NL(num) {
    if (!/^\\d{9}B\\d{2}$/.test(num)) return formatFail('Must be 9 digits + B + 2 digits');
    const rearranged = num + 'NL';
    const numeric = rearranged.replace(/[A-Z]/g, c => (c.charCodeAt(0) - 55).toString());
    return BigInt(numeric) % 97n === 1n ? checksumPass() : checksumFail();
  },

  PL(num) {
    if (!/^\\d{10}$/.test(num)) return formatFail('Must be 10 digits');
    const d = num.split('').map(Number);
    const sum = [6,5,7,2,3,4,5,6,7].reduce((s,w,i) => s + d[i]*w, 0);
    const r = sum % 11;
    return r !== 10 && r === d[9] ? checksumPass() : checksumFail();
  },

  PT(num) {
    if (!/^\\d{9}$/.test(num)) return formatFail('Must be 9 digits');
    const d = num.split('').map(Number);
    if (d[0] === 0) return checksumFail();
    const sum = [9,8,7,6,5,4,3,2].reduce((s,w,i) => s + d[i]*w, 0);
    return (11 - sum % 11) % 11 % 10 === d[8] ? checksumPass() : checksumFail();
  },

  RO(num) {
    if (!/^[1-9]\\d{1,9}$/.test(num)) return formatFail('Must be 2-10 digits, first non-zero');
    const idx = 10 - num.length;
    const weights = [7,5,3,2,1,7,5,3,2].slice(idx);
    const d = num.split('').map(Number);
    const sum = weights.reduce((s,w,i) => s + d[i]*w, 0);
    let check = (sum * 10) % 11;
    if (check === 10) check = 0;
    return check === d[d.length - 1] ? checksumPass() : checksumFail();
  },

  SE(num) {
    if (!/^\\d{12}$/.test(num)) return formatFail('Must be 12 digits');
    if (num.slice(10) !== '01') return formatFail('Last 2 digits must be 01');
    const d = num.slice(0,10).split('').map(Number);
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      const v = d[i] * (i % 2 === 0 ? 2 : 1);
      sum += v > 9 ? v - 9 : v;
    }
    return sum % 10 === 0 ? checksumPass() : checksumFail();
  },

  SI(num) {
    if (!/^[1-9]\\d{7}$/.test(num)) return formatFail('Must be 8 digits, first non-zero');
    const d = num.split('').map(Number);
    const r = 11 - [8,7,6,5,4,3,2].reduce((s,w,i) => s + d[i]*w, 0) % 11;
    if (r === 11) return checksumFail();
    return (r === 10 && d[7] === 0) || d[7] === r ? checksumPass() : checksumFail();
  },

  SK(num) {
    if (!/^[1-9]\\d[2346-9]\\d{7}$/.test(num)) return formatFail('Must be 10 digits matching structure');
    return BigInt(num) % 11n === 0n ? checksumPass() : checksumFail();
  },

  XI(num) { return V.GB(num); },

  GB(num) {
    if (/^GD\\d{3}$/.test(num)) return parseInt(num.slice(2)) < 500 ? checksumPass() : checksumFail();
    if (/^HA\\d{3}$/.test(num)) return parseInt(num.slice(2)) >= 500 ? checksumPass() : checksumFail();
    if (/^\\d{12}$/.test(num)) return V.GB(num.slice(0, 9));
    if (!/^\\d{9}$/.test(num)) return formatFail('Must be 9 or 12 digits, or GD/HA + 3 digits');
    const d = num.split('').map(Number);
    const no = parseInt(num.slice(0, 7));
    if (no === 0 || (no >= 100000 && no <= 999999) || (no >= 9490001 && no <= 9700000) || no >= 9990001) return checksumFail();
    const weighted = d[0]*8 + d[1]*7 + d[2]*6 + d[3]*5 + d[4]*4 + d[5]*3 + d[6]*2;
    const checkDigits = d[7]*10 + d[8];
    const check1 = (97 - (weighted % 97)) % 97;
    const check2 = (97 - ((weighted + 55) % 97)) % 97;
    return checkDigits === check1 || (no > 1000000 && checkDigits === check2) ? checksumPass() : checksumFail();
  },
};

function runChecksum(cc, num) {
  const validate = V[cc];
  if (!validate) return { formatValid: false, valid: false, error: 'Unknown country code: ' + cc };
  return validate(num);
}

// ─── VIES SOAP query ─────────────────────────────────────────

async function queryVIES(countryCode, vatNumber) {
  const soapBody = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:ec.europa.eu:taxud:vies:services:checkVat:types">' +
    '<soapenv:Header/><soapenv:Body><urn:checkVat>' +
    '<urn:countryCode>' + countryCode + '</urn:countryCode>' +
    '<urn:vatNumber>' + vatNumber + '</urn:vatNumber>' +
    '</urn:checkVat></soapenv:Body></soapenv:Envelope>';
  try {
    const res = await fetch(VIES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
      body: soapBody,
    });
    const xml = await res.text();
    const faultMatch = xml.match(/<faultstring>([\\s\\S]*?)<\\/faultstring>/);
    if (faultMatch) return { error: faultMatch[1].trim() };
    const tag = (name) => {
      const m = xml.match(new RegExp('<ns2:' + name + '>([\\\\s\\\\S]*?)</ns2:' + name + '>'));
      return m ? m[1].trim() : null;
    };
    const valid = tag('valid') === 'true';
    const name = tag('name') || 'N/A';
    const address = (tag('address') || 'N/A').replace(/\\n/g, ', ');
    return {
      registered: valid,
      vatNumber: countryCode + vatNumber,
      name: name === '---' ? 'N/A' : name,
      address: address === '---' ? 'N/A' : address,
      country: countryCode,
    };
  } catch (err) {
    return { error: err.message };
  }
}

// ─── HMRC query ──────────────────────────────────────────────

function collectCookies(headers, existing) {
  const raw = [];
  if (headers.getSetCookie) {
    raw.push(...headers.getSetCookie());
  } else {
    const sc = headers.get('set-cookie');
    if (sc) raw.push(...sc.split(/,(?=[^ ]+=)/));
  }
  const prev = existing ? existing.split('; ').filter(Boolean) : [];
  const map = new Map(prev.map(c => [c.split('=')[0], c]));
  for (const h of raw) {
    const pair = h.split(';')[0].trim();
    map.set(pair.split('=')[0], pair);
  }
  return [...map.values()].join('; ');
}

async function queryHMRC(vatNumber) {
  try {
    const formUrl = HMRC_BASE + '/enter-vat-details';
    const getRes = await fetch(formUrl, { redirect: 'follow' });
    if (!getRes.ok) throw new Error('GET form failed: ' + getRes.status);
    const html = await getRes.text();
    let cookies = collectCookies(getRes.headers, '');
    const csrfMatch = html.match(/name="csrfToken"\\s+value="([^"]+)"/);
    if (!csrfMatch) throw new Error('CSRF token not found');
    await sleep(RATE_MS);
    const body = 'csrfToken=' + encodeURIComponent(csrfMatch[1]) + '&target=' + encodeURIComponent(vatNumber);
    const postRes = await fetch(formUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookies,
        Referer: formUrl,
      },
      body: body,
      redirect: 'manual',
    });
    cookies = collectCookies(postRes.headers, cookies);
    let resultHtml;
    if (postRes.status >= 300 && postRes.status < 400) {
      const location = postRes.headers.get('location');
      const resultUrl = location.startsWith('http') ? location : HMRC_BASE + location.replace('/check-vat-number', '');
      await sleep(300);
      const resultRes = await fetch(resultUrl, { headers: { Cookie: cookies }, redirect: 'follow' });
      resultHtml = await resultRes.text();
    } else {
      resultHtml = await postRes.text();
    }
    if (!resultHtml.includes('govuk-panel--confirmation')) {
      return { registered: false, vatNumber: 'GB' + vatNumber, country: 'GB', reason: 'Not registered' };
    }
    let name = 'N/A';
    const nameMatch = resultHtml.match(/Registered business name<\\/h3>\\s*<p[^>]*>([\\s\\S]*?)<\\/p>/i);
    if (nameMatch) name = nameMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
    let address = 'N/A';
    const addrMatch = resultHtml.match(/Registered business address<\\/h3>\\s*<p[^>]*>([\\s\\S]*?)<\\/p>/i);
    if (addrMatch) address = addrMatch[1].replace(/<br\\s*\\/?>/gi, ',').replace(/<[^>]+>/g, '').replace(/\\s+/g, ' ').replace(/\\s*,\\s*/g, ', ').replace(/,\\s*$/, '').trim();
    return { registered: true, vatNumber: 'GB' + vatNumber, name, address, country: 'GB' };
  } catch (err) {
    return { error: err.message };
  }
}

// ─── Transient error handling ─────────────────────────────────

const TRANSIENT_ERRORS = ['MS_MAX_CONCURRENT_REQ', 'MS_UNAVAILABLE', 'TIMEOUT', 'SERVICE_UNAVAILABLE'];
function isTransientError(r) {
  return r && r.error && TRANSIENT_ERRORS.some(e => r.error.includes(e));
}

// ─── Main processing loop ────────────────────────────────────

const items = $input.all();
const results = [];
let delayMs = RATE_MS;

for (let i = 0; i < items.length; i++) {
  const carrier = items[i].json.Carrier || '';
  const rawVat = items[i].json.VAT || '';

  if (!rawVat) {
    results.push({ json: { Carrier: carrier, VAT: '', Format: '', Checksum: '', Registered: '', Name: '', Address: '', Country: '', Error: 'No VAT number' } });
    continue;
  }

  const clean = sanitize(rawVat);
  const cc = clean.slice(0, 2).toUpperCase();
  const num = clean.slice(2);
  const ck = runChecksum(cc, num);

  const row = {
    Carrier: carrier,
    VAT: cc + num,
    Format: ck.formatValid ? 'Valid' : 'Invalid',
    Checksum: !ck.formatValid ? '' : ck.formatOnly ? 'N/A' : ck.valid ? 'Pass' : 'Fail',
    Registered: '',
    Name: '',
    Address: '',
    Country: cc,
    Error: ck.error || '',
  };

  const isUK = cc === 'GB' || cc === 'XI';
  const shouldSkip = !ck.formatValid || (!ck.valid && !ck.formatOnly);

  if (shouldSkip) {
    results.push({ json: row });
    continue;
  }

  await sleep(delayMs);
  let api;
  for (let attempt = 1; attempt <= 3; attempt++) {
    api = isUK ? await queryHMRC(num) : await queryVIES(cc, num);
    if (!isTransientError(api)) break;
    if (attempt < 3) await sleep(delayMs * Math.pow(2, attempt));
  }

  if (api && !api.error) {
    row.Registered = api.registered ? 'Yes' : 'No';
    row.Name = api.name || '';
    row.Address = api.address || '';
    row.Country = api.country || cc;
    delayMs = Math.max(RATE_MS, delayMs > RATE_MS ? delayMs - 500 : delayMs);
  } else if (api && api.error) {
    row.Error = api.error;
    if (isTransientError(api)) delayMs = Math.min(delayMs * 2, 5000);
  }

  results.push({ json: row });
}

return results;
`;

// ─── Code Node 2: Generate Suggestions ──────────────────────

const generateSuggestionsCode = `
const cross = (v) => (v >= 10 ? Math.floor(v / 10) + (v % 10) : v);
const sanitize = (s) => s.replace(/[\\s\\-._,/\\\\]+/g, '');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Re-include checksum functions (needed for candidate generation)
function formatFail(error) { return { formatValid: false, valid: false, error }; }
function checksumPass()     { return { formatValid: true,  valid: true }; }
function checksumFail()     { return { formatValid: true,  valid: false }; }
function formatOnlyPass()   { return { formatValid: true,  valid: true, formatOnly: true }; }

// Checksum validators (same as validation node)
const V = {
  AT(num) {
    const n = num.startsWith('U') ? num.slice(1) : num;
    if (!/^\\d{8}$/.test(n)) return formatFail('err');
    const d = n.split('').map(Number);
    const s = d[0]+cross(d[1]*2)+d[2]+cross(d[3]*2)+d[4]+cross(d[5]*2)+d[6];
    return (96-s)%10===d[7]?checksumPass():checksumFail();
  },
  BE(num) { if(!/^[01]\\d{9}$/.test(num))return formatFail('err'); return 97-(parseInt(num.slice(0,8))%97)===parseInt(num.slice(8))?checksumPass():checksumFail(); },
  BG(num) {
    if(!/^\\d{9,10}$/.test(num))return formatFail('err');
    const d=num.split('').map(Number);
    if(d.length===9){let s=[1,2,3,4,5,6,7,8].reduce((a,w,i)=>a+d[i]*w,0);let r=s%11;if(r===10){s=[3,4,5,6,7,8,9,10].reduce((a,w,i)=>a+d[i]*w,0);r=s%11;if(r===10)r=0;}return r===d[8]?checksumPass():checksumFail();}
    return formatOnlyPass();
  },
  CY(num) { if(!/^[0-59]\\d{7}[A-Z]$/.test(num))return formatFail('err'); if(num.startsWith('12'))return checksumFail(); const lookup=[1,0,5,7,9,13,15,17,19,21]; let s=0; for(let i=0;i<8;i++)s+=i%2===0?lookup[Number(num[i])]:Number(num[i]); return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[s%26]===num[8]?checksumPass():checksumFail(); },
  CZ(num) {
    if(!/^\\d{8,10}$/.test(num))return formatFail('err');
    const d=num.split('').map(Number);
    if(num.length===8){if(d[0]===9)return checksumFail();const a1=[8,7,6,5,4,3,2].reduce((s,w,i)=>s+d[i]*w,0);const a2=a1%11===0?a1+11:Math.ceil(a1/11)*11;return(a2-a1)%10===d[7]?checksumPass():checksumFail();}
    if(num.length===10){return parseInt(num)%11===0?checksumPass():checksumFail();}
    return formatOnlyPass();
  },
  DE(num) { if(!/^\\d{9}$/.test(num))return formatFail('err'); const d=num.split('').map(Number); if(d[0]===0)return checksumFail(); let p=10; for(let i=0;i<8;i++){let s=(d[i]+p)%10;if(s===0)s=10;p=(s*2)%11;} return(11-p)%10===d[8]?checksumPass():checksumFail(); },
  DK(num) { if(!/^\\d{8}$/.test(num))return formatFail('err'); const d=num.split('').map(Number); if(d[0]===0)return checksumFail(); return[2,7,6,5,4,3,2,1].reduce((s,w,i)=>s+d[i]*w,0)%11===0?checksumPass():checksumFail(); },
  EE(num) { if(!/^10\\d{7}$/.test(num))return formatFail('err'); const d=num.split('').map(Number); const s=[3,7,1,3,7,1,3,7].reduce((a,w,i)=>a+d[i]*w,0); let c=10-(s%10);if(c===10)c=0; return c===d[8]?checksumPass():checksumFail(); },
  EL(num) { if(!/^\\d{9}$/.test(num))return formatFail('err'); const d=num.split('').map(Number); return([256,128,64,32,16,8,4,2].reduce((s,w,i)=>s+d[i]*w,0)%11)%10===d[8]?checksumPass():checksumFail(); },
  ES(num) {
    if(!/^[A-Z0-9]\\d{7}[A-Z0-9]$/.test(num))return formatFail('err');
    const first=num[0],last=num[8],mid=num.slice(1,8),dniL='TRWAGMYFPDXBNJZSQVHLCKE';
    if(/^\\d$/.test(first))return last===dniL[parseInt(first+mid)%23]?checksumPass():checksumFail();
    if('XYZ'.includes(first)){const p={X:'0',Y:'1',Z:'2'};return last===dniL[parseInt(p[first]+mid)%23]?checksumPass():checksumFail();}
    if(/^[A-HJ-NP-SUVW]$/.test(first)){const d=mid.split('').map(Number);let so=0,se=0;for(let i=0;i<7;i++){if(i%2===0)so+=cross(d[i]*2);else se+=d[i];}let c=10-((so+se)%10);if(c===10)c=0;return last===String(c)||last==='JABCDEFGHI'[c]?checksumPass():checksumFail();}
    return formatOnlyPass();
  },
  FI(num) { if(!/^\\d{8}$/.test(num))return formatFail('err'); const d=num.split('').map(Number); const s=[7,9,10,5,8,4,2].reduce((a,w,i)=>a+d[i]*w,0); const r=s%11; if(r===1)return checksumFail(); return(r===0?0:11-r)===d[7]?checksumPass():checksumFail(); },
  FR(num) { if(!/^[0-9A-HJ-NP-Z]{2}\\d{9}$/.test(num))return formatFail('err'); const k=num.slice(0,2),s=num.slice(2); if(/^\\d{2}$/.test(k))return parseInt(k)===(parseInt(s)*100+12)%97?checksumPass():checksumFail(); return formatOnlyPass(); },
  HR(num) { if(!/^\\d{11}$/.test(num))return formatFail('err'); const d=num.split('').map(Number); let p=10; for(let i=0;i<10;i++){let s=(d[i]+p)%10;if(s===0)s=10;p=(s*2)%11;} return(p+d[10])%10===1?checksumPass():checksumFail(); },
  HU(num) { if(!/^\\d{8}$/.test(num))return formatFail('err'); const d=num.split('').map(Number); const r=[9,7,3,1,9,7,3].reduce((s,w,i)=>s+d[i]*w,0); const c=r%10===0?0:10-(r%10); return c===d[7]?checksumPass():checksumFail(); },
  IE(num) {
    const ck='WABCDEFGHIJKLMNOPQRSTUV',sl='WABCDEFGHI';
    if(/^\\d{7}[A-W]([A-IW])?$/.test(num)){const d=num.slice(0,7).split('').map(Number);const c9=num[8]?sl.indexOf(num[8]):0;const r=(9*c9+8*d[0]+7*d[1]+6*d[2]+5*d[3]+4*d[4]+3*d[5]+2*d[6])%23;return num[7]===ck[r]?checksumPass():checksumFail();}
    return formatFail('err');
  },
  IT(num) { if(!/^\\d{11}$/.test(num))return formatFail('err'); const d=num.split('').map(Number); if(num.slice(0,7)==='0000000')return checksumFail(); const p=parseInt(num.slice(7,10)); if(p===0||(p>201&&p!==888&&p!==999))return checksumFail(); let s=0; for(let i=0;i<10;i++)s+=i%2===0?d[i]:cross(d[i]*2); return d[10]===(10-(s%10))%10?checksumPass():checksumFail(); },
  LT(num) { if(!/^\\d{9}$/.test(num)&&!/^\\d{12}$/.test(num))return formatFail('err'); if(num[num.length-2]!=='1')return formatFail('err'); const d=num.split('').map(Number);const n=d.length; const w1=n===9?[1,2,3,4,5,6,7,8]:[1,2,3,4,5,6,7,8,9,1,2]; const w2=n===9?[3,4,5,6,7,8,9,1]:[3,4,5,6,7,8,9,1,2,3,4]; const r1=w1.reduce((s,w,i)=>s+d[i]*w,0)%11; if(r1%10!==0)return r1===d[n-1]?checksumPass():checksumFail(); const r2=w2.reduce((s,w,i)=>s+d[i]*w,0)%11; return(r2===10?0:r2)===d[n-1]?checksumPass():checksumFail(); },
  LU(num) { if(!/^\\d{8}$/.test(num))return formatFail('err'); return parseInt(num.slice(0,6))%89===parseInt(num.slice(6))?checksumPass():checksumFail(); },
  LV(num) { if(!/^\\d{11}$/.test(num))return formatFail('err'); const d=num.split('').map(Number); if(d[0]>3){const w=[9,1,4,8,3,10,2,5,7,6];const r=3-w.reduce((s,w,i)=>s+d[i]*w,0)%11;if(r===-1)return checksumFail();return d[10]===(r<-1?r+11:r)?checksumPass():checksumFail();} return formatOnlyPass(); },
  MT(num) { if(!/^[1-9]\\d{7}$/.test(num))return formatFail('err'); const d=num.split('').map(Number); return 37-([3,4,6,7,8,9].reduce((s,w,i)=>s+d[i]*w,0)%37)===d[6]*10+d[7]?checksumPass():checksumFail(); },
  NL(num) { if(!/^\\d{9}B\\d{2}$/.test(num))return formatFail('err'); const n=(num+'NL').replace(/[A-Z]/g,c=>(c.charCodeAt(0)-55).toString()); return BigInt(n)%97n===1n?checksumPass():checksumFail(); },
  PL(num) { if(!/^\\d{10}$/.test(num))return formatFail('err'); const d=num.split('').map(Number); const s=[6,5,7,2,3,4,5,6,7].reduce((a,w,i)=>a+d[i]*w,0); const r=s%11; return r!==10&&r===d[9]?checksumPass():checksumFail(); },
  PT(num) { if(!/^\\d{9}$/.test(num))return formatFail('err'); const d=num.split('').map(Number); if(d[0]===0)return checksumFail(); return(11-[9,8,7,6,5,4,3,2].reduce((s,w,i)=>s+d[i]*w,0)%11)%11%10===d[8]?checksumPass():checksumFail(); },
  RO(num) { if(!/^[1-9]\\d{1,9}$/.test(num))return formatFail('err'); const idx=10-num.length; const w=[7,5,3,2,1,7,5,3,2].slice(idx); const d=num.split('').map(Number); let c=(w.reduce((s,w,i)=>s+d[i]*w,0)*10)%11; if(c===10)c=0; return c===d[d.length-1]?checksumPass():checksumFail(); },
  SE(num) { if(!/^\\d{12}$/.test(num))return formatFail('err'); if(num.slice(10)!=='01')return formatFail('err'); const d=num.slice(0,10).split('').map(Number); let s=0; for(let i=0;i<10;i++){const v=d[i]*(i%2===0?2:1);s+=v>9?v-9:v;} return s%10===0?checksumPass():checksumFail(); },
  SI(num) { if(!/^[1-9]\\d{7}$/.test(num))return formatFail('err'); const d=num.split('').map(Number); const r=11-[8,7,6,5,4,3,2].reduce((s,w,i)=>s+d[i]*w,0)%11; if(r===11)return checksumFail(); return(r===10&&d[7]===0)||d[7]===r?checksumPass():checksumFail(); },
  SK(num) { if(!/^[1-9]\\d[2346-9]\\d{7}$/.test(num))return formatFail('err'); return BigInt(num)%11n===0n?checksumPass():checksumFail(); },
  XI(num) { return V.GB(num); },
  GB(num) {
    if(/^GD\\d{3}$/.test(num))return parseInt(num.slice(2))<500?checksumPass():checksumFail();
    if(/^HA\\d{3}$/.test(num))return parseInt(num.slice(2))>=500?checksumPass():checksumFail();
    if(/^\\d{12}$/.test(num))return V.GB(num.slice(0,9));
    if(!/^\\d{9}$/.test(num))return formatFail('err');
    const d=num.split('').map(Number),no=parseInt(num.slice(0,7));
    if(no===0||(no>=100000&&no<=999999)||(no>=9490001&&no<=9700000)||no>=9990001)return checksumFail();
    const w=d[0]*8+d[1]*7+d[2]*6+d[3]*5+d[4]*4+d[5]*3+d[6]*2,cd=d[7]*10+d[8];
    return cd===(97-(w%97))%97||(no>1000000&&cd===(97-((w+55)%97))%97)?checksumPass():checksumFail();
  },
};

function runChecksum(cc, num) {
  const v = V[cc];
  return v ? v(num) : { formatValid: false, valid: false, error: 'Unknown' };
}

// ─── Suggestion generation ───────────────────────────────────

function suggestCorrections(cc, num) {
  const candidates = [];
  const chars = num.split('');
  for (let pos = 0; pos < chars.length; pos++) {
    const orig = chars[pos];
    const isLetter = /[A-Z]/.test(orig);
    const options = isLetter ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('') : '0123456789'.split('');
    for (const rep of options) {
      if (rep === orig) continue;
      chars[pos] = rep;
      const r = runChecksum(cc, chars.join(''));
      if (r.valid) candidates.push({ number: chars.join(''), label: cc + chars.join(''), type: 'substitution' });
    }
    chars[pos] = orig;
  }
  for (let pos = 0; pos < chars.length - 1; pos++) {
    if (chars[pos] === chars[pos + 1]) continue;
    [chars[pos], chars[pos+1]] = [chars[pos+1], chars[pos]];
    const r = runChecksum(cc, chars.join(''));
    if (r.valid) {
      const existing = candidates.find(c => c.number === chars.join(''));
      if (!existing) candidates.push({ number: chars.join(''), label: cc + chars.join(''), type: 'transposition' });
    }
    [chars[pos], chars[pos+1]] = [chars[pos+1], chars[pos]];
  }
  return candidates;
}

// ─── Process ─────────────────────────────────────────────────

const items = $input.all();
const failures = items.filter(item =>
  item.json.Format === 'Valid' && item.json.Checksum === 'Fail'
);

if (failures.length === 0) {
  return [{ json: { _noSuggestions: true, message: 'No checksum failures found' } }];
}

const suggestions = [];
for (const item of failures) {
  const vat = sanitize(item.json.VAT || '');
  const cc = vat.slice(0, 2).toUpperCase();
  const num = vat.slice(2);
  const candidates = suggestCorrections(cc, num);

  if (candidates.length === 0) {
    suggestions.push({
      json: {
        Carrier: item.json.Carrier || '',
        VAT: item.json.VAT || '',
        Suggestion: '',
        Registered: '',
        Name: 'No corrections found',
        Country: '',
        LLM_Analysis: '',
      }
    });
    continue;
  }

  for (const c of candidates) {
    suggestions.push({
      json: {
        Carrier: item.json.Carrier || '',
        VAT: item.json.VAT || '',
        Suggestion: c.label,
        Registered: '',
        Name: '',
        Country: cc,
        LLM_Analysis: '',
        _needsVerification: true,
        _cc: cc,
        _num: c.number,
      }
    });
  }
}

return suggestions;
`;

// ─── Code Node 3: Verify Suggestions via API ────────────────

const verifySuggestionsCode = `
const VIES_URL = 'https://ec.europa.eu/taxation_customs/vies/services/checkVatService';
const HMRC_BASE = 'https://www.tax.service.gov.uk/check-vat-number';
const RATE_MS = 1200;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function collectCookies(headers, existing) {
  const raw = [];
  if (headers.getSetCookie) raw.push(...headers.getSetCookie());
  else { const sc = headers.get('set-cookie'); if (sc) raw.push(...sc.split(/,(?=[^ ]+=)/)); }
  const prev = existing ? existing.split('; ').filter(Boolean) : [];
  const map = new Map(prev.map(c => [c.split('=')[0], c]));
  for (const h of raw) { const pair = h.split(';')[0].trim(); map.set(pair.split('=')[0], pair); }
  return [...map.values()].join('; ');
}

async function queryVIES(cc, num) {
  const soap = '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:ec.europa.eu:taxud:vies:services:checkVat:types"><soapenv:Header/><soapenv:Body><urn:checkVat><urn:countryCode>'+cc+'</urn:countryCode><urn:vatNumber>'+num+'</urn:vatNumber></urn:checkVat></soapenv:Body></soapenv:Envelope>';
  try {
    const res = await fetch(VIES_URL, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' }, body: soap });
    const xml = await res.text();
    const fault = xml.match(/<faultstring>([\\s\\S]*?)<\\/faultstring>/);
    if (fault) return { error: fault[1].trim() };
    const tag = (n) => { const m = xml.match(new RegExp('<ns2:'+n+'>([\\\\s\\\\S]*?)</ns2:'+n+'>')); return m ? m[1].trim() : null; };
    return { registered: tag('valid') === 'true', name: tag('name') || 'N/A', country: cc };
  } catch (e) { return { error: e.message }; }
}

async function queryHMRC(num) {
  try {
    const formUrl = HMRC_BASE + '/enter-vat-details';
    const getRes = await fetch(formUrl, { redirect: 'follow' });
    const html = await getRes.text();
    let cookies = collectCookies(getRes.headers, '');
    const csrf = html.match(/name="csrfToken"\\s+value="([^"]+)"/);
    if (!csrf) throw new Error('CSRF not found');
    await sleep(RATE_MS);
    const postRes = await fetch(formUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookies, Referer: formUrl },
      body: 'csrfToken='+encodeURIComponent(csrf[1])+'&target='+encodeURIComponent(num),
      redirect: 'manual',
    });
    cookies = collectCookies(postRes.headers, cookies);
    let resultHtml;
    if (postRes.status >= 300 && postRes.status < 400) {
      const loc = postRes.headers.get('location');
      const url = loc.startsWith('http') ? loc : HMRC_BASE + loc.replace('/check-vat-number', '');
      await sleep(300);
      resultHtml = await (await fetch(url, { headers: { Cookie: cookies }, redirect: 'follow' })).text();
    } else { resultHtml = await postRes.text(); }
    if (!resultHtml.includes('govuk-panel--confirmation')) return { registered: false, name: '', country: 'GB' };
    let name = 'N/A';
    const nm = resultHtml.match(/Registered business name<\\/h3>\\s*<p[^>]*>([\\s\\S]*?)<\\/p>/i);
    if (nm) name = nm[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
    return { registered: true, name, country: 'GB' };
  } catch (e) { return { error: e.message }; }
}

const TRANSIENT_ERRORS = ['MS_MAX_CONCURRENT_REQ', 'MS_UNAVAILABLE', 'TIMEOUT', 'SERVICE_UNAVAILABLE'];
function isTransientError(r) {
  return r && r.error && TRANSIENT_ERRORS.some(e => r.error.includes(e));
}

const items = $input.all();
const results = [];
let delayMs = RATE_MS;

for (const item of items) {
  if (!item.json._needsVerification) {
    const { _needsVerification, _cc, _num, ...clean } = item.json;
    results.push({ json: clean });
    continue;
  }
  const cc = item.json._cc;
  const num = item.json._num;
  const isUK = cc === 'GB' || cc === 'XI';
  await sleep(delayMs);

  let api;
  for (let attempt = 1; attempt <= 3; attempt++) {
    api = isUK ? await queryHMRC(num) : await queryVIES(cc, num);
    if (!isTransientError(api)) break;
    if (attempt < 3) await sleep(delayMs * Math.pow(2, attempt));
  }

  const { _needsVerification, _cc: _, _num: __, ...clean } = item.json;
  if (api && !api.error && api.registered) {
    clean.Registered = 'Yes';
    clean.Name = api.name || '';
    clean.Country = api.country || cc;
    results.push({ json: clean });
    delayMs = Math.max(RATE_MS, delayMs > RATE_MS ? delayMs - 500 : delayMs);
  } else if (api && api.error) {
    clean.Registered = '';
    clean.Name = 'API error: ' + api.error;
    results.push({ json: clean });
    if (isTransientError(api)) delayMs = Math.min(delayMs * 2, 5000);
  }
}

return results.length > 0 ? results : [{ json: { _noSuggestions: true, message: 'No verified suggestions found' } }];
`;

// ─── Code Node 4: Format for LLM ────────────────────────────

const formatForLlmCode = `
const items = $input.all();
if (items.length === 1 && items[0].json._noSuggestions) {
  return items;
}

const grouped = {};
for (const item of items) {
  const vat = item.json.VAT || 'unknown';
  if (!grouped[vat]) grouped[vat] = { carrier: item.json.Carrier, vat, suggestions: [] };
  grouped[vat].suggestions.push({
    suggestion: item.json.Suggestion,
    registered: item.json.Registered,
    name: item.json.Name,
    country: item.json.Country,
  });
}

const entries = Object.values(grouped).map(g => {
  const verified = g.suggestions.filter(s => s.registered === 'Yes');
  const unverified = g.suggestions.filter(s => s.registered !== 'Yes' && s.suggestion);
  const lines = [];
  lines.push('CARRIER: ' + g.carrier);
  lines.push('ORIGINAL VAT (FAILED): ' + g.vat);
  lines.push('VERIFIED MATCHES (' + verified.length + '):');
  if (verified.length > 0) {
    verified.forEach(s => lines.push('  ' + s.suggestion + ' → registered as "' + s.name + '" in ' + s.country));
  } else {
    lines.push('  (none)');
  }
  if (unverified.length > 0) {
    lines.push('CHECKSUM-VALID BUT NOT REGISTERED (' + unverified.length + '):');
    unverified.forEach(s => lines.push('  ' + s.suggestion));
  }
  const orig = g.vat.replace(/^[A-Z]{2}/, '');
  verified.forEach(s => {
    const corrected = s.suggestion.replace(/^[A-Z]{2}/, '');
    let diffs = 0;
    const diffPositions = [];
    for (let i = 0; i < Math.max(orig.length, corrected.length); i++) {
      if (orig[i] !== corrected[i]) { diffs++; diffPositions.push(i + 1); }
    }
    lines.push('DIFF: ' + orig + ' → ' + corrected + ' (' + diffs + ' digit(s) changed at position ' + diffPositions.join(',') + ')');
  });
  return lines.join('\\n');
}).join('\\n\\n===\\n\\n');

return [{
  json: {
    chatInput: entries,
    _allSuggestions: items.map(i => i.json),
  }
}];
`;

// ─── Code Node 5: Merge LLM output back ─────────────────────

const mergeLlmOutputCode = `
const items = $input.all();
const llmResponse = items[0].json.output || items[0].json.text || '';
const allSuggestions = items[0].json._allSuggestions || [];

if (allSuggestions.length === 0) {
  return [{ json: { _noSuggestions: true } }];
}

return allSuggestions.map(s => ({
  json: {
    Carrier: s.Carrier || '',
    VAT: s.VAT || '',
    Suggestion: s.Suggestion || '',
    Registered: s.Registered || '',
    Name: s.Name || '',
    Country: s.Country || '',
    LLM_Analysis: llmResponse,
  }
}));
`;

// ═══════════════════════════════════════════════════════════════
// Workflow JSON structure
// ═══════════════════════════════════════════════════════════════

const now = new Date();
const datestamp = now.toISOString().slice(0, 10);

const workflow = {
  _generated: now.toISOString(),
  name: "VAT Checker — Google Sheets",
  nodes: [
    // 1. Form Trigger — user pastes the spreadsheet URL
    {
      id: "trigger-001",
      name: "Submit Spreadsheet",
      type: "n8n-nodes-base.formTrigger",
      typeVersion: 2.2,
      position: [200, 340],
      parameters: {
        formTitle: "VAT Checker",
        formDescription: "Paste the URL of your Google Sheet. It must have a sheet named \"VAT Input\" with Carrier and VAT columns, and a sheet named \"Suggestions\".",
        formFields: {
          values: [
            {
              fieldLabel: "Spreadsheet URL",
              fieldType: "text",
              requiredField: true,
              placeholder: "https://docs.google.com/spreadsheets/d/.../edit",
            },
          ],
        },
        options: {},
      },
      webhookId: "vat-checker-form",
    },

    // 2. Extract spreadsheet ID from URL
    {
      id: "code-extract-id-001",
      name: "Extract Sheet ID",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [420, 340],
      parameters: {
        mode: "runOnceForAllItems",
        jsCode: "const url = $input.first().json['Spreadsheet URL'] || $input.first().json.spreadsheet_url || '';\nconst match = url.match(/\\/spreadsheets\\/d\\/([a-zA-Z0-9-_]+)/);\nconst spreadsheetId = match ? match[1] : url.trim();\nreturn [{ json: { spreadsheetId } }];\n",
      },
    },

    // 3. Read from Google Sheets
    {
      id: "sheets-read-001",
      name: "Read VAT Input",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [660, 340],
      parameters: {
        operation: "read",
        documentId: {
          __rl: true,
          value: "={{ $('Extract Sheet ID').item.json.spreadsheetId }}",
          mode: "id",
        },
        sheetName: {
          __rl: true,
          value: "gid=0",
          mode: "list",
          cachedResultName: "VAT Input",
        },
        options: {},
      },
      credentials: {
        googleSheetsOAuth2Api: {
          id: "YOUR_CREDENTIAL_ID",
          name: "Google Sheets account",
        },
      },
    },

    // 4. Validate all VAT numbers
    {
      id: "code-validate-001",
      name: "Validate VAT Numbers",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [900, 340],
      parameters: {
        mode: "runOnceForAllItems",
        jsCode: validateAllCode,
      },
    },

    // 5. Update Sheet1 with results
    {
      id: "sheets-update-001",
      name: "Update Results",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [1140, 340],
      parameters: {
        operation: "appendOrUpdate",
        documentId: {
          __rl: true,
          value: "={{ $('Extract Sheet ID').item.json.spreadsheetId }}",
          mode: "id",
        },
        sheetName: {
          __rl: true,
          value: "gid=0",
          mode: "list",
          cachedResultName: "VAT Input",
        },
        columns: {
          mappingMode: "autoMapInputData",
          value: {},
          matchingColumns: ["VAT"],
        },
        options: {},
      },
      credentials: {
        googleSheetsOAuth2Api: {
          id: "YOUR_CREDENTIAL_ID",
          name: "Google Sheets account",
        },
      },
    },

    // 6. Generate suggestions for failures
    {
      id: "code-suggest-001",
      name: "Generate Suggestions",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1380, 340],
      parameters: {
        mode: "runOnceForAllItems",
        jsCode: generateSuggestionsCode,
      },
    },

    // 7. Check if there are suggestions
    {
      id: "if-suggestions-001",
      name: "Has Suggestions?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [1620, 340],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [
            {
              id: "cond-001",
              leftValue: "={{ $json._noSuggestions }}",
              rightValue: true,
              operator: { type: "boolean", operation: "notTrue" },
            },
          ],
          combinator: "and",
        },
        options: {},
      },
    },

    // 8. Verify suggestions via API
    {
      id: "code-verify-001",
      name: "Verify Suggestions",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [1860, 340],
      parameters: {
        mode: "runOnceForAllItems",
        jsCode: verifySuggestionsCode,
      },
    },

    // 9. Format data for LLM
    {
      id: "code-format-llm-001",
      name: "Format for LLM",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [2100, 340],
      parameters: {
        mode: "runOnceForAllItems",
        jsCode: formatForLlmCode,
      },
    },

    // 10. Skip LLM check
    {
      id: "if-skip-llm-001",
      name: "Needs LLM?",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [2340, 340],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [
            {
              id: "cond-002",
              leftValue: "={{ $json._noSuggestions }}",
              rightValue: true,
              operator: { type: "boolean", operation: "notTrue" },
            },
          ],
          combinator: "and",
        },
        options: {},
      },
    },

    // 11. AI Agent for analysis
    {
      id: "agent-001",
      name: "AI Agent",
      type: "@n8n/n8n-nodes-langchain.agent",
      typeVersion: 3.1,
      position: [2580, 340],
      parameters: {
        promptType: "define",
        text: "={{ $json.chatInput }}",
        options: {
          systemMessage: [
            "You are a VAT compliance analyst. You receive EU/UK VAT numbers that failed checksum validation, alongside correction suggestions that were verified against government registries (VIES for EU, HMRC for UK).",
            "",
            "For each carrier entry you receive:",
            "- The original failed VAT number",
            "- Verified suggestions: corrections that passed checksum AND are confirmed registered businesses",
            "- The exact digit differences between original and each suggestion",
            "",
            "Your task: determine which suggestion is the most confident correction.",
            "",
            "CONFIDENCE RULES:",
            "- HIGH: Exactly one verified suggestion, OR the registered business name closely matches the carrier name, OR only a single digit differs",
            "- MEDIUM: Multiple verified suggestions but one has a name matching the carrier, or only adjacent digits were swapped (transposition)",
            "- LOW: Multiple suggestions with no clear match, or the business name is completely unrelated to the carrier",
            "- NONE: No verified suggestions exist",
            "",
            "ERROR CLASSIFICATION:",
            "- Typo: single character was substituted (e.g. position 5: '3' → '8')",
            "- Transposition: two adjacent characters were swapped",
            "- Multiple errors: more than one digit differs",
            "",
            "OUTPUT FORMAT (one block per carrier):",
            "```",
            "Carrier: [name]",
            "Original: [failed VAT]",
            "Best match: [suggestion] → [registered name]",
            "Confidence: [HIGH/MEDIUM/LOW/NONE]",
            "Error type: [Typo/Transposition/Multiple errors]",
            "Action: [Update to X / Verify with carrier / Contact carrier]",
            "```",
            "",
            "Rules:",
            "- If a registered business name contains the carrier name (or vice versa), boost confidence",
            "- If only one suggestion is verified as registered, it is almost certainly correct — mark HIGH",
            "- Single-digit errors at the end of the number are more likely typos than at the start",
            "- Be concise. No preamble. No VAT rule explanations. Only the structured output.",
          ].join("\n"),
        },
      },
    },

    // 12. Trimble Model Gateway
    {
      id: "llm-model-001",
      name: "Trimble Model Gateway",
      type: "CUSTOM.lmChatTrimbleGateway",
      typeVersion: 1,
      position: [2600, 560],
      parameters: {
        model: {
          __rl: true,
          mode: "list",
          value: "gemini-2.5-flash-lite",
        },
        options: {},
      },
    },

    // 13. Merge LLM output with suggestions
    {
      id: "code-merge-llm-001",
      name: "Merge LLM Output",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [2820, 340],
      parameters: {
        mode: "runOnceForAllItems",
        jsCode: mergeLlmOutputCode,
      },
    },

    // 14. Save suggestions to Sheet2
    {
      id: "sheets-append-001",
      name: "Save Suggestions",
      type: "n8n-nodes-base.googleSheets",
      typeVersion: 4.5,
      position: [3060, 340],
      parameters: {
        operation: "append",
        documentId: {
          __rl: true,
          value: "={{ $('Extract Sheet ID').item.json.spreadsheetId }}",
          mode: "id",
        },
        sheetName: {
          __rl: true,
          value: "Suggestions",
          mode: "list",
          cachedResultName: "Suggestions",
        },
        columns: {
          mappingMode: "autoMapInputData",
          value: {},
        },
        options: {},
      },
      credentials: {
        googleSheetsOAuth2Api: {
          id: "YOUR_CREDENTIAL_ID",
          name: "Google Sheets account",
        },
      },
    },

    // 15. Sticky note — setup instructions
    {
      id: "sticky-setup-001",
      name: "Setup Instructions",
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [140, 60],
      parameters: {
        content:
          "## VAT Checker — Setup\n\n" +
          "### How it works\n" +
          "1. User opens the form and pastes a Google Sheet URL\n" +
          "2. The spreadsheet ID is extracted automatically\n" +
          "3. All Google Sheets nodes use that ID dynamically\n\n" +
          "### Google Sheet structure\n" +
          "**Sheet 1 — \"VAT Input\"**\n" +
          "| Carrier | VAT | Format | Checksum | Registered | Name | Address | Country | Error |\n\n" +
          "**Sheet 2 — \"Suggestions\"**\n" +
          "| Carrier | VAT | Suggestion | Registered | Name | Country | LLM_Analysis |\n\n" +
          "### Setup\n" +
          "1. Connect your Google Sheets credentials (all 3 Sheets nodes)\n" +
          "2. Trimble Model Gateway uses gemini-2.5-flash-lite (pre-configured)\n" +
          "3. Activate the workflow — this enables the form URL\n" +
          "4. Users open the form, paste the spreadsheet URL, and submit\n\n" +
          "### If Code nodes fail with fetch errors\n" +
          "Ask your n8n admin to add this env var:\n" +
          "`NODE_FUNCTION_ALLOW_BUILTIN=*`",
        width: 480,
        height: 480,
        color: 4,
      },
    },
  ],

  connections: {
    "Submit Spreadsheet": {
      main: [[{ node: "Extract Sheet ID", type: "main", index: 0 }]],
    },
    "Extract Sheet ID": {
      main: [[{ node: "Read VAT Input", type: "main", index: 0 }]],
    },
    "Read VAT Input": {
      main: [[{ node: "Validate VAT Numbers", type: "main", index: 0 }]],
    },
    "Validate VAT Numbers": {
      main: [[{ node: "Update Results", type: "main", index: 0 }]],
    },
    "Update Results": {
      main: [[{ node: "Generate Suggestions", type: "main", index: 0 }]],
    },
    "Generate Suggestions": {
      main: [[{ node: "Has Suggestions?", type: "main", index: 0 }]],
    },
    "Has Suggestions?": {
      main: [
        [{ node: "Verify Suggestions", type: "main", index: 0 }],
        [],
      ],
    },
    "Verify Suggestions": {
      main: [[{ node: "Format for LLM", type: "main", index: 0 }]],
    },
    "Format for LLM": {
      main: [[{ node: "Needs LLM?", type: "main", index: 0 }]],
    },
    "Needs LLM?": {
      main: [
        [{ node: "AI Agent", type: "main", index: 0 }],
        [{ node: "Save Suggestions", type: "main", index: 0 }],
      ],
    },
    "AI Agent": {
      main: [[{ node: "Merge LLM Output", type: "main", index: 0 }]],
    },
    "Trimble Model Gateway": {
      ai_languageModel: [
        [{ node: "AI Agent", type: "ai_languageModel", index: 0 }],
      ],
    },
    "Merge LLM Output": {
      main: [[{ node: "Save Suggestions", type: "main", index: 0 }]],
    },
  },

  pinData: {},
  settings: {
    executionOrder: "v1",
    saveManualExecutions: true,
    callerPolicy: "workflowsFromSameOwner",
    executionTimeout: 600,
  },
  staticData: null,
  active: false,
  meta: {
    templateCredsSetupCompleted: false,
  },
  tags: [],
};

// ─── Write output ────────────────────────────────────────────

const outputDir = "workflows";
mkdirSync(outputDir, { recursive: true });
const outputPath = join(outputDir, `${datestamp}_n8n-vat-checker-workflow.json`);
writeFileSync(outputPath, JSON.stringify(workflow, null, 2), "utf-8");
console.log(`\n  ✔ Workflow JSON written to ${outputPath}`);
console.log(`  Import it into n8n: Workflows → Import from File\n`);
console.log(`  Before running, configure:`);
console.log(`    1. Google Sheets credentials + spreadsheet ID`);
console.log(`    2. LLM credentials (Model Agent Gateway node)`);
console.log(`    3. Sheet column headers (see sticky note in workflow)\n`);
