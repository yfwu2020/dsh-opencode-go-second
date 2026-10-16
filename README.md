# OpenCode Go · 2

这是独立的 DeepSeek Harness 模型插件，只注册 `opencode-go-second`。
第一套 `opencode-go` 和其他供应商继续由原生适配器管理。

## 安装

已验证环境为 DeepSeek Harness `0.2.0-rc.2`、Node.js `>=22.19.0`。
DSH 官方包通过精确版本的 peer dependencies 复用宿主；其他版本请先验证兼容性。

桌面端可安装发布包：

```sh
dsh plugin --profile desktop add https://github.com/yfwu2020/dsh-opencode-go-second/releases/download/v0.2.2/dsh-opencode-go-second.tgz
```

Web 端将 `--profile desktop` 改为 `--profile web`。也可以从源码安装：

```sh
dsh plugin --profile desktop add github:yfwu2020/dsh-opencode-go-second
```

安装后重启 DSH，在设置 → 模型 → OpenCode Go · 2 → 管理中配置 **OpenCode Go**
API 密钥，点击“获取可用模型”，选择后保存。模型是否能实际调用由账号权限、额度
和上游服务状态决定，目录查询成功不代表逐个模型已通过推理测试。

本插件新增独立的 `opencode-go-second` 连接，不替换原生适配器或其他供应商配置。
默认使用密钥引用 `OPENCODE_API_KEY`；如果已在别处使用相同引用，请先为新连接
选择独立引用，避免更新密钥时影响使用同一引用的其他连接。

### 本地开发

克隆仓库后运行 `npm ci` 和 `npm test`。需要联调时，将 DSH profile 的
`package.json` 依赖指向 `link:<项目的绝对路径>`，在 `dsh.profile.bundles` 中添加
`dsh-opencode-go-second`，并合并本仓库 `cordis.patch.yml` 中的条目；不要覆盖已有
profile 文件。DSH profile 通常位于 `~/.dsh/profiles/desktop`。

`migration.mjs` 仅供处理本项目特定的旧覆盖方案，不随发布包交付。
普通安装不需要运行它；维护旧方案前应备份并核对原配置。

## 使用与隔离

设置 → 模型中显示“OpenCode Go · 2”。密钥沿用 DSH 密钥库里的
`OPENCODE_API_KEY` 引用，插件不保存或打印密钥。内置 38 个备用模型；可手动刷新当前账号可用的模型。
点卡片右侧“管理”可查看和搜索模型、选择启用模型、获取可用模型。
有改动时显示“保存模型”和“撤销修改”；替换密钥需要单独点“更新密钥”。
收起面板保留未保存的修改。原生编辑入口仅在此插件卡片中隐藏，第一套不受影响。
各模型按资料使用 Chat Completions、Responses 或 Anthropic Messages 接口；
新加入的 Google 模型使用 Google Generative AI 接口。
会话标识取自 DSH 当前聊天，User-Agent 复用 DSH 的请求标识。
两个连接之间没有密钥轮换、自动降级或路由覆盖。

迁移时第二套内部名称由 `opencode` 变为 `opencode-go-second`，避免与原生 Zen
设置目录冲突。当前全局默认模型会迁移到新名称，模型和推理等级保持原值。
聊天记录不修改；若某个旧聊天单独保存了旧连接选择，需要重新选择“第二套”。
不同适配器之间的历史按 DSH 官方规则转换为通用历史，原生专用回放信息可能
不再被复用，但文本、工具调用与结果仍保留。

## 实现

依赖官方发布的 `@deepseek-ai/dsh-llm-pi-ai@0.2.0-rc.2` 和
`@earendil-works/pi-ai@0.87.1`，复用公开的 `PiAiAdapter` 以及原生 Go provider。
没有复制核心适配器源码、替换原生包或导入 app.asar 内的绝对路径。
`package-lock.json` 固定依赖版本；升级 DSH 后仍需检查公开接口的兼容性。

模型元数据合并了当时的原生 Go/Zen 目录与 models.dev 的 Go 资料。
可用 ID 来自第二套认证的 `/zen/go/v1/models` 查询，不使用未认证的公共列表。
两个旧别名 `deepseek-flash`、`omen-alpha` 沿用已存在的能力配置，能力上限未经
额外实测。DSH 支持的输入为文本和图片；不会声称支持音视频/PDF 原始输入。

## 更新模型目录

只在点击设置面板中的“获取可用模型”时查询列表；启动、定时任务和密钥更新均不会触发刷新。
手动刷新会用第二套已保存的密钥（或尚未保存的草稿密钥）查询 Go 列表，
仅将该密钥发送给 `opencode.ai`。遇到未知模型时自动补齐接入资料，资料来自
[models.dev](https://models.dev/api.json) 的 `opencode-go` 目录；这个请求不携带 API 密钥。
接口地址固定在 OpenCode 官方域名，忽略外部资料中的自定义地址。支持 Chat
Completions、Responses、Anthropic Messages 和 Google Generative AI 四种协议。

刷新后可选择启用的模型，点击“保存模型”才修改配置。网络失败、缺少资料或遇到尚未
支持的协议时保留原配置，不按名字猜测接口。已有模型的接口与能力定义保持稳定；
变更这些定义仍需要升级插件。

验证过的公开模型资料保存在系统用户缓存目录的 `dsh-opencode-go-second/catalog.json`，
不写入项目或 Git 仓库，不保存密钥。重启时可从本地资料恢复；缓存丢失或损坏时，
先提供已有资料的模型，点击“获取可用模型”可恢复其余模型。
空模型列表恢复插件默认目录；移除供应商配置会停用该连接。

接口依据：[OpenCode Go 官方端点说明](https://opencode.ai/v2/docs/console/go/#endpoints)。

## 验证

运行 `npm test` 验证实际官方适配器/SDK 对 38 个模型的接口选择、密钥与会话
隔离、流式解析、错误结果、设置注册、模型发现和第一套迁移保持不变。
还覆盖启动时不发起查询、不创建刷新计时器、手动发现不自动保存，以及缓存、
Gemini 思考等级、认证和工具回放。
测试替换网络传输，不产生模型调用费用；通过并不代表 38 个模型都完成了真实推理。
实际可用性受账号权限、额度、地区和服务端状态影响。

## 回退

部署前在 desktop profile 的 `backups` 目录保留原 `package.json`、
`cordis.patch.yml` 和旧覆盖包链接地址。本机部署记录、备份和日志不进入仓库。
回退时关闭 DSH，恢复这两份备份并恢复旧 `@deepseek-ai/dsh-llm-pi-ai` 链接，
再重启 DSH，即回到迁移前的第二套方案。若迁移后又编辑过其他设置，先保留
当前配置，再只恢复第二套对应条目，避免覆盖后续修改。

## 仓库中的敏感信息处理

仓库不包含真实 API 密钥、密码、个人路径、账号标识、日志或部署备份。
配置中的 `OPENCODE_API_KEY` 等名称是密钥引用，不是密钥值。测试使用虚构
凭据和示例会话标识。依赖目录和本地环境文件由 `.gitignore` 排除。
