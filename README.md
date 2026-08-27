# c3addon

This is a simple script to publish your `.c3addon` to the Construct Addon registry.

See how to configure [GitHub Actions](https://github.com/endel/construct3-addon-release-github-actions/blob/main/.github/workflows/release.yml) to publish your addon automatically.

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

Publishing looks at the releases already on the addon page before adding one.
If that version is already published there is nothing to do; if it is there but
unpublished, that release is finished off rather than a second one being made.
So re-running after a failed publish picks up where it left off.

### Listing releases

```sh
npx c3addon releases \
	--username <username> \
	--password <password> \
	--addon-url <addon-url> \
	[--latest] [--json]
```

`--latest` prints just the highest published version, which is a way to tell
whether publishing is needed at all.

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

### Reading the releases

```typescript
import { getReleases, getLatestRelease } from "c3addon";

const credentials = {
  addonUrl: "https://www.construct.net/en/make-games/addons/1057/testing-auto-release/",
  username: "your c3 username",
  password: "your c3 password",
};

// everything on the addon page
const releases = await getReleases(credentials);

// the highest published version, or null if there is not one yet
const latest = await getLatestRelease(credentials);
```

Both return the rows of the addon's release table, as they read on the page:

```typescript
interface Release {
  id: string;           // the id in the edit URL, e.g. "2071"
  version: string;      // "1.2.0.0", or empty until a file is uploaded
  stability: string;    // "Stable" or "Beta", as the column reads it
  isBeta: boolean;
  filename: string;     // "my-addon-1-2-0-0.c3addon", empty with no file
  size: string;         // "43.58 KB", empty with no file
  publishDate: string;  // "26 Aug, 2026 at 22:35", empty when unpublished
  isPublished: boolean;
  isDeleted: boolean;   // removed releases stay in the table, struck through
  url: string;          // the release's edit page
}
```

A release exists from the moment it is created, before anything is uploaded to
it, so `version`, `filename` and `size` are all empty until then. Construct
reads the version out of the package rather than being told it.

`getLatestRelease` skips releases that are deleted, unpublished, or have no
version yet, and compares versions as numbers, so `1.1.10.0` beats `1.1.9.0`.

## License

MIT
