export const metadata = { title: 'Fairness · RenaissLens' }

/**
 * The roadmap tab: pull verification is deliberately shipped DISABLED —
 * building it against Renaiss's private internals isn't possible (or honest)
 * until they open-source the commitment scheme, which they have said they
 * will. The tab exists so the feature has a visible, waiting home.
 */
export default function Fairness() {
  return (
    <div className="max-w-2xl space-y-8">
      <div className="overflow-hidden rounded-sm border border-zinc-700/60 bg-zinc-900/60">
        <div className="h-1 bg-vault-700" />
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-1.5">
          <span className="font-display text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
            RenaissLens · Pull Verification
          </span>
          <span className="rounded border border-zinc-700 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-[0.14em] text-zinc-500">
            Disabled
          </span>
        </div>
        <div className="px-4 pb-4 pt-2">
          <h2 className="font-display text-2xl font-bold text-zinc-400">
            Coming when Renaiss open-sources its fairness internals
          </h2>
        </div>
      </div>

      <section className="space-y-4 text-sm leading-relaxed text-zinc-300">
        <p>
          Verifying that a gacha pull was fair requires Renaiss&apos;s commitment scheme — the
          server-seed commitments and Merkle roots that fix each pull&apos;s outcome before you
          click. Those internals are not public yet; Renaiss has said they will be open-sourced.
          Until then, no third party can honestly verify a pull, and RenaissLens won&apos;t pretend
          otherwise.
        </p>
        <p>When the internals land, this tab activates and does three things:</p>
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            <span className="text-zinc-100">Read the commitment.</span> Before your pull, the server
            publishes a cryptographic commitment to its seed — a promise it can&apos;t change
            afterward.
          </li>
          <li>
            <span className="text-zinc-100">Check the reveal.</span> After the pull, the server
            reveals the seed. RenaissLens hashes it and checks it against the earlier commitment and
            the published Merkle root.
          </li>
          <li>
            <span className="text-zinc-100">Re-derive your outcome.</span> From the revealed seed
            and your inputs, RenaissLens independently recomputes the pull result — proving the
            outcome was fixed <em>before</em> you clicked, not after.
          </li>
        </ol>
        <p className="border-l-2 border-prism/40 pl-3 text-zinc-400">
          RenaissLens already treats every number it publishes as something a reader should be able
          to trace and re-derive. Pull verification is the same principle applied to the gacha
          itself — and this is where it will live.
        </p>
      </section>
    </div>
  )
}
