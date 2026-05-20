import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cowherd Acharya Bot",
  description: "Telegram bot for Cowherd Acharya — cattle and horse care training",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
