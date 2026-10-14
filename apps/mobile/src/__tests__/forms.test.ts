import { demoApi } from "../lib/demo";
import { formAnswersText, formFileName, formProgress, formSheetHtml, groupFields, isFilled } from "../lib/formSheet";
import type { CaseForm, FormField } from "../lib/types";

const field = (over: Partial<FormField>): FormField => ({
  key: "k", pdf_field: null, page: 1, section: "A", label_de: "Name", explanation: "Your name", type: "text", options: [],
  value: null, source_note: null, question: null, required: false, ...over,
});

const labels = {
  heading: "Sheet", intro: "Copy <each> value", page: "Page", field: "Field", write: "Write", missing: "missing", sign: "Sign",
  yes: "Yes", no: "No",
};

describe("form helpers", () => {
  const fields = [
    field({ key: "a", value: "Amina", required: true }),
    field({ key: "b", value: " ", required: true }),
    field({ key: "c", type: "signature", section: "Unterschrift", page: 2, required: true }),
    field({ key: "d", type: "checkbox", value: "true", section: "Unterschrift", page: 2 }),
  ];

  it("counts signatures as done and blank values as missing", () => {
    expect(isFilled(fields[1])).toBe(false);
    expect(formProgress(fields)).toEqual({ total: 4, filled: 3, missingRequired: 1 });
  });

  it("lists only filled answers for the agent to suggest what to remember", () => {
    const text = formAnswersText({ title_de: "Hauptantrag", file_name: null, fields });
    expect(text).toBe('I filled in the form "Hauptantrag" with these answers:\n- Name: Amina\n- Name: true');
  });

  it("groups fields by section in form order", () => {
    expect(groupFields(fields).map((g) => [g.title, g.page, g.fields.length])).toEqual([["A", 1, 2], ["Unterschrift", 2, 2]]);
  });

  it("builds an escaped filling sheet that marks missing fields", () => {
    const form = { title_de: "Antrag <Test>", title: "Application", fields } as CaseForm;
    const html = formSheetHtml(form, labels);
    expect(html).toContain("Antrag &lt;Test&gt;");
    expect(html).toContain("Copy &lt;each&gt; value");
    expect(html).toContain("<b>Amina</b>");
    expect(html).toContain('class="missing"');
    expect(html).toContain("☒ Yes");
    expect(html).toContain("Page 2 · Unterschrift");
  });

  it("names the file after the form", () => {
    expect(formFileName({ title_de: "Antrag auf Bürgergeld", file_name: null }, "ausgefuellt", new Date("2026-10-14")))
      .toBe("2026-10-14_Antrag-auf-Burgergeld-ausgefuellt.pdf");
  });
});

describe("demo forms", () => {
  beforeAll(() => demoApi.updateProfile({ ai_consent_at: new Date().toISOString() }));

  it("adds a form, fills a field from an answer and deletes it", async () => {
    const form = await demoApi.addForm("demo-case-1", [{ uri: "x", mimeType: "image/jpeg", name: "p1.jpg" }]);
    expect(form.status).toBe("ready");
    expect((await demoApi.listForms("demo-case-1")).map((f) => f.id)).toContain(form.id);
    expect((await demoApi.getTimeline("demo-case-1")).some((x) => x.kind === "form")).toBe(true);

    const res = await demoApi.answerForm(form.id, "Born 01.02.1990");
    expect(res.form.fields.find((f) => f.key === "p1_birth")?.value).toBe("01.02.1990");

    const fields = res.form.fields.map((f) => (f.key === "p1_nationality" ? { ...f, value: "syrisch" } : f));
    await demoApi.saveFormFields(form.id, fields);
    expect((await demoApi.getForm(form.id)).fields.find((f) => f.key === "p1_nationality")?.value).toBe("syrisch");

    await demoApi.deleteForm(form.id);
    await expect(demoApi.getForm(form.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
