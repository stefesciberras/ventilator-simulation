interface EdusimBackLinkProps {
  className?: string
  label?: string
}

export function EdusimBackLink({ className = '', label = 'Return to LoppjuSIM' }: EdusimBackLinkProps) {
  return <a href="/" className={`edusim-back-link ${className}`.trim()} aria-label={label} title={label}>‹</a>
}
