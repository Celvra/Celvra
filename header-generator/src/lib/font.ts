// 把 Google Sans Flex 的子集（只含用到的字符）转成 base64，内嵌进 SVG，
// 这样 SVG 在 GitHub README 的 <img> 里也能正确显示字体。
const cache = new Map<string, string>();

// Node（CI 生成时）必须带浏览器 UA，Google Fonts 才会返回 woff2；
// 浏览器里 User-Agent 是禁止手动设置的，留空即可。
const UA: Record<string, string> =
  typeof document === "undefined"
    ? {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      }
    : {};

function toB64(buf: ArrayBuffer) {
  let s = "";
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i += 0x8000) {
    s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export async function embedFontCss(text: string): Promise<string | null> {
  // 只保留 ASCII 可打印字符 + 常见符号，CJK 由系统字体回退
  const chars = [...new Set(text)].filter((c) => {
    const n = c.charCodeAt(0);
    return (n >= 32 && n < 0x2fff) || "·—…★✓".includes(c);
  });
  const key = chars.sort().join("");
  if (cache.has(key)) return cache.get(key)!;
  try {
    const css = await (
      await fetch(
        `https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@400..700&text=${encodeURIComponent(key)}`,
        { headers: UA },
      )
    ).text();
    const m = css.match(/url\((https:[^)]+)\)/);
    if (!m) return null;
    const buf = await (await fetch(m[1], { headers: UA })).arrayBuffer();
    const out = `@font-face{font-family:'Google Sans Flex';font-style:normal;font-weight:400 700;src:url(data:font/woff2;base64,${toB64(buf)}) format('woff2');}`;
    cache.set(key, out);
    return out;
  } catch {
    return null;
  }
}
