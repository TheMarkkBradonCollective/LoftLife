// Type-only declaration for Wrangler's virtual runtime module.
// The real implementation is supplied by the Cloudflare Workers runtime.
declare module "cloudflare:workers" {
  export class DurableObject<Bindings = unknown> {
    constructor(ctx: unknown, env: Bindings);
  }
}
