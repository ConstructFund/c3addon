import { Page } from "puppeteer";

import { AuthOptions, openSession } from "./session";

export interface Release {
  /** The id in the edit URL, e.g. "2071". */
  id: string;
  /**
   * Empty until a file has been uploaded: the version is read out of the
   * package, so a release created but never filled in has no version yet.
   */
  version: string;
  /** As the column reads it: "Stable", or "Beta" for a beta release. */
  stability: string;
  isBeta: boolean;
  /** Empty when no file has been uploaded, where the page shows "n/a". */
  filename: string;
  /** As shown, e.g. "43.58 KB". Empty when there is no file. */
  size: string;
  /** As shown, e.g. "26 Aug, 2026 at 22:35". Empty when unpublished. */
  publishDate: string;
  /** The page writes "Unpublished" in the date column until it goes out. */
  isPublished: boolean;
  /** A removed release stays in the table, struck through. */
  isDeleted: boolean;
  url: string;
}

/**
 * Read the "Current Releases" table off the releases page.
 *
 * The table is found by the edit links its rows carry rather than by position,
 * so another table appearing on the page does not silently change the answer.
 */
export async function scrapeReleases(page: Page): Promise<Release[]> {
  return page.evaluate(() => {
    const clean = (el: Element | null | undefined) =>
      (el?.textContent ?? "").replace(/\s+/g, " ").trim();

    const rows = Array.from(document.querySelectorAll("table tbody tr")).filter(
      (row) => row.querySelector('a[href*="/edit/releases/"]')
    );

    return rows.map((row) => {
      const cells = Array.from(row.children);
      const link = row.querySelector(
        'a[href*="/edit/releases/"]'
      ) as HTMLAnchorElement;

      const href = link.getAttribute("href") ?? "";
      const id = (href.split("/edit/releases/")[1] ?? "").split(/[/?#]/)[0];

      // "name.c3addon (43.58 KB)" - the size lives in a <strong> after the name.
      const fileCell = clean(cells[2]);
      const size = fileCell.match(/\(([^)]*)\)\s*$/)?.[1] ?? "";
      const filename = fileCell.replace(/\s*\([^)]*\)\s*$/, "").trim();

      const stability = clean(cells[1]);

      // The date column carries the word "Unpublished" rather than being left
      // blank, so an empty check is not enough to tell the two apart.
      const dateCell = clean(cells[3]);
      const isPublished = dateCell !== "" && !/^unpublished$/i.test(dateCell);

      return {
        id,
        version: clean(cells[0]),
        stability,
        isBeta: stability.toLowerCase().includes("beta"),
        filename: /^n\/a$/i.test(filename) ? "" : filename,
        size,
        publishDate: isPublished ? dateCell : "",
        isPublished,
        // Removal is marked on the row, not in any cell.
        isDeleted: row.classList.contains("deletedRelease"),
        url: link.href,
      };
    });
  });
}

/** Newest version first. Four numbers, compared as numbers. */
export function compareVersions(a: string, b: string) {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < 4; ++i) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l !== r) return l - r;
  }
  return 0;
}

/** Every release on the addon's releases page, in the order it lists them. */
export async function getReleases(options: AuthOptions = {}): Promise<Release[]> {
  const { browser, page } = await openSession(options);
  try {
    return await scrapeReleases(page);
  } finally {
    await browser.close();
  }
}

/**
 * The highest published version, ignoring removed releases and ones that were
 * created but never filled in.
 *
 * By version rather than by position or date, so a release published out of
 * order does not become "latest" just by being the most recent thing done.
 */
export async function getLatestRelease(
  options: AuthOptions = {}
): Promise<Release | null> {
  return latestOf(await getReleases(options));
}

export function latestOf(releases: Release[]): Release | null {
  const published = releases.filter(
    (r) => r.isPublished && !r.isDeleted && r.version !== ""
  );
  if (!published.length) return null;

  return published.reduce((best, r) =>
    compareVersions(r.version, best.version) > 0 ? r : best
  );
}

/** One line per release, for the CLI listing. */
export function formatRelease(release: Release) {
  const state = release.isPublished ? release.publishDate : "unpublished";

  return [
    (release.version || "-").padEnd(10),
    (release.isBeta ? "beta" : "stable").padEnd(7),
    (release.isDeleted ? `deleted, ${state}` : state).padEnd(24),
    release.filename || "-",
  ].join("  ");
}
