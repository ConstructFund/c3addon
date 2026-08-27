import fs from "node:fs";
import { Dialog, Page } from "puppeteer";

import { ask } from './utils';
import { pack } from "./pack";
import { openSession, parseAddonURL } from "./session";
import { readAddonVersion } from "./addonFile";
import { scrapeReleases, planRelease } from "./releases";

// parseAddonURL used to live here; keep it reachable from this module.
export { parseAddonURL };

export interface PublishOptions {
  addonUrl?: string,
  filename?: string,
  username?: string,
  password?: string,
  releaseNotes?: string,
}

/**
 * Put the file on a release that is already open in the browser.
 *
 * Used both for a release just created and for one picked up from the list, as
 * the edit page is the same either way.
 */
/**
 * Take the file off a release that already has one.
 *
 * A release holding a file offers Delete where an empty one offers Upload, so
 * the file cannot simply be replaced. The Delete goes through a native
 * confirm(), and puppeteer blocks on a dialog nobody answers - so the handler
 * has to be attached before the click, not after.
 */
async function removeExistingUpload(page: Page) {
  const deleteButton = await page.$("#DeleteReleaseUpload");
  if (!deleteButton) return;

  console.log("Removing the file already on this release...");

  const accept = (dialog: Dialog) => dialog.accept();
  page.on("dialog", accept);

  try {
    await Promise.all([page.waitForNavigation(), deleteButton.click()]);
  } finally {
    page.off("dialog", accept);
  }
}

async function uploadFile(page: Page, filename: string) {
  await removeExistingUpload(page);

  const uploadButton = await page
    .waitForSelector("#UploadReleaseButton", { timeout: 30000 })
    .catch(() => null);

  if (!uploadButton) throw new Error("failed to find the upload button");
  await uploadButton.click();

  // the dialog holding the file input is only built on click.
  const fileInput = await page.waitForSelector("input[type=file]").catch(() => null);
  if (!fileInput) throw new Error("failed to find file input");

  await fileInput.uploadFile(filename);

  // submit the upload.
  console.info(`Uploading file ${filename}...`);

  try {
    await Promise.all([
      page.waitForNavigation(),
      page.click('.ui-dialog .ui-dialog-buttonset button:last-child')
    ]);

  } catch (e) {
    // try to check for upload errors
    const uploadError = await page.$eval("#AddonReleaseUploadFileControl_MessageLabel", el => el.textContent).catch(() => null);
    if (uploadError && uploadError.trim()) {
      console.error("Error:", uploadError.trim());
      process.exit(1);
    } else {
      throw e;
    }
  }
}

async function updateReleaseNotes(page: Page, releaseNotes: string) {
  console.log("Updating release notes...");
  await page.waitForSelector("#RichContent");

  // The field keeps whatever was there before, so it has to be emptied first
  // or a reused release ends up with two sets of notes run together.
  await page.$eval("#RichContent", (el) => {
    (el as HTMLInputElement | HTMLTextAreaElement).value = "";
  }).catch(() => {});

  // The field caps what it will hold, and typing past it is simply ignored -
  // silently, and only on the site. Say so rather than shipping notes that end
  // mid-sentence.
  const maxLength = await page
    .$eval("#RichContent", (el) => Number(el.getAttribute("maxlength")) || 0)
    .catch(() => 0);

  if (maxLength && releaseNotes.length > maxLength) {
    console.warn(
      `Release notes are ${releaseNotes.length} characters and the field holds ${maxLength}; the rest will be dropped.`
    );
  }

  await page.type("#RichContent", releaseNotes);
  await Promise.all([
    page.waitForNavigation(),
    page.click("#BtnUpdateRelease"),
  ])
}

async function publishRelease(page: Page, releasesUrl: string, version: string) {
  // Waiting for the button rather than going straight to page.click matters:
  // click() is a one-shot query followed by a mouse event at the coordinates
  // it found. Run while the page from the update above is still settling, it
  // can measure the old document and dispatch into the new one, which clicks
  // nothing at all and reports no error. The navigation started alongside it
  // then resolves on the update's own navigation, so the whole step looks like
  // it worked and the release is quietly left unpublished.
  const publishButton = await page.waitForSelector("#BtnPublishRelease", {
    timeout: 30000,
  }).catch(() => null);

  if (!publishButton) {
    console.error("Error: the release was uploaded but the publish button never appeared.");
    console.error(`Finish it by hand at ${page.url()}`);
    process.exit(1);
  }

  await Promise.all([
    page.waitForNavigation(),
    publishButton.click(),
  ]);

  // wait for "This release is now published!" to appear
  const published = await page
    .waitForSelector('.notification.success', { timeout: 10000 })
    .then(() => true)
    .catch(() => false);

  if (published) return;

  // The banner is only a confirmation and its markup is not ours to depend on.
  // The release list is the actual record, so go and read it rather than guess
  // from what the edit page happens to still be showing.
  const editUrl = page.url();

  if (version) {
    await page.goto(releasesUrl, { waitUntil: "domcontentloaded" });
    const ours = (await scrapeReleases(page)).find(
      (r) => r.version === version && !r.isDeleted
    );

    if (ours?.isPublished) {
      console.warn("Published. (The confirmation banner did not appear, so this was read back from the release list.)");
      return;
    }

    console.error(`Error: ${version} is still not published.`);
    console.error(`Finish it by hand at ${editUrl}`);
    process.exit(1);
  }

  // Without a version to look for, the best that is left is whether the page
  // is still offering to publish.
  if (await page.$("#BtnPublishRelease")) {
    console.error("Error: the publish did not take effect - the release is still unpublished.");
    console.error(`Finish it by hand at ${editUrl}`);
    process.exit(1);
  }

  console.warn("Published, but the confirmation banner did not appear.");
}

export async function publish(options: PublishOptions = {}) {
  // if the filename is a directory, pack it first.
  const isDir = fs.lstatSync(options.filename!).isDirectory();
  if (isDir) {
    console.log("Packing directory...");
    const packedFile = await pack(options.filename!);
    options.filename = packedFile;
  }

  const filename = options.filename || process.env.UPLOAD_FILE || await ask("File to upload: (./my-addon.c3addon)");
  const releaseNotes = options.releaseNotes || process.env.RELEASE_NOTES || "Released via c3addon-publish (https://npmjs.com/package/c3addon)";

  if (!filename) throw new Error(`Please provide a file to upload (received ${filename})`);

  const version = await readAddonVersion(filename);
  const { browser, page, releasesUrl } = await openSession(options);

  try {
    const plan = planRelease(await scrapeReleases(page), version);

    if (plan.kind === "already-published") {
      // The file cannot be swapped on a published release, so there is nothing
      // to change and nothing to fix. Leave the notes alone and call it done.
      console.log(`Version ${version} is already published. Nothing to do.`);
      return;
    }

    if (plan.kind === "create") {
      await Promise.all([
        page.waitForNavigation(),
        page.click('#BtnCreateRelease'),
      ]);

    } else {
      const what = plan.kind === "reuse"
        ? `the unpublished release for ${version}`
        : "an empty release that was left behind";
      console.log(`Reusing ${what} (${plan.release.url})`);

      await page.goto(plan.release.url, { waitUntil: "domcontentloaded" });
    }

    await uploadFile(page, filename);
    await updateReleaseNotes(page, releaseNotes);
    await publishRelease(page, releasesUrl, version);

  } finally {
    await browser.close();
  }
}
