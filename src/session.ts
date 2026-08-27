import puppeteer, { Browser, Page } from "puppeteer";

import { ask } from "./utils";

export interface AuthOptions {
  addonUrl?: string;
  username?: string;
  password?: string;
  headful?: boolean;
  slowMo?: number;
}

export interface Addon {
  lang: string;
  addonId: string;
  addonName: string;
}

export interface Session {
  browser: Browser;
  page: Page;
  addon: Addon;
  releasesUrl: string;
}

export function parseAddonURL(url: string) {
  // ensure addon URL ends with a slash.
  if (!url.endsWith("/")) url += "/";

  const pattern = /\/([a-z]+)\/make-games\/addons\/([0-9]+)\/([^\s/]+)\//;

  const match = url.match(pattern);
  if (match) {
    const [, lang, addonId, addonName] = match;
    return { lang, addonId, addonName };
  }

  return null;
}

export function releasesUrlFor(addon: Addon) {
  return `https://www.construct.net/${addon.lang}/make-games/addons/${addon.addonId}/${addon.addonName}/edit/releases`;
}

/**
 * Log in and land on an addon's releases page.
 *
 * Shared by publishing and by reading the release list, so there is one copy of
 * the login and one copy of the "did that actually work" checks.
 */
export async function openSession(options: AuthOptions = {}): Promise<Session> {
  const addonUrl =
    options.addonUrl ||
    process.env.ADDON_URL ||
    (await ask("Addon URL: (https://www.construct.net/en/make-games/addons/1057/testing-auto-release)"));
  const username = options.username || process.env.USERNAME || (await ask("Username:"));
  const password = options.password || process.env.PASSWORD || (await ask("Password:", "password"));

  if (!addonUrl) throw new Error(`Please provide an Addon URL (received ${addonUrl})`);
  if (!username) throw new Error(`Please provide an auth user (received ${username})`);
  if (!password) throw new Error(`Please provide an auth password (received ${password})`);

  const headful = options.headful ?? process.env.C3ADDON_HEADFUL === "true";
  const slowMo = options.slowMo ?? Number(process.env.C3ADDON_SLOWMO || 0);

  const browser = await puppeteer.launch({
    headless: !headful,
    slowMo,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();

  // fake user agent
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36"
  );

  // first, login.
  console.log("Logging in...");
  await page.goto("https://www.construct.net/en/login");
  await page.type("#Username", username);
  await page.type("#Password", password);
  await Promise.all([page.waitForNavigation(), page.click("#BtnLogin")]);

  // try to check for auth errors.
  try {
    const authError = await page.$eval("#AuthErrorWrapper", (el) => el.textContent);
    if (authError) {
      console.error("Authentication error:", authError.trim());
      process.exit(1);
    }
  } catch (e) {}

  // parse the addon URL.
  const addon = parseAddonURL(addonUrl);
  if (!addon) {
    throw new Error(
      `Invalid addon URL: ${addonUrl} (expected https://www.construct.net/[LANG]/make-games/addons/[ADDON-ID]/[ADDON-NAME])`
    );
  }

  // navigate to the addon releases page.
  const releasesUrl = releasesUrlFor(addon);
  console.log(`Navigating to addon URL... (${releasesUrl})`);

  const response = await page.goto(releasesUrl, { waitUntil: "domcontentloaded" });
  if (response?.status() !== 200) {
    console.error(`Failed to navigate to ${releasesUrl} (status ${response?.status()})`);
    process.exit(1);
  }

  return { browser, page, addon, releasesUrl };
}
