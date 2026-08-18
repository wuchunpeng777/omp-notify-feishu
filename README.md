# omp-notify-feishu

为 [Oh My Pi](https://github.com/can1357/oh-my-pi) 提供按需飞书通知的扩展。

扩展不会在每轮对话结束后自动推送。只有用户明确要求发送飞书通知，或手动执行 `/feishu-notify` 命令时，才会调用飞书自定义机器人 Webhook。

## 功能

- 注册 `feishu_notify` 工具，供 Agent 在用户明确要求时调用
- 提供 `/feishu-notify` 命令，可立即发送通知
- 支持自定义通知正文
- 使用飞书自定义机器人 HMAC-SHA256 签名
- 通知包含项目名、当前轮耗时、完成时间和主机名
- 支持环境变量和 JSON 配置文件
- 校验飞书响应中的 HTTP 状态和业务状态码

## 前置条件

- 已安装 [Oh My Pi](https://github.com/can1357/oh-my-pi)
- 已创建飞书群自定义机器人
- 已在机器人安全设置中启用“签名校验”

## 安装

克隆仓库并安装依赖：

```bash
git clone https://github.com/wuchunpeng777/omp-notify-feishu.git
cd omp-notify-feishu
bun install
```

将当前目录链接为 OMP 扩展：

```bash
omp install .
```

重新启动 OMP，或在已有会话中重新加载插件。

## 配置飞书机器人

在飞书群中添加自定义机器人，记录以下两项：

- Webhook 地址，例如 `https://open.feishu.cn/open-apis/bot/v2/hook/...`
- 签名密钥

### 使用环境变量

```bash
export FEISHU_WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/你的-webhook-id"
export FEISHU_SIGNING_SECRET="你的签名密钥"
```

### 使用配置文件

默认配置文件路径：

```text
~/.config/omp-notify-feishu/config.json
```

配置示例：

```json
{
  "webhookUrl": "https://open.feishu.cn/open-apis/bot/v2/hook/你的-webhook-id",
  "signingSecret": "你的签名密钥",
  "keyword": "AI通知",
  "timeoutMs": 5000
}
```

配置字段：

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `webhookUrl` | 是 | 无 | 飞书自定义机器人 Webhook 地址 |
| `signingSecret` | 是 | 无 | 机器人签名密钥 |
| `keyword` | 否 | `AI通知` | 通知首行关键词，可用于飞书关键词安全校验 |
| `timeoutMs` | 否 | `5000` | 请求超时，范围为 1–30000 毫秒 |

可通过 `FEISHU_NOTIFY_CONFIG` 指定其他配置文件：

```bash
export FEISHU_NOTIFY_CONFIG="$HOME/.config/my-feishu-bot.json"
```

`FEISHU_WEBHOOK_URL` 和 `FEISHU_SIGNING_SECRET` 的优先级高于配置文件中的对应字段。

## 使用

### 让 Agent 按需发送

在任务中明确提出通知要求，例如：

```text
功能完成后发送飞书通知，正文写“登录功能已完成”。
```

Agent 完成任务后会调用 `feishu_notify` 工具。未明确要求时，扩展不会发送通知。

### 手动发送

在 OMP 中执行：

```text
/feishu-notify 功能做完了
```

不传正文时，将发送默认正文 `AI 任务已完成`：

```text
/feishu-notify
```

通知示例：

```text
AI通知
功能做完了
项目：omp-notify-feishu
耗时：2 分 5 秒
完成时间：2026/8/18 20:00:00
主机：your-host
```

## 安全说明

- 不要把 Webhook 地址或签名密钥提交到 Git 仓库
- `.env` 文件已被 Git 忽略，但本扩展不会自动加载 `.env`；请由 Shell、进程管理器或其他安全配置方式注入环境变量
- 建议同时启用飞书机器人的签名校验和关键词校验
- `feishu_notify` 是外部写操作，OMP 会按当前审批策略处理工具调用

## 开发

安装依赖：

```bash
bun install
```

运行测试和类型检查：

```bash
bun run check
```

项目结构：

```text
.
├── index.ts             # OMP 扩展入口、工具和命令注册
├── src/feishu.ts        # 配置、签名、通知载荷和发送逻辑
└── test/feishu.test.ts  # 单元测试和扩展触发测试
```
