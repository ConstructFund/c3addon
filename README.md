# c3addon

This is a simple script to publish your `.c3addon` to the Construct Addon registry.

## CLI Usage

### Publishing a `.c3addon` file

If you provide a `.c3addon` file, the script will publish it directly. You may also provide a directory, in which case the script will pack the directory into a `.c3addon` file before publishing.

```sh
npx c3addon publish <c3addon-file-or-directory> \
	--username <username> \
	--password <password> \
	--addon-url <addon-url> \
	--release-notes <release-notes>
```

## API Usage

```typescript
import { publish } from "c3addon";

publish({
  addonUrl: "https://www.construct.net/en/make-games/addons/1057/testing-auto-release/",
  filename: "path/to/addon.c3addon",
  username: "your c3 username",
  password: "your c3 password",
  releaseNotes: "This is a release note",
});
```

## License

MIT