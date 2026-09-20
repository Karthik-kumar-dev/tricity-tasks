import { cookies } from "next/headers";

const ADMIN_COOKIE = "admin_token";

export async function verifyAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE)?.value;
  return token === process.env.ADMIN_PASSWORD;
}

export function adminCookieOptions() {
  return {
    name: ADMIN_COOKIE,
    value: process.env.ADMIN_PASSWORD!,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: 60 * 60 * 24, // 1 day
  };
}
