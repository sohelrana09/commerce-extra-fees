import { ActionButton } from "@react-spectrum/s2/ActionButton";
import { Content } from "@react-spectrum/s2/Content";
import { Divider } from "@react-spectrum/s2/Divider";
import { Heading } from "@react-spectrum/s2/Heading";
import { InlineAlert } from "@react-spectrum/s2/InlineAlert";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
import { Text } from "@react-spectrum/s2/Text";
import { ToggleButton } from "@react-spectrum/s2/ToggleButton";
import { useCallback, useEffect, useState } from "react";

import { CartPreview } from "../components/cart-preview.tsx";
import { FeeReport } from "../components/fee-report.tsx";
import { RuleEditor } from "../components/rule-editor.tsx";
import { RulesList } from "../components/rules-list.tsx";
import { useFeesApi } from "../hooks/use-fees-api.ts";
import { editableCopy, emptyRule } from "../lib/rules.ts";

import type { FeeRule, Lookups } from "../lib/types.ts";

type View = "rules" | "preview" | "reports";
type Editing = { rule: FeeRule; originalCode?: string } | null;

export function ExtraFeesPage() {
  const api = useFeesApi();
  const [view, setView] = useState<View>("rules");
  const [rules, setRules] = useState<FeeRule[]>([]);
  const [examples, setExamples] = useState<FeeRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [lookups, setLookups] = useState<Lookups | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listRules();
      setRules(data.rules);
      setExamples(data.examples);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
    api
      .lookups()
      .then(setLookups, () =>
        setLookups({ customerGroups: [], storeViews: [], unavailable: true }),
      );
  }, [api, load]);

  const handleEdit = useCallback(
    (code: string) => {
      const rule = rules.find((r) => r.code === code);
      if (rule) {
        setEditing({ originalCode: code, rule: editableCopy(rule) });
      }
    },
    [rules],
  );

  const handleCreate = useCallback((template?: FeeRule) => {
    setEditing({
      rule: template
        ? { ...editableCopy(template), enabled: false }
        : emptyRule(),
    });
  }, []);

  const handleSave = async (rule: FeeRule, previousCode?: string) => {
    await api.saveRule(rule, previousCode);
    setEditing(null);
    setNotice(
      `Saved “${rule.label}”. Checkout picks up the change within a minute.`,
    );
    await load();
  };

  const handleDelete = async (code: string) => {
    await api.deleteRule(code);
    setEditing(null);
    setNotice("Fee deleted.");
    await load();
  };

  const handleRefreshCatalog = async () => {
    try {
      const { removed } = await api.refreshCatalog();
      setNotice(
        `Product data cache cleared (${removed} products). It refills on the next carts.`,
      );
    } catch (refreshError) {
      setNotice(
        `Couldn't clear the product cache: ${(refreshError as Error).message}`,
      );
    }
  };

  const navigate = (next: View) => {
    setEditing(null);
    setNotice(null);
    setView(next);
  };

  return (
    <div className={style({ display: "flex", font: "body", height: "screen" })}>
      <nav
        className={style({
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          width: 240,
        })}>
        <div className={style({ padding: 16 })}>
          <Heading level={3} styles={style({ font: "title-lg", margin: 0 })}>
            Extra Fees
          </Heading>
        </div>
        <Divider size="S" />
        <div
          className={style({
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            gap: 8,
            padding: 16,
          })}>
          <ToggleButton
            isQuiet
            isSelected={view === "rules"}
            onPress={() => navigate("rules")}>
            Fees
          </ToggleButton>
          <ToggleButton
            isQuiet
            isSelected={view === "preview"}
            onPress={() => navigate("preview")}>
            Test a cart
          </ToggleButton>
          <ToggleButton
            isQuiet
            isSelected={view === "reports"}
            onPress={() => navigate("reports")}>
            Reports
          </ToggleButton>
        </div>
        <div
          className={style({
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: 16,
          })}>
          <ActionButton isQuiet onPress={handleRefreshCatalog}>
            Refresh product data
          </ActionButton>
          <Text>
            Product categories and attributes are cached for fee conditions.
          </Text>
        </div>
      </nav>

      <Divider orientation="vertical" size="S" />

      <div
        className={style({
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          gap: 16,
          overflowY: "auto",
          padding: 24,
        })}>
        {notice && (
          <InlineAlert variant="informative">
            <Content>{notice}</Content>
          </InlineAlert>
        )}
        {view === "rules" && editing && (
          <RuleEditor
            initial={editing.rule}
            key={editing.originalCode ?? "new"}
            lookups={lookups}
            onCancel={() => setEditing(null)}
            onDelete={handleDelete}
            onSave={handleSave}
            originalCode={editing.originalCode}
          />
        )}
        {view === "rules" && !editing && (
          <RulesList
            error={error}
            examples={examples}
            loading={loading}
            onCreate={handleCreate}
            onEdit={handleEdit}
            onReload={load}
            rules={rules}
          />
        )}
        {view === "preview" && <CartPreview />}
        {view === "reports" && <FeeReport />}
      </div>
    </div>
  );
}
