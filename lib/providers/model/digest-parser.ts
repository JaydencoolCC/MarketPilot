import type { DigestPreview } from "@/lib/domain/types";

export function parseDigestResponse(content: string): DigestPreview | null {
  const payload = extractJsonPayload(content);
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload) as Partial<DigestPreview>;
    if (!parsed.title || !Array.isArray(parsed.sections)) {
      return null;
    }

    const sections = parsed.sections
      .filter((section) => section?.heading && section?.body)
      .map((section) => ({
        heading: String(section.heading),
        body: String(section.body),
        sources: Array.isArray(section.sources)
          ? section.sources
              .filter((source) => source?.title && source?.url)
              .map((source) => ({
                title: String(source.title),
                url: String(source.url),
              }))
          : undefined,
      }));

    if (sections.length === 0) {
      return null;
    }

    return {
      title: String(parsed.title),
      generatedAt: new Date().toISOString(),
      sections,
    };
  } catch {
    return null;
  }
}

function extractJsonPayload(content: string) {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  if (fenced?.startsWith("{") && fenced.endsWith("}")) return fenced;

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return trimmed.slice(start, end + 1);
}
