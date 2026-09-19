import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
  strokeWidth?: number;
};

/**
 * Iconos de trazo 1.8px tomados literalmente de `ui/design/screens`. Se
 * inlinean para no depender de una librería y mantener el trazo exacto.
 */
function Icon({
  children,
  size = 18,
  strokeWidth = 1.8,
  fill = "none",
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={fill === "none" ? "currentColor" : "none"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const PanelLeftIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="M9 4v16M13 10l2 2-2 2" />
  </Icon>
);

export const PlusIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const SearchIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);

export const AgentsIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
  </Icon>
);

export const ActivityIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 12h4l3-8 4 16 3-8h4" />
  </Icon>
);

export const SettingsIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
    <circle cx="15" cy="6" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="17" cy="18" r="2" />
  </Icon>
);

export const PlayIcon = (props: IconProps) => (
  <Icon size={12} fill="currentColor" {...props}>
    <path d="M7 4.5v15l12.5-7.5z" />
  </Icon>
);

export const SendIcon = (props: IconProps) => (
  <Icon size={16} strokeWidth={2} {...props}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </Icon>
);

export const PaperclipIcon = (props: IconProps) => (
  <Icon size={14} {...props}>
    <path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L15.5 7" />
  </Icon>
);

export const ChevronDownIcon = (props: IconProps) => (
  <Icon size={12} strokeWidth={2} {...props}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const CheckIcon = (props: IconProps) => (
  <Icon size={12} strokeWidth={2.6} {...props}>
    <path d="m5 12 5 5 9-10" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon size={12} strokeWidth={2.4} {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const AlertIcon = (props: IconProps) => (
  <Icon size={12} strokeWidth={2.4} {...props}>
    <path d="M12 7v6M12 17h.01" />
  </Icon>
);

export const RefreshIcon = (props: IconProps) => (
  <Icon size={12} strokeWidth={2.4} {...props}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
  </Icon>
);

export const PauseIcon = (props: IconProps) => (
  <Icon size={14} strokeWidth={2.2} {...props}>
    <path d="M9 5v14M15 5v14" />
  </Icon>
);

export const LockIcon = (props: IconProps) => (
  <Icon size={14} strokeWidth={2} {...props}>
    <rect x="6" y="11" width="12" height="9" rx="2" />
    <path d="M9 11V8a3 3 0 0 1 6 0v3" />
  </Icon>
);

export const GitConflictIcon = (props: IconProps) => (
  <Icon size={12} strokeWidth={2.2} {...props}>
    <circle cx="6" cy="5" r="2" />
    <circle cx="6" cy="19" r="2" />
    <circle cx="18" cy="6" r="2" />
    <path d="M6 7v10M18 8c0 5-5 5-10 9" />
  </Icon>
);

export const CopyIcon = (props: IconProps) => (
  <Icon size={14} {...props}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a1 1 0 0 1 1-1h10" />
  </Icon>
);

export const ExternalIcon = (props: IconProps) => (
  <Icon size={13} strokeWidth={2} {...props}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Icon>
);

export const StopIcon = (props: IconProps) => (
  <Icon size={12} fill="currentColor" {...props}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </Icon>
);
