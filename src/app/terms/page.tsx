import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "이용약관",
  description:
    "피부텐텐(주식회사 진솔컴퍼니) 이용약관 — 서비스 이용 조건, 회원의 의무, 게시물 관리, 면책 조항.",
  alternates: { canonical: `${SITE_URL}/terms` },
  robots: { index: true, follow: true },
};

/**
 * 이용약관.
 * 시행일: 2026-05-13 (pbtt.kr 런칭과 동시)
 */
export default function TermsPage() {
  return (
    <article className="mx-auto w-full max-w-[720px] px-4 py-6 sm:px-6">
      <header className="mb-8">
        <h1 className="mb-3 text-[26px] font-bold leading-[1.35] text-[var(--text)] sm:text-[30px]">
          이용약관
        </h1>
        <p className="text-[13px] text-[var(--text-muted)]">
          시행일자: 2026년 5월 13일
        </p>
      </header>

      <Section title="제1조 (목적)">
        <p>
          이 약관은 주식회사 진솔컴퍼니(이하 &ldquo;회사&rdquo;)가 운영하는
          피부텐텐(pbtt.kr, 이하 &ldquo;서비스&rdquo;)의 이용과 관련하여 회사와
          이용자(회원·비회원)의 권리, 의무 및 책임 사항, 기타 필요한 사항을
          규정함을 목적으로 합니다.
        </p>
      </Section>

      <Section title="제2조 (용어의 정의)">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>서비스</strong>: 피부과 전문의가 함께 만드는 피부 미용
            Q&amp;A SNS — 의사 답변·회원 글·검색·태그·알림 등 일체.
          </li>
          <li>
            <strong>회원</strong>: 본 약관에 동의하고 회사와 이용계약을 체결한
            자.
          </li>
          <li>
            <strong>의사 회원</strong>: 피부과 전문의 자격을 회사가 확인한 회원
            으로, 의사 답변·칼럼 작성 권한이 있는 회원.
          </li>
          <li>
            <strong>게시물</strong>: 회원이 서비스에 게시한 글·댓글·이미지·태그
            등 모든 형태의 정보.
          </li>
        </ul>
      </Section>

      <Section title="제3조 (약관의 효력 및 변경)">
        <p className="mb-2">
          본 약관은 서비스 화면에 게시하거나 기타 방법으로 회원에게 공지함으로써
          효력이 발생합니다. 회사는 관련 법령을 위배하지 않는 범위에서 본 약관
          을 변경할 수 있으며, 변경된 약관은 시행일 7일 전(회원에게 불리한 변경
          은 30일 전)부터 공지합니다.
        </p>
        <p>
          회원이 변경된 약관에 동의하지 않을 경우 회원 탈퇴를 요청할 수 있으며,
          공지 후에도 서비스 이용을 계속할 경우 변경된 약관에 동의한 것으로
          간주합니다.
        </p>
      </Section>

      <Section title="제4조 (회원가입 및 자격)">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            회원가입은 본 약관 및 개인정보 처리방침에 동의한 후 Google·Kakao·
            Naver 등의 소셜 로그인을 통해 신청할 수 있습니다.
          </li>
          <li>
            만 14세 미만 아동은 회원가입이 제한될 수 있으며, 회사는 회원가입 시
            연령 확인 절차를 둘 수 있습니다.
          </li>
          <li>
            회원은 가입 신청 시 사실에 근거한 정보를 제공하여야 하며, 허위
            정보 제공으로 인한 불이익은 회원이 부담합니다.
          </li>
          <li>
            회사는 다음 각 호의 신청에 대해서는 가입을 거절하거나 사후 자격을
            상실시킬 수 있습니다.
            <ul className="mt-1 list-[circle] space-y-0.5 pl-5">
              <li>타인의 명의를 도용한 경우</li>
              <li>본 약관에 위배되거나 위법한 목적이 명확한 경우</li>
              <li>이미 가입된 동일인이 재가입을 시도하는 경우</li>
            </ul>
          </li>
        </ul>
      </Section>

      <Section title="제5조 (회원의 의무)">
        <ul className="list-disc space-y-1 pl-5">
          <li>회원은 다음 행위를 하여서는 안 됩니다.</li>
        </ul>
        <ul className="mt-2 list-[circle] space-y-1 pl-10 text-[13.5px]">
          <li>신청 또는 변경 시 허위 내용 등록</li>
          <li>타인의 정보 도용</li>
          <li>회사·타 회원·제3자의 명예 훼손 또는 업무 방해</li>
          <li>음란·폭력·차별·혐오 정보, 또는 공공질서에 위반되는 정보의 공개·게시</li>
          <li>회사의 동의 없는 상업적 광고·홍보·스팸성 콘텐츠 게시</li>
          <li>저작권 등 회사·제3자의 권리를 침해하는 행위</li>
          <li>의료법·약사법 등 관련 법령을 위반하는 정보의 게시</li>
        </ul>
      </Section>

      <Section title="제6조 (서비스의 제공 및 변경)">
        <p className="mb-2">
          회사는 다음과 같은 서비스를 제공합니다.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>피부과 전문의의 검수된 Q&amp;A 답변·칼럼 열람</li>
          <li>회원의 피부 관련 글·질문·일기·꿀팁·공유하기 작성 및 열람</li>
          <li>댓글·좋아요·저장·공유 등 커뮤니티 기능</li>
          <li>피부 관심사 기반 맞춤 피드</li>
          <li>알림·검색·태그 등 부가 기능</li>
        </ul>
        <p className="mt-3">
          회사는 서비스 운영·기술상 필요한 경우 서비스의 일부 또는 전부를 변경할
          수 있으며, 사전 또는 사후 공지합니다.
        </p>
      </Section>

      <Section title="제7조 (게시물의 관리)">
        <p className="mb-2">
          회원이 게시한 게시물의 저작권은 해당 회원에게 귀속됩니다. 다만 회원은
          회사가 서비스의 운영·전시·전송·홍보·개선을 위하여 게시물을 사용할 수
          있는 비독점적·무상의 사용권을 회사에 부여합니다.
        </p>
        <p className="mb-2">
          회사는 다음에 해당하는 게시물에 대해 사전 통지 없이 삭제·이동하거나
          비공개 처리할 수 있습니다.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>제5조 회원의 의무를 위반한 게시물</li>
          <li>타인의 명예 훼손·인격권 침해 게시물</li>
          <li>의료법·약사법 위반 우려가 있는 광고성 게시물</li>
          <li>저작권·초상권 등 제3자 권리를 침해한 게시물</li>
          <li>기타 관련 법령 또는 공공질서에 위반되는 게시물</li>
        </ul>
      </Section>

      <Section title="제8조 (개인정보 보호)">
        <p>
          회사는 관련 법령에 따라 회원의 개인정보를 보호하기 위해 노력하며, 회원
          의 개인정보 보호 및 사용에 대해서는 별도의{" "}
          <Link
            href="/privacy"
            className="text-[var(--primary)] hover:underline"
          >
            개인정보 처리방침
          </Link>
          이 적용됩니다.
        </p>
      </Section>

      <Section title="제9조 (회원 탈퇴 및 자격 상실)">
        <p>
          회원은 언제든지 서비스 내 <strong>설정 → 계정 관리</strong> 메뉴를 통해
          탈퇴를 요청할 수 있으며, 회사는 즉시 회원의 개인정보를 「개인정보
          처리방침」에 따라 처리합니다.
        </p>
      </Section>

      <Section title="제10조 (의료 정보 면책)">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <p className="mb-2 font-semibold">중요 — 본 서비스의 콘텐츠 성격</p>
          <p className="mb-2">
            본 서비스에서 제공하는 전문의 답변은 board-certified 피부과 전문의가
            작성한 <strong>일반적인 의학 정보</strong>이며, 개인 진단·처방·치료를
            대체하지 않습니다.
          </p>
          <p>
            회원이 작성한 글은 개인 의견이며 의료 정보가 아닙니다. 시술·치료·약물
            결정 시에는 반드시 의료기관에서 자격 있는 의료진과 직접 상담하시기
            바랍니다.
          </p>
        </div>
      </Section>

      <Section title="제11조 (손해배상 및 책임 제한)">
        <p className="mb-2">
          회사는 무료로 제공되는 서비스의 이용과 관련하여 「개인정보 보호법」 및
          관련 법령상 회사에 귀책사유가 없는 한 회원에게 손해를 배상할 책임이
          없습니다.
        </p>
        <p>
          회사는 천재지변, 회사가 통제할 수 없는 사유로 서비스가 중단되는 경우
          에는 책임이 면제되며, 회원 간 또는 회원과 제3자 간 발생한 분쟁에 대해
          개입할 의무가 없습니다.
        </p>
      </Section>

      <Section title="제12조 (분쟁 해결 및 관할)">
        <p>
          본 약관과 관련하여 발생한 분쟁에 대해 양 당사자는 신의성실의 원칙에
          따라 합의하여 해결하도록 노력합니다. 합의가 이루어지지 않을 경우
          민사소송법상의 관할 법원에 따릅니다.
        </p>
      </Section>

      <footer className="mt-10 border-t border-[var(--border)] pt-6 text-[13px] text-[var(--text-muted)]">
        <p>주식회사 진솔컴퍼니 · 사업자등록번호 261-86-01781</p>
        <p>
          본 약관은 검수·수정을 거치는 중인 초안 단계이며, 정식 법무 자문 후
          확정될 수 있습니다.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/"
            className="rounded-md bg-[var(--primary)] px-4 py-2 font-semibold text-white hover:bg-[var(--primary-dark)]"
            style={{ color: "#FFFFFF" }}
          >
            홈으로
          </Link>
          <Link
            href="/privacy"
            className="rounded-md border border-[var(--border)] px-4 py-2 hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            개인정보 처리방침
          </Link>
          <Link
            href="/about"
            className="rounded-md border border-[var(--border)] px-4 py-2 hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            사이트 안내
          </Link>
        </div>
      </footer>
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8 text-[14px] leading-[1.75] text-[var(--text-secondary)]">
      <h2 className="mb-3 text-[17px] font-bold text-[var(--text)]">{title}</h2>
      {children}
    </section>
  );
}
