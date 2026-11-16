/**
 * App-wide settings from the App Management configuration form (businessConfig in
 * app.commerce.config.ts), read at the global scope. Missing or unreadable settings fall back to
 * the defaults, so a fresh install behaves predictably.
 */

export const DEFAULT_SETTINGS = {
  catalogCacheMinutes: 60,
  feesEnabled: true,
};

function toBool(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return fallback;
}

/** Turns stored config entries ([{ name, value }]) into typed settings. */
export function parseSettings(entries = []) {
  const raw = Object.fromEntries(
    entries
      .filter((entry) => entry?.value !== undefined && entry?.value !== null)
      .map((entry) => [entry.name, entry.value]),
  );
  const minutes = Number(raw.catalogCacheMinutes);
  return {
    catalogCacheMinutes:
      Number.isFinite(minutes) && minutes >= 0
        ? minutes
        : DEFAULT_SETTINGS.catalogCacheMinutes,
    feesEnabled: toBool(raw.feesEnabled, DEFAULT_SETTINGS.feesEnabled),
  };
}

export async function loadSettings(logger = console) {
  try {
    const [{ default: appConfig }, libConfig] = await Promise.all([
      import("#app.commerce.config"),
      import("@adobe/aio-commerce-lib-config"),
    ]);
    await libConfig.initialize({ schema: appConfig.businessConfig.schema });
    const result = await libConfig.getConfiguration(
      libConfig.byCodeAndLevel("global", "global"),
    );
    return parseSettings(result?.config);
  } catch (error) {
    logger.warn(`Using default settings: ${error.message}`);
    return { ...DEFAULT_SETTINGS };
  }
}
