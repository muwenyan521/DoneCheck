import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export function isAllowedRendererNavigation(targetUrl: string, rendererEntryUrl: string): boolean {
  try {
    const target = new URL(targetUrl);
    const entry = new URL(rendererEntryUrl);
    if (entry.protocol === "file:") {
      if (target.protocol !== "file:") return false;
      const rendererRoot = resolve(fileURLToPath(new URL(".", entry)));
      const targetPath = resolve(fileURLToPath(target));
      return targetPath === rendererRoot || targetPath.startsWith(`${rendererRoot}${sep}`);
    }
    if (entry.protocol !== "http:" && entry.protocol !== "https:") return false;
    return target.origin === entry.origin;
  } catch {
    return false;
  }
}
