import type { ModelContextLike } from "./registry";

export interface DocumentWithOptionalModelContext {
  readonly modelContext?: unknown;
}

function isModelContextLike(value: unknown): value is ModelContextLike {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ModelContextLike>;

  return (
    typeof candidate.registerTool === "function" &&
    typeof candidate.getTools === "function" &&
    typeof candidate.addEventListener === "function" &&
    typeof candidate.removeEventListener === "function"
  );
}

export function getModelContext(
  source?: DocumentWithOptionalModelContext,
): ModelContextLike | null {
  const target =
    source ??
    (typeof document === "undefined"
      ? undefined
      : (document as DocumentWithOptionalModelContext));

  return isModelContextLike(target?.modelContext)
    ? target.modelContext
    : null;
}
