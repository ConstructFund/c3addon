import path from "node:path";
import * as ZipLib from "zip-lib";

export async function pack (rootPath: string) {
  const pluginDir = path.resolve(rootPath || ".");
  const addonJson = require(pluginDir + "/addon.json");
  const filename = `${addonJson.id}.c3addon`;
  const outputAddonFile = `${path.resolve(".")}/${filename}`;

  await ZipLib.archiveFolder(pluginDir, outputAddonFile);
  console.log("Packed into:", outputAddonFile);

  return outputAddonFile;
}
