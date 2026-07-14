/**
 * Minimal seed data for a fresh database.
 * Only used when the entities table is empty.
 */
export const seed = {
  programs: [
    { id: "p_demo", title: "시범 프로그램", targetAge: 7 },
  ],
  episodes: [
    { id: "e_demo", programId: "p_demo", programTitle: "시범 프로그램", title: "시범 에피소드", targetAge: 7 },
  ],
  recommendations: [],
  clips: [],
  jobs: [],
  connections: [
    { id: "c_demo", from: "e_demo", to: "p_demo", type: "belongs_to" },
  ],
};