/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Lab 쓰기 토큰 — 빌드 시 주입해 운영자가 직접 입력하지 않게 한다 (api.ts 주석 참고). */
  readonly VITE_LAB_TOKEN?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
