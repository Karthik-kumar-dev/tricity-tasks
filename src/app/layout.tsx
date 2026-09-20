import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TRI-CITY AI HACKATHON | Centle India Hyderabad Hackathon & Tasks",
  description: "TRI-CITY AI HACKATHON is Centle India Hyderabad's student-run hackathon across Warangal, Hanamkonda, and Kazipet. Complete challenges, submit answers, and compete on the live leaderboard.",
  keywords: ["Hackathon", "Centle India", "Tricity", "Hyderabad", "Warangal", "Hanamkonda", "Kazipet", "AI", "Tasks"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased scroll-smooth">
      <body className="min-h-full flex flex-col bg-white text-slate-900 selection:bg-teal-100 selection:text-teal-900">
        {children}
      </body>
    </html>
  );
}
