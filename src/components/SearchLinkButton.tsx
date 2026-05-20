import Link from "next/link";

type Props = {
  className?: string;
};

export default function SearchLinkButton({
  className = "text-gray-400 hover:text-gray-600",
}: Props) {
  return (
    <Link
      href="/search"
      aria-label="검색"
      className={`p-1.5 rounded-lg transition-colors ${className}`}
    >
      <svg
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
        />
      </svg>
    </Link>
  );
}
