type DentalMarkProps = {
  className?: string;
};

export function DentalMark({ className = "h-6 w-6" }: DentalMarkProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M16 6.15C13.8 4.7 11.45 4 9.35 4 5.7 4 3.5 6.8 3.5 10.45c0 3.15 1.45 5.15 2.35 7.75.85 2.45.95 9.8 4.45 9.8 2.65 0 2.5-6.35 5.7-6.35S19.05 28 21.7 28c3.5 0 3.6-7.35 4.45-9.8.9-2.6 2.35-4.6 2.35-7.75C28.5 6.8 26.3 4 22.65 4c-2.1 0-4.45.7-6.65 2.15Z"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeWidth="2.15"
        strokeLinejoin="round"
      />
      <path d="M11.2 8.1c1.55.75 3.15 1.1 4.8 1.1s3.25-.35 4.8-1.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M11.5 18.2h2.7l1.35-2.65 1.8 5.05 1.25-2.4h2" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
