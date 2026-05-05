"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  external?: boolean;
  icon: React.ReactNode;
};

const HomeIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
    aria-hidden="true"
  >
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5 10.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9.5" />
  </svg>
);

const SearchIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const DoctorIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
    aria-hidden="true"
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const YoutubeIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
    aria-hidden="true"
  >
    <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
    <path d="m10 15 5-3-5-3z" />
  </svg>
);

const NAV_ITEMS: NavItem[] = [
  { href: "/doctors", label: "전문의", icon: DoctorIcon },
  {
    href: "https://www.youtube.com/@pibutenten",
    label: "피부텐텐",
    external: true,
    icon: YoutubeIcon,
  },
];

export default function TopNav() {
  const pathname = usePathname();

  return (
    <header
      className="sticky top-0 z-50 border-b border-[var(--border)] backdrop-blur"
      style={{ background: "rgba(255,255,255,0.92)" }}
    >
      <div className="mx-auto flex w-full max-w-[1080px] items-center justify-between gap-2 px-4 py-3">
        <Link
          href="/"
          aria-label="피부텐텐 홈"
          className="flex items-center gap-2 shrink-0"
        >
          <Image
            src="/logo.svg"
            alt="피부텐텐"
            width={32}
            height={32}
            priority
            className="rounded-md"
          />
          <span className="text-[16px] font-bold leading-none text-[var(--primary)] sm:text-[19px]">
            피부텐텐
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-3">
          {NAV_ITEMS.map((item) => {
            const isActive =
              !item.external &&
              (item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href));

            const baseCls =
              "flex items-center gap-1.5 rounded-md p-2 text-[14px] font-medium transition-colors";
            const activeCls = isActive
              ? "text-[var(--primary)]"
              : "text-[var(--text-secondary)] hover:text-[var(--primary)]";

            const content = (
              <>
                {item.icon}
                <span className="hidden sm:inline">{item.label}</span>
              </>
            );

            if (item.external) {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={item.label}
                  title={item.label}
                  className={`${baseCls} ${activeCls}`}
                >
                  {content}
                </a>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                title={item.label}
                aria-current={isActive ? "page" : undefined}
                className={`${baseCls} ${activeCls}`}
              >
                {content}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
