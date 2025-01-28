import fs from "node:fs";
import puppeteer from 'puppeteer';

import { ask } from './utils';
import { pack } from "./pack";

export interface PublishOptions {
  addonUrl?: string,
  filename?: string,
  username?: string,
  password?: string,
  releaseNotes?: string,
}

export async function publish(options: PublishOptions = {}) {
  // if the filename is a directory, pack it first.
  const isDir = fs.lstatSync(options.filename!).isDirectory();
  if (isDir) {
    console.log("Packing directory...");
    const packedFile = await pack(options.filename);
    options.filename = packedFile;
  }

  const addonUrl = options.addonUrl || process.env.ADDON_URL || await ask("Addon URL: (https://www.construct.net/en/make-games/addons/1057/testing-auto-release)");
  const filename = options.filename || process.env.UPLOAD_FILE || await ask("File to upload: (./my-addon.c3addon)");
  const username = options.username || process.env.USERNAME || await ask("Username:");
  const password = options.password || process.env.PASSWORD || await ask("Password:", "password");
  const releaseNotes = options.releaseNotes || process.env.RELEASE_NOTES || "Released via c3addon-publish (https://npmjs.com/package/c3addon)";

  if (!addonUrl) throw new Error(`Please provide an Addon URL (received ${addonUrl})`);
  if (!filename) throw new Error(`Please provide a file to upload (received ${filename})`);
  if (!username) throw new Error(`Please provide an auth user (received ${username})`);
  if (!password) throw new Error(`Please provide an auth password (received ${password})`);

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();

  // fake user agent
  page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36");

  // first, login.
  console.log("Logging in...");
  await page.goto("https://www.construct.net/en/login");
  await page.type("#Username", username);
  await page.type("#Password", password);
  await Promise.all([
    page.waitForNavigation(),
    page.click("#BtnLogin")
  ]);

  await page.waitForNavigation();

  // try to check for auth errors.
  try {
    const authError = await page.$eval("#AuthErrorWrapper", el => el.textContent);
    if (authError) {
      console.error("Authentication error:", authError.trim());
      process.exit(1);
    }
  } catch (e) {}

  // parse the addon URL.
  const addon = parseAddonURL(addonUrl);
  if (!addon) { throw new Error(`Invalid addon URL: ${addonUrl} (expected https://www.construct.net/[LANG]/make-games/addons/[ADDON-ID]/[ADDON-NAME])`); }

  // navigate to the addon releases page.
  const releasesUrl = `https://www.construct.net/${addon.lang}/make-games/addons/${addon.addonId}/${addon.addonName}/edit/releases`;
  console.log(`Navigating to addon URL... (${releasesUrl})`);

  const response = await page.goto(releasesUrl, { waitUntil: 'domcontentloaded' });
  if (response?.status() !== 200) {
    console.error(`Failed to navigate to ${releasesUrl} (status ${response?.status()})`);
    process.exit(1);
  }

  // create a new release.
  await page.click('#BtnCreateRelease');
  await page.waitForNavigation();

  // upload the file.
  await page.click("#UploadReleaseButton");
  const fileInput = await page.$("input[type=file]");
  if (fileInput) {
    await fileInput.uploadFile(filename);
    // submit the upload.
    console.info(`Uploading file ${filename}...`);
    await Promise.all([
      page.waitForNavigation(),
      page.click('.ui-dialog .ui-dialog-buttonset button:last-child')
    ]);
  } else {
    throw new Error("failed to find file input");
  }

  // update the release notes.
  console.log("Updating release notes...");
  await page.type("#RichContent", releaseNotes);
  await Promise.all([
    page.waitForNavigation(),
    page.click("#BtnUpdateRelease"),
  ])

  // publish the release.
  await Promise.all([
    page.waitForNavigation(),
    page.click("#BtnPublishRelease"),
  ]);

  // wait for "This release is now published!" to appear
  await page.waitForSelector('.notification.success', { timeout: 10000 });

  // close the browser!
  await browser.close();
}


export function parseAddonURL(url: string) {
  const pattern = /\/([a-z]+)\/make-games\/addons\/([0-9]+)\/([^\s/]+)\//;

  const match = url.match(pattern);
  if (match) {
    const [, lang, addonId, addonName] = match;
    return { lang, addonId, addonName };
  }

  return null;
}
