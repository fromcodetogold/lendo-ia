const assert = require("node:assert/strict");
const { test } = require("node:test");
const { NextRequest } = require("next/server");
const { loadApp } = require("./helpers/load-app.cjs");

function fixture() {
  const user = { id: "reader", currentStreak: 0, longestStreak: 0, lastCheckInAt: null };
  const goals = [
    { id: "first-book", userId: "reader", status: "ACTIVE", currentPage: 0, totalPages: 100, book: { title: "Primeiro livro", authors: ["Autor A"] } },
    { id: "second-book", userId: "reader", status: "ACTIVE", currentPage: 0, totalPages: 200, book: { title: "Segundo livro", authors: ["Autor B"] } },
    { id: "private-book", userId: "other-reader", status: "ACTIVE", currentPage: 0, totalPages: 100, book: { title: "Livro de outra pessoa", authors: [] } },
  ];
  const checkIns = [];
  const generationInputs = [];
  const prisma = {
    readingGoal: {
      async findFirst({ where }) { return goals.find((goal) => Object.entries(where).every(([key, value]) => goal[key] === value)) ?? null; },
      async update({ where, data }) { const goal = goals.find((item) => item.id === where.id); Object.assign(goal, data); return goal; },
    },
    checkIn: {
      async findUnique({ where: { readingGoalId_checkInDate: key } }) {
        return checkIns.find((item) => item.readingGoalId === key.readingGoalId && +item.checkInDate === +key.checkInDate) ?? null;
      },
      async create({ data }) { const item = { id: `checkin-${checkIns.length + 1}`, ...data }; checkIns.push(item); return item; },
      async count({ where }) { return checkIns.filter((item) => goals.find((goal) => goal.id === item.readingGoalId)?.userId === where.readingGoal.userId).length; },
    },
    user: {
      async findUniqueOrThrow({ where }) { assert.equal(where.id, user.id); return user; },
      async update({ data }) { Object.assign(user, data); return user; },
    },
    referral: { async findUnique() { return null; } },
    async $transaction(queries) { return Promise.all(queries); },
  };
  const { POST } = loadApp("src/app/api/checkins/route.ts", {
    "@/lib/auth": { auth: async () => ({ user: { id: "reader" } }) },
    "@/lib/prisma": { prisma },
    "@/lib/gemini/generate-quiz": {
      async generateQuiz(input) {
        generationInputs.push(input);
        return [0, 1, 2].map((index) => ({ question: `Pergunta ${index + 1}`, options: ["A", "B", "C", "D"], correctIndex: index }));
      },
    },
  });
  const submit = (readingGoalId, pageTo) => POST(new NextRequest("http://localhost/api/checkins", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ readingGoalId, pageTo }),
  }));
  return { submit, user, goals, checkIns, generationInputs };
}

test("a reader can check in to two different books on the same day, with independent progress", async () => {
  const app = fixture();
  const first = await app.submit("first-book", 8);
  const second = await app.submit("second-book", 12);
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.deepEqual(app.goals.slice(0, 2).map((goal) => goal.currentPage), [8, 12]);
  assert.equal(app.user.currentStreak, 1);
  assert.deepEqual(app.generationInputs.map(({ bookTitle, pageFrom, pageTo }) => ({ bookTitle, pageFrom, pageTo })), [
    { bookTitle: "Primeiro livro", pageFrom: 1, pageTo: 8 },
    { bookTitle: "Segundo livro", pageFrom: 1, pageTo: 12 },
  ]);
  const firstBody = await first.json();
  assert.ok(firstBody.questions.every((question) => !Object.hasOwn(question, "correctIndex")));
  assert.notEqual(firstBody.checkInId, (await second.json()).checkInId);
  assert.equal((await app.submit("first-book", 9)).status, 409);
  assert.equal(app.checkIns.length, 2);
});

test("having multiple books never permits checking in to someone else's goal", async () => {
  const app = fixture();
  assert.equal((await app.submit("private-book", 5)).status, 404);
  assert.equal(app.checkIns.length, 0);
  assert.equal(app.generationInputs.length, 0);
});
