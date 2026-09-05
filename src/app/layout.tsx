import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { FieldBackground } from "@/components/motif/FieldBackground";
import { GrainOverlay } from "@/components/motif/GrainOverlay";
import { ToastProvider } from "@/components/ui/Toast";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "find_time — AI Productivity Management",
  description: "Find_time plans your calendar in advance from your inbox and your to-dos.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable} h-full antialiased`}>
      <body className="relative flex min-h-full flex-col">
        <FieldBackground />
        <GrainOverlay />
        <ToastProvider>
          <div className="relative z-10 flex min-h-full flex-1 flex-col">{children}</div>
        </ToastProvider>
      </body>
    </html>
  );
}
