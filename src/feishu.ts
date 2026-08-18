import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { basename, join } from "node:path";

const DEFAULT_CONFIG_PATH = join(
  homedir(),
  ".config",
  "omp-notify-feishu",
  "config.json",
);
const DEFAULT_TIMEOUT_MS = 5_000;

export interface FeishuConfig {
  webhookUrl: string;
  signingSecret: string;
  keyword: string;
  timeoutMs: number;
}

export interface CompletionNotification {
  project: string;
  durationMs: number;
  completedAt: Date;
  host?: string;
  message?: string;
}

interface RawConfig {
  webhookUrl?: unknown;
  signingSecret?: unknown;
  keyword?: unknown;
  timeoutMs?: unknown;
}

interface FeishuResponse {
  code?: number;
  msg?: string;
}

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readNonNegativeNumber(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("通知配置中的时间参数必须是非负数");
  }
  return value;
}

function validateWebhookUrl(webhookUrl: string): void {
  const url = new URL(webhookUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "open.feishu.cn" ||
    !url.pathname.startsWith("/open-apis/bot/v2/hook/")
  ) {
    throw new Error("webhookUrl 不是有效的飞书自定义机器人地址");
  }
}

function normalizeConfig(raw: RawConfig): FeishuConfig {
  const webhookUrl = readString(raw.webhookUrl);
  const signingSecret = readString(raw.signingSecret);
  if (!webhookUrl || !signingSecret) {
    throw new Error("飞书通知需要 webhookUrl 和 signingSecret");
  }
  validateWebhookUrl(webhookUrl);

  const timeoutMs = readNonNegativeNumber(raw.timeoutMs, DEFAULT_TIMEOUT_MS);
  if (timeoutMs === 0 || timeoutMs > 30_000) {
    throw new Error("timeoutMs 必须大于 0 且不超过 30000");
  }

  return {
    webhookUrl,
    signingSecret,
    keyword: readString(raw.keyword) ?? "AI通知",
    timeoutMs,
  };
}

async function readConfigFile(path: string): Promise<RawConfig | undefined> {
  try {
    const content = await readFile(path, "utf8");
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("飞书通知配置必须是 JSON 对象");
    }
    return parsed as RawConfig;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}

export async function loadFeishuConfig(
  env: NodeJS.ProcessEnv = process.env,
  configPath = env.FEISHU_NOTIFY_CONFIG ?? DEFAULT_CONFIG_PATH,
): Promise<FeishuConfig | undefined> {
  const fileConfig = await readConfigFile(configPath);
  const webhookUrl = readString(env.FEISHU_WEBHOOK_URL);
  const signingSecret = readString(env.FEISHU_SIGNING_SECRET);

  if (!fileConfig && !webhookUrl && !signingSecret) return undefined;

  return normalizeConfig({
    ...fileConfig,
    webhookUrl: webhookUrl ?? fileConfig?.webhookUrl,
    signingSecret: signingSecret ?? fileConfig?.signingSecret,
  });
}

export function createFeishuSignature(
  timestamp: string,
  signingSecret: string,
): string {
  return createHmac("sha256", `${timestamp}\n${signingSecret}`)
    .update("")
    .digest("base64");
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1_000));
  if (totalSeconds < 60) return `${totalSeconds} 秒`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds === 0 ? `${minutes} 分钟` : `${minutes} 分 ${seconds} 秒`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0
    ? `${hours} 小时`
    : `${hours} 小时 ${remainingMinutes} 分钟`;
}

export function createCompletionNotification(
  cwd: string,
  durationMs: number,
  completedAt = new Date(),
  message?: string,
): CompletionNotification {
  const normalizedMessage = readString(message);
  return {
    project: basename(cwd) || cwd,
    durationMs,
    completedAt,
    host: hostname(),
    ...(normalizedMessage ? { message: normalizedMessage } : {}),
  };
}

export function buildFeishuPayload(
  config: FeishuConfig,
  notification: CompletionNotification,
  timestamp = Math.floor(Date.now() / 1_000).toString(),
): Record<string, unknown> {
  const lines = [
    config.keyword,
    readString(notification.message) ?? "AI 任务已完成",
    `项目：${notification.project}`,
    `耗时：${formatDuration(notification.durationMs)}`,
    `完成时间：${notification.completedAt.toLocaleString("zh-CN", { hour12: false })}`,
  ];
  if (notification.host) lines.push(`主机：${notification.host}`);

  return {
    timestamp,
    sign: createFeishuSignature(timestamp, config.signingSecret),
    msg_type: "text",
    content: { text: lines.join("\n") },
  };
}

export async function sendFeishuNotification(
  config: FeishuConfig,
  notification: CompletionNotification,
  fetchFn: FetchLike = fetch,
): Promise<void> {
  const response = await fetchFn(config.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildFeishuPayload(config, notification)),
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`飞书通知请求失败：HTTP ${response.status}`);
  }

  let result: FeishuResponse;
  try {
    result = JSON.parse(text) as FeishuResponse;
  } catch {
    throw new Error("飞书通知返回了无效 JSON");
  }

  if (result.code !== 0) {
    throw new Error(`飞书通知发送失败：${result.msg ?? `错误码 ${result.code}`}`);
  }
}
