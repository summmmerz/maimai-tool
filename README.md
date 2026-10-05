# 抽歌终端 · maimai DX Challenge Generator

本地小工具：按 **定数 / 难度 / 谱面类型 / 版本 / BPM / 谱师 / 歌名** 圈出一个练习池，
随手随机抽几首去练。纯本地运行，只加载一次公开曲库数据，之后不联网。

## 跑起来

双击 `start.bat`（或在项目目录执行 `python -m http.server 8770`），
浏览器会自动打开 <http://127.0.0.1:8770/>。

两个页面：

- **抽歌器** <http://127.0.0.1:8770/> —— 按条件圈池子、随机抽谱
- **推分规划器** <http://127.0.0.1:8770/plan.html> —— 拉自己的成绩，算推分收益

三个 bat：

| 脚本 | 作用 |
|---|---|
| `start.bat` | 起本地服务并打开浏览器 |
| `fetch-records.bat` | 拉自己的成绩到 `data/records.json`（推分规划器用） |
| `update-db.bat` | 重新抓曲库，覆盖 `data/songs.json` |

> 必须用本地 HTTP 服务打开，**不能直接双击 `index.html`**：
> 浏览器的 `file://` 协议会用 CORS 挡住 `fetch('data/songs.json')`。

操作要点：

- `Space` 或点中间的 8 键环 = 再抽一次
- 数量 / 种子：填了种子结果可复现（`seed 42` 每次都是同一组）
- 「排除历史抽过的谱面」默认开启，所以连续抽不会抽到重复的；历史保留最近 300 次
- 「复制结果」一键把本次结果拷成文本，方便甩群里

## 数据

`data/songs.json`（768 KB，1344 首 / 5564 张谱）由 `build_db.py` 抓两个公开接口合并而成，
都不需要 API key：

| 来源 | 拿它做什么 |
|---|---|
| [落雪 maimai DX API](https://maimai.lxns.net/docs/api/maimai) | 主数据：定数 `level_value`、谱师 `note_designer`、BPM、曲目版本 |
| [落雪别名接口](https://maimai.lxns.net/api/v0/maimai/alias/list) | 曲目别名：中文译名 / 罗马音 / 社区绰号（无需密钥） |
| [水鱼 diving-fish API](https://maimai.diving-fish.com/manual/docs/developer/zh-api-document) | 版本名（`basic_info.from`）、物量（note 数） |

两条踩坑记录（写死在脚本里）：

- **水鱼的 DX 谱曲目 id = 标准谱 id + 10000**，不换算的话有一半曲目匹配不上。
- 落雪按谱面给 `version` 码，水鱼给版本名字符串，所以版本名用「按 `version` 码投票」推导，
  1282 首能直接命中，剩下 62 首是宴会场曲目，统一标为「宴会场」。
- **歌名 / 谱师支持中文别名与罗马音**：曲目别名来自落雪 `alias/list`（覆盖 1044 / 1344 首，
  含「快乐断手器」「扭腰舞」这类社区绰号，以及 `happysynthesizer` 这类罗马音）。
  谱师没有别名数据集，用「假名 → 罗马音 + 剥掉 `譜面-` 前缀 + 归一化子串命中」解决：
  `ニャイン`→`nyain`、`はっぴー`→`happi`、`譜面-100号`→`100号`。
  三条谱师别名（`小鳥遊さん`→`takanashi` 等）写在 `core.js` 的 `DESIGNER_ALIAS` 里，可自行追加。
- 宴会场谱面仍留在数据里（用于「新血」表的排除判断），但抽歌器的谱面类型只有 SD / DX。

更新曲库：双击 `update-db.bat`（重新抓取并覆盖 `data/songs.json`）。
`data/raw_*.json` 是原始响应缓存，删掉后会自动重抓。

## 已知限制

- **宴会场 62 首谱面没有物量数据**（水鱼那边对不上），界面显示 `—`；其余 5502 张都有。
- 定数 / 版本以两个第三方查分器的公开数据为准，**新版本上线后可能滞后几天**，跑一次更新即可。
- 曲目与定数为日服 / 国服通用口径；国服未上线的曲子也在库里（可按版本自己筛掉）。
- 只是本地练习辅助工具，不涉及任何账号信息，也不修改成绩数据。

## 推分规划器（plan.html）

先把成绩拉下来：填 `config.json` 里的 `username`（你自己在水鱼查分器的用户名），
然后双击 `fetch-records.bat`。想先看界面长什么样，跑 `python fetch_records.py --test`，
它会拉官方测试数据（成绩是假的，但结构和真实一致）。

按拉到的数据量分两种模式：

| 模式 | 条件 | 能做什么 |
|---|---|---|
| **B50** | 只填 `username` | 看你最好的一批成绩、每张抬一档能加多少分。**看不到「哪些没打过」** |
| **完整成绩** | 额外填 `import_token` | 多一张「新血」表：没打过的谱里哪些值得打 |

`import_token` 在水鱼官网登录后「编辑个人资料」里生成，复制粘贴即可，**不需要申请成为开发者**。

> ⚠️ 网上很多老教程让你申请 `Developer-Token`：**它已经停止签发**，2027-01-01 起一律返回 410，
> 已被水鱼账号 OAuth 取代。别照着老教程折腾。

规划器里三块内容：

1. **距下一千** —— 当前 rating、离下一个整千还差多少、按你的谱面抬一档平均能加几分、大概要抬多少次
2. **临门一脚** —— 已打谱面抬到**下一个够得着的档位**（97 / 98 / 99 / 99.5 / 100 / 100.5%，
   比如 100.19% → 100.5%）的真实收益，默认按**离下一档最近**排序。
   注意「增益 0」不是 bug：那张谱现在排在 Top35/Top15 之外，抬了也不进分
3. **新血**（完整模式才有）—— 未打谱面里，打满 100.5% 时单曲 ra ≥ 当前 B50 门槛的，按能加多少分排序

### 评分口径（与官方一致）

取自水鱼开源实现 `ScoreCoefficient`：

```
单曲 ra = floor(c × 定数 × min(100.5, 达成率) / 100)
总 rating = 旧曲 Top35 + 新曲 Top15     （宴会场曲目不参与）
```

`c` 是按达成率分段查表：80%→13.6、90%→15.2、97%→20.0、98%→20.3、99%→20.8、
99.5%→21.1、100%→21.6、100.5%→22.4。**同一张谱抬到下一档系数是加分最快的动作**，
所以规划器就是围绕「下一档」算的。

新旧曲的划分用曲库里水鱼 `basic_info.is_new` 这个字段；查不到的曲目一律当旧曲。

## 手机 / PWA（Android）

两个页面都是零后端静态页，手机上两种用法：

1. **托管版（推荐）**：部署到 GitHub Pages 后，手机 Chrome 开
   `https://<用户名>.github.io/maimai-tool/`，菜单里「添加到主屏幕」，用起来就是个 App
   （`manifest.json` + `sw.js`，图标是脚本生成的 8 键环）。
2. **局域网**：PC 上跑 `start.bat`，手机同 WiFi 开 `http://<PC局域网IP>:8770/`。
   需要放行 Windows 防火墙入站，卡巴斯基也可能拦（见文末）。

手机上取成绩**不需要 bat**：规划器顶部的 **00 取成绩** 面板有两种拉法。

1. **拉取 B50**：填水鱼用户名即可，不需要任何密钥。
   （实测水鱼接口 `Access-Control-Allow-Origin: *`，预检 `OPTIONS` 返回 200 且
   `Access-Control-Allow-Headers` 含 `content-type`，所以浏览器可以直接跨域 POST。）
2. **拉取完整成绩**：粘上你自己的 `Import-Token`（水鱼官网「编辑个人资料」生成）。
   预检同样允许 `import-token` 头，所以网页也能直接拉全量成绩——**这样任何访客都能在网页上
   用自己的令牌拿自己的完整成绩，不需要仓库里放任何人的数据**。
   令牌默认只存在内存，勾「记住这台设备」才落到 localStorage；「清除本机成绩」会一并清掉。
   本页没有任何第三方脚本 / CDN / 统计，随时可在官网重置令牌。

拉到的成绩存在浏览器 localStorage 里。**PC 上的 `Import-Token` 仍然只填 `config.json`**，
`data/records.json` 不进仓库（见下）。

### 部署到 GitHub Pages

```bash
git init -b main && git add -A && git commit -m "舞萌小工具：抽歌器 + 推分规划器"
gh repo create maimai-tool --public --source=. --push
gh api -X POST repos/<用户名>/maimai-tool/pages -f 'source[branch]=main' -f 'source[path]=/'
```

`.gitignore` 已排除 `config.json`（含用户名 / token）、`data/records.json`（**你的真实成绩，别公开**）、
`data/raw_*.json`（可重抓的缓存）。仓库里只有前端 + 曲库。

### Service Worker 策略（重要）

- HTML / CSS / JS：**network-first**，改完重新部署就生效，断网回退缓存
- 字体 / 图标 / 数据：**cache-first**，省流量。改了 `data/songs.json` 记得把 `sw.js` 里的
  `CACHE` 版本号 +1，否则手机上还在用旧曲库

（这个坑是实测踩到的：最初全用 cache-first，改完 CSS 后手机端一直加载旧样式。）

### 字体

标题和数字用 **Barlow Condensed**（SIL OFL 1.1，许可见 `fonts/OFL.txt`，只打包 latin 子集，2×22KB），
中文回落系统字体。原来用的 Bahnschrift 是 Windows 独占，手机上会掉风格，所以换成自带字体。

## 卡巴斯基

本机装了卡巴斯基 21.22。实测它会拦截 DSH 派生子进程，表现是命令返回 `Error: spawn EPERM`
**且命令根本没执行**（短命令偶尔能过、长命令和无头浏览器基本必挂），也可能拦
`msedge --headless --allow-file-access-from-files` 这类行为。哪条命令莫名"没反应"，
先去卡巴斯基「报告 → 检测 / 受阻止对象」看，别先怀疑代码。
前端验证如果要跑无头浏览器，用 `python -m http.server` + **普通**无头模式，
别加 `--allow-file-access-from-files`。
