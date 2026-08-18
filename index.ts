import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { getPluginSettings } from "@oh-my-pi/pi-coding-agent/extensibility/plugins";
import {
  createCompletionNotification,
  loadFeishuConfig,
  sendFeishuNotification,
} from "./src/feishu.ts";

const PLUGIN_NAME = "omp-notify-feishu";

export default function feishuNotifyExtension(pi: ExtensionAPI): void {
  let turnStartedAt = Date.now();

  pi.setLabel("飞书按需通知");

  pi.on("turn_start", (event) => {
    turnStartedAt = event.timestamp;
  });

  const sendNotification = async (
    cwd: string,
    message?: string,
  ): Promise<void> => {
    const pluginSettings = await getPluginSettings(PLUGIN_NAME, cwd);
    const config = await loadFeishuConfig({ pluginSettings });
    if (!config) {
      throw new Error("尚未配置飞书 Webhook 和签名密钥");
    }

    await sendFeishuNotification(
      config,
      createCompletionNotification(
        cwd,
        Date.now() - turnStartedAt,
        new Date(),
        message,
      ),
    );
  };
  const notificationParameters = pi.zod.object({
    message: pi.zod.string().min(1).default("").describe("自定义通知正文"),
  });

  pi.registerTool({
    name: "feishu_notify",
    label: "发送飞书通知",
    description:
      "仅当用户明确要求在当前任务完成后发送飞书通知时调用；可选传入自定义通知正文。",
    parameters: notificationParameters,
    loadMode: "essential",
    approval: "write",
    async execute(_toolCallId, rawParams, _signal, _onUpdate, ctx) {
      const params = notificationParameters.parse(rawParams);
      await sendNotification(ctx.cwd, params.message);
      return {
        content: [{ type: "text", text: "飞书通知已发送" }],
        details: {},
      };
    },
  });

  pi.registerCommand("feishu-notify", {
    description: "立即发送一条飞书任务完成通知，可追加自定义正文",
    handler: async (args, ctx) => {
      try {
        await sendNotification(ctx.cwd, args.trim() || undefined);
        ctx.ui.notify("飞书通知已发送", "info");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(message, "error");
      }
    },
  });

}
