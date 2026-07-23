# Frame

A semantic movie-discovery map. ~5,000 films embedded into vector space,
projected to 2D, and rendered as an explorable star-field. Type a vibe —
*"paranoid slow-burn surveillance thriller"* — and the camera flies to
that region of the map.

**Live:** _(coming soon)_

---

## The idea

Most movie discovery is metadata filtering: genre, year, rating, "because
you watched." Frame treats films as points in semantic space instead. Two
movies sit near each other because their *descriptions* mean similar
things — not because they share a genre tag.

The result is a map you can explore. Clusters emerge that no one labeled:
paranoid thrillers pool together, coming-of-age dramas form their own
neighborhood, and the odd film that sits between two clusters is usually
the interesting one.

---

## Architecture

The central design decision is **what runs offline vs. what runs live.**

### Offline (batch, run once)

Everything expensive happens ahead of time:

1. Pull ~5k popular films from TMDB
2. Build a text blob per film (overview + genres + key cast + director)
3. Embed each blob via OpenAI `text-embedding-3-small`
4. Run UMAP over all 5k vectors → 2D coordinates
5. Store vectors and coordinates in Postgres

This is a batch job, not a service. It runs on a laptop or as a one-off
AWS task. If it takes ten minutes, nobody notices — no user is waiting on it.

### Live (per request)

The API does almost nothing expensive:

| Endpoint | Work |
|---|---|
| `GET /points` | Read `{id, x, y, genre}` for all films — a plain SELECT |
| `GET /movies/:id/neighbors` | pgvector cosine search (`<=>`) — one indexed query |
| `POST /search` | **One embedding call**, then the same pgvector search |

`POST /search` is the only place an AI model is invoked at request time.
One short string in, one vector out, then it's a database problem again.

**Why this split matters:** the naive version of this app embeds things on
demand and is slow and expensive. Precomputing the entire catalog turns
"semantic search over 5,000 films" into a single indexed vector query.
The AI is a coordinate lookup, not the runtime.

### Request path

```
browser → Vercel (React) → ALB → ECS Fargate (Express) → Supabase Postgres
```

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + TypeScript (Vite) → Vercel | Fast builds, free hosting |
| Rendering | WebGL (deck.gl) | 5k interactive points — DOM/SVG can't do this |
| API | Node + Express + TypeScript, Docker | `tsx` in dev, `tsc` for prod |
| Hosting | AWS ECS Fargate + ALB | Containers without managing servers |
| Database | Supabase Postgres + pgvector | Managed Postgres with native vector search |
| Embeddings | OpenAI `text-embedding-3-small` | 1536 dims, ~$0.02/M tokens |
| Projection | UMAP | Preserves local structure better than t-SNE at this scale |

---

## Schema

One table. Vector and coordinate columns are nullable — populated by the
offline job, not the initial data pull.

```sql
create extension if not exists vector;

create table movies (
  id           bigint primary key,    -- TMDB id: makes re-pulls idempotent
  title        text not null,
  overview     text,
  genres       text[],
  cast_names   text[],                -- top ~5 billed
  director     text,
  year         int,
  poster_path  text,                  -- TMDB path fragment, not a full URL
  embedding    vector(1536),          -- null until the offline job runs
  x            double precision,      -- UMAP output
  y            double precision
);

create index on movies using ivfflat (embedding vector_cosine_ops);
```

**Notes on the shape:**

- TMDB's id is the primary key, so re-running the ingest upserts rather
  than duplicating.
- `poster_path` stores TMDB's path fragment. The CDN base and the size
  segment are URL parameters — building full URLs at write time bakes in
  a choice that belongs at read time.
- `cast_names`, not `cast` — `cast` is a reserved word in SQL.

---

## Scope

**In:** the map, click-to-recenter, nearest neighbors, semantic search.

**Deliberately out:** authentication, user accounts, saved searches,
watchlists, ratings. None of it makes the map better, and all of it adds
surface area — sessions, row-level security, protected routes — that
distracts from the part of this project that's actually interesting.

---

## Running locally

```bash
# API
cd api && npm install && npm run dev     # → localhost:8080

# Web
cd web && npm install && npm run dev     # → localhost:5173
```

Requires `.env` files in both (see `.env.example`). Never committed.

---

## Status

- [ ] **M0** — Deploy pipeline (hello-world through the full AWS path)
- [ ] **M1** — TMDB ingest → Postgres
- [ ] **M2** — Embeddings + UMAP projection
- [ ] **M3** — WebGL star-field
- [ ] **M4** — Click-to-recenter + neighbors
- [ ] **M5** — Semantic search
- [ ] **M6** — Polish