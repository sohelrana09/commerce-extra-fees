import { useIms } from "@adobe/aio-commerce-lib-admin-ui/web";
import { useCallback, useMemo } from "react";

import actionUrls from "../config.json";

import type {
  FeeReport,
  FeeRule,
  Lookups,
  PreviewCart,
  PreviewResult,
  ReportGroupBy,
} from "../lib/types.ts";

const PACKAGE = "ExtraFeesAdmin";

export class ApiError extends Error {
  public readonly errors: string[];

  public constructor(message: string, errors: string[] = []) {
    super(message);
    this.name = "ApiError";
    this.errors = errors;
  }
}

/**
 * Calls the app's Admin web actions with the signed-in admin's IMS token. Action URLs come from
 * `config.json`, which the App Builder CLI writes at build and dev time.
 */
export function useFeesApi() {
  const ims = useIms();
  if (ims.error) {
    throw ims.error;
  }
  const { imsToken, imsOrgId } = ims.data;

  const invoke = useCallback(
    async <T>(action: string, payload: object = {}): Promise<T> => {
      const url = (actionUrls as Record<string, string>)[
        `${PACKAGE}/${action}`
      ];
      const response = await fetch(url, {
        body: JSON.stringify(payload),
        headers: {
          authorization: `Bearer ${imsToken}`,
          "Content-Type": "application/json",
          "x-gw-ims-org-id": imsOrgId,
        },
        method: "POST",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new ApiError(
          body?.error ?? `Request failed (${response.status})`,
          body?.errors ?? [],
        );
      }
      return body as T;
    },
    [imsOrgId, imsToken],
  );

  return useMemo(
    () => ({
      deleteRule: (code: string) =>
        invoke<{ deleted: boolean }>("rule-delete", { code }),
      listRules: () =>
        invoke<{ rules: FeeRule[]; examples: FeeRule[] }>("rules-list"),
      lookups: () => invoke<Lookups>("lookups"),
      preview: (cart: PreviewCart, rules?: FeeRule[], selections = {}) =>
        invoke<PreviewResult>("rule-preview", { cart, rules, selections }),
      refreshCatalog: () => invoke<{ removed: number }>("catalog-refresh"),
      report: (request: { from: string; to: string; groupBy: ReportGroupBy }) =>
        invoke<FeeReport>("fee-report", request),
      saveRule: (rule: FeeRule, previousCode?: string) =>
        invoke<{ rule: FeeRule }>("rule-save", { previousCode, rule }),
    }),
    [invoke],
  );
}
