import { program } from "commander";
import { pack } from "./pack";
import { publish } from "./publish";
import { getReleases, latestOf, formatRelease } from "./releases";

const pkg = require('../package.json');

program
  .name('c3addon')
  .description("Publish your addon or plugin to Construct 3 Addon Registry.")
  .version(pkg.version);

program.command('pack')
  .argument('<directory>', 'Addon directory pack to upload')
  .action((directory) => {
    pack(directory);
  });

program.command('publish')
  .argument('<filename or directory>', 'Final .c3addon file to upload, or the addon directory pack to upload')
  .option('--addon-url <string>', 'URL of the addon to upload to (e.g. https://www.construct.net/en/make-games/addons/1057/testing-auto-release)')
  .option('--username <string>', 'Username to login with')
  .option('--password <string>', 'Password to login with')
  .option('--release-notes <string>', 'Release notes to include with the upload')
  .action((filename, options) => {
    options.filename = filename;
    publish(options);
  });

program.command('releases')
  .description("List the releases already on an addon's page")
  .option('--addon-url <string>', 'URL of the addon to read (e.g. https://www.construct.net/en/make-games/addons/1057/testing-auto-release)')
  .option('--username <string>', 'Username to login with')
  .option('--password <string>', 'Password to login with')
  .option('--latest', 'Print only the highest published version')
  .option('--json', 'Print the full records as JSON')
  .action(async (options) => {
    const releases = await getReleases(options);

    if (options.latest) {
      const latest = latestOf(releases);
      if (!latest) {
        console.error("No published release found.");
        process.exit(1);
      }
      console.log(options.json ? JSON.stringify(latest, null, 2) : latest.version);
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(releases, null, 2));
      return;
    }

    for (const r of releases) console.log(formatRelease(r));
  });

program.parse();