import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const screenshotRoot = fileURLToPath(
  new URL("../../RhineLabUI-screenshots/", import.meta.url),
);

export function testScreenshotPath(...segments) {
  const output = resolve(screenshotRoot, ...segments);
  const subpath = relative(screenshotRoot, output);
  if (
    !subpath || subpath === ".." ||
    subpath.startsWith(`..${sep}`) || isAbsolute(subpath)
  ) {
    throw new Error("Use a screenshot filename inside RhineLabUI-screenshots.");
  }
  mkdirSync(dirname(output), { recursive: true });
  return output;
}
