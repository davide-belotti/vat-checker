// ─── Constants ───────────────────────────────────────────────

const VIES_URL =
  "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number";

const HMRC_BASE =
  "https://www.tax.service.gov.uk/check-vat-number";

const RATE_LIMIT_MS = 2000;
const VIES_TIMEOUT_MS = 30000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sanitize = (s) => s.replace(/[\s\-._,/\\]+/g, "");

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

// ─── VIES REST query (EU countries) ─────────────────────────

async function queryVIES(countryCode, vatNumber) {
  countryCode = sanitize(countryCode).toUpperCase();
  vatNumber = sanitize(vatNumber);
  await sleep(RATE_LIMIT_MS);

  try {
    const res = await fetch(VIES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countryCode, vatNumber }),
      signal: AbortSignal.timeout(VIES_TIMEOUT_MS),
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

export { queryVIES, queryHMRC, sanitize, isTransientError, sleep, RATE_LIMIT_MS, VIES_TIMEOUT_MS };
