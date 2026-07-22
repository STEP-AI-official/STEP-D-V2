/** @type {import('next').NextConfig} */
const nextConfig = {
  // 라우트 정리 (2026-07-22): /os 폴더 삭제 후 /(app) 그룹의 실제 화면들을 그대로 사용.
  // 리다이렉트 없음 — 루트 /가 (app)/page.tsx를 서빙한다.
};

export default nextConfig;
