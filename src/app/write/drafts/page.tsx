"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listDrafts, deleteDraft, type DraftData, type DraftFormType } from "@/lib/draft-storage";

const TYPE_LABEL: Record<DraftFormType, string> = {
  doodle: "끄적끄적",
  qa: "Q&A",
  review: "시술후기",
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${m}/${day} ${h}:${min}`;
}

export default function DraftsPage() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<DraftData[]>([]);

  useEffect(() => {
    setDrafts(listDrafts());
  }, []);

  const handleDelete = (formType: DraftFormType) => {
    deleteDraft(formType);
    setDrafts(listDrafts());
  };

  const handleResume = (formType: DraftFormType) => {
    if (formType === "review") {
      router.push("/review/new");
    } else {
      router.push(`/write?tab=${formType}`);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "#ffffff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          borderBottom: "1px solid #edf2f5",
        }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            border: "none",
            background: "none",
            cursor: "pointer",
          }}
        >
          <svg
            width={22}
            height={22}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#3c4856"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 style={{ fontSize: 17, fontWeight: 700, color: "#1e2a35" }}>
          임시저장
        </h1>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {drafts.length === 0 ? (
          <p
            style={{
              textAlign: "center",
              color: "#7b8794",
              fontSize: 14,
              paddingTop: 48,
            }}
          >
            임시 저장된 글이 없습니다.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {drafts.map((d) => {
              // fields 는 localStorage 유래 — 손상 row 는 listDrafts 가 걸러내지만 방어적으로 옵셔널 접근.
              const title =
                ((d.fields?.title as string) ?? "") ||
                ((d.fields?.procedureKo as string) ?? "") ||
                "(제목 없음)";
              const preview =
                ((d.fields?.body as string) ?? "") ||
                ((d.fields?.oneliner as string) ?? "");
              return (
                <div
                  key={d.formType}
                  style={{
                    border: "1px solid #edf2f5",
                    borderRadius: 14,
                    padding: "14px 16px",
                    background: "#fafbfc",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#45b7e8",
                        background: "#eaf6fd",
                        padding: "2px 8px",
                        borderRadius: 999,
                      }}
                    >
                      {TYPE_LABEL[d.formType]}
                    </span>
                    <span style={{ fontSize: 12, color: "#9aa3b0" }}>
                      {formatDate(d.savedAt)}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: "#1e2a35",
                      marginBottom: 4,
                    }}
                  >
                    {title}
                  </p>
                  {preview && (
                    <p
                      style={{
                        fontSize: 13,
                        color: "#7b8794",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "100%",
                      }}
                    >
                      {preview.slice(0, 60)}
                    </p>
                  )}
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginTop: 12,
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleDelete(d.formType)}
                      style={{
                        padding: "7px 16px",
                        borderRadius: 8,
                        border: "1px solid #edf2f5",
                        background: "#fff",
                        color: "#7b8794",
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      삭제
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResume(d.formType)}
                      style={{
                        padding: "7px 16px",
                        borderRadius: 8,
                        border: "none",
                        background: "#45b7e8",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      이어 작성
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
