import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as ZipLib from "zip-lib";

/**
 * The version declared inside a .c3addon package.
 *
 * Construct reads the version out of the uploaded file rather than being told
 * it, which is why a release has no version until something is uploaded. To
 * decide whether a release for this version already exists we have to read the
 * same place it does.
 */
export async function readAddonVersion(file: string): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "c3addon-"));

  try {
    await ZipLib.extract(file, dir);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(dir, "addon.json"), "utf-8")
    );
    return typeof manifest.version === "string" ? manifest.version : "";
  } catch {
    // Not being able to read it is not fatal: it only means we cannot match
    // against what is already there, and fall back to making a new release.
    return "";
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
