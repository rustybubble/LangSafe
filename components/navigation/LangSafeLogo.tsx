interface LogoIconProps {
  size?: number;
  className?: string;
}

export function LogoIcon({ size = 22, className }: LogoIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M12 2.8L19 5.45V10.9C19 15.45 16.25 19.45 12 21.25C7.75 19.45 5 15.45 5 10.9V5.45L12 2.8Z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M12 4.95L17 6.85V10.85C17 14.35 15.05 17.2 12 18.75C8.95 17.2 7 14.35 7 10.85V6.85L12 4.95Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8.9 11.15C10.15 9.8 11.95 9.8 13.1 11.15C13.85 12.05 15.05 12.05 15.8 11.15"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
      <path
        d="M9.25 14.15H14.75"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
    </svg>
  );
}
