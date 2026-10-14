import { sseParser } from "../lib/sse";

describe("sseParser", () => {
  it("joins events split across chunks and skips comments", () => {
    const events: unknown[] = [];
    const push = sseParser((e) => events.push(e));
    push('data: {"type":"delta","text":"Hal');
    push('lo"}\n\n: keep-alive\n\ndata: {"type":"delta","text":"!"}\r\n\r\ndata: {"type":"done"}');
    expect(events).toEqual([{ type: "delta", text: "Hallo" }, { type: "delta", text: "!" }]);
    push("\n\n");
    expect(events).toHaveLength(3);
  });
});
