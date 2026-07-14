import { LegalPage } from "@/components/legal-page";

export const metadata = {
  title: "서비스 이용약관 — STEP-D",
  description: "STEP-D 콘텐츠 분석 서비스의 이용 조건입니다.",
};

export default function TermsPage() {
  return (
    <LegalPage title="서비스 이용약관" updated="2026년 7월 14일">
      <section>
        <h2>1. 서비스 개요</h2>
        <p>
          STEP-D(이하 &ldquo;서비스&rdquo;)는 STEP AI(이하 &ldquo;회사&rdquo;)가 제공하는 콘텐츠 분석
          서비스입니다. 이용자가 자신의 YouTube 채널을 연결하면, 서비스는 해당 채널의 성과 지표를
          조회하여 분석 리포트와 콘텐츠 추천을 제공합니다.
        </p>
      </section>

      <section>
        <h2>2. 채널 연결과 권한</h2>
        <p>
          이용자는 Google OAuth 2.0을 통해 본인 소유의 YouTube 채널을 연결합니다. 서비스는
          채널 분석에 필요한 <strong>읽기 전용 권한만</strong> 요청하며, 이용자의 영상을 업로드하거나
          수정·삭제하지 않습니다.
        </p>
        <p>
          이용자는 본인이 정당한 권한을 가진 채널만 연결해야 합니다. 타인의 채널을 무단으로
          연결하는 행위는 금지됩니다.
        </p>
      </section>

      <section>
        <h2>3. 이용자의 데이터</h2>
        <p>
          연결된 채널의 데이터에 대한 권리는 이용자에게 있습니다. 회사는 분석 리포트 제공이라는
          목적 범위에서만 데이터를 처리하며, 상세한 내용은{" "}
          <a href="/privacy">개인정보처리방침</a>에 따릅니다.
        </p>
      </section>

      <section>
        <h2>4. 연결 해제</h2>
        <p>
          이용자는 언제든지 Google 계정 권한 관리 페이지 또는 회사에 대한 요청을 통해 연결을
          해제할 수 있습니다. 해제 시 회사는 해당 채널의 인증 토큰과 수집 데이터를 삭제합니다.
        </p>
      </section>

      <section>
        <h2>5. 금지 행위</h2>
        <ul>
          <li>서비스의 정상적인 운영을 방해하는 행위</li>
          <li>서비스에 무단으로 접근하거나 접근을 시도하는 행위</li>
          <li>타인의 채널 또는 계정을 도용하는 행위</li>
          <li>관련 법령 또는 YouTube 서비스 약관을 위반하는 행위</li>
        </ul>
      </section>

      <section>
        <h2>6. 서비스의 변경 및 중단</h2>
        <p>
          회사는 서비스의 내용을 변경하거나 운영을 중단할 수 있습니다. 이 경우 회사는 이용자에게
          사전에 통지하기 위해 합리적인 노력을 기울입니다.
        </p>
      </section>

      <section>
        <h2>7. 책임의 한계</h2>
        <p>
          서비스가 제공하는 분석 결과와 추천은 참고 자료입니다. 회사는 YouTube API가 제공하는
          데이터의 정확성이나 가용성을 보증하지 않으며, 이용자가 분석 결과에 근거하여 내린
          의사결정의 결과에 대해 책임을 지지 않습니다.
        </p>
      </section>

      <section>
        <h2>8. 약관의 변경</h2>
        <p>
          회사는 본 약관을 변경할 수 있으며, 변경 시 본 페이지에 게시하고 최종 수정일을
          갱신합니다. 변경 후에도 서비스를 계속 이용하는 경우 변경된 약관에 동의한 것으로 봅니다.
        </p>
      </section>

      <section>
        <h2>9. 문의</h2>
        <p>
          본 약관에 관한 문의는 <a href="mailto:hkj@stepai.kr">hkj@stepai.kr</a> 로 연락해 주십시오.
        </p>
      </section>
    </LegalPage>
  );
}
