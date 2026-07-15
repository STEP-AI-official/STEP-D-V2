/**
 * Seed data for a fresh database.
 * Only applied when the entities table is empty (see db-pg.ts seedIfEmpty).
 * Intentionally empty: production starts with no demo content — real programs,
 * episodes, and clips are created by actual uploads. The app renders clean
 * empty states when there is nothing yet.
 */
export const seed = {
  programs: [],
  episodes: [],
  recommendations: [],
  clips: [],
  jobs: [],
  connections: [],
};
