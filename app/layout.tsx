import './globals.css';
export const metadata = {
  title: 'THE PRINTING DEPOT',
  description: 'Your one-stop shop for all your printing needs!',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
