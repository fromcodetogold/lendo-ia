const assert = require("node:assert/strict");
const test = require("node:test");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { NextRequest } = require("next/server");
const { getURLFromRedirectError } = require("next/dist/client/components/redirect");
const { isRedirectError } = require("next/dist/client/components/redirect-error");
const { loadApp } = require("./helpers/load-app.cjs");

function reader(overrides) {
  return {
    id: "owner",
    name: "Meu leitor",
    email: "private@example.test",
    emailVerified: new Date("2026-01-01T00:00:00Z"),
    image: null,
    bio: "Biografia privada",
    xpTotal: 5000,
    xpWeekly: 12,
    xpLabel: "XP_TOTAL",
    currentStreak: 3,
    longestStreak: 8,
    lastCheckInAt: null,
    league: "INICIANTE",
    referralCode: "private-referral-code",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

const mixedLeagues = [
  reader({ id: "zero", name: "Novo leitor", xpWeekly: 0, xpTotal: 99999 }),
  reader({}),
  reader({ id: "silver", name: "Leitora prata", league: "PRATA", xpWeekly: 40, xpTotal: 40 }),
  reader({ id: "gold", name: "Leitor ouro", league: "OURO", xpWeekly: 100, xpTotal: 100 }),
];

// This fixture executes the query's filtering, sorting, limit and projection.
// Returning the whole fixture regardless of query would hide the original bug.
function database(users, onQuery = () => {}) {
  function matches(row, where = {}) {
    return Object.entries(where).every(([field, value]) => {
      assert.ok(value === null || typeof value !== "object", `Unsupported where: ${field}`);
      return row[field] === value;
    });
  }

  function project(row, select) {
    if (!select) return { ...row };
    return Object.fromEntries(
      Object.entries(select).filter(([, included]) => included).map(([field]) => [field, row[field]])
    );
  }

  return {
    user: {
      async findUniqueOrThrow(query) {
        onQuery();
        const row = users.find((user) => matches(user, query.where));
        assert.ok(row, "Fixture user must exist");
        return project(row, query.select);
      },
      async findMany(query = {}) {
        onQuery();
        assert.equal(query.skip, undefined, "Fixture does not silently ignore pagination");
        let result = users.filter((user) => matches(user, query.where));
        const orders = query.orderBy ? [query.orderBy].flat() : [];
        result.sort((left, right) => {
          for (const order of orders) {
            for (const [field, direction] of Object.entries(order)) {
              const comparison = left[field] < right[field] ? -1 : left[field] > right[field] ? 1 : 0;
              if (comparison) return direction === "desc" ? -comparison : comparison;
            }
          }
          return 0;
        });
        if (query.take !== undefined) result = result.slice(0, query.take);
        return result.map((row) => project(row, query.select));
      },
    },
  };
}

function app(relativePath, users = mixedLeagues, session = { user: { id: "owner" } }, onQuery) {
  return loadApp(relativePath, {
    "@/lib/auth": { auth: async () => session },
    "@/lib/prisma": { prisma: database(users, onQuery) },
  });
}

function listItems(node) {
  if (Array.isArray(node)) return node.flatMap(listItems);
  if (!React.isValidElement(node)) return [];
  if (node.type === "li") return [node];
  return listItems(node.props.children);
}

test("ranking API includes every league and zero XP in weekly XP order", async () => {
  const { GET } = app("src/app/api/ranking/route.ts");
  const response = await GET(new NextRequest("http://localhost/api/ranking"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.users.map((user) => user.id), ["gold", "silver", "owner", "zero"]);
  assert.deepEqual(body.users.map((user) => user.xpWeekly), [100, 40, 12, 0]);
  assert.deepEqual(body.users.map((user) => user.league), ["OURO", "PRATA", "INICIANTE", "INICIANTE"]);
});

test("ranking API keeps the global list when an old league parameter is present", async () => {
  const { GET } = app("src/app/api/ranking/route.ts");
  const response = await GET(new NextRequest("http://localhost/api/ranking?league=PRATA"));
  const body = await response.json();
  assert.deepEqual(body.users.map((user) => user.id), ["gold", "silver", "owner", "zero"]);
});

test("ranking API publishes only public ranking fields", async () => {
  const { GET } = app("src/app/api/ranking/route.ts");
  const response = await GET(new NextRequest("http://localhost/api/ranking"));
  const { users } = await response.json();
  for (const user of users) {
    assert.deepEqual(Object.keys(user).sort(), ["currentStreak", "id", "image", "league", "name", "xpWeekly"]);
    assert.equal(user.email, undefined);
    assert.equal(user.referralCode, undefined);
    assert.equal(user.bio, undefined);
  }
});

test("ranking page renders all leagues in weekly XP order and includes zero XP", async () => {
  const { default: RankingPage } = app("src/app/(app)/ranking/page.tsx");
  const rows = listItems(await RankingPage());
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((row) => row.key), ["gold", "silver", "owner", "zero"]);
  const markup = rows.map((row) => renderToStaticMarkup(row));
  assert.match(markup[0], /Leitor ouro/);
  assert.match(markup[0], /Liga Ouro/);
  assert.match(markup[1], /Liga Prata/);
  assert.match(markup[3], /Novo leitor/);
  assert.match(markup[3], /0 XP/);
  for (const row of markup) {
    assert.doesNotMatch(row, /private@example|private-referral|Biografia privada/);
  }
});

test("ranking page identifies the signed-in reader at their global position", async () => {
  const { default: RankingPage } = app("src/app/(app)/ranking/page.tsx");
  const rows = listItems(await RankingPage());
  const mine = rows.find((row) => row.key === "owner");
  assert.ok(mine);
  assert.match(mine.props.className, /border-indigo-600/);
  assert.match(renderToStaticMarkup(mine), /Você/);
  for (const row of rows.filter((row) => row.key !== "owner")) {
    assert.doesNotMatch(renderToStaticMarkup(row), /Você/);
  }
});

function largeRanking() {
  const users = Array.from({ length: 61 }, (_, index) => reader({
    id: `reader-${index}`,
    name: `Leitor ${index}`,
    xpWeekly: index,
  }));
  const session = { user: { id: "reader-0" } };
  return { users, session };
}

test("ranking API includes users beyond position 50", async () => {
  const { users, session } = largeRanking();
  const { GET } = app("src/app/api/ranking/route.ts", users, session);
  const response = await GET(new NextRequest("http://localhost/api/ranking"));
  const body = await response.json();
  assert.equal(body.users.length, 61);
  assert.equal(body.users[0].id, "reader-60");
  assert.equal(body.users[60].id, "reader-0");
});

test("ranking page includes users beyond position 50", async () => {
  const { users, session } = largeRanking();
  const { default: RankingPage } = app("src/app/(app)/ranking/page.tsx", users, session);
  const rows = listItems(await RankingPage());
  assert.equal(rows.length, 61);
  assert.equal(rows[0].key, "reader-60");
  assert.equal(rows[60].key, "reader-0");
});

for (const [description, session] of [
  ["no session", null],
  ["no user", {}],
  ["no user id", { user: {} }],
]) {
  test(`ranking API returns 401 with ${description} before reading the database`, async () => {
    const { GET } = app("src/app/api/ranking/route.ts", mixedLeagues, session, () => {
      assert.fail("Unauthenticated requests must not query users");
    });
    const response = await GET(new NextRequest("http://localhost/api/ranking"));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).users, undefined);
  });

  test(`ranking page redirects to login with ${description} before reading the database`, async () => {
    const { default: RankingPage } = app("src/app/(app)/ranking/page.tsx", mixedLeagues, session, () => {
      assert.fail("Unauthenticated requests must not query users");
    });
    await assert.rejects(RankingPage(), (error) => {
      assert.ok(isRedirectError(error), "Missing session must trigger Next's redirect");
      assert.equal(getURLFromRedirectError(error), "/login");
      return true;
    });
  });
}
