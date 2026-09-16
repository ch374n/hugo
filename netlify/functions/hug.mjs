import { getStore } from "@netlify/blobs";

/* The gestures the page knows about. Anything else is rejected. */
const GESTURES = ["hug", "kiss", "neck", "behind", "lap"];

/* How many of each person's sends we keep. */
const KEEP = 30;

function people() {
  return [
    { id: "a", name: process.env.NAME_A || "Me",  key: process.env.KEY_A || "" },
    { id: "b", name: process.env.NAME_B || "Her", key: process.env.KEY_B || "" }
  ];
}

function sameKey(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length === 0 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}

export default async (req) => {
  const presented = req.headers.get("x-hug-key") || "";
  const me = people().find((p) => sameKey(p.key, presented));
  if (!me) return json({ error: "unauthorized" }, 401);

  const store = getStore("hugs");

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad_request" }, 400);
    }
    if (!GESTURES.includes(body.gesture)) {
      return json({ error: "unknown_gesture" }, 400);
    }
    /* Each person writes only their own blob, so two people sending at the
       same moment can never overwrite each other. The sender is taken from
       the key, never from the request body. */
    let mine = [];
    try {
      mine = (await store.get(me.id, { type: "json" })) || [];
    } catch {
      mine = [];
    }
    mine.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      g: body.gesture,
      at: Date.now()
    });
    if (mine.length > KEEP) mine = mine.slice(-KEEP);
    await store.setJSON(me.id, mine);
  } else if (req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const names = {};
  const events = [];
  for (const p of people()) {
    names[p.id] = p.name;
    let list = [];
    try {
      list = (await store.get(p.id, { type: "json" })) || [];
    } catch {
      list = [];
    }
    for (const e of list) events.push({ ...e, from: p.id });
  }
  events.sort((x, y) => y.at - x.at);

  return json({ you: me.id, names, events: events.slice(0, 40) });
};

export const config = { path: "/api/hug" };
