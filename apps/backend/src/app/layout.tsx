export const metadata = {
  title: "Rehearsal API",
  description: "Backend for the Rehearsal app.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "ui-monospace, monospace", margin: 24 }}>{children}</body>
    </html>
  );
}
