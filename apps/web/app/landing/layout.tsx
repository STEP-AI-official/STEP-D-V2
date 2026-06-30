import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "STEP D ㅣ 영상 운영·생성 자동화 SaaS",
  description:
    "방송이 끝난 영상을 STEP D가 분석해 하이라이트·쇼츠·클립으로 만들고, 멀티채널 유통과 광고·커머스 수익화까지. 한국 미디어를 위한 AI 영상 운영 SaaS.",
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
