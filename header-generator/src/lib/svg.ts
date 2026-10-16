import type { GhData } from "./github";
import { embedFontCss } from "./font";

export const W = 1200;
export const H = 620;
const T = 18; // 动画循环时长（秒）

export interface Options {
  title: string;
  prefix: string;
  nameA: string;
  nameB: string;
  image: string | null;
  blur: number;
  fade: number; // 渐变开始位置 0-90 (%)
  overlay: number; // 0-100
  theme: "auto" | "dark" | "light";
  lang: "en" | "zh";
  nameColor: string; // 名字与光标的纯色
}

const SANS = `"Google Sans Flex", "Google Sans", system-ui, -apple-system, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`;
const MONO = `ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`;
const BOLD = 650;

interface Seg {
  t: string;
  b?: boolean;
  w?: number;
  c?: "fg" | "mu" | "gr";
  mono?: boolean;
}

export interface Deps {
  /** 量一段文字在指定 CSS font 下的宽度（浏览器端用 canvas，Node 端用字体度量） */
  measure: (text: string, cssFont: string) => number;
  /** 构建前预加载字体；Node 端不需要 */
  loadFonts?: () => Promise<void>;
}

let _ctx: CanvasRenderingContext2D | null = null;
const browserMeasure = (text: string, cssFont: string) => {
  const c = (_ctx ??= document.createElement("canvas").getContext("2d")!);
  c.font = cssFont;
  return c.measureText(text).width;
};
const browserLoadFonts = () =>
  Promise.all([
    document.fonts.load(`400 20px "Google Sans Flex"`, "Hi there"),
    document.fonts.load(`650 20px "Google Sans Flex"`, "Hi there"),
  ]).then(() => undefined);

const fontOf = (s: Seg, size: number) =>
  `${s.b ? BOLD : (s.w ?? 400)} ${size}px ${s.mono ? MONO : SANS}`;
const chars = (t: string) => [...t];
const len = (segs: Seg[]) => segs.reduce((a, s) => a + chars(s.t).length, 0);

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r1 = (n: number) => Math.round(n * 10) / 10;
const fmtN = (n: number) =>
  n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* ---------------- SMIL helpers ---------------- */
function fixTimes(times: number[]) {
  const out: number[] = [];
  times.forEach((t, i) => {
    const v = Math.min(T, Math.max(0, t));
    out.push(i === 0 ? v : Math.max(v, out[i - 1] + 0.0001));
  });
  return out;
}
const kt = (times: number[]) =>
  fixTimes(times)
    .map((t) => (t / T).toFixed(5))
    .join(";");

function anim(attr: string, times: number[], values: (string | number)[], extra = "") {
  return `<animate attributeName="${attr}" dur="${T}s" repeatCount="indefinite" keyTimes="${kt(times)}" values="${values.join(";")}" ${extra}/>`;
}
// 带自动补全首尾的轨迹
function track(attr: string, pts: [number, string | number][], extra = "") {
  const p = [...pts];
  if (p[0][0] > 0) p.unshift([0, p[0][1]]);
  if (p[p.length - 1][0] < T) p.push([T, p[p.length - 1][1]]);
  return anim(attr, p.map((x) => x[0]), p.map((x) => x[1]), extra);
}
const show = (s: number, d = 0.4) => track("opacity", [[s, 0], [s + d, 1]]);
const rise = (s: number, d = 0.5, dy = 8) =>
  show(s, d) +
  `<animateTransform attributeName="transform" type="translate" dur="${T}s" repeatCount="indefinite" keyTimes="${kt([0, s, s + d, T])}" values="0 ${dy};0 ${dy};0 0;0 0"/>`;
const grow = (attr: string, from: number, to: number, s: number, d: number) =>
  `<animate attributeName="${attr}" dur="${T}s" repeatCount="indefinite" calcMode="spline" keyTimes="${kt([0, s, s + d, T])}" keySplines="0 0 1 1;0.2 0.9 0.3 1;0 0 1 1" values="${r1(from)};${r1(from)};${r1(to)};${r1(to)}"/>`;

/* ---------------- 主体 ---------------- */
export async function buildSvg(o: Options, d: GhData, deps?: Deps): Promise<string> {
  const mw = deps?.measure ?? browserMeasure;
  const measure = (segs: Seg[], size: number, n = Infinity) => {
    let left = n;
    let w = 0;
    for (const s of segs) {
      if (left <= 0) break;
      const ch = chars(s.t);
      const part = ch.slice(0, left).join("");
      left -= ch.length;
      w += mw(part, fontOf(s, size));
    }
    return w;
  };
  try {
    await (deps ? deps.loadFonts?.() : browserLoadFonts());
  } catch {
    /* ignore */
  }

  const zh = o.lang === "zh";
  let defs = "";
  let uid = 0;
  let allText = "";
  const X = 72;

  /* ---- 数据统计 ---- */
  const days = d.days;
  const last30 = days.slice(-30);
  const month = last30.reduce((a, b) => a + b.count, 0);
  const peak = Math.max(0, ...last30.map((x) => x.count));
  const year = days.reduce((a, b) => a + b.count, 0);
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count > 0) streak++;
    else if (i === days.length - 1) continue;
    else break;
  }
  const topLang = d.langs[0]?.name ?? "code";

  /* ---- 打字效果：clipPath 宽度逐字跳变 ---- */
  function typed(
    x: number,
    y: number,
    size: number,
    segs: Seg[],
    start: number,
    cps: number,
    cls = "fg",
  ) {
    segs.forEach((s) => (allText += s.t));
    const n = len(segs);
    const id = `tp${++uid}`;
    const times = [0];
    const vals = [0];
    const pts: { t: number; x: number }[] = [{ t: start, x: x }];
    for (let i = 1; i <= n; i++) {
      const w = measure(segs, size, i);
      const t = start + (i - 1) / cps;
      times.push(t);
      vals.push(r1(i === n ? w + Math.max(30, size) : w + 3));
      pts.push({ t, x: x + w });
    }
    defs += `<clipPath id="${id}"><rect x="${r1(x - 2)}" y="${r1(y - size * 1.15)}" width="${vals[vals.length - 1]}" height="${r1(size * 1.6)}">${anim("width", times, vals, 'calcMode="discrete"')}</rect></clipPath>`;
    const tspans = segs
      .map((s) => {
        const a: string[] = [];
        if (s.c) a.push(`class="${s.c}"`);
        if (s.b) a.push(`font-weight="${BOLD}"`);
        else if (s.w) a.push(`font-weight="${s.w}"`);
        if (s.mono) a.push(`font-family="${MONO.replace(/"/g, "'")}"`);
        return `<tspan ${a.join(" ")}>${esc(s.t)}</tspan>`;
      })
      .join("");
    const svg = `<text x="${x}" y="${y}" font-size="${size}" class="${cls}" clip-path="url(#${id})" xml:space="preserve">${tspans}</text>`;
    return { svg, end: start + n / cps, pts };
  }

  /* ================= 背景 ================= */
  const pad = Math.max(24, o.blur * 2);
  const f = Math.min(0.92, Math.max(0, o.fade / 100));
  const stops = [
    [0, 1],
    [f, 1],
    [f + (1 - f) * 0.25, 0.86],
    [f + (1 - f) * 0.5, 0.52],
    [f + (1 - f) * 0.75, 0.2],
    [1, 0],
  ]
    .map(([off, v]) => {
      const g = Math.round(255 * v).toString(16).padStart(2, "0");
      return `<stop offset="${(off as number).toFixed(3)}" stop-color="#${g}${g}${g}"/>`;
    })
    .join("");
  defs += `<linearGradient id="fadeG" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient>`;
  defs += `<mask id="fadeM" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#fadeG)"/></mask>`;
  defs += `<clipPath id="canvas"><rect width="${W}" height="${H}"/></clipPath>`;
  if (o.blur > 0)
    defs += `<filter id="blur" filterUnits="userSpaceOnUse" x="-300" y="-300" width="${W + 600}" height="${H + 600}"><feGaussianBlur stdDeviation="${o.blur}"/></filter>`;

  let bg: string;
  if (o.image) {
    bg = `<g ${o.blur > 0 ? 'filter="url(#blur)"' : ""}><g><animateTransform attributeName="transform" type="translate" dur="${T}s" repeatCount="indefinite" keyTimes="0;0.5;1" values="0 0;-${Math.min(14, pad - 4)} -${Math.min(6, pad - 4)};0 0"/><image xlink:href="${o.image}" x="${-pad}" y="${-pad}" width="${W + pad * 2}" height="${H + pad * 2}" preserveAspectRatio="xMidYMid slice"/></g></g>`;
  } else {
    defs += `<filter id="soft" filterUnits="userSpaceOnUse" x="-400" y="-400" width="${W + 800}" height="${H + 800}"><feGaussianBlur stdDeviation="${Math.max(50, o.blur * 2)}"/></filter>`;
    const orb = (cx: number, cy: number, r: number, c: string, dx: number, dy: number) =>
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"><animate attributeName="cx" dur="${T}s" repeatCount="indefinite" values="${cx};${cx + dx};${cx}"/><animate attributeName="cy" dur="${T}s" repeatCount="indefinite" values="${cy};${cy + dy};${cy}"/></circle>`;
    bg = `<rect width="${W}" height="${H}" fill="#12162f"/><g filter="url(#soft)">${orb(180, 140, 250, "#6d5dfc", 120, 60)}${orb(760, 40, 230, "#ff6aa2", -140, 80)}${orb(1080, 320, 260, "#22d3b6", -90, -60)}${orb(520, 380, 180, "#4f8cff", 80, -50)}</g>`;
  }
  const scrim = `<rect width="${W}" height="${H}" style="fill:var(--bg)" opacity="${(o.overlay / 100).toFixed(2)}"/>`;

  /* ================= 前景 ================= */
  let fg = "";

  /* ---- 标题 ---- */
  const title = typed(X, 122, 66, [{ t: o.title, b: true }], 0.25, 13);
  fg += title.svg;

  /* ---- 副标题 + 轮流显示的名字 ---- */
  const pre: Seg[] = [{ t: o.prefix + " ", w: 500 }];
  allText += o.prefix + o.nameA + o.nameB;
  const SUB = 36;
  const nameX = X + measure(pre, SUB);
  fg += `<g>${rise(0.9)}<text x="${X}" y="182" font-size="${SUB}" font-weight="500" class="fg" xml:space="preserve">${esc(o.prefix)}</text></g>`;
  const slots = [0, 1, 2, 3].map((k) => {
    const s = 1 + 4 * k;
    return { name: k % 2, a: k === 0 ? 1.0 : s - 0.3, b: s + 4 };
  });
  const nameBlock = (idx: 0 | 1, text: string) => {
    const wins = slots.filter((s) => s.name === idx);
    const op: [number, number][] = [];
    const ty: [number, string][] = [];
    wins.forEach((w) => {
      op.push([w.a, 0], [w.a + 0.45, 1], [w.b - 0.45, 1], [w.b, 0]);
      ty.push([w.a, "0 12"], [w.a + 0.45, "0 0"], [w.b - 0.45, "0 0"], [w.b, "0 -12"]);
    });
    const tw = measure([{ t: text, b: true }], SUB);
    const ty0 = ty.map((p) => p[0]);
    return `<g transform="translate(${r1(nameX)} 182)"><g${idx === 1 ? ' opacity="0"' : ""}>${track("opacity", op)}<animateTransform attributeName="transform" type="translate" dur="${T}s" repeatCount="indefinite" keyTimes="${kt([0, ...ty0, T])}" values="${["0 12", ...ty.map((p) => p[1]), "0 12"].join(";")}"/><text font-size="${SUB}" font-weight="${BOLD}" fill="${o.nameColor}" xml:space="preserve">${esc(text)}</text><rect x="${r1(tw + 7)}" y="-29" width="3" height="35" rx="1.5" fill="${o.nameColor}"><animate attributeName="opacity" dur="1.1s" repeatCount="indefinite" keyTimes="0;0.5;0.5;1" values="1;1;0;0"/></rect></g></g>`;
  };
  fg += nameBlock(0, o.nameA) + nameBlock(1, o.nameB);

  /* ---- Thinking（闪光文字）→ Thought for 4s ---- */
  const TY = 262;
  const thinkTxt = zh ? "思考中" : "Thinking";
  const thoughtSegs: Seg[] = [{ t: zh ? "已思考 4 秒" : "Thought for 4s", c: "mu" }];
  allText += thinkTxt + thoughtSegs[0].t;
  defs += `<linearGradient id="shim" gradientUnits="userSpaceOnUse" x1="${X + 20}" y1="0" x2="${X + 150}" y2="0" spreadMethod="repeat"><stop offset="0" style="stop-color:var(--mu)"/><stop offset="0.5" style="stop-color:var(--fg)"/><stop offset="1" style="stop-color:var(--mu)"/><animateTransform attributeName="gradientTransform" type="translate" dur="1.5s" repeatCount="indefinite" values="0 0;130 0"/></linearGradient>`;
  const tw = measure(thoughtSegs, 15);
  fg += `<g opacity="0">${track("opacity", [[1.7, 0], [2.0, 1], [3.9, 1], [4.1, 0]])}<circle cx="${X + 4}" cy="${TY - 5}" r="4" style="fill:var(--mu)"><animate attributeName="opacity" dur="1.2s" repeatCount="indefinite" values="1;0.25;1"/></circle><text x="${X + 22}" y="${TY}" font-size="15" fill="url(#shim)">${esc(thinkTxt)}…</text></g>`;
  fg += `<g>${track("opacity", [[4.0, 0], [4.3, 1]])}<circle cx="${X + 4}" cy="${TY - 5}" r="4" style="fill:var(--mu)" opacity=".55"/><text x="${X + 22}" y="${TY}" font-size="15" class="mu">${esc(thoughtSegs[0].t)}</text><path d="M${r1(X + 22 + tw + 10)} ${TY - 9} l4 4 l-4 4" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="stroke:var(--mu)"/></g>`;

  /* ---- 工具调用（Codex 风格） ---- */
  const toolRow = (
    y: number,
    start: number,
    cmd: string,
    sub: string,
  ) => {
    const verb = zh ? "已运行 " : "Ran ";
    const a = typed(X + 22, y, 15, [{ t: verb, b: true }, { t: cmd, c: "mu", mono: true, w: 400 }], start, 42);
    const b = typed(X + 44, y + 25, 14, [{ t: sub, c: "mu" }], a.end + 0.12, 60);
    const svg = `<g>${show(start, 0.2)}<circle cx="${X + 4}" cy="${y - 5}" r="4" style="fill:var(--gr)"/>${a.svg}</g><g>${show(a.end + 0.1, 0.2)}<path d="M${X + 5} ${y + 6} V${y + 19} h10" fill="none" stroke-width="1.4" stroke-linecap="round" style="stroke:var(--mu)" opacity=".55"/>${b.svg}</g>`;
    return { svg, end: b.end };
  };
  const t1 = toolRow(
    296,
    4.2,
    `gh api users/${d.user}`,
    zh
      ? `${d.repos} 个仓库 · ${fmtN(d.stars)} 颗星 · ${fmtN(d.followers)} 位关注者`
      : `${d.repos} repositories · ${fmtN(d.stars)} stars · ${fmtN(d.followers)} followers`,
  );
  const t2 = toolRow(
    352,
    t1.end + 0.25,
    `gh api graphql -f query=contributions`,
    zh ? `过去一年共 ${fmtN(year)} 次贡献` : `${fmtN(year)} contributions in the past year`,
  );
  fg += t1.svg + t2.svg;

  /* ---- 回答：流式输出 + ChatGPT 圆点光标 ---- */
  const AS = 19;
  const l1: Seg[] = zh
    ? [
        { t: "本月共 " },
        { t: String(month), b: true },
        { t: " 次贡献，单日最高 " },
        { t: String(peak), b: true },
        { t: " 次。" },
      ]
    : [
        { t: String(month), b: true },
        { t: " contributions this month, peaking at " },
        { t: String(peak), b: true },
        { t: " in a single day." },
      ];
  const l2: Seg[] = zh
    ? [
        { t: "主要使用 " },
        { t: topLang, b: true },
        { t: "，当前已连续提交 " },
        { t: String(streak), b: true },
        { t: " 天。" },
      ]
    : [
        { t: "Mostly " },
        { t: topLang, b: true },
        { t: ", currently on a " },
        { t: `${streak}-day`, b: true },
        { t: " streak." },
      ];
  const aStart = t2.end + 0.4;
  const A1 = typed(X, 428, AS, l1, aStart, 30);
  const A2 = typed(X, 460, AS, l2, A1.end + 0.15, 30);
  fg += A1.svg + A2.svg;
  {
    const ev = [
      ...A1.pts.map((p) => ({ t: p.t, x: p.x, y: 428 })),
      ...A2.pts.map((p) => ({ t: p.t, x: p.x, y: 460 })),
    ];
    const times = [0, ...ev.map((e) => e.t)];
    const xs = [ev[0].x + 9, ...ev.map((e) => r1(e.x + 9))];
    const ys = [ev[0].y - 7, ...ev.map((e) => e.y - 7)];
    fg += `<circle r="5.5" cx="${xs[xs.length - 1]}" cy="${ys[ys.length - 1]}" class="fg">${anim("cx", times, xs, 'calcMode="discrete"')}${anim("cy", times, ys, 'calcMode="discrete"')}${track("opacity", [[aStart - 0.05, 0], [aStart, 1], [A2.end + 1.2, 1], [A2.end + 1.6, 0]])}<animate attributeName="r" dur="1.1s" repeatCount="indefinite" values="5.5;4;5.5"/></circle>`;
  }

  /* ---- 近 30 天迷你柱状图 ---- */
  const sp = A2.end + 0.5;
  const base = 548;
  const maxC = Math.max(1, ...last30.map((x) => x.count));
  allText += "Last 30 days";
  let bars = "";
  last30.forEach((x, i) => {
    const h = x.count === 0 ? 2.5 : Math.max(5, (x.count / maxC) * 40);
    const s = sp + 0.15 + i * 0.03;
    bars += `<rect x="${X + i * 13}" y="${r1(base - h)}" width="8" height="${r1(h)}" rx="2.5" class="${x.count === 0 ? "l0" : "gr"}" ${x.count === 0 ? "" : `opacity="${(0.45 + 0.55 * (x.count / maxC)).toFixed(2)}"`}>${grow("height", 0, h, s, 0.7)}${grow("y", base, base - h, s, 0.7)}</rect>`;
  });
  fg += `<g>${rise(sp, 0.4, 6)}<text x="${X}" y="496" font-size="15" font-weight="${BOLD}" class="fg" xml:space="preserve">${zh ? "近 30 天" : "Last 30 days"}<tspan class="mu" font-weight="400"> · ${month}</tspan></text></g>${bars}`;

  /* ---- 行内 code 标签 ---- */
  const chipTexts = [
    `@${d.user}`,
    zh ? `${d.repos} 仓库` : `${d.repos} repos`,
    `★ ${fmtN(d.stars)}`,
    zh ? `${fmtN(d.followers)} 关注者` : `${fmtN(d.followers)} followers`,
  ];
  let cx = X;
  const cs = sp + 1.3;
  chipTexts.forEach((t, i) => {
    allText += t;
    const w = mw(t, `400 13px ${MONO}`) + 20;
    fg += `<g>${rise(cs + i * 0.18, 0.4, 6)}<rect x="${r1(cx)}" y="570" width="${r1(w)}" height="26" rx="7" style="fill:var(--mu)" opacity=".18"/><text x="${r1(cx + 10)}" y="587.5" font-size="13" font-family="${MONO.replace(/"/g, "'")}" class="fg">${esc(t)}</text></g>`;
    cx += w + 10;
  });

  /* ================= 右栏 ================= */
  const RX = 660;
  const hs = 5.6;
  allText += "Contributions · last 26 weeks";
  fg += `<g>${rise(hs - 0.4, 0.4, 6)}<text x="${RX}" y="${TY}" font-size="15" font-weight="${BOLD}" class="fg" xml:space="preserve">${zh ? "贡献热力图" : "Contributions"}<tspan class="mu" font-weight="400"> · ${zh ? "近 26 周" : "last 26 weeks"}</tspan></text></g>`;

  // 热力图
  {
    const map = new Map(days.map((x) => [x.date, x]));
    const lastD = new Date(days[days.length - 1].date + "T00:00:00");
    const start = new Date(lastD);
    start.setDate(start.getDate() - lastD.getDay() - 25 * 7);
    for (let c = 0; c < 26; c++) {
      let cells = "";
      for (let r = 0; r < 7; r++) {
        const dt = new Date(start);
        dt.setDate(start.getDate() + c * 7 + r);
        if (dt > lastD) continue;
        const cell = map.get(iso(dt));
        cells += `<rect x="${RX + c * 18}" y="${282 + r * 18}" width="15" height="15" rx="4" class="l${cell?.level ?? 0}"/>`;
      }
      fg += `<g>${show(hs + c * 0.055, 0.3)}${cells}</g>`;
    }
  }

  // 语言
  const ls = 8.4;
  allText += "Languages";
  fg += `<g>${rise(ls, 0.4, 6)}<text x="${RX}" y="456" font-size="15" font-weight="${BOLD}" class="fg">${zh ? "常用语言" : "Languages"}</text></g>`;
  const maxP = Math.max(...d.langs.map((l) => l.pct), 1);
  d.langs.slice(0, 5).forEach((l, i) => {
    const y = 486 + i * 27;
    const s = ls + 0.3 + i * 0.16;
    const bw = (l.pct / maxP) * 250;
    allText += l.name;
    fg += `<g>${rise(s, 0.4, 5)}<text x="${RX}" y="${y}" font-size="15" class="fg">${esc(l.name)}</text><rect x="${RX + 128}" y="${y - 10}" width="250" height="7" rx="3.5" style="fill:var(--mu)" opacity=".18"/><rect x="${RX + 128}" y="${y - 10}" width="${r1(bw)}" height="7" rx="3.5" fill="${l.color}">${grow("width", 0, bw, s + 0.1, 0.9)}</rect><text x="${RX + 468}" y="${y}" font-size="13.5" text-anchor="end" class="mu" font-family="${MONO.replace(/"/g, "'")}">${l.pct.toFixed(1)}%</text></g>`;
  });

  /* ================= 样式 ================= */
  allText += "0123456789.:%@#-+*()/ ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const fontCss = (await embedFontCss(allText)) ?? "";
  const light = `--fg:#1f2328;--mu:#656d76;--bg:#ffffff;--gr:#2da44e;--l0:#e3e8ee;--l1:#aceebb;--l2:#4ac26b;--l3:#2da44e;--l4:#116329;`;
  const dark = `--fg:#f0f3f6;--mu:#9198a1;--bg:#0d1117;--gr:#3fb950;--l0:#262c36;--l1:#0e4429;--l2:#006d32;--l3:#26a641;--l4:#39d353;`;
  const themeCss =
    o.theme === "dark"
      ? `svg{${dark}}`
      : o.theme === "light"
        ? `svg{${light}}`
        : `svg{${light}}@media (prefers-color-scheme:dark){svg{${dark}}}`;
  const css = `${fontCss}${themeCss}text{font-family:${SANS.replace(/"/g, "'")}}.fg{fill:var(--fg)}.mu{fill:var(--mu)}.gr{fill:var(--gr)}.l0{fill:var(--l0)}.l1{fill:var(--l1)}.l2{fill:var(--l2)}.l3{fill:var(--l3)}.l4{fill:var(--l4)}`;

  const globalFade = track("opacity", [[0, 1], [T - 1, 1], [T - 0.3, 0]]);

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title)} ${esc(o.prefix)} ${esc(o.nameA)} / ${esc(o.nameB)}">
<title>${esc(o.title)} ${esc(o.prefix)} ${esc(o.nameA)} / ${esc(o.nameB)}</title>
<style>${css}</style>
<defs>${defs}</defs>
<g clip-path="url(#canvas)"><g mask="url(#fadeM)">${bg}${scrim}</g></g>
<g>${globalFade}${fg}</g>
</svg>`;
}
