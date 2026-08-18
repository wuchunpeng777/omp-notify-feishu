# omp-notify-feishu

为 [Oh My Pi](https://github.com/can1357/oh-my-pi) 提供按需飞书通知的扩展。

扩展不会在每轮对话结束后自动推送。只有用户明确要求发送飞书通知，或手动执行 `/feishu-notify` 命令时，才会调用飞书自定义机器人 Webhook。

## 功能

- 注册 `feishu_notify` 工具，供 Agent 在用户明确要求时调用
- 提供 `/feishu-notify` 命令，可立即发送通知
- 支持自定义通知正文
- 使用飞书自定义机器人 HMAC-SHA256 签名
- 通知包含项目名、当前轮耗时、完成时间和主机名
- 支持 OMP 插件配置和 JSON 配置文件
- 校验飞书响应中的 HTTP 状态和业务状态码

## 前置条件

- 已安装 [Oh My Pi](https://github.com/can1357/oh-my-pi)
- 已创建飞书群自定义机器人
- 已在机器人安全设置中启用“签名校验”

## 安装

### 从 GitHub 直接安装（推荐）

```bash
omp install github:wuchunpeng777/omp-notify-feishu
```

也可以使用完整仓库地址：

```bash
omp install https://github.com/wuchunpeng777/omp-notify-feishu
```

### 从源码安装

```bash
git clone https://github.com/wuchunpeng777/omp-notify-feishu.git
cd omp-notify-feishu
bun install
omp install .
```

安装完成后，重新启动 OMP，或在已有会话中重新加载插件。

## 配置飞书机器人

在飞书群中添加自定义机器人，记录以下两项：

- Webhook 地址，例如 `https://open.feishu.cn/open-apis/bot/v2/hook/...`
- 签名密钥

### 使用 OMP 插件配置（推荐）

安装插件后，可通过 OMP 的插件配置命令保存凭据：

```bash
omp plugin config set omp-notify-feishu webhookUrl "https://open.feishu.cn/open-apis/bot/v2/hook/你的-webhook-id"
omp plugin config set omp-notify-feishu signingSecret "你的签名密钥"
```

可选配置：

```bash
omp plugin config set omp-notify-feishu keyword "AI通知"
omp plugin config set omp-notify-feishu timeoutMs 5000
```

查看当前配置：

```bash
omp plugin config list omp-notify-feishu
```

Webhook 和签名密钥会在 OMP 的配置界面与命令输出中隐藏。也可以在 OMP 的 `Settings → Plugins → omp-notify-feishu` 中配置这些字段。

### 使用独立配置文件

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

配置优先级为：OMP 插件配置、独立配置文件。

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
- OMP 插件配置保存在本机，请限制配置文件访问权限并避免复制到公开位置
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
