import type { Metadata, Viewport } from "next";
import { privateRobots } from "@/lib/seo";
import { SEO_DESCRIPTION, SEO_NAME, SEO_ORIGIN } from "@/lib/seo-policy.mjs";
import "./globals.css";
// One owner for shared recovery styles. The client fallback must not import
// them again into a separate, unused not-found.css preload on ordinary routes.
// All selectors are namespaced; 404 recovery remains styled without JavaScript.
import "@/components/ui/page-not-found.css";
import ServiceWorkerRegistration from "../components/shared/ServiceWorkerRegistration";
import PwaInstallPrompt from "../components/shared/PwaInstallPrompt";
import NetworkStatusBanner from "../components/shared/NetworkStatusBanner";
import ThemeToggle from "../components/shared/ThemeToggle";

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
  metadataBase: new URL(SEO_ORIGIN),
  title: { default: SEO_NAME, template: `%s | ${SEO_NAME}` },
  description: SEO_DESCRIPTION,
  applicationName: SEO_NAME,
  // New routes are out of search unless they explicitly opt in like Home.
  robots: privateRobots,
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
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
