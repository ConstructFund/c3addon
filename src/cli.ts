import { program } from "commander";
import { pack } from "./pack";
import { publish } from "./publish";

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

program.parse();