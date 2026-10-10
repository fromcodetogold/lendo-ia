import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BookOpen, Sparkles, Flame } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StreakBadge } from "@/components/gamification/streak-badge";
import { XpBar } from "@/components/gamification/xp-bar";
import { LeagueBadge } from "@/components/gamification/league-badge";
import { ClaimReferral } from "@/components/claim-referral";
import { XP_LABELS } from "@/lib/xp-label";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  const xpLabel = XP_LABELS[user.xpLabel];

  const activeGoals = await prisma.readingGoal.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    include: { book: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-8">
      <Suspense>
        <ClaimReferral />
      </Suspense>

      <div className="flex flex-wrap items-center gap-3">
        <StreakBadge days={user.currentStreak} />
        <LeagueBadge league={user.league} />
        <Link
          href="/onboarding"
          className="ml-auto inline-block rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
        >
          Adicionar livro
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <XpBar xp={user.xpTotal} label={xpLabel} />
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <XpBar xp={user.xpWeekly} label="XP nesta semana" />
        </div>
      </div>

      {activeGoals.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {activeGoals.map((activeGoal) => (
            <div key={activeGoal.id} className="rounded-xl border border-neutral-200 bg-white p-6">
              <p className="text-sm text-neutral-500">Lendo agora</p>
              <h2 className="mt-1 text-xl font-bold">{activeGoal.book.title}</h2>
              <p className="mt-1 text-neutral-600">
                Página {activeGoal.currentPage} de {activeGoal.totalPages} — meta de{" "}
                {activeGoal.dailyPageGoal} páginas/dia
              </p>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${Math.min(100, (activeGoal.currentPage / activeGoal.totalPages) * 100)}%` }}
                />
              </div>
              <Link
                href={`/checkin?goalId=${activeGoal.id}`}
                className="mt-5 inline-block rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
              >
                Fazer check-in de hoje
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 p-8 text-center">
            <h2 className="text-xl font-bold">Como o Lendo.IA funciona</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
              Sem PDF pirata: você lê o livro de verdade, a gente só te ajuda a manter o
              hábito.
            </p>
          </div>

          <div className="grid gap-6 p-8 sm:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <BookOpen className="size-5" />
              </div>
              <p className="mt-3 text-sm font-semibold">1. Escolha um livro</p>
              <p className="mt-1 text-sm text-neutral-500">
                Busca o título e diz em quantos dias quer terminar — a gente calcula sua
                meta diária de páginas.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <Sparkles className="size-5" />
              </div>
              <p className="mt-3 text-sm font-semibold">2. Check-in com quiz da IA</p>
              <p className="mt-1 text-sm text-neutral-500">
                Todo dia que ler, registra até que página chegou e responde um quiz gerado
                na hora sobre a obra, considerando seu progresso.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                <Flame className="size-5" />
              </div>
              <p className="mt-3 text-sm font-semibold">3. Ganhe XP e mantenha o streak</p>
              <p className="mt-1 text-sm text-neutral-500">
                Acumule XP, suba de liga na semana e mantenha sua sequência de dias
                seguidos lendo.
              </p>
            </div>
          </div>

          <div className="border-t border-neutral-100 p-6 text-center">
            <Link
              href="/onboarding"
              className="inline-block rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-700"
            >
              Escolher meu primeiro livro
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
