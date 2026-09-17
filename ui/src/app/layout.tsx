import type { Metadata } from "next";
import { ThemeProvider } from "@/lib/theme";
import { AppShell } from "@/components/layout/AppShell";
import { CommandPalette } from "@/components/CommandPalette";
import "./globals.css";

export const metadata: Metadata = {
  title: "MrRobot",
  description: "Orquestador multiagente para desarrollo de software",
};

const themeScript = `
(function () {
  try {
    var theme = localStorage.getItem("mrrobot-theme");
    var dark = theme === "dark" || ((!theme || theme === "system") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
          <CommandPalette />
        </ThemeProvider>
      </body>
    </html>
  );
}
