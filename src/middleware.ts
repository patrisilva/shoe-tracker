import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

// Adapter-free instance: safe to run on the edge.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (req.auth?.user) return NextResponse.next();

  const url = new URL("/", req.nextUrl.origin);
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
});

export const config = {
  matcher: ["/dashboard/:path*", "/shoes/:path*"],
};
