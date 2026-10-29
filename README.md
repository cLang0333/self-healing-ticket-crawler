# 带自愈能力的票务爬虫

华信航空（Mandarin Airlines）国内线查票的只读冒烟测试。航司网页改版、选择器失效时，这个仓库要能自己发现、留下现场，并在后续步骤里把修复变成待人工审核的 PR。当前完成的是第一步：能稳定跑通的检查，以及失败时的现场。

## 项目目标

每晚自动打开华信国内线查票（松山 TSA → 金门 KNH，单程、1 位成人），确认结果页仍有班次，并且页面上的航班卡片和隐藏字段 `FlightJsonStr` 对得上。查不到、页面结构变了、或被反爬挡住时，保存整页截图、HTML 和报错，供后面的诊断使用。

这不是订票机器人。它不下单、不付款、不保存旅客资料。

## 只读保护

测试和本地脚本都遵守下面几条，代码里用点击拦截、提交拦截和请求拦截再挡了一层（`src/readonly-guard.ts`）：

- 只做航班搜索。首页「搜 尋」会走页面自己的 `beforeSub()`，先取隐形 reCAPTCHA v3 token 再提交。测试不伪造 token，也不绕过验证码。
- 不点击「我要購票」（`.buybt`）、「我要候補」（`.buybt01`）或 Confirm，不调用 `doConfirm` / `ShowFareInfo`。
- 不填写姓名、证件、电话、邮箱或其他个人信息。
- 不进入候补确认（`/b2c/Waiting/FlightConfirm`）、付款、出票页面。
- 不伪装成有头浏览器，不修改自动化特征。若被挑战页拦住，测试失败并留下现场，不尝试绕过。

`seatAmount` 里出现过数字 `0-9` 和字母 `L` / `C` / `S`。字母的业务含义没有写死，报告里原样输出。满舱、全部候补都算正常结果，测试不要求一定有余票。

## 整体架构

```text
每晚定时（北京时间 03:00–05:00 之间的随机时刻）
        │
        ▼
Playwright 只读冒烟
  ├─ 数据层：GET 结果页，解码 FlightJsonStr
  └─ UI 层：首页表单 TSA → KNH，比对 .ticket-box 与 JSON
        │
        ├─ 成功 → 上传结果页截图和 HTML，作为对比基线
        └─ 失败 → 保存全页截图、HTML、报错并上传
        │
        ▼
【待做】AI 对照失败现场和成功基线，判断是选择器漂移、流程变化还是反爬
        │
        ▼
【待做】只修改 selectors/mandarin.ts，自动开修复 PR
        │
        ▼
【待做】人工审核后合并，下一晚重新自检
```

| 步骤 | 状态 |
| --- | --- |
| 每晚自检，限速，只发少量请求 | 本次 |
| 失败留现场，成功留基线 | 本次 |
| AI 诊断选择器或流程哪里坏了 | 待做 |
| 自动改选择器并提 PR | 待做 |
| 人工审核 | 待做 |

自动修复以后只允许改 `selectors/mandarin.ts`。每个元素有多组定位（id、文字或 role、结构），按顺序用第一个恰好匹配一个元素的，其余是备份。解码、日期、只读护栏和用例流程不放进这个文件，避免修复选择器时把保护或断言改松。

## 这次做了什么

- 数据层：直接 GET `/b2c/BookingNPurchase/SearchFlight`，解码 `form#form2` 里 gzip + base64 的 `FlightJsonStr`，断言有班次且 `flightNumber`、`departureDateTime`、`arrivalDateTime`、`cabinInfoList[].rbd`、`cabinInfoList[].seatAmount` 齐全。
- UI 层：打开首页，先选出发地（会触发 `ChooseArrAirport()` 重建目的地），再选金门，确认单程和 1 成人 0 婴儿，出发日设为台北今天起第 7～14 天（默认 +10 天），提交搜索。断言 `.ticket-box` 数量大于 0，且和 JSON 班次数、航班号、起飞到达时间一致。班次号、时间和余座打印在测试输出里，并写入 `flights.txt`。
- 失败目录 `evidence/failure/<用例>/`：`page.png`（全页）、`page.html`（`page.content()`）、`error.txt`、`meta.json`。成功目录 `evidence/baseline/<用例>/` 是同一套快照，给以后的对比当基线。
- GitHub Actions：`.github/workflows/nightly-mandarin-smoke.yml`。

查询日固定一条航线、一个日期，全局 1 个 worker、0 次重试。一次运行只会打开结果页一次，再走一遍首页表单。两条用例之间空 2 秒。

## 目录

```text
selectors/mandarin.ts          选择器（以后只允许自动修复改这里）
src/readonly-guard.ts          只读拦截
src/flight-json.ts             gzip + base64 解码
src/read-flights.ts            读结果、拼报告
src/evidence.ts                截图 / HTML / 报错
src/dates.ts                   台北时区日期
src/route.ts                   TSA → KNH 与结果页 URL
src/locators.ts                多重定位的解析顺序
tests/mandarin-data.spec.ts    数据层
tests/mandarin-ui.spec.ts      UI 层
tests/fixtures.ts              护栏与现场保存
playwright.config.ts
.github/workflows/nightly-mandarin-smoke.yml
```

## 本地运行

需要 Node.js 20 或以上。依赖里的 `@playwright/test` 固定为当前稳定版 **1.64.1**。

```bash
npm ci
npx playwright install chromium
npm test
```

Linux 上如果缺少浏览器系统库，改用：

```bash
npx playwright install --with-deps chromium
```

只跑一层：

```bash
npm run test:data
npm run test:ui
```

出发日默认是台北今天 +10 天。要改成 7～14 之间的其他偏移：

```bash
DEPARTURE_OFFSET_DAYS=7 npm test
```

通过后，报告在终端的 `===== mandarin flights =====` 段，页面快照在 `evidence/baseline/`。HTML 报告：

```bash
npm run report
```

`evidence/`、`playwright-report/`、`test-results/` 不进 git。

## GitHub Actions

工作流在三种情况下运行：

- 每晚定时。cron 只能写固定时刻，这里写的是 UTC：`0 19 * * *`。中国标准时间 UTC+8、没有夏令时，所以这是北京时间 03:00。真正跑测试的时间不固定在 3 点：只有 `schedule` 会再随机等到当天北京时间 03:00–05:00（含两端）里的一个时刻。`workflow_dispatch` 和 `pull_request` 不等待，立刻跑。
- `workflow_dispatch` 手动触发。可选输入 `offset_days`（7～14，默认 10）。
- `pull_request`。

等待放在单独的 job 里，超时 130 分钟，盖住 120 分钟的窗口。访问航司的测试 job 仍是 20 分钟，并且只在测试阶段串行，避免等待的两小时挡住 PR。

成功时用 `actions/upload-artifact` 上传 `evidence/baseline/`（artifact 名 `mandarin-success-baseline-<run_id>`）。失败时上传 `evidence/failure/` 和 Playwright HTML 报告（`mandarin-failure-evidence-<run_id>`），里面有全页截图、HTML 和 `error.txt`。保留 14 天。

运行器是 GitHub 托管的 `ubuntu-latest`（美国 IP 段）。这条航线目前从美国 IP 可以打开。工作流不会并行第二份，避免和定时任务叠在一起打站点。

## 页面注意点

这些是写选择器时已经核对过的行为，改 `selectors/mandarin.ts` 时不要假设它们变了，除非新的失败现场证明变了：

- 首页表单是 `form#book`。出发地 `#depstn` 的 `onchange` 会重建 `#arrstn`，目的地要等选项出现后再选。
- 单程是 `#itinType1`（默认选中，控件本身隐藏）。日期格式 `yyyy/mm/dd`，写在 `#datepicker1 input[name=departureDate]`。另一个同名 `departureDate`（`#home_departureDate`）是来回程。
- 搜索按钮文字是「搜 尋」，`onclick` 为 `beforeSub()`。同一页还有一颗行程查询用的「搜 尋」，不在 `form#book` 里。
- Cookie 横幅 `#AcceptCookiePolicyButton` 不挡操作。
- 结果页由服务端渲染。直接 GET 结果页地址目前不带 reCAPTCHA 也会返回完整结果；从表单提交则是 POST 到同一个地址，并带上页面自己拿到的 `recaptcharesult`。
- `.ticket-list .ticket-box` 一张卡片一个航班。航班号在 `.air-type p`，起飞、到达是两个 `.flight-time p`（文字里带「起飛」「抵達」）。可售 `.buybt`，候补 `.buybt01`。
- 有票价时 `.price2` / `.price3` 里面有 `span`；没有票价时只有 `<p>--</p>`，没有 `span`。2026-10-29 查 2026/11/08 时，AE-1271 已经是「我要購票」，两列价格仍是 `--`。`seatAmount` 为 `C` 的舱等也会和「我要購票」同时出现，不要把字母翻译成候补或关闭。
- `FlightJsonStr` 出现两次：`form#form2` 和 `form#Waittingform`（页面原样拼写），而且 id 重复。只读 `form#form2` 那一份。解码后是 `{ data: [{ flightNumber, departureDateTime, arrivalDateTime, cabinInfoList: [{ rbd, seatAmount }] }] }`。
- `form#form2` 有隐藏字段 `ipCheck=true`。`cf_turnstile_response` 目前出现在解码后的 `PnrViewModelStr.searchModel` 里（值为 null），抓到的 HTML 里没有同名输入框。以后如果加上真正的挑战页，冒烟会失败并留下现场，而不是去解挑战。
