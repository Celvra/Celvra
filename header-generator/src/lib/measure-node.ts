// Node 端（CI 生成）的文字测量：不跑浏览器，直接拉 Google Fonts 的静态字体实例，
// 用 fontkit 量字宽。和浏览器 canvas measureText 的实测误差 < 0.1px。
import { create } from "fontkit";
import type { Deps } from "./svg";

const FAMILY = "Google Sans Flex";
const WEIGHTS = [400, 500, 600, 700];
const EXTRA_CHARS = "·—…★✓";
const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("");

const faces = (css: string) =>
  css
    .split("@font-face")
    .slice(1)
    .map((b) => ({
      weight: Number(b.match(/font-weight:\s*(\d+)/)?.[1]),
      url: b.match(/url\((https:[^)]+)\)/)?.[1] ?? "",
    }))
    .filter((f) => f.weight && f.url);

export async function createNodeDeps(extraText: string[] = []): Promise<Deps> {
  // 不带 UA 时 Google Fonts 给的是静态 TTF 实例（每个重量一份，fvar 已压平），
  // 正好可以直接用 fontkit 量宽度，不用管变量字体插值。
  const q =
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(FAMILY)}:wght@${WEIGHTS.join(";")}` +
    `&text=${encodeURIComponent(ASCII + EXTRA_CHARS + extraText.join(""))}`;
  const css = await (await fetch(q)).text();
  const fonts = new Map<number, ReturnType<typeof create>>();
  for (const f of faces(css)) {
    fonts.set(f.weight, create(Buffer.from(await (await fetch(f.url)).arrayBuffer())));
  }
  const base = fonts.get(400);
  if (!base) throw new Error("无法从 Google Fonts 获取 Google Sans Flex（测量用）");
  const upem = base.unitsPerEm;
  const has = (cp: number) => base.hasGlyphForCodePoint(cp);

  // 查不到对应重量（如 650）时在相邻静态实例间线性插值
  const layout = (s: string, w: number) => {
    const keys = [...fonts.keys()].sort((a, b) => a - b);
    if (fonts.has(w)) return fonts.get(w)!.layout(s).advanceWidth;
    const lo = [...keys].reverse().find((k) => k <= w) ?? keys[0];
    const hi = keys.find((k) => k >= w) ?? keys[keys.length - 1];
    const a = fonts.get(lo)!.layout(s).advanceWidth;
    const b = fonts.get(hi)!.layout(s).advanceWidth;
    return lo === hi ? a : a + ((b - a) * (w - lo)) / (hi - lo);
  };

  return {
    measure: (text, cssFont) => {
      const size = Number(cssFont.match(/([\d.]+)px/)?.[1] ?? 16);
      // 等宽字体按 0.6em/字符近似（常见等宽字体就是这个宽度），CJK、★ 等回退字符按 1em
      if (/mono/i.test(cssFont)) {
        return [...text].reduce((w, ch) => {
          const cp = ch.codePointAt(0)!;
          return w + (cp < 0x2000 || cp === 0x2014 || cp === 0x2026 ? 0.6 : 1) * size;
        }, 0);
      }
      const weight = Number(cssFont.match(/^(\d+)/)?.[1] ?? 400);
      let w = 0;
      let run = "";
      const flush = () => {
        if (run) {
          w += (layout(run, weight) * size) / upem;
          run = "";
        }
      };
      for (const ch of text) {
        const cp = ch.codePointAt(0)!;
        if (has(cp)) run += ch;
        else {
          flush();
          // CJK 用系统字体回退，字宽就是 1em；其余零散字符按 0.6em 近似
          w += (cp >= 0x2e80 ? 1 : 0.6) * size;
        }
      }
      flush();
      return w;
    },
  };
}
