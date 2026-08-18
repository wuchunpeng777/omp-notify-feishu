import { describe, expect, test } from "bun:test";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { z } from "zod";
import feishuNotifyExtension from "../index.ts";
import {
  buildFeishuPayload,
  createFeishuSignature,
  formatDuration,
  loadFeishuConfig,
  sendFeishuNotification,
  type CompletionNotification,
  type FeishuConfig,
} from "../src/feishu.ts";

const config: FeishuConfig = {
  webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/test-hook",
  signingSecret: "demo",
  keyword: "AI通知",
  timeoutMs: 5_000,
};

const notification: CompletionNotification = {
  project: "omp-notify-feishu",
  durationMs: 125_000,
  completedAt: new Date("2026-08-18T12:00:00Z"),
  host: "mac-studio",
};

function readPayloadText(payload: Record<string, unknown>): string {
  const content = payload.content;
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw new Error("测试载荷缺少正文对象");
  }
  if (!("text" in content) || typeof content.text !== "string") {
    throw new Error("测试载荷缺少文本正文");
  }
  return content.text;
}

describe("飞书签名", () => {
  test("符合官方 HMAC-SHA256 示例算法", () => {
    expect(createFeishuSignature("1599360473", "demo")).toBe(
      "l1N0gAcBjdwBvGm1xMjOF0XSyaLRpR7tuO5dHfhAYc8=",
    );
  });
});

describe("通知正文", () => {
  test("包含安全关键词和任务元数据", () => {
    const payload = buildFeishuPayload(config, notification, "1599360473");
    expect(payload.timestamp).toBe("1599360473");
    expect(payload.sign).toBe(
      "l1N0gAcBjdwBvGm1xMjOF0XSyaLRpR7tuO5dHfhAYc8=",
    );
    expect(payload.content).toEqual({
      text: expect.stringContaining(
        "AI通知\nAI 任务已完成\n项目：omp-notify-feishu\n耗时：2 分 5 秒",
      ),
    });
  });

  test("使用自定义正文替换默认状态", () => {
    const payload = buildFeishuPayload(
      config,
      { ...notification, message: "功能已完成" },
      "1599360473",
    );
    const text = readPayloadText(payload);

    expect(text).toContain("AI通知\n功能已完成\n项目：omp-notify-feishu");
    expect(text).not.toContain("AI 任务已完成");
  });

  test("格式化短任务和长任务耗时", () => {
    expect(formatDuration(9_900)).toBe("10 秒");
    expect(formatDuration(3_600_000)).toBe("1 小时");
    expect(formatDuration(3_720_000)).toBe("1 小时 2 分钟");
  });
});

describe("配置加载", () => {
  test("忽略遗留飞书环境变量", async () => {
    const previousWebhookUrl = process.env.FEISHU_WEBHOOK_URL;
    const previousSigningSecret = process.env.FEISHU_SIGNING_SECRET;

    try {
      process.env.FEISHU_WEBHOOK_URL =
        "https://open.feishu.cn/open-apis/bot/v2/hook/from-env";
      process.env.FEISHU_SIGNING_SECRET = "env-secret";

      const loaded = await loadFeishuConfig({
        configPath: "/tmp/omp-notify-feishu-missing-env-config.json",
      });

      expect(loaded).toBeUndefined();
    } finally {
      if (previousWebhookUrl === undefined) {
        delete process.env.FEISHU_WEBHOOK_URL;
      } else {
        process.env.FEISHU_WEBHOOK_URL = previousWebhookUrl;
      }
      if (previousSigningSecret === undefined) {
        delete process.env.FEISHU_SIGNING_SECRET;
      } else {
        process.env.FEISHU_SIGNING_SECRET = previousSigningSecret;
      }
    }
  });

  test("可仅使用 OMP 插件配置加载凭据", async () => {
    const loaded = await loadFeishuConfig({
      configPath: "/tmp/omp-notify-feishu-missing-plugin-config.json",
      pluginSettings: {
        webhookUrl:
          "https://open.feishu.cn/open-apis/bot/v2/hook/from-omp",
        signingSecret: "omp-secret",
        keyword: "任务通知",
        timeoutMs: 2_500,
      },
    });

    expect(loaded).toEqual({
      webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/from-omp",
      signingSecret: "omp-secret",
      keyword: "任务通知",
      timeoutMs: 2_500,
    });
  });
});

describe("发送请求", () => {
  test("校验 HTTP 成功和飞书业务状态", async () => {
    let sentBody: Record<string, unknown> | undefined;
    const fetchFn = async (_input: string | URL | Request, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ code: 0, msg: "success" }), {
        status: 200,
      });
    };

    await sendFeishuNotification(config, notification, fetchFn);
    expect(sentBody?.msg_type).toBe("text");
    expect(sentBody?.sign).toBeString();
  });

  test("HTTP 200 但业务失败时抛错", async () => {
    const fetchFn = async () =>
      new Response(JSON.stringify({ code: 19021, msg: "sign match fail" }), {
        status: 200,
      });

    await expect(
      sendFeishuNotification(config, notification, fetchFn),
    ).rejects.toThrow("sign match fail");
  });
});

interface CapturedTool {
  name: string;
  description: string;
  loadMode?: string;
  execute(
    toolCallId: string,
    params: { message: string },
    signal: AbortSignal | undefined,
    onUpdate: undefined,
    context: { cwd: string },
  ): Promise<{ content: Array<{ type: string; text?: string }> }>;
}

describe("扩展触发方式", () => {
  test("不注册自动通知，只在显式调用工具时发送", async () => {
    const registeredEvents: string[] = [];
    const registeredCommands: string[] = [];
    const registeredTools = new Map<string, CapturedTool>();

    feishuNotifyExtension({
      zod: z,
      setLabel: (_label: string) => undefined,
      on: (event: string) => registeredEvents.push(event),
      registerTool: (tool: unknown) => {
        const captured = tool as CapturedTool;
        registeredTools.set(captured.name, captured);
      },
      registerCommand: (name: string) => registeredCommands.push(name),
    } as unknown as ExtensionAPI, async () => ({
      webhookUrl:
        "https://open.feishu.cn/open-apis/bot/v2/hook/explicit-test",
      signingSecret: "test-secret",
      keyword: "AI通知",
      timeoutMs: 5_000,
    }));

    expect(registeredEvents).toEqual(["turn_start"]);
    expect(registeredCommands).toEqual(["feishu-notify"]);

    const tool = registeredTools.get("feishu_notify");
    expect(tool).toBeDefined();
    expect(tool?.description).toContain("仅当用户明确要求");
    expect(tool?.loadMode).toBe("essential");

    const previousFetch = globalThis.fetch;
    let sentBody: Record<string, unknown> | undefined;

    try {
      globalThis.fetch = (async (
        _input: string | URL | Request,
        init?: RequestInit,
      ) => {
        sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ code: 0, msg: "success" }), {
          status: 200,
        });
      }) as typeof fetch;

      expect(sentBody).toBeUndefined();
      const result = await tool?.execute(
        "explicit-call",
        { message: "功能已完成" },
        undefined,
        undefined,
        { cwd: "/tmp/explicit-project" },
      );

      expect(result?.content).toEqual([
        { type: "text", text: "飞书通知已发送" },
      ]);
      expect(sentBody?.content).toEqual({
        text: expect.stringContaining("功能已完成\n项目：explicit-project"),
      });
      expect(readPayloadText(sentBody ?? {})).not.toContain("AI 任务已完成");
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
