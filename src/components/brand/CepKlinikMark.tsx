type CepKlinikMarkProps = {
  className?: string;
};

export function CepKlinikMark({ className = "h-6 w-6" }: CepKlinikMarkProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M6.25 5.25h19.5v13.1c0 5.16-4.19 9.35-9.35 9.35h-.8c-5.16 0-9.35-4.19-9.35-9.35V5.25Z"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <path d="M10.1 10.1h11.8" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      <path d="M16 13.2v8.1M11.95 17.25h8.1" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
    </svg>
  );
}

