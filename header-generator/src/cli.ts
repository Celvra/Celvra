// 无浏览器的 header.svg 生成入口：直接用 Node 跑 svg.ts 的同一套逻辑
// （文字测量用 lib/measure-node.ts 的字体度量代替 canvas）。
// 环境变量见 README.md。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { fetchGithub } from "./lib/github";
import { createNodeDeps } from "./lib/measure-node";
import { buildSvg, type Options } from "./lib/svg";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, "..");
const repoRoot = path.resolve(pkgRoot, "..");
const env = process.env;
const num = (v: string | undefined, d: number) => (v === undefined || v === "" ? d : Number(v));

const opts: Options = {
  title: env.TITLE ?? "Hi there!",
  prefix: env.PREFIX ?? "We're",
  nameA: env.NAME_A ?? "残月",
  nameB: env.NAME_B ?? "明兮",
  image: null,
  blur: num(env.BLUR, 10),
  fade: num(env.FADE, 30),
  overlay: num(env.OVERLAY, 54),
  theme: env.THEME === "dark" || env.THEME === "auto" ? env.THEME : "light",
  lang: env.LANG === "zh" ? "zh" : "en",
  nameColor: env.NAME_COLOR ?? "#ff8a65",
};

const user = env.GH_USER || env.GITHUB_REPOSITORY_OWNER || "Celvra";
const token = env.ACCESS_TOKEN || "";
const out = path.resolve(repoRoot, env.OUTPUT || "header.svg");

// 背景图：默认仓库根的 bg.png，IMAGE= 置空则用渐变光斑背景。
// 和网页版上传一致：宽度压到 1400px 内、JPEG 80，避免把几 MB 的原图直接塞进 SVG。
const imagePath = env.IMAGE === undefined ? path.join(repoRoot, "bg.png") : env.IMAGE;
if (imagePath) {
  if (!existsSync(imagePath)) {
    throw new Error(`背景图不存在：${imagePath}（用 IMAGE= 指定，或 IMAGE= 置空使用渐变背景）`);
  }
  const jpg = await sharp(readFileSync(imagePath))
    .resize({ width: 1400, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  opts.image = `data:image/jpeg;base64,${jpg.toString("base64")}`;
  console.log(`背景图：${path.relative(repoRoot, imagePath)} → ${(jpg.length / 1024).toFixed(0)} KB`);
}

console.log(`获取 @${user} 的 GitHub 数据…`);
const data = await fetchGithub(user, token);
console.log(
  `仓库 ${data.repos} · star ${data.stars} · 关注者 ${data.followers}` +
    (data.demo ? "（贡献热力图用了回退数据）" : ""),
);

const deps = await createNodeDeps([opts.title, opts.prefix, opts.nameA, opts.nameB]);
const svg = await buildSvg(opts, data, deps);
writeFileSync(out, svg);
console.log(`✓ 已生成 ${path.relative(repoRoot, out)}（${(svg.length / 1024).toFixed(0)} KB）`);
