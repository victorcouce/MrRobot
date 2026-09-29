import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import { LayoutContent } from "@/components/layout/LayoutContent";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Mr. Robot",
  description: "Orquestador multiagente para desarrollo de software",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable}`}
    >
      <body>
        <LayoutContent>{children}</LayoutContent>
      </body>
    </html>
  );
}
