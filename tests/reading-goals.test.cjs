const assert = require("node:assert/strict");
const test = require("node:test");
const { renderToStaticMarkup } = require("react-dom/server");
const { loadApp } = require("./helpers/load-app.cjs");

function fixture() {
  const user = {
    id: "reader-1", name: "Leitor", email: "reader@example.test",
    emailVerified: null, image: null, bio: null,
    xpTotal: 120, xpWeekly: 40, xpLabel: "XP_TOTAL",
    currentStreak: 2, longestStreak: 4, lastCheckInAt: null,
    league: "INICIANTE", referralCode: "reader-code",
    createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"),
  };
  const books = [
    ["book-1", "Primeiro livro"], ["book-2", "Segundo livro"],
    ["book-3", "Livro concluído"], ["book-4", "Livro abandonado"],
    ["book-5", "Livro de outra pessoa"],
  ].map(([id, title]) => ({
    id, title, googleBooksId: `google-${id}`, authors: ["Autora"],
    thumbnailUrl: null, pageCount: 200, description: null,
    createdAt: new Date("2026-01-01"),
  }));
  const goals = [
    ["goal-1", "book-1", "ACTIVE", user.id, 20, "2026-01-01"],
    ["goal-2", "book-2", "ACTIVE", user.id, 80, "2026-01-02"],
    ["goal-3", "book-3", "COMPLETED", user.id, 200, "2026-01-03"],
    ["goal-4", "book-4", "ABANDONED", user.id, 30, "2026-01-04"],
    ["goal-5", "book-5", "ACTIVE", "reader-2", 100, "2026-01-05"],
  ].map(([id, bookId, status, userId, currentPage, createdAt]) => ({
    id, bookId, status, userId, currentPage, totalPages: 200,
    dailyPageGoal: 10, targetDate: new Date("2026-02-01"),
    startDate: new Date(createdAt), createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
  }));
  const state = { user, books, goals };
  const matches = (row, where = {}) => Object.entries(where)
    .every(([field, value]) => row[field] === value);
  function findGoals({ where, orderBy, include } = {}) {
    const rows = goals.filter((goal) => matches(goal, where));
    if (orderBy) {
      const [field, direction] = Object.entries(orderBy)[0];
      rows.sort((a, b) => (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0)
        * (direction === "desc" ? -1 : 1));
    }
    return rows.map((goal) => ({
      ...goal,
      ...(include?.book ? { book: books.find((book) => book.id === goal.bookId) } : {}),
    }));
  }
  const prisma = {
    user: {
      async findUniqueOrThrow({ where }) {
        assert.equal(where.id, user.id, "database reads must use the signed-in user");
        return { ...user };
      },
    },
    book: {
      async upsert({ where, update, create }) {
        const existing = books.find((book) => matches(book, where));
        if (existing) return Object.assign(existing, update);
        const book = { id: `book-${books.length + 1}`, createdAt: new Date(), ...create };
        books.push(book);
        return { ...book };
      },
    },
    readingGoal: {
      async findFirst(args) { return findGoals(args)[0] ?? null; },
      async findMany(args) { return findGoals(args); },
      async updateMany({ where, data }) {
        const rows = goals.filter((goal) => matches(goal, where));
        rows.forEach((goal) => Object.assign(goal, data));
        return { count: rows.length };
      },
      async create({ data }) {
        const now = new Date();
        const goal = {
          id: `goal-${Math.max(0, ...goals.map((goal) => Number(goal.id.split("-")[1]))) + 1}`,
          currentPage: 0, status: "ACTIVE",
          startDate: now, createdAt: now, updatedAt: now, ...data,
        };
        goals.push(goal);
        return { ...goal };
      },
    },
    async $transaction(operations) {
      return typeof operations === "function" ? operations(prisma) : Promise.all(operations);
    },
  };
  return { state, prisma };
}

function load(relativePath, context, session = { user: { id: "reader-1" } }) {
  return loadApp(relativePath, {
    "@/lib/auth": { auth: async () => session },
    "@/lib/prisma": { prisma: context.prisma },
    // This client-only effect requires a live router and does not render UI.
    "@/components/claim-referral": { ClaimReferral: () => null },
  });
}

const newBook = {
  googleBooksId: "new-book", title: "Nova leitura", authors: ["Autor"],
  totalPages: 301, days: 30,
};

function request(body, raw = false) {
  return new Request("http://localhost/api/goals", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: raw ? body : JSON.stringify(body),
  });
}

test("creating a second reading preserves existing goals and assigns it to the session user", async () => {
  const context = fixture();
  context.state.goals.splice(1, 1);
  const before = structuredClone(context.state.goals);
  const { POST } = load("src/app/api/goals/route.ts", context);

  const response = await POST(request({ ...newBook, userId: "reader-2" }));
  assert.equal(response.status, 201);
  const { goal } = await response.json();
  assert.equal(goal.userId, "reader-1");
  assert.equal(goal.status, "ACTIVE");
  assert.equal(goal.currentPage, 0);
  assert.equal(goal.dailyPageGoal, 11);
  assert.equal(goal.totalPages, 301);
  assert.deepEqual(context.state.goals.slice(0, before.length), before);
  assert.equal(context.state.goals.filter((row) => row.userId === "reader-1" && row.status === "ACTIVE").length, 2);
  assert.equal(context.state.books.find((book) => book.id === goal.bookId).title, "Nova leitura");
});

test("unauthenticated goal creation returns 401 without changing stored data", async () => {
  const context = fixture();
  const before = structuredClone(context.state);
  const { POST } = load("src/app/api/goals/route.ts", context, null);
  const response = await POST(request(newBook));
  assert.equal(response.status, 401);
  assert.deepEqual(context.state, before);
});

test("invalid goal payloads return 422 without changing stored data", async (t) => {
  for (const [name, body, raw] of [
    ["missing book", { ...newBook, googleBooksId: "" }],
    ["zero pages", { ...newBook, totalPages: 0 }],
    ["zero days", { ...newBook, days: 0 }],
    ["fractional pages", { ...newBook, totalPages: 2.5 }],
    ["malformed JSON", "{", true],
  ]) {
    await t.test(name, async () => {
      const context = fixture();
      const before = structuredClone(context.state);
      const { POST } = load("src/app/api/goals/route.ts", context);
      const response = await POST(request(body, raw));
      assert.equal(response.status, 422);
      assert.deepEqual(context.state, before);
    });
  }
});

test("the dashboard renders both active books with separate progress and check-in links", async () => {
  const context = fixture();
  const { default: DashboardPage } = load("src/app/(app)/dashboard/page.tsx", context);
  const html = renderToStaticMarkup(await DashboardPage());
  assert.match(html, /Primeiro livro/);
  assert.match(html, /Segundo livro/);
  assert.ok(html.indexOf("Segundo livro") < html.indexOf("Primeiro livro"));
  assert.match(html, /Página 20 de 200/);
  assert.match(html, /Página 80 de 200/);
  assert.match(html, /width:10%/);
  assert.match(html, /width:40%/);
  assert.deepEqual([...html.matchAll(/href="(\/checkin\?goalId=[^"]+)"/g)].map((match) => match[1]), [
    "/checkin?goalId=goal-2", "/checkin?goalId=goal-1",
  ]);
  assert.match(html, /href="\/onboarding"[^>]*>Adicionar livro<\/a>/);
});

test("the dashboard excludes completed, abandoned, and other users' books", async () => {
  const context = fixture();
  const { default: DashboardPage } = load("src/app/(app)/dashboard/page.tsx", context);
  const html = renderToStaticMarkup(await DashboardPage());
  assert.doesNotMatch(html, /Livro concluído|Livro abandonado|Livro de outra pessoa/);
  assert.doesNotMatch(html, /goal-3|goal-4|goal-5/);
});

test("the empty dashboard keeps onboarding accessible", async () => {
  const context = fixture();
  context.state.goals.forEach((goal) => { goal.status = "COMPLETED"; });
  const { default: DashboardPage } = load("src/app/(app)/dashboard/page.tsx", context);
  const html = renderToStaticMarkup(await DashboardPage());
  assert.match(html, /Escolher meu primeiro livro/);
  assert.match(html, /href="\/onboarding"[^>]*>Adicionar livro<\/a>/);
  assert.doesNotMatch(html, /\/checkin\?goalId=/);
});

test("the dashboard redirects to login when its session is absent", async () => {
  const context = fixture();
  const { default: DashboardPage } = load("src/app/(app)/dashboard/page.tsx", context, null);
  await assert.rejects(DashboardPage, (error) => error.digest === "NEXT_REDIRECT;replace;/login;307;");
});
