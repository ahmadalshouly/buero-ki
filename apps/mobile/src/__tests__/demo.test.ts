import { demoApi } from "../lib/demo";
import { ApiError } from "../lib/errors";

jest.setTimeout(15000);

describe("demo backend", () => {
  it("refuses AI features until consent is given", async () => {
    await expect(demoApi.sendMessage("demo-case-1", "Hi")).rejects.toMatchObject({ code: "consent" });
    await demoApi.updateProfile({ ai_consent_at: new Date().toISOString() });
    const reply = await demoApi.sendMessage("demo-case-1", "Hi");
    expect(reply.role).toBe("assistant");
  });

  it("creates, updates, times and deletes a case", async () => {
    const c = await demoApi.createCase({ title: "  Wohngeld  ", category: "housing" });
    expect(c.title).toBe("Wohngeld");
    await demoApi.updateCase(c.id, { status: "waiting" });
    expect((await demoApi.getCase(c.id)).status).toBe("waiting");

    const t = await demoApi.createTask({ caseId: c.id, title: "Call office", dueDate: null });
    await demoApi.setTaskDone(t.id, true);
    const timeline = await demoApi.getTimeline(c.id);
    expect(timeline.map((x) => x.kind)).toContain("task_done");

    await demoApi.deleteCase(c.id);
    await expect(demoApi.getCase(c.id)).rejects.toBeInstanceOf(ApiError);
    expect(await demoApi.listTasks({ caseId: c.id })).toEqual([]);
  });

  it("revises a draft and records sending", async () => {
    const first = await demoApi.createDraft({ caseId: "demo-case-1", kind: "letter", instructions: "Send documents" });
    const second = await demoApi.createDraft({ caseId: "demo-case-1", kind: "letter", instructions: "Shorter", reviseDraftId: first.id });
    expect(second.revision_of).toBe(first.id);
    await demoApi.setDraftStatus(second.id, "sent");
    expect((await demoApi.getDraft(second.id)).sent_at).not.toBeNull();
    await demoApi.updateDraft(second.id, { body_de: "Neu" });
    expect((await demoApi.getDraft(second.id)).edited).toBe(true);
  });

  it("searches cases and letters", async () => {
    const hits = await demoApi.search("kindergeld");
    expect(hits.some((h) => h.kind === "case")).toBe(true);
    expect(await demoApi.search("x")).toEqual([]);
  });

  it("counts usage against the daily limit", async () => {
    const usage = await demoApi.getUsage();
    expect(usage.used["case-chat"]).toBeGreaterThan(0);
    expect(usage.limits["case-chat"]).toBe(40);
  });
});
