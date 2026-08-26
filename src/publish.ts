import fs from "node:fs";

import { ask } from './utils';
import { pack } from "./pack";
import { openSession, parseAddonURL } from "./session";

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
    const packedFile = await pack(options.filename!);
    options.filename = packedFile;
  }

  const filename = options.filename || process.env.UPLOAD_FILE || await ask("File to upload: (./my-addon.c3addon)");
  const releaseNotes = options.releaseNotes || process.env.RELEASE_NOTES || "Released via c3addon-publish (https://npmjs.com/package/c3addon)";

  if (!filename) throw new Error(`Please provide a file to upload (received ${filename})`);

  const { browser, page } = await openSession(options);

  // create a new release.
  await Promise.all([
    page.waitForNavigation(),
    page.click('#BtnCreateRelease'),
  ]);

  // upload the file.
  await page.click("#UploadReleaseButton");

  // the dialog holding the file input is only built on click.
  const fileInput = await page.waitForSelector("input[type=file]").catch(() => null);
  if (fileInput) {
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

  } else {
    throw new Error("failed to find file input");
  }

  // update the release notes.
  console.log("Updating release notes...");
  await page.waitForSelector("#RichContent");
  await page.type("#RichContent", releaseNotes);
  await Promise.all([
    page.waitForNavigation(),
    page.click("#BtnUpdateRelease"),
  ])

  // publish the release.
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

  if (!published) {
    const stillOffered = await page.$("#BtnPublishRelease");

    if (stillOffered) {
      console.error("Error: the publish did not take effect - the release is still unpublished.");
      console.error(`Finish it by hand at ${page.url()}`);
      await browser.close();
      process.exit(1);
    }

    console.warn("Published, but the confirmation banner did not appear.");
  }

  // close the browser!
  await browser.close();
}
