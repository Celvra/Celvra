export interface Lang {
  name: string;
  pct: number;
  color: string;
}
export interface Day {
  date: string; // YYYY-MM-DD
  count: number;
  level: number; // 0-4
}
export interface GhData {
  user: string;
  repos: number;
  followers: number;
  stars: number;
  langs: Lang[];
  days: Day[];
  demo: boolean;
}

const COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572a5",
  Go: "#00add8",
  Rust: "#dea584",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#8a8a8a",
  "C#": "#178600",
  Swift: "#f05138",
  Kotlin: "#a97bff",
  Ruby: "#cc342d",
  PHP: "#4f5d95",
  Shell: "#89e051",
  HTML: "#e34c26",
  CSS: "#7c5cff",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Dart: "#00b4ab",
  Lua: "#6a6ad0",
  Jupyter: "#da5b0b",
  "Jupyter Notebook": "#da5b0b",
  SCSS: "#c6538c",
  Zig: "#ec915c",
  Nix: "#7e7eff",
};
const PALETTE = ["#6e7bff", "#ff8a65", "#4dd0b1", "#f2c94c", "#c77dff", "#ff6b9a"];
const colorOf = (n: string, i: number) => COLORS[n] ?? PALETTE[i % PALETTE.length];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function demoData(user: string): GhData {
  const r = rng(
    [...user].reduce((a, c) => a + c.charCodeAt(0) * 31, 7) || 42,
  );
  const days: Day[] = [];
  const today = new Date();
  for (let i = 370; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const wd = d.getDay();
    const base = wd === 0 || wd === 6 ? 0.35 : 0.8;
    const wave = 0.55 + 0.45 * Math.sin(i / 17);
    const v = r() < base * wave ? Math.floor(r() * r() * 22) + 1 : 0;
    days.push({ date: iso(d), count: v, level: v === 0 ? 0 : v < 4 ? 1 : v < 9 ? 2 : v < 15 ? 3 : 4 });
  }
  const raw = [
    ["TypeScript", 46],
    ["Python", 22],
    ["Go", 14],
    ["Rust", 11],
    ["CSS", 7],
  ] as const;
  return {
    user,
    repos: 38,
    followers: 1280,
    stars: 4620,
    langs: raw.map(([name, pct], i) => ({ name, pct, color: colorOf(name, i) })),
    days,
    demo: true,
  };
}

async function j(url: string, ms = 9000, headers?: Record<string, string>) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

const BASE_HEADERS: Record<string, string> = { "User-Agent": "Celvra/header-generator" };

export async function fetchGithub(user: string, token?: string): Promise<GhData> {
  const auth: Record<string, string> = token
    ? { ...BASE_HEADERS, Authorization: `Bearer ${token}` }
    : BASE_HEADERS;
  const [profile, repos, contrib] = await Promise.all([
    j(`https://api.github.com/users/${user}`, 9000, auth),
    j(`https://api.github.com/users/${user}/repos?per_page=100&sort=pushed`, 9000, auth),
    j(`https://github-contributions-api.jogruber.de/v4/${user}?y=last`, 9000, BASE_HEADERS).catch(
      () => null,
    ),
  ]);

  const own = (repos as any[]).filter((r) => !r.fork);
  const stars = own.reduce((a, r) => a + (r.stargazers_count || 0), 0);
  const bag = new Map<string, number>();
  for (const r of own) {
    if (!r.language) continue;
    bag.set(r.language, (bag.get(r.language) || 0) + 1 + Math.sqrt(Math.max(r.size || 0, 1)) / 40);
  }
  const total = [...bag.values()].reduce((a, b) => a + b, 0) || 1;
  const langs = [...bag.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, v], i) => ({ name, pct: (v / total) * 100, color: colorOf(name, i) }));
  const sum = langs.reduce((a, l) => a + l.pct, 0) || 1;
  langs.forEach((l) => (l.pct = (l.pct / sum) * 100));

  const fallback = demoData(user);
  const days: Day[] = contrib?.contributions
    ? contrib.contributions.map((c: any) => ({ date: c.date, count: c.count, level: c.level }))
    : fallback.days;

  return {
    user: profile.login || user,
    repos: profile.public_repos ?? own.length,
    followers: profile.followers ?? 0,
    stars,
    langs: langs.length ? langs : fallback.langs,
    days,
    demo: !contrib,
  };
}
