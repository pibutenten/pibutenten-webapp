/**
 * 관리자 영역 전용 레이아웃 — root layout main의 max-w-1080은 그대로 유지.
 * (시원한 헤더 너비에 맞춰 정렬)
 */
export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
