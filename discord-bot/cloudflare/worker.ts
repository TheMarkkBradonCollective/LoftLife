import { DurableObject } from "cloudflare:workers";

const PORT = 8788;
const INACTIVITY_TIMEOUT_MS = 6 * 60 * 60 * 1000;

interface Env {
  DISCORD_GATEWAY: DurableObjectNamespace<DiscordGatewayContainer>;
  DISCORD_BOT_TOKEN: string;
  CONTROL_SECRET: string;
  GUILD_ID: string;
}

export class DiscordGatewayContainer extends DurableObject<Env> {
  private starting?: Promise<void>;
  private monitoring?: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    if (ctx.container?.running) {
      void ctx.blockConcurrencyWhile(() => ctx.container!.setInactivityTimeout(INACTIVITY_TIMEOUT_MS));
      this.observeExit();
    }
  }

  async fetch(request: Request): Promise<Response> {
    this.starting ??= this.startAndWaitForPort().finally(() => {
      this.starting = undefined;
    });
    await this.starting;
    const url = new URL(request.url);
    url.protocol = "http:";
    url.host = "container";
    const forwarded = new Request(url, request);
    forwarded.headers.delete("host");
    return this.ctx.container!.getTcpPort(PORT).fetch(forwarded);
  }

  private async startAndWaitForPort(): Promise<void> {
    const container = this.ctx.container!;
    if (!container.running) {
      container.start({
        image: container.images.base,
        instance: "lite",
        enableInternet: true,
        env: {
          DISCORD_BOT_TOKEN: this.env.DISCORD_BOT_TOKEN,
          CONTROL_SECRET: this.env.CONTROL_SECRET,
          GUILD_ID: this.env.GUILD_ID,
          PORT: String(PORT)
        }
      });
    }
    this.observeExit();
    await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);
    const port = container.getTcpPort(PORT);
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await port.fetch("http://container/health", {
          signal: AbortSignal.timeout(1000)
        });
        await response.body?.cancel();
        if (response.ok) return;
      } catch {
        // The process may still be starting.
      }
      await scheduler.wait(200);
    }
    throw new Error("Discord Gateway container did not become ready on port 8788");
  }

  private observeExit(): void {
    if (this.monitoring) return;
    this.monitoring = this.ctx.container!.monitor()
      .then(() => console.log("Discord Gateway container exited"))
      .catch((error: unknown) => console.error("Discord Gateway container failed:", error))
      .finally(() => {
        this.monitoring = undefined;
      });
    this.ctx.waitUntil(this.monitoring);
  }
}

function gateway(env: Env) {
  const id = env.DISCORD_GATEWAY.idFromName("loftlife-discord-gateway");
  return env.DISCORD_GATEWAY.get(id);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/health" && !url.pathname.startsWith("/control/")) {
      return new Response("Not found", { status: 404 });
    }
    if (url.pathname.startsWith("/control/") && request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }
    return gateway(env).fetch(request);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const request = new Request("https://gateway.internal/health");
    ctx.waitUntil(gateway(env).fetch(request).then(() => undefined));
  }
};
