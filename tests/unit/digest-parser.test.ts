import { describe, expect, it } from "vitest";
import { parseDigestResponse } from "@/lib/providers/model/digest-parser";

describe("digest response parser", () => {
  it("extracts a digest JSON object from fenced model output", () => {
    const parsed = parseDigestResponse(`
      下面是摘要 JSON：

      \`\`\`json
      {
        "title": "今日重点财经摘要",
        "sections": [
          {
            "heading": "行情速览",
            "body": "美股盘前承压。\\n科技股普遍走弱。",
            "sources": [
              { "title": "美股盘前", "url": "https://finance.yahoo.com/example" }
            ]
          }
        ]
      }
      \`\`\`
    `);

    expect(parsed?.title).toBe("今日重点财经摘要");
    expect(parsed?.sections[0]?.heading).toBe("行情速览");
    expect(parsed?.sections[0]?.body).toContain("科技股普遍走弱");
    expect(parsed?.sections[0]?.sources?.[0]?.url).toBe("https://finance.yahoo.com/example");
  });
});
