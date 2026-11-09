# Kanban

A full-stack Kanban board: Django REST Framework + PostgreSQL backend, React + TypeScript frontend.



## Run it locally

1. `docker compose up -d` (Postgres and Redis)
2. Backend: `cd backend`, create and activate a venv, `pip install -r requirements.txt`,
   copy `.env.example` to `.env` and set `SECRET_KEY`, then `python manage.py migrate`
   and `python -m uvicorn config.asgi:application --reload`
3. Frontend: `cd frontend`, `npm install`, copy `.env.example` to `.env`, `npm run dev`
4. Tests: `pytest` in `backend/`, `npm test` in `frontend/`

## Technical decisions

- **Card ordering uses float positions.** Moving a card sets its position to the midpoint of
  its two neighbors, so a move updates one row. When two neighbors get closer than 1e-6, the
  column is renumbered in steps of 1000.
- **The server decides positions.** Clients send neighbor IDs (`before_id`, `after_id`), never
  numbers. A stale client view can't corrupt ordering.
- **Ownership is enforced at the query level and on create.** Every queryset filters by owner,
  so other users' objects return 404, and relation fields only accept objects the user owns.
- **Moves are optimistic and saved through a serial queue.** Each request's neighbor IDs stay
  valid when it runs. A failure cancels the rest of the queue and reloads the board.
- **Cards carry a `version` that increments on every change**, in preparation for conflict
  handling in real-time sync.
- **Drag logic is pure functions** (`previewLayout`, `planMove`), tested directly, because jsdom
  can't simulate pointer drags. The gesture itself is verified manually.

## Known limitations

_(see below)_
