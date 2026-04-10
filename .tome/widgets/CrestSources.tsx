import React, { useMemo } from "react";

interface Props {
  crestSources?: Record<string, string[]>;
  title?: string;
  changedFields?: string[];
}

const CREST_ORDER = [
  "Myth Dawncrest",
  "Hero Dawncrest",
  "Champion Dawncrest",
  "Veteran Dawncrest",
  "Adventurer Dawncrest",
];

const CREST_COLOR: Record<string, string> = {
  "Myth Dawncrest": "var(--tome-chart-5)",
  "Hero Dawncrest": "var(--tome-chart-2)",
  "Champion Dawncrest": "var(--tome-chart-3)",
  "Veteran Dawncrest": "var(--tome-chart-1)",
  "Adventurer Dawncrest": "var(--tome-chart-4)",
};

export default function CrestSources({ crestSources, title = "Crest Sources", changedFields }: Props) {
  const rows = useMemo(() => {
    if (!crestSources) return [];
    return CREST_ORDER.filter((c) => crestSources[c]).map((c) => ({ crest: c, sources: crestSources[c] }));
  }, [crestSources]);

  const crestsChanged = changedFields?.includes("crestSources");

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--tome-bg-primary)", color: "var(--tome-text-primary)", overflow: "hidden" }}>
      <div style={{ padding: "12px 18px 10px 18px", borderBottom: "1px solid var(--tome-border-primary)", fontSize: 13, fontWeight: 600 }}>
        {title}
      </div>
      <div className={crestsChanged ? "tome-changed" : undefined} style={{ flex: 1, overflow: "auto" }}>
        {rows.length === 0 ? (
          <div style={{ padding: 18, fontSize: 12, color: "var(--tome-text-disabled)", fontStyle: "italic" }}>
            No crest data loaded. Wire a data node to the <code>crestSources</code> prop.
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "170px 1fr", padding: "10px 16px", fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--tome-text-secondary)", background: "var(--tome-bg-tertiary)", position: "sticky", top: 0 }}>
              <div>Crest</div>
              <div>Sources</div>
            </div>
            {rows.map((row) => (
              <div
                key={row.crest}
                style={{
                  display: "grid",
                  gridTemplateColumns: "170px 1fr",
                  padding: "12px 16px",
                  borderTop: "1px solid var(--tome-border-secondary)",
                  fontSize: 12,
                  alignItems: "start",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--tome-text-primary)",
                    borderLeft: `3px solid ${CREST_COLOR[row.crest] ?? "var(--tome-text-secondary)"}`,
                    paddingLeft: 8,
                  }}
                >
                  {row.crest}
                </div>
                <div style={{ color: "var(--tome-text-secondary)", lineHeight: 1.5 }}>
                  {row.sources.map((s, i) => (
                    <div key={i}>{s}</div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export const meta = {
  type: "crest-sources",
  description: "Table of crests with the activities that award them",
  ports: {
    inputs: [
      { prop: "crestSources", label: "Crest Sources (object)", type: "record" },
      { prop: "title", label: "Title", type: "string" },
    ],
    outputs: [],
  },
};
