import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildSvg, type Options } from "./lib/svg";
import { demoData, fetchGithub, type GhData } from "./lib/github";
import { cn } from "./utils/cn";

const DEFAULTS: Options = {
  title: "Hi there!",
  prefix: "We're",
  nameA: "残月",
  nameB: "明兮",
  image: null,
  blur: 10,
  fade: 30,
  overlay: 40,
  theme: "auto",
  lang: "en",
  nameColor: "#ff8a65",
};

async function compressImage(file: File, maxW = 1400): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const k = Math.min(1, maxW / img.width);
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-neutral-900";

function Slider({
  label,
  value,
  min,
  max,
  onChange,
  unit = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[12px] text-neutral-500">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full"
      />
    </div>
  );
}

function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-neutral-200/70 p-0.5">
      {options.map(([v, l]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn(
            "rounded-md px-3 py-1 text-[13px] transition",
            value === v ? "bg-white font-medium shadow-sm" : "text-neutral-500 hover:text-neutral-900",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [opts, setOpts] = useState<Options>(DEFAULTS);
  const [user, setUser] = useState("octocat");
  const [data, setData] = useState<GhData>(() => demoData("octocat"));
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [svg, setSvg] = useState("");
  const [previewSvg, setPreviewSvg] = useState("");
  const [previewBg, setPreviewBg] = useState<"dark" | "light">("dark");
  const [replay, setReplay] = useState(0);
  const [copied, setCopied] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Options>(k: K, v: Options[K]) => setOpts((o) => ({ ...o, [k]: v }));

  // 构建 SVG（防抖）
  useEffect(() => {
    let dead = false;
    const t = setTimeout(async () => {
      const out = await buildSvg(opts, data);
      if (dead) return;
      setSvg(out);
      if (opts.theme === "auto") {
        const p = await buildSvg({ ...opts, theme: previewBg }, data);
        if (!dead) setPreviewSvg(p);
      } else {
        setPreviewSvg(out);
      }
    }, 250);
    return () => {
      dead = true;
      clearTimeout(t);
    };
  }, [opts, data, previewBg]);

  const url = useMemo(() => {
    if (!previewSvg) return "";
    return URL.createObjectURL(new Blob([previewSvg], { type: "image/svg+xml" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewSvg, replay]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  const generate = useCallback(async () => {
    const u = user.trim().replace(/^@/, "");
    if (!u) {
      setData(demoData("yourname"));
      setMsg("未填写用户名，使用示例数据");
      return;
    }
    setLoading(true);
    setMsg("");
    try {
      const d = await fetchGithub(u);
      setData(d);
      setMsg(d.demo ? "贡献热力图接口暂不可用，该部分使用示例数据" : "已获取 GitHub 实时数据");
    } catch {
      setData(demoData(u));
      setMsg("获取失败（用户不存在或触发限流），已使用示例数据");
    }
    setReplay((n) => n + 1);
    setLoading(false);
  }, [user]);

  // 首次进入自动尝试一次
  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFile = async (f?: File | null) => {
    if (!f || !f.type.startsWith("image/")) return;
    set("image", await compressImage(f));
  };

  const copy = async (text: string, tag: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(tag);
    setTimeout(() => setCopied(""), 1400);
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    a.download = "header.svg";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const kb = (svg.length / 1024).toFixed(0);

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* 控制面板 */}
      <aside className="w-full shrink-0 overflow-y-auto border-b border-neutral-200 bg-[#fbfbfa] p-6 lg:w-[360px] lg:border-b-0 lg:border-r">
        <h1 className="text-lg font-semibold tracking-tight">SVG 头图生成器</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-neutral-500">
          生成带动画的 GitHub README 头图，字体与图片均内嵌，直接可用。
        </p>

        <div className="mt-6 space-y-7">
          <section className="space-y-3">
            <Field label="GitHub 用户名">
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  value={user}
                  placeholder="octocat"
                  onChange={(e) => setUser(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && generate()}
                />
              </div>
            </Field>
            <button
              onClick={generate}
              disabled={loading}
              className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60"
            >
              {loading ? "正在生成…" : "一键生成"}
            </button>
            {msg && <p className="text-[12px] text-neutral-500">{msg}</p>}
          </section>

          <section className="space-y-3">
            <div className="text-[12px] font-medium text-neutral-500">背景图片</div>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                onFile(e.dataTransfer.files[0]);
              }}
              className={cn(
                "relative flex h-24 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed text-[13px] text-neutral-500 transition",
                drag ? "border-neutral-900 bg-neutral-100" : "border-neutral-300 hover:border-neutral-500",
              )}
            >
              {opts.image ? (
                <>
                  <img src={opts.image} className="absolute inset-0 h-full w-full object-cover" />
                  <span className="relative rounded bg-black/55 px-2 py-0.5 text-white">点击更换</span>
                </>
              ) : (
                "点击或拖入图片（默认使用渐变背景）"
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            {opts.image && (
              <button
                onClick={() => set("image", null)}
                className="text-[12px] text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline"
              >
                移除图片
              </button>
            )}
            <Slider label="高斯模糊" value={opts.blur} min={0} max={40} onChange={(v) => set("blur", v)} unit="px" />
            <Slider label="渐变起点（向下透明）" value={opts.fade} min={0} max={85} onChange={(v) => set("fade", v)} unit="%" />
            <Slider label="文字遮罩" value={opts.overlay} min={0} max={90} onChange={(v) => set("overlay", v)} unit="%" />
          </section>

          <section className="space-y-3">
            <div className="text-[12px] font-medium text-neutral-500">文本</div>
            <Field label="标题">
              <input className={inputCls} value={opts.title} onChange={(e) => set("title", e.target.value)} />
            </Field>
            <Field label="副标题前缀">
              <input className={inputCls} value={opts.prefix} onChange={(e) => set("prefix", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="名字 A">
                <input className={inputCls} value={opts.nameA} onChange={(e) => set("nameA", e.target.value)} />
              </Field>
              <Field label="名字 B">
                <input className={inputCls} value={opts.nameB} onChange={(e) => set("nameB", e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-[12px] font-medium text-neutral-500">样式</div>
            <div className="flex items-center justify-between">
              <span className="text-[13px]">主题</span>
              <Seg
                value={opts.theme}
                onChange={(v) => set("theme", v)}
                options={[
                  ["auto", "自动"],
                  ["dark", "深色"],
                  ["light", "浅色"],
                ]}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px]">内容语言</span>
              <Seg
                value={opts.lang}
                onChange={(v) => set("lang", v)}
                options={[
                  ["en", "English"],
                  ["zh", "中文"],
                ]}
              />
            </div>
          </section>
        </div>
      </aside>

      {/* 预览 */}
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 lg:p-10">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="mr-auto text-[13px] text-neutral-500">
            预览 · 1200 × 620 · {kb} KB
          </div>
          <Seg
            value={previewBg}
            onChange={setPreviewBg}
            options={[
              ["dark", "深色底"],
              ["light", "浅色底"],
            ]}
          />
          <button
            onClick={() => setReplay((n) => n + 1)}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-[13px] hover:border-neutral-900"
          >
            重播
          </button>
          <button
            onClick={() => copy(svg, "svg")}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-[13px] hover:border-neutral-900"
          >
            {copied === "svg" ? "已复制" : "复制代码"}
          </button>
          <button
            onClick={download}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-700"
          >
            下载 SVG
          </button>
        </div>

        <div
          className={cn(
            "overflow-hidden rounded-xl border",
            previewBg === "dark" ? "border-neutral-800 bg-[#0d1117]" : "border-neutral-200 bg-white",
          )}
        >
          {url ? (
            <img key={url} src={url} alt="preview" className="block w-full" draggable={false} />
          ) : (
            <div className="flex aspect-[1200/620] items-center justify-center text-sm text-neutral-400">
              生成中…
            </div>
          )}
        </div>

        <div className="mt-6 text-[13px] text-neutral-500">
          <p className="mb-2 font-medium text-neutral-700">使用方法</p>
          <p>
            把下载的 <code className="rounded bg-neutral-200/70 px-1.5 py-0.5">header.svg</code> 放进你的{" "}
            <code className="rounded bg-neutral-200/70 px-1.5 py-0.5">username/username</code> 仓库，然后在 README 中引用：
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-neutral-200/60 px-3 py-2 font-mono text-[12px] text-neutral-800">
              {`![header](./header.svg)`}
            </code>
            <button
              onClick={() => copy("![header](./header.svg)", "md")}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-[12px] hover:border-neutral-900"
            >
              {copied === "md" ? "已复制" : "复制"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
