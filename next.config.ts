import type { NextConfig } from "next";

const isStaticExport = process.env.NEXT_STATIC_EXPORT === "true";

const nextConfig: NextConfig = {
  output: isStaticExport ? "export" : "standalone",
  ...(isStaticExport
    ? {
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
  reactStrictMode: true,
  // Use Lightning CSS instead of PostCSS for Tailwind v4 compatibility
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // Security headers only apply to the standalone/server build — the static
  // export (used for the Android/Capacitor build) can't set HTTP headers,
  // so a matching <meta> CSP is also set in src/app/layout.tsx.
  ...(isStaticExport
    ? {}
    : {
        async headers() {
          return [
            {
              source: "/:path*",
              headers: [
                { key: "X-Frame-Options", value: "DENY" },
                { key: "X-Content-Type-Options", value: "nosniff" },
                { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
                {
                  key: "Content-Security-Policy",
                  value:
                    "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none';",
                },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
