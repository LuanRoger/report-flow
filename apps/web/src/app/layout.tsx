import "./globals.css";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Report Flow",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      className={cn(
        "antialiased",
        "font-sans",
        geistSans.variable,
        geistMono.variable
      )}
      lang="en"
      suppressHydrationWarning
    >
      <body>
        <NuqsAdapter>
          <ThemeProvider>
            <TooltipProvider>
              <SidebarProvider>{children}</SidebarProvider>
            </TooltipProvider>
          </ThemeProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
