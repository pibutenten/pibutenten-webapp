"use client";

// 우리 목업의 내 일기(연표/달력/목록) 컴포넌트를 그대로 재사용.
import { RecordView } from "../../mockups/skin-diary/SkinDiaryMockup";

export default function RecordTab() {
  return (
    <div className="pb-16 sm:pb-0">
      <RecordView go={() => {}} />
    </div>
  );
}
