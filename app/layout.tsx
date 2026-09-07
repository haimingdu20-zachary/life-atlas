import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "人生地图 · Life Atlas",
  description: "从 3D 地球放大到城市与区域，点击地图记录亲身经历，并用 AI 帮你完善叙述。",
  applicationName: "人生地图",
  appleWebApp: { capable: true, title: "人生地图", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icons/app-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  // This Vinext version omits viewport-fit; render one complete tag below.
  width: undefined,
  initialScale: undefined,
  themeColor: "#061116",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
      </head>
      <body>{children}</body>
    </html>
  );
}
