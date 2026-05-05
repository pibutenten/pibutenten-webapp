/**
 * 관리자 영역 전용 레이아웃 — root layout의 main(max-w-1080) 너비 제한을 풀어
 * 데스크탑 전체 너비를 시원하게 사용.
 */
export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="admin-area w-full">
      {children}
      {/* eslint-disable-next-line react/no-unknown-property */}
      <style jsx global>{`
        body main {
          max-width: none !important;
        }
        @media (min-width: 1080px) {
          body main {
            padding-left: 32px;
            padding-right: 32px;
          }
        }
      `}</style>
    </div>
  );
}
