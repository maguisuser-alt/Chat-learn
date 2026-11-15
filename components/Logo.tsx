/** Logo de Lingua Tutor: burbuja de chat con ondas de voz. */
export default function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Lingua Tutor">
      <rect width="64" height="64" rx="16" fill="#10a37f" />
      <path
        d="M32 13c-10.5 0-19 7.6-19 17 0 5 2.4 9.500 6.200 12.600L18 51l9.300-4.300c1.500.3 3.100.4 4.700.4 10.500 0 19-7.600 19-17S42.500 13 32 13Z"
        fill="#fff"
      />
      <g stroke="#10a37f" strokeWidth="3.4" strokeLinecap="round">
        <path d="M24 27v7" />
        <path d="M28.500 23v15" />
        <path d="M33 26v9" />
        <path d="M37.500 22v17" />
        <path d="M42 28v5" />
      </g>
    </svg>
  );
}
