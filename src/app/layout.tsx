import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { SiteHeader } from "@/components/layout/site-header";
import { getSessionUser } from "@/server/auth/mock-auth-provider";

export const metadata: Metadata = {
  title: "3D Print Management Portal",
  description: "Enterprise-grade operations portal for 3D print management.",
};

const themeInitScript = `
(() => {
  try {
    const key = "portal-theme";
    const stored = window.localStorage.getItem(key);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = stored === "light" || stored === "dark" ? stored : (prefersDark ? "dark" : "light");
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle("theme-dark", theme === "dark");
  } catch {
    // no-op
  }
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSessionUser();

  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full bg-background text-foreground">
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <div className="flex min-h-full flex-col">
          <SiteHeader user={user} />
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
