import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeagueBadge } from "@/components/gamification/league-badge";

export default async function RankingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const users = await prisma.user.findMany({
    orderBy: { xpWeekly: "desc" },
    select: { id: true, name: true, image: true, xpWeekly: true, currentStreak: true, league: true },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ranking semanal global</h1>
      </div>
      <p className="mt-1 text-neutral-600">
        Todos os leitores, ordenados pelo XP desta semana. O XP semanal zera toda
        segunda-feira, com promoções e rebaixamentos dentro de cada liga.
      </p>

      <ol className="mt-6 space-y-2">
        {users.map((u, i) => (
          <li
            key={u.id}
            className={`flex items-center gap-3 rounded-xl border p-3 ${
              u.id === session.user.id ? "border-indigo-600 bg-indigo-50" : "border-neutral-200 bg-white"
            }`}
          >
            <span className="w-6 text-center font-bold text-neutral-400">{i + 1}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {u.image && <img src={u.image} alt="" className="size-8 rounded-full" />}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate font-medium">
                {u.name ?? "Leitor"}
                {u.id === session.user.id && <span className="ml-2 text-sm text-indigo-600">Você</span>}
              </p>
              <LeagueBadge league={u.league} />
            </div>
            <span className="text-sm text-neutral-500">🔥 {u.currentStreak}</span>
            <span className="font-bold">{u.xpWeekly} XP</span>
          </li>
        ))}
        {users.length === 0 && (
          <p className="text-neutral-500">Nenhum leitor no ranking ainda.</p>
        )}
      </ol>
    </div>
  );
}
