/**
 * RenaissLens wordmark: house + proof + seal in one lockup. Space Grotesk
 * Medium; a prism→facet authentication rule under "Lens"; a gold seal-dot as
 * the cert period after the final f. The logotype encodes the whole brand.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-baseline font-display font-medium tracking-[-0.01em] text-bone-50 ${className ?? ''}`}
    >
      <span>Renaiss</span>
      <span className="relative">
        Lens
        <span
          aria-hidden
          className="absolute -bottom-[0.08em] left-0 h-[1.5px] w-full bg-gradient-to-r from-prism to-facet"
        />
      </span>
      <span
        aria-hidden
        className="ml-[0.12em] inline-block h-[0.26em] w-[0.26em] self-center rounded-full bg-seal"
      />
    </span>
  )
}
