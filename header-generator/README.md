# header-generator

用 [animated-svg-header-generator](../README.md) 的逻辑生成 README 头图（带动画的 SVG）。
`npm run generate` 不开浏览器，直接在 Node 里跑 `src/lib/svg.ts` 的同一套 TS 逻辑
（文字测量用 fontkit 字体度量代替 canvas，实测误差 < 0.1px），GitHub Action 用的就是这个。

- `npm run dev` — 启动可视化编辑器，调参后下载
- `npm run generate` — 生成 `../header.svg`（默认参数就是本仓库头图那套）

## generate 的环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `GH_USER` | `GITHUB_REPOSITORY_OWNER` / `Celvra` | 拉数据的 GitHub 用户名 |
| `ACCESS_TOKEN` | 空 | GitHub token（Action 里传 `secrets.PAT`） |
| `IMAGE` | `../bg.png` | 背景图路径；设为空字符串则用渐变光斑背景 |
| `TITLE` | `Hi there!` | 标题 |
| `PREFIX` | `We're` | 副标题前缀 |
| `NAME_A` / `NAME_B` | `残月` / `明兮` | 轮播的两个名字 |
| `NAME_COLOR` | `#ff8a65` | 名字与光标的纯色 |
| `THEME` | `light` | `light` / `dark` / `auto`（跟随系统） |
| `LANG` | `en` | 文案语言 `en` / `zh` |
| `BLUR` / `FADE` / `OVERLAY` | `10` / `30` / `54` | 背景模糊 / 渐变起点% / 文字遮罩% |
| `OUTPUT` | `../header.svg` | 输出路径 |

## 说明

- 动画由 SVG 自带的 SMIL（`<animate>`）驱动，**只在浏览器里播放**（GitHub README 正常显示）；
  系统看图软件只显示第一帧，属正常现象。
- 网页版（`npm run dev`）上传背景图时用 canvas 压到 1400px/JPEG 80，
  `generate` 用 sharp 做同样的压缩，所以两边输出基本一致。
