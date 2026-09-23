import { describe, expect, test } from "bun:test";
import { parseCsv, parseCsvRows } from "./wago.ts";

describe("parseCsv (RFC4180)", () => {
  test("parses plain rows", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([{ a: "1", b: "2", c: "3" }]);
  });

  test("keeps commas inside quoted fields", () => {
    expect(parseCsv('ID,Name\n1,"Bag of Tricks, Reversed"\n')).toEqual([
      { ID: "1", Name: "Bag of Tricks, Reversed" },
    ]);
  });

  test("unescapes doubled quotes", () => {
    expect(parseCsv('ID,Name\n1,"He said ""hi"""\n')).toEqual([{ ID: "1", Name: 'He said "hi"' }]);
  });

  test("keeps newlines inside quoted fields on one row", () => {
    const rows = parseCsv('ID,Desc\n1,"line one\nline two"\n2,plain\n');
    expect(rows).toEqual([{ ID: "1", Desc: "line one\nline two" }, { ID: "2", Desc: "plain" }]);
  });

  test("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([{ a: "1", b: "2" }]);
  });

  test("preserves CRLF inside a quoted field", () => {
    expect(parseCsvRows('a\n"x\r\ny"\n')).toEqual([["a"], ["x\r\ny"]]);
  });

  test("keeps empty trailing fields", () => {
    expect(parseCsv("a,b,c\n1,,\n")).toEqual([{ a: "1", b: "", c: "" }]);
  });

  test("pads short rows and ignores extra columns", () => {
    expect(parseCsv("a,b,c\n1\n")).toEqual([{ a: "1", b: "", c: "" }]);
  });

  test("does not emit a phantom row for a trailing newline", () => {
    expect(parseCsv("a\n1\n")).toHaveLength(1);
  });

  test("parses a final row with no trailing newline", () => {
    expect(parseCsv("a\n1")).toEqual([{ a: "1" }]);
  });

  test("treats a mid-field quote as literal", () => {
    expect(parseCsvRows('a\n5" blade\n')).toEqual([["a"], ['5" blade']]);
  });

  test("every row has the header column count for quoted input", () => {
    const csv = 'ID,Name,Flags\n1,"Comma, here",0\n2,"Quote ""x""",1\n3,"multi\nline",2\n';
    const raw = parseCsvRows(csv);
    for (const row of raw) expect(row).toHaveLength(3);
    expect(raw).toHaveLength(4);
  });
});
