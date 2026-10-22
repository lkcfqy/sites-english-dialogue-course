# 英语生活剧场

## 公开源码导出说明（2026-10-22）

- 来源：Sites 最新保存版本 **v4**，源码提交 `e13e5211eaac31eba393a4899cb113418fb42c9a`。
- 这是应用源码快照，不包含原 Git 历史，也没有修改或重新部署原 Site。
- `.openai/hosting.json` 的项目身份已替换为 `YOUR_SITES_PROJECT_ID`。如需部署，先注册你自己的项目并配置身份与 D1 `DB` 绑定；不要指向他人的部署。
- 不包含 `.git`、`node_modules`、生产构建包、凭证、会话、运行时数据库、学习记录或聊天数据。SQL 与 `drizzle/meta` 仅为建表迁移/结构，不是数据库内容导出。
- 保留 `package-lock.json` 及现有第三方许可声明。未新增项目开源许可证；公开可见不代表授予新的开源许可。
- 本次导出只进行了源码/敏感项和配置检查；没有安装依赖、重跑生产构建、浏览器或线上服务验收。下文原有通过记录属于源版本历史说明，不是此次复验结果。

### 独立本地启动

需要 Node.js 22.13+。先运行 `npm run install:ci`，按下文初始化本地数据库，然后运行 `npm run dev`（默认本地端口 5173）。生产构建为 `npm run build`，构建后本地预览为 `npm start`。开发登录为本地模拟身份，不是原 Site 的真实账户；不要把开发服务器作为安全的生产登录服务公开。

`.env.example` 仅说明配置入口，不含密钥。本项目当前不需要用户 API 密钥；`DB` 是 Cloudflare D1 绑定而非 `.env` 字符串。托管登录需要你自己的 Sites 平台环境。导出不会带入任何已有云端学习数据。

语音代码中的 Edge 协议公共客户端常量与公开上游实现相符，并非用户的私有 API 密钥；该非官方服务仍可能变化或失效。未调用语音服务或导出音频。

以大量英语对话和句子建立理解、接话与独立表达能力。26 周、每周 5 课，共 130 课、650 段对话；路线面向接近雅思 7 分所描述的实际语言能力，不包含备考入口。课程进阶是学习路线，不是能力认证。

## 学习路线

- 第 1–4 周：听懂日常安排、需求和约定，确认细节，尝试接话。
- 第 5–9 周：讲清经历、原因和选择，追问、澄清与委婉协商。
- 第 10–18 周：理解较长讨论，区分事实与观点，用例子支持表达。
- 第 19–22 周：解释限制和不确定性，回应不同意见，协商取舍。
- 第 23–26 周：连贯展开复杂话题，改述意思，迁移到陌生交流。

每课包含 3 段情境与表达对话，另有 2 段逐课编写的完整交流。短段为 4 或 8 句，新增对话为 8–12 句，带人物、交流目的、理解问题、参考回答和开口任务。12 课旧辅导素材已重写为真实交流；130 课主对话的理解问题均只取证于当前段落。阶段能力检查要求在新情境里复述、说明、回应追问，帮助判断自己能否独立使用语言。

## 使用方式

- **连续听**：依次播放本课各段，完成后接下一课。
- **跟读**：每句播放后留出开口时间。
- **角色接话**：轮到所选角色时先自己回答，再听参考台词。

字幕可切换英文、双语或隐藏；支持整句重听、语速和重复次数。全程使用美音 Jenny / Guy。页面不提供单词入口、词卡或逐词释义。

句子收藏、自主表达笔记、上次课程位置和播放偏好保存在当前浏览器。开始书写会暂停播放，草稿逐次自动保存，避免连播切换时丢失。表达笔记可以保留自己对情境的英语回应，并自查是否讲清意思、给出细节、能够改述；这些记录不计为能力评分。对话的“听过了／稍后复听／能独立理解”状态在登录后按账号保存到 D1；保存失败会显示错误。旧词汇表和记录保留在数据库中。

建议每天安排 90–120 分钟，可分两次练习；每周 5 天新课，另外 2 天复听、阅读和自主表达。学习进度可以调整，半年能力目标需要通过新情境里的独立理解与表达验证。

## 开发与检查

需要 Node.js 22.13 或更新版本。首次准备本地数据库时先构建，随后执行下面两条迁移命令；已有旧版词汇表的本地数据库只需执行第二条。迁移使用的 `.wrangler/state` 与开发及生产构建预览共用。

```bash
npm run install:ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_lively_sugar_man.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_dialogue_progress.sql
npm run dev
```

本地预览可通过 `/signin-with-chatgpt?return_to=%2F` 建立开发账号会话。上述初始化命令只执行一次；接口不会在请求中创建表，缺少对话进度表时返回 503 并提示应用迁移。

```bash
npm run audit:course
npm test
npm run lint
npx tsc --noEmit
npm run build
```

`data/immersion.ts` 组合原有课程、两个 `immersion-dialogues-*.json` 扩展文件、两个 `immersion-checks-*.json` 理解检查文件和 `immersion-core-late.json` 核心改写文件，类型定义在 `data/immersion-types.ts`。首页服务端提供课程目录与初课，其余课程通过 `/api/course/[lessonId]` 按需加载，客户端不加载完整课程词典。

`/api/progress` 要求登录身份，读写仅限当前用户；对话 ID 与课程范围对应，状态限定为 `listened`、`revisit`、`understood`，响应禁止缓存。新增 `0001_dialogue_progress.sql` 只增加对话进度表，不删除旧记录。生产构建将 `drizzle/` 复制到 `dist/.openai/drizzle/`，Sites 发布流程应用这些迁移。

课程审计检查课程覆盖、双语内容、对话结构与整句重复。回归测试用模拟上游验证进度身份隔离、输入边界、语音完成、提前关闭、超时及取消，不批量调用语音服务。

语音沿用 Microsoft Edge Read Aloud 非官方 WebSocket 接口，无需 Azure Speech 密钥。服务端要求收到 `turn.end` 才返回完整音频；20 秒截止时间覆盖连接和音频接收，停止播放会传递取消信号。上游失败或接口变化时页面支持重试。
