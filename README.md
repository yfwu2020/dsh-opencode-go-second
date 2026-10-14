# OpenCode Go · 2

这是独立的 DeepSeek Harness 模型插件，只注册 `opencode-go-second`。
第一套 `opencode-go` 和其他供应商继续由原生适配器管理。

## 本地安装

适用于 DeepSeek Harness `0.2.0-rc.2`，需要 Node.js `>=22.19.0`。

1. 将仓库克隆到本地，进入项目目录运行 `npm ci`。
2. 在 DSH desktop profile 的 `package.json` 中，将依赖
   `dsh-opencode-go-second` 指向 `link:<项目的绝对路径>`，并在
   `dsh.profile.bundles` 列表中添加 `dsh-opencode-go-second`。
3. 在 profile 的 `cordis.patch.yml` 中添加插件条目；本项目同名文件提供条目示例。
   合并条目，不覆盖已有 profile 文件。如果已有相同插件条目，请勿重复添加。
4. 重启 DSH，在设置 → 模型 → OpenCode Go · 2 → 管理中配置 Go API 密钥，
   获取可用模型后保存。

DSH profile 通常位于 `~/.dsh/profiles/desktop`。此插件用于新增独立连接；
`migration.mjs` 仅供处理特定旧覆盖方案，运行前需备份并核对原配置。

## 使用与隔离

设置 → 模型中显示“OpenCode Go · 2”。密钥沿用 DSH 密钥库里的
`OPENCODE_API_KEY` 引用，插件不保存或打印密钥。内置 38 个备用模型；运行时自动同步当前账号可用的模型。
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

插件启动后自动同步一次，运行期间每 6 小时检查一次；更新密钥后也会重试。
自动同步会用第二套已保存的密钥查询 Go 列表，仅将该密钥发送给 `opencode.ai`。
新模型资料从 [models.dev](https://models.dev/api.json) 的 `opencode-go` 目录获取，
这个资料请求不携带 API 密钥。接口地址固定在 OpenCode 官方域名，忽略外部资料中的
自定义地址。支持 Chat Completions、Responses、Anthropic Messages 和 Google
Generative AI 四种协议；实际可用名单以账号认证查询为准。

新模型自动加入，下架模型从可选列表移除；保留手动关闭的模型、名称和参数覆盖。
设置使用版本检查，发生并发冲突时本次更新不会覆盖用户修改，之后可重试。
“获取可用模型”仍可立即查询，必要时自动补齐新模型资料；手动查询后保存才更改设置。
网络失败、缺少资料或遇到尚未支持的协议时保留原配置，不按名字猜测接口。
已有模型的接口与能力定义保持稳定；变更这些定义仍需要升级插件。

验证过的公开模型资料保存在系统用户缓存目录的 `dsh-opencode-go-second/catalog.json`，
不写入项目或 Git 仓库，不保存密钥。重启时可从本地资料恢复；缓存丢失或损坏时，
先提供已有资料的模型，后台恢复其余模型，并保守保留已保存的选择。
空模型列表恢复插件默认目录；移除供应商配置会停用该连接。

接口依据：[OpenCode Go 官方端点说明](https://opencode.ai/v2/docs/console/go/#endpoints)。

## 验证

运行 `npm test` 验证实际官方适配器/SDK 对 38 个模型的接口选择、密钥与会话
隔离、流式解析、错误结果、设置注册、模型发现和第一套迁移保持不变。
还覆盖自动同步冲突重试、离线与缓存恢复，以及 Gemini 思考等级、认证和工具回放。
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
