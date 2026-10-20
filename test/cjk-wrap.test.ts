import stripAnsi from "strip-ansi";
import { describe, expect, it } from "vitest";
import { render, strip } from "../src/index.ts";
import { visibleWidth, wrapText } from "../src/wrap.ts";

const chinese =
  "纯中文没有任何空格的一段很长很长的文字用来测试换行宽度是否按照终端列宽正确计算而不是按字符数再多写一点";

function expectWrapped(text: string, width: number) {
  const lines = text.trimEnd().split("\n");
  expect(lines.length).toBeGreaterThan(1);
  for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
  return lines;
}

describe("CJK wrapping", () => {
  it.each([
    chinese,
    "空白を含まない日本語の文章でも指定した端末の幅で正しく折り返します。",
    "공백없는한국어문장도터미널너비에맞추어줄바꿈합니다",
  ])("wraps unspaced prose by terminal columns: %s", (text) => {
    const lines = expectWrapped(strip(text, { width: 30 }), 30);
    expect(lines.join("")).toBe(text);
  });

  it("wraps mixed styled prose after the last space", () => {
    const markdown =
      "会议改到 **下午三点** 了，请大家提前十分钟到达会议室并准备好上周的项目进度报告和下季度的预算草案。";
    const lines = expectWrapped(render(markdown, { width: 30, color: true }), 30);
    expect(stripAnsi(lines.join(""))).toBe(markdown.replaceAll("**", ""));
  });

  it("keeps opening and closing punctuation with adjacent text", () => {
    const text = "你好，世界。今天（天气）很好！明日「继续」努力。";
    const lines = expectWrapped(wrapText(text, 10, true).join("\n"), 10);
    expect(lines.join("")).toBe(text);
    for (const line of lines) {
      expect(line).not.toMatch(/^[，。、！？」）]/u);
      expect(line).not.toMatch(/[（「]$/u);
    }
  });

  it("keeps grapheme clusters intact", () => {
    const text = "か\u3099か\u3099か\u3099か\u3099か\u3099";
    const lines = expectWrapped(wrapText(text, 4, true).join("\n"), 4);
    expect(lines.join("")).toBe(text);
    expect(lines.every((line) => !line.startsWith("\u3099"))).toBe(true);
  });

  it("preserves complete styles and hyperlinks when splitting a CJK label", () => {
    const out = render(`[**${chinese}**](https://example.com/中文)`, {
      width: 30,
      color: true,
      hyperlinks: true,
    });
    const lines = expectWrapped(out, 30);
    expect(stripAnsi(lines.join(""))).toBe(chinese);
    for (const line of lines) {
      expect(line).toContain("\u001b[1m");
      expect(line).toContain("\u001b[22m");
      expect(line).toContain("\u001b]8;;https://example.com/中文\u0007");
      expect(line).toContain("\u001b]8;;\u0007");
    }
  });

  it.each([6, 80])("preserves styles and hyperlinks across spaces at width %i", (width) => {
    const out = render("[**中文 中文 中文**](https://example.com)", {
      width,
      color: true,
      hyperlinks: true,
    });
    const lines = out.trimEnd().split("\n");
    expect(stripAnsi(out).replaceAll("\n", "")).toBe(
      width === 80 ? "中文 中文 中文" : "中文中文中文",
    );
    for (const line of lines) {
      expect(line).toContain("\u001b[1m");
      expect(line).toContain("\u001b[22m");
      expect(line).toContain("\u001b]8;;https://example.com\u0007");
      expect(line).toContain("\u001b]8;;\u0007");
    }
    if (width === 80) expect(out).toContain("中文 中文 中文");
  });

  it.each(["中文in中文", "中文a中文", "中文with中文"])(
    "does not insert orphan-word spacing into %s",
    (text) => {
      expect(wrapText(text, 6, true).join("")).toBe(text);
    },
  );

  it("preserves long styled paragraphs", () => {
    const text = "中文".repeat(2000);
    const out = render(`**${text}**`, { width: 30, color: true });
    expect(stripAnsi(expectWrapped(out, 30).join(""))).toBe(text);
  });

  it.each(["first  \nsecond", "中文  \n中文"])(
    "preserves formatting across hard breaks in %s",
    (text) => {
      const out = render(`[**${text}**](https://example.com)`, {
        width: 80,
        color: true,
        hyperlinks: true,
      });
      const lines = out.trimEnd().split("\n");
      expect(lines).toHaveLength(2);
      for (const line of lines) {
        expect(line).toContain("\u001b[1m");
        expect(line).toContain("\u001b[22m");
        expect(line).toContain("\u001b]8;;https://example.com\u0007");
        expect(line).toContain("\u001b]8;;\u0007");
      }
    },
  );

  it("uses the width remaining after a list or blockquote prefix", () => {
    for (const prefix of ["- ", "> "]) {
      expectWrapped(strip(prefix + chinese, { width: 30 }), 30);
    }
  });

  it("wraps table cells without truncation", () => {
    const out = strip(`| 文 |\n|---|\n| ${chinese} |`, {
      width: 30,
      tableTruncate: false,
      tableBorder: "ascii",
    });
    expectWrapped(out, 30);
    expect(out.split("\n").filter((line) => line.startsWith("|")).length).toBeGreaterThan(2);
  });

  it("still preserves unbreakable Latin words and no-wrap output", () => {
    expect(wrapText("https://example.com/longpath", 6, true)).toEqual([
      "https://example.com/longpath",
    ]);
    expect(wrapText(chinese, 30, false)).toEqual([chinese]);
    expect(wrapText(chinese, 0, true)).toEqual([chinese]);
  });
});
