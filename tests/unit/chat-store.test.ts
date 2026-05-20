import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addChatMessage, listRecentChatMessages, resetStoreForTests } from "@/lib/db/store";

beforeEach(() => {
  resetStoreForTests();
});

afterEach(() => {
  resetStoreForTests();
});

describe("chat store", () => {
  it("keeps recent chat messages in insertion order", async () => {
    await addChatMessage({ role: "user", content: "第一问" });
    await addChatMessage({ role: "assistant", content: "第一答" });
    await addChatMessage({ role: "user", content: "第二问" });

    const recent = await listRecentChatMessages(2);

    expect(recent.map((message) => message.content)).toEqual(["第一答", "第二问"]);
  });
});
