import { BotRunner } from "./BotRunner";
import { getBot, updateBotStatus } from "../persistence/botRepo";

class BotManagerSingleton {
  private runners = new Map<string, BotRunner>();

  async startBot(botId: string): Promise<void> {
    if (this.runners.has(botId)) {
      throw new Error("Bot is already running");
    }

    const config = getBot(botId);
    if (!config) {
      throw new Error("Bot not found");
    }

    if (config.status === "running") {
      throw new Error("Bot is already running");
    }

    const runner = new BotRunner(config);
    this.runners.set(botId, runner);

    try {
      await runner.start();
    } catch (error) {
      this.runners.delete(botId);
      throw error;
    }
  }

  async stopBot(botId: string): Promise<void> {
    const runner = this.runners.get(botId);
    if (!runner) {
      // Bot not in memory - just update status
      updateBotStatus(botId, "stopped");
      return;
    }

    await runner.stop();
    this.runners.delete(botId);
  }

  isRunning(botId: string): boolean {
    return this.runners.get(botId)?.isRunning() ?? false;
  }

  getRunningBotIds(): string[] {
    return [...this.runners.keys()];
  }

  async stopAll(): Promise<void> {
    const promises = [...this.runners.keys()].map((id) => this.stopBot(id));
    await Promise.allSettled(promises);
  }
}

// BUG 13: Use globalThis to survive Next.js HMR and ensure true singleton
const globalForBotManager = globalThis as unknown as { _botManager?: BotManagerSingleton };
export const botManager = globalForBotManager._botManager ?? (globalForBotManager._botManager = new BotManagerSingleton());
