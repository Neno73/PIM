interface TexetIconProps {
  size?: number
  className?: string
}

export function TexetIcon({ size = 24, className = "" }: TexetIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="12" cy="12" r="10" fill="hsl(var(--accent))" />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fill="hsl(var(--accent-foreground))"
        fontSize="10"
        fontWeight="bold"
      >
        T
      </text>
    </svg>
  )
}