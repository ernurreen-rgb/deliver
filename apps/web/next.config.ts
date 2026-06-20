import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import { fileURLToPath } from "node:url";

const monorepoRoot = fileURLToPath(new URL("../..", import.meta.url));
loadEnvConfig(monorepoRoot, process.env.NODE_ENV !== "production");

const isDev = process.env.NODE_ENV !== "production";
const twoGisSources =
  "https://mapgl.2gis.com https://*.2gis.com https://*.2gis.ru";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${twoGisSources}${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${twoGisSources}`,
  `font-src 'self' ${twoGisSources}`,
  isDev
    ? `connect-src 'self' http: https: ws: wss: ${twoGisSources}`
    : `connect-src 'self' ${twoGisSources}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: [
    "@deliver/auth",
    "@deliver/contracts",
    "@deliver/database",
    "@deliver/domain",
  ],
  turbopack: {
    root: monorepoRoot,
  },
  images: {
    localPatterns: [
      {
        pathname: "/images/demo/**",
        search: "",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
          ...(isDev
            ? []
            : [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ]),
        ],
      },
    ];
  },
};

export default nextConfig;
