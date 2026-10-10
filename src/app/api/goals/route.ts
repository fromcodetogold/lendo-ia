import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createGoalSchema } from "@/lib/validations/goal";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Entre na sua conta para continuar." }, { status: 401 });
  }

  const parsed = createGoalSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 422 });
  }
  const data = parsed.data;

  const book = await prisma.book.upsert({
    where: { googleBooksId: data.googleBooksId },
    update: {},
    create: {
      googleBooksId: data.googleBooksId,
      title: data.title,
      authors: data.authors,
      thumbnailUrl: data.thumbnailUrl ?? null,
      pageCount: data.totalPages,
      description: data.description ?? null,
    },
  });

  const dailyPageGoal = Math.ceil(data.totalPages / data.days);
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + data.days);

  const goal = await prisma.readingGoal.create({
    data: {
      userId: session.user.id,
      bookId: book.id,
      totalPages: data.totalPages,
      targetDate,
      dailyPageGoal,
    },
  });

  return NextResponse.json({ goal }, { status: 201 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Entre na sua conta para continuar." }, { status: 401 });
  }

  const goals = await prisma.readingGoal.findMany({
    where: { userId: session.user.id },
    include: { book: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ goals });
}
