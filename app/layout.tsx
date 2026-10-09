import type { Metadata, Viewport } from "next";
import "./globals.css";
// The root not-found boundary is available on every route. Load its small,
// scoped stylesheet here rather than leaving Next's fallback-only preload unused.
// Keep server-rendered recovery usable even when JavaScript is unavailable.
import "@/components/ui/page-not-found.module.css";
import ServiceWorkerRegistration from "./component/ServiceWorkerRegistration";
import PwaInstallPrompt from "./component/PwaInstallPrompt";
import NetworkStatusBanner from "./component/NetworkStatusBanner";
import ThemeToggle from "./component/ThemeToggle";

const themeBootScript = `
  (() => {
    try {
      const isAdmin = location.pathname === '/admin' || location.pathname.startsWith('/admin/');
      const saved = localStorage.getItem('emergency-response-theme');
      const theme = isAdmin ? 'light' : saved === 'light' || saved === 'dark'
        ? saved
        : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark', theme === 'dark');
      document.documentElement.style.colorScheme = theme;
    } catch {}
  })();
`;

export const metadata: Metadata = {
  title: "Emergency Response App",
  description: "Community-based emergency reporting and response coordination for Cordova, Cebu.",
  applicationName: "Emergency Response App",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Emergency Response" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#db0000',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Metadata adds credentials only on Vercel previews, not protected production. */}
        {process.env.NEXT_PUBLIC_PRODUCTION_VALIDATION !== "true" && (
          <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
        )}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        {(process.env.NEXT_PUBLIC_PREVIEW_ONLY === "true" || process.env.NEXT_PUBLIC_PRODUCTION_VALIDATION === "true" || process.env.NEXT_PUBLIC_VERCEL_ENV === "preview") && (
          <div
            role="status"
            className="border-b border-border bg-warning px-4 py-3 text-center text-sm font-semibold text-warning-foreground"
          >
            {process.env.NEXT_PUBLIC_PRODUCTION_VALIDATION === "true"
              ? "Restricted production validation — this uses the live system. Submit only a prearranged test. For a real emergency, "
              : process.env.NEXT_PUBLIC_STAGING_TEST === "true"
              ? "Restricted test site — reports submitted here are tests, not requests for emergency response. For a real emergency, "
              : "Private preview only — emergency reporting is unavailable here. For urgent help, "}
            <a className="underline underline-offset-2" href="tel:911">call 911</a>.
          </div>
        )}
        <NetworkStatusBanner />
        <ServiceWorkerRegistration />
        {children}
        {process.env.NEXT_PUBLIC_PRODUCTION_VALIDATION !== "true" && <PwaInstallPrompt />}
        <ThemeToggle />
      </body>
    </html>
  );
}
