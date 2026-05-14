import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "개인정보 처리방침",
  description:
    "피부텐텐(주식회사 진솔컴퍼니) 개인정보 처리방침 — 수집 항목, 이용 목적, 보유 기간, 정보주체 권리.",
  alternates: { canonical: `${SITE_URL}/privacy` },
  robots: { index: true, follow: true },
};

/**
 * 개인정보 처리방침.
 * 한국 개인정보보호법(2024 개정) 기준 표준 구조.
 * 운영 주체: 주식회사 진솔컴퍼니
 * 시행일: 2026-05-13 (도메인 pbtt.kr 런칭과 동시)
 */
export default function PrivacyPage() {
  return (
    <article className="mx-auto w-full max-w-[720px] px-4 py-6 sm:px-6">
      <header className="mb-8">
        <h1 className="mb-3 text-[26px] font-bold leading-[1.35] text-[var(--text)] sm:text-[30px]">
          개인정보 처리방침
        </h1>
        <p className="text-[13px] text-[var(--text-muted)]">
          시행일자: 2026년 5월 13일 · 최종 개정일: 2026년 5월 13일
        </p>
      </header>

      <p className="mb-8 rounded-md bg-[var(--bg-soft)] p-4 text-[14px] leading-[1.7] text-[var(--text-secondary)]">
        주식회사 진솔컴퍼니(이하 &ldquo;회사&rdquo;)는 정보주체의 자유와 권리
        보호를 위해 「개인정보 보호법」 및 관련 법령이 정한 바를 준수하며, 다음과
        같이 개인정보 처리방침을 수립·공개합니다.
      </p>

      <Section title="제1조 (개인정보의 처리 목적)">
        <p className="mb-3">
          회사는 다음의 목적을 위하여 개인정보를 처리하며, 이용 목적이 변경될
          경우 「개인정보 보호법」 제18조에 따라 별도 동의를 받는 등 필요한
          조치를 이행할 예정입니다.
        </p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            회원 가입 및 관리 — 회원 식별·인증, 본인 확인, 부정 이용 방지
          </li>
          <li>
            서비스 제공 — 피부 관련 Q&amp;A 게시, 댓글, 좋아요·저장, 맞춤형
            피드, 알림 발송
          </li>
          <li>
            피부 맞춤 콘텐츠 추천 — 회원이 선택적으로 입력한 피부 정보(피부
            타입·고민·관심 시술)를 기반으로 피드 정렬에 활용. 단순 정렬
            수준이며 자동화된 결정으로 인한 법적 효과는 발생하지 않습니다. 회원은
            언제든지 입력한 피부 정보를 수정·삭제할 수 있습니다.
          </li>
          <li>고객 문의 응대 및 분쟁 처리</li>
          <li>서비스 개선을 위한 통계 분석 (개인 식별 불가능한 형태로 처리)</li>
        </ol>
      </Section>

      <Section title="제2조 (처리하는 개인정보의 항목)">
        <p className="mb-3">
          회사는 다음의 개인정보 항목을 처리하고 있습니다.
        </p>

        <h3 className="mb-2 mt-4 text-[15px] font-semibold text-[var(--text)]">
          1. 회원가입 시 (소셜 로그인)
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>필수</strong>: 이메일 주소, 이름(또는 닉네임)
          </li>
          <li>
            <strong>선택</strong>: 프로필 사진
          </li>
          <li>
            제공자: Google / Kakao / Naver — 정보주체가 각 OAuth 동의 화면에서
            동의한 항목만 전달받습니다.
          </li>
        </ul>

        <h3 className="mb-2 mt-5 text-[15px] font-semibold text-[var(--text)]">
          2. 추가 입력 정보 (선택, 온보딩 단계)
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>생년월일, 성별</li>
          <li>피부 정보: 얼굴형, 피부타입, 피부 고민, 관심 시술</li>
          <li>자기소개(자기 작성), 닉네임(별칭)</li>
        </ul>

        <h3 className="mb-2 mt-5 text-[15px] font-semibold text-[var(--text)]">
          3. 서비스 이용 과정에서 자동 수집되는 항목
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            접속 IP 주소, 쿠키, 서비스 이용 기록, 접속 일시, 브라우저 종류
          </li>
          <li>좋아요·저장·댓글 등 활동 로그(서비스 운영 목적)</li>
        </ul>

        <p className="mt-4">
          회사는 회원의 진단명·치료 이력·복용 약물 등 「개인정보 보호법」
          제23조에 따른 민감정보를 수집·처리하지 않습니다. 회원이 자발적으로
          게시물에 건강 관련 정보를 기재할 수 있으나, 이는 회원 본인의 의사에
          따른 자발적 공개이며 회사가 별도로 수집·관리하는 항목이 아닙니다.
        </p>
      </Section>

      <Section title="제3조 (개인정보의 처리 및 보유 기간)">
        <p className="mb-3">
          회사는 법령에 따른 개인정보 보유·이용 기간 또는 정보주체로부터
          개인정보를 수집 시 동의받은 보유·이용 기간 내에서 개인정보를
          처리·보유합니다.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>회원 정보</strong>: 회원 탈퇴 시까지. 단, 관계 법령 위반에
            따른 수사·조사 등이 진행 중인 경우 해당 절차 종료 시까지.
          </li>
          <li>
            <strong>활동 기록(글·댓글 등)</strong>: 게시 시점부터 회원 탈퇴 또는
            본인 삭제 시까지. 단, 다른 회원의 답글이 달린 글은 익명화 처리 후
            보존될 수 있습니다.
          </li>
          <li>
            <strong>접속 로그</strong>: 3개월 (「통신비밀보호법」)
          </li>
          <li>
            <strong>부정 이용 기록</strong>: 1년
          </li>
        </ul>

        <p className="mt-4 mb-2">
          향후 유료 서비스를 도입하는 경우 「전자상거래 등에서의 소비자보호에
          관한 법률」에 따라 다음과 같이 거래 관련 정보를 보존합니다.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>계약 또는 청약철회에 관한 기록: 5년</li>
          <li>대금결제 및 재화 등의 공급에 관한 기록: 5년</li>
          <li>소비자 불만 또는 분쟁처리에 관한 기록: 3년</li>
          <li>표시·광고에 관한 기록: 6개월</li>
        </ul>
      </Section>

      <Section title="제4조 (개인정보의 제3자 제공)">
        <p className="mb-2">
          회사는 정보주체의 개인정보를 제1조에 명시한 범위 내에서만 처리하며,
          정보주체의 동의, 법률의 특별한 규정 등 「개인정보 보호법」 제17조 및
          제18조에 해당하는 경우에만 개인정보를 제3자에게 제공합니다.{" "}
          <strong className="text-[var(--text)]">
            현재 회사가 정기적으로 제3자에게 제공하는 개인정보는 없습니다.
          </strong>
        </p>
        <p>
          수사기관 등 관계 기관의 적법한 요청이 있는 경우, 회사는 관련 법령상
          절차에 따라 최소한의 범위에서 개인정보를 제공할 수 있습니다.
        </p>
      </Section>

      <Section title="제5조 (개인정보 처리의 위탁)">
        <p className="mb-3">
          회사는 원활한 개인정보 업무 처리를 위하여 다음과 같이 개인정보 처리
          업무를 위탁하고 있습니다.
        </p>
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="w-full text-[13.5px]">
            <thead className="bg-[var(--bg-soft)] text-[var(--text)]">
              <tr>
                <th className="border-b border-[var(--border)] px-3 py-2 text-left">
                  수탁사
                </th>
                <th className="border-b border-[var(--border)] px-3 py-2 text-left">
                  위탁 업무
                </th>
              </tr>
            </thead>
            <tbody className="text-[var(--text-secondary)]">
              <tr>
                <td className="border-b border-[var(--border)] px-3 py-2">
                  Supabase Inc.
                </td>
                <td className="border-b border-[var(--border)] px-3 py-2">
                  회원 인증·계정 관리·데이터 저장 (클라우드 DB)
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2">Vercel Inc.</td>
                <td className="px-3 py-2">서비스 호스팅·CDN</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          회사는 위탁 계약 시 「개인정보 보호법」 제26조에 따라 개인정보가
          안전하게 관리될 수 있도록 필요한 사항을 규정합니다. 수탁자가 변경될
          경우 본 처리방침을 통해 지체 없이 공개합니다.
        </p>
        <p className="mt-3">
          회사 운영자는 콘텐츠 작성을 보조하기 위해 Anthropic PBC의 AI
          도구(Claude)를 사용할 수 있으며, 이 과정에서 회원의 개인정보는
          입력되지 않습니다.
        </p>
      </Section>

      <Section title="제5조의2 (개인정보의 국외 이전)">
        <p className="mb-3">
          회사는 서비스 제공을 위해 다음과 같이 개인정보를 국외로 이전합니다.
        </p>
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="w-full text-[12.5px]">
            <thead className="bg-[var(--bg-soft)] text-[var(--text)]">
              <tr>
                <th className="border-b border-[var(--border)] px-2 py-2 text-left">
                  이전받는 자
                </th>
                <th className="border-b border-[var(--border)] px-2 py-2 text-left">
                  국가
                </th>
                <th className="border-b border-[var(--border)] px-2 py-2 text-left">
                  이전 시점·방법
                </th>
                <th className="border-b border-[var(--border)] px-2 py-2 text-left">
                  이전 항목
                </th>
                <th className="border-b border-[var(--border)] px-2 py-2 text-left">
                  이용 목적
                </th>
                <th className="border-b border-[var(--border)] px-2 py-2 text-left">
                  보유·이용 기간
                </th>
              </tr>
            </thead>
            <tbody className="text-[var(--text-secondary)]">
              <tr>
                <td className="border-b border-[var(--border)] px-2 py-2 align-top">
                  Supabase Inc.
                </td>
                <td className="border-b border-[var(--border)] px-2 py-2 align-top">
                  미국
                </td>
                <td className="border-b border-[var(--border)] px-2 py-2 align-top">
                  회원가입·서비스 이용 시 정보통신망을 통한 전송
                </td>
                <td className="border-b border-[var(--border)] px-2 py-2 align-top">
                  이메일, 이름(닉네임), 프로필 사진, 피부 정보, 활동 로그
                </td>
                <td className="border-b border-[var(--border)] px-2 py-2 align-top">
                  회원 인증, 데이터 저장
                </td>
                <td className="border-b border-[var(--border)] px-2 py-2 align-top">
                  회원 탈퇴 시까지 또는 위탁계약 종료 시까지
                </td>
              </tr>
              <tr>
                <td className="px-2 py-2 align-top">Vercel Inc.</td>
                <td className="px-2 py-2 align-top">미국</td>
                <td className="px-2 py-2 align-top">
                  서비스 접속 시 정보통신망을 통한 전송
                </td>
                <td className="px-2 py-2 align-top">
                  접속 IP, 쿠키, 서비스 이용 기록
                </td>
                <td className="px-2 py-2 align-top">호스팅, 콘텐츠 전송</td>
                <td className="px-2 py-2 align-top">위탁계약 종료 시까지</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          회원은 위 국외 이전에 동의하지 않을 권리가 있으나, 동의를 거부할 경우
          서비스 이용이 제한될 수 있습니다.
        </p>
      </Section>

      <Section title="제6조 (정보주체와 법정대리인의 권리·의무 및 행사 방법)">
        <p className="mb-3">
          정보주체는 회사에 대해 언제든지 다음 각 호의 개인정보 보호 관련 권리를
          행사할 수 있습니다.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>개인정보 열람 요구</li>
          <li>오류 등이 있을 경우 정정 요구</li>
          <li>삭제 요구</li>
          <li>처리정지 요구</li>
        </ul>
        <p className="mt-3">
          만 14세 미만 아동의 경우 법정대리인이 위 권리를 대리하여 행사할 수
          있습니다. (회사는 만 14세 미만 아동의 회원가입을 허용하지 않습니다.)
        </p>
        <p className="mt-3">
          권리 행사는 서비스 내 <strong>설정 → 계정 관리</strong> 메뉴에서
          가능하며, 직접 처리가 어려운 사항은 아래 개인정보 보호책임자 이메일로
          요청해 주시면 10일 이내에 조치하겠습니다.
        </p>
      </Section>

      <Section title="제7조 (개인정보의 파기)">
        <p>
          회사는 개인정보 보유기간의 경과, 처리 목적 달성 등 개인정보가 불필요
          하게 되었을 때에는 지체 없이 해당 개인정보를 파기합니다. 전자적 파일
          형태는 복구·재생이 불가능한 방법으로 영구 삭제하며, 종이 문서는 분쇄
          또는 소각합니다.
        </p>
      </Section>

      <Section title="제8조 (개인정보의 안전성 확보 조치)">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>관리적 조치</strong> — 내부관리계획 수립·시행, 개인정보
            취급자 지정 및 접근 권한 최소화, 정기적 보안 교육
          </li>
          <li>
            <strong>기술적 조치</strong> — 비밀번호 암호화(단방향 해시), 전송
            구간 TLS 암호화, 데이터베이스 행 단위 권한 제어(RLS), 접속 기록 보관
            및 위·변조 방지, 악성 프로그램 방지 조치
          </li>
          <li>
            <strong>물리적 조치</strong> — 위탁사(Supabase, Vercel)의 데이터
            센터 보안 표준 준수 (SOC 2 Type II 등)
          </li>
        </ul>
      </Section>

      <Section title="제9조 (자동 수집 장치의 설치·운영 및 거부)">
        <p className="mb-2">
          회사는 이용자에게 개별 맞춤 서비스를 제공하기 위해 쿠키(Cookie)를
          사용합니다. 이용자는 브라우저 옵션 설정을 통해 쿠키 저장을 거부할 수
          있으나, 일부 서비스(로그인 유지 등) 이용에 어려움이 있을 수 있습니다.
        </p>
        <p>
          회사는 현재 행태정보를 수집하여 광고에 활용하지 않습니다. 향후 광고·
          분석 도구를 도입할 경우 본 처리방침을 통해 사전 고지합니다.
        </p>
      </Section>

      <Section title="제10조 (영상정보처리기기 운영)">
        <p>회사는 영상정보처리기기(CCTV 등)를 운영하지 않습니다.</p>
      </Section>

      <Section title="제11조 (개인정보 보호책임자)">
        <ul className="list-disc space-y-1 pl-5">
          <li>책임자: 배정민</li>
          <li>소속: 주식회사 진솔컴퍼니</li>
          <li>
            연락처:{" "}
            <a
              href="mailto:pibutenten@gmail.com"
              className="text-[var(--primary)] hover:underline"
            >
              pibutenten@gmail.com
            </a>
          </li>
        </ul>
        <p className="mt-3 text-[13px] text-[var(--text-muted)]">
          기타 개인정보 침해에 대한 신고나 상담이 필요하신 경우 아래 기관으로
          문의하시기 바랍니다.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-[var(--text-muted)]">
          <li>개인정보침해 신고센터: privacy.kisa.or.kr / 국번 없이 118</li>
          <li>개인정보 분쟁조정위원회: kopico.go.kr / 1833-6972</li>
          <li>대검찰청 사이버수사과: spo.go.kr / 02-3480-3573</li>
          <li>경찰청 사이버수사국: ecrm.police.go.kr / 국번 없이 182</li>
        </ul>
      </Section>

      <Section title="제12조 (개인정보 처리방침의 변경)">
        <p>
          본 개인정보 처리방침은 시행일로부터 적용되며, 법령·정책 또는 서비스
          내용의 변경에 따라 내용을 변경하는 경우 변경 시행 7일 전부터 본
          페이지를 통해 고지합니다.
        </p>
      </Section>

      <footer className="mt-10 border-t border-[var(--border)] pt-6 text-[13px] text-[var(--text-muted)]">
        <p>주식회사 진솔컴퍼니 · 사업자등록번호 261-86-01781</p>
        <p>
          본 방침은 검수·수정을 거치는 중인 초안 단계이며, 정식 법무 자문 후
          확정될 수 있습니다. 수정 사항은 본 페이지에서 공지됩니다.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/about"
            className="rounded-md border border-[var(--border)] px-4 py-2 hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            사이트 안내
          </Link>
          <Link
            href="/terms"
            className="rounded-md border border-[var(--border)] px-4 py-2 hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            이용약관
          </Link>
          <Link
            href="/privacy"
            aria-current="page"
            className="rounded-md border border-[var(--primary)]/40 bg-[var(--primary-soft)] px-4 py-2 font-semibold text-[var(--primary)]"
          >
            개인정보 처리방침
          </Link>
          <Link
            href="/doctor-guidelines"
            className="rounded-md border border-[var(--border)] px-4 py-2 hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            의사 답변 가이드라인
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
