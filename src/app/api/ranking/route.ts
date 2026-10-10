import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Entre na sua conta para continuar." }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    orderBy: { xpWeekly: "desc" },
    select: { id: true, name: true, image: true, xpWeekly: true, currentStreak: true, league: true },
  });

  return NextResponse.json({ users });
}
