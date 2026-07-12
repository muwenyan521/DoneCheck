import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultWorkspace = path.join(root, "fixtures", "status-coverage", "workspace");
const defaultOutput = path.join(
  root,
  "artifacts",
  "initial-round",
  "six-status-source-report.json",
);

export async function generateSixStatusEvidence({
  outputPath = defaultOutput,
  workspacePath = defaultWorkspace,
} = {}) {
  const { runDoneCheckPipelineNode } = await import("../packages/core/dist/index.js");
  const provider = createSixStatusProvider();
  const result = await runDoneCheckPipelineNode({
    generatedAt: "2026-07-12T00:00:00.000Z",
    provider,
    requirements: requirements(),
    requirement: "六状态正式 pipeline 覆盖",
    workspacePath,
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result.report, null, 2)}\n`, "utf8");
  return result.report;
}

function requirements() {
  return [
    { id: "REQ-FULFILLED", text: "实现 auth 认证持久化。" },
    { id: "REQ-PARTIAL", text: "实现 profile 个人资料编辑。" },
    { id: "REQ-INSUFFICIENT", text: "实现 audit 审计日志。" },
    { id: "REQ-UNFULFILLED", text: "实现 billing 账单管理。" },
    { id: "REQ-SUSPICIOUS", text: "实现 export 数据导出。" },
  ];
}

function createSixStatusProvider() {
  return {
    metadata: { model: "six-status-fixture", provider: "deterministic-test", retries: 0 },
    async generateObject(input) {
      if (input.schemaName === "FileSelectionModelOutput") {
        return {
          metadata: this.metadata,
          object: input.schema.parse({
            candidateFiles: [
              "src/auth-persistence.ts",
              "src/profile.ts",
              "src/audit-trail.ts",
              "src/billing.ts",
              "src/export.ts",
            ],
            confidence: 1,
            reasoningSummary: "deterministic fixture selection from requirement semantics",
            warnings: [],
          }),
          usage: {},
        };
      }
      const payload = JSON.parse(input.prompt.user);
      const requirement = payload.requirement;
      const evidenceFileByRequirement = {
        "REQ-FULFILLED": "src/auth-persistence.ts",
        "REQ-PARTIAL": "src/profile.ts",
        "REQ-INSUFFICIENT": "src/audit-trail.ts",
        "REQ-UNFULFILLED": "src/billing.ts",
        "REQ-SUSPICIOUS": "src/export.ts",
      };
      const evidence = payload.evidenceSnippets.find(
        (snippet) => snippet.filePath === evidenceFileByRequirement[requirement.id],
      );
      const draftByRequirement = {
        "REQ-FULFILLED": "fulfilled",
        "REQ-PARTIAL": "partial",
        "REQ-INSUFFICIENT": "partial",
        "REQ-UNFULFILLED": "unsupported",
        "REQ-SUSPICIOUS": "suspicious",
      };
      const extraScope =
        requirement.id === "REQ-PARTIAL" ? ["实现了一个需求外的演示管理入口。"] : undefined;
      return {
        metadata: this.metadata,
        object: input.schema.parse({
          confidence: requirement.id === "REQ-INSUFFICIENT" ? 0.35 : 0.9,
          evidenceRefs: [
            {
              filePath: evidence.filePath,
              lineEnd: evidence.lineEnd,
              lineStart: evidence.lineStart,
              snippetSummary: `${requirement.id} evidence`,
            },
          ],
          explanation: `${requirement.id} deterministic semantic assessment`,
          judgementDraft: draftByRequirement[requirement.id],
          matchedRequirementId: requirement.id,
          ...(extraScope === undefined ? {} : { possibleExtraScope: extraScope }),
          repairSuggestion: `Repair ${requirement.id} only when its final evidence requires it.`,
        }),
        usage: {},
      };
    },
  };
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  const [outputPath] = process.argv.slice(2);
  await generateSixStatusEvidence(outputPath === undefined ? {} : { outputPath });
}
