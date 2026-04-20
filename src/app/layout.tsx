import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { SiteHeader } from "@/components/layout/site-header";
import { getSessionUser } from "@/server/auth/mock-auth-provider";

export const metadata: Metadata = {
  title: "3D Print Management Portal",
  description: "Enterprise-grade operations portal for 3D print management.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [user, cookieStore] = await Promise.all([getSessionUser(), cookies()]);
  const savedTheme = cookieStore.get("portal-theme")?.value;
  const initialTheme = savedTheme === "dark" ? "dark" : "light";

  return (
    <html lang="en" className="h-full antialiased" data-theme={initialTheme} suppressHydrationWarning>
      <body className="min-h-full bg-background text-foreground">
        <div className="flex min-h-full flex-col">
          <SiteHeader user={user} />
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
