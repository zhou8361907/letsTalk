import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import type { NextConfig } from "next";

loadEnv({ path: resolve(process.cwd(), "../../.env.local") });
loadEnv({ path: resolve(process.cwd(), "../../.env") });

/** Pi 与 agent-runtime 必须整包由 Node 加载，不能被 Webpack 拆进 route 包 */
const NODE_ONLY_PACKAGES = [
  "@lets-talk/ast-tools",
  "@lets-talk/conversation",
  "@lets-talk/memory",
  "@lets-talk/context",
  "@lets-talk/agent-runtime",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-tui",
];

const nextConfig: NextConfig = {
  transpilePackages: ["@lets-talk/shared-types"],
  serverExternalPackages: NODE_ONLY_PACKAGES,
  webpack(config, { isServer }) {
    if (isServer) {
      const prev = config.externals;
      config.externals = [
        ...(Array.isArray(prev) ? prev : prev ? [prev] : []),
        ({ request }: { request?: string }, callback: (err?: Error | null, result?: string) => void) => {
          if (
            request &&
            (NODE_ONLY_PACKAGES.includes(request) ||
              request.startsWith("@lets-talk/") ||
              request.startsWith("@earendil-works/pi-"))
          ) {
            return callback(null, `module ${request}`);
          }
          callback();
        },
      ];
    }
    return config;
  },
};

export default nextConfig;
