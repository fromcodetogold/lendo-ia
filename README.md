# Lendo.IA

App de incentivo à leitura: o usuário define uma meta (livro + prazo), registra o progresso todo dia e responde um quiz gerado por IA sobre o que leu. Streaks, XP e ligas semanais criam o reforço positivo pro hábito pegar.

**Sem PDF pirata.** O app não hospeda nem busca o texto de nenhum livro. O Gemini recebe título, autores e intervalo de páginas informado, mas não recebe o conteúdo dessas páginas nem a edição. O quiz usa o conhecimento geral do modelo sobre a obra: a correspondência com as páginas é aproximada e pode conter erros ou spoilers. O prompt pede perguntas de reflexão quando o modelo não conhece a obra; essas respostas pessoais não têm um gabarito objetivo confiável. Perguntas fiéis ao trecho exigem conteúdo de referência da edição lida.

## Como funciona

1. **Onboarding** — busca o livro na API do Google Books, diz em quantos dias quer terminar; o app calcula a meta diária de páginas. É possível manter vários livros ativos, cada um com seu progresso e prazo.
2. **Check-in diário** — informa até que página leu; o Gemini gera 3 perguntas de múltipla escolha sobre esse trecho.
3. **Quiz** — as respostas certas nunca são enviadas ao cliente antes da correção: o servidor guarda o gabarito, corrige e só então libera o placar. Isso impede inspecionar a resposta certa no DevTools antes de responder.
4. **Gamificação** — XP por check-in (+bônus por acerto), streak de dias seguidos, ranking global por XP semanal com todos os usuários, liga semanal (Iniciante → Prata → Ouro) com promoção/rebaixamento automático toda segunda, e indicação de amigos com bônus de XP no primeiro check-in do indicado.

## Stack

- **Next.js 16** (App Router) + **TypeScript**, Tailwind CSS v4
- **NextAuth v5** — login via Google/GitHub, sessão em banco (Prisma Adapter)
- **PostgreSQL** (Supabase) + **Prisma ORM**
- **Gemini 3.6 Flash** — geração do quiz com saída JSON estruturada (`responseSchema`)
- **Google Books API** — busca e metadados dos livros
- Deploy na **Vercel**, reset semanal de ligas via **Vercel Cron**

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preenche as credenciais (ver abaixo)
cp .env.example .env         # o Prisma CLI só lê .env, não .env.local
npx prisma migrate dev
npm run dev
```

### Credenciais necessárias

| Variável | Onde conseguir |
|---|---|
| `DATABASE_URL` / `DIRECT_URL` | Projeto Postgres no [Supabase](https://supabase.com) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) — OAuth Client (Web), redirect `http://localhost:3000/api/auth/callback/google` |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | [GitHub OAuth Apps](https://github.com/settings/developers), callback `http://localhost:3000/api/auth/callback/github` |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) — nível gratuito, sem cartão |
| `GOOGLE_BOOKS_API_KEY` | Opcional. Mesmo projeto do Google Cloud, ativando a "Books API" — sem ela a busca funciona com cota bem mais baixa |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `CRON_SECRET` | `openssl rand -hex 24` — protege o endpoint do reset semanal |

## Decisões de design

- **Streak é por usuário, não por meta** — qualquer check-in no dia conta, mesmo trocando de livro no meio do caminho.
- **Reset de liga em lote** — a promoção/rebaixamento semanal roda como uma única query com `PERCENT_RANK() OVER (PARTITION BY liga)`, sem loop por usuário, pra continuar rápido conforme a base cresce.
- **Bônus de indicação só no primeiro check-in real** do indicado — não no cadastro, pra não recompensar quem só criou conta e nunca leu nada.
- **Rótulo de XP customizável** — o usuário escolhe como chamar seus pontos (XP total, Aura Farmada, etc.) no perfil.

## Estrutura

```
src/
├── app/
│   ├── (app)/          # rotas autenticadas: dashboard, onboarding, check-in, ranking, perfil
│   ├── api/             # rotas de API (goals, checkins, ranking, referral, cron)
│   └── login/
└── lib/
    ├── auth.ts           # config do NextAuth
    ├── gemini/           # geração do quiz
    ├── google-books/     # busca de livros
    ├── gamification/     # xp, streak, liga
    └── validations/      # schemas zod
```
