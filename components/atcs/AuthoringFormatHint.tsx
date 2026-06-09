// Inline format guide for the Steps / Assertions code editors. The editors are
// intentionally code-authoring (markdown numbered list + YAML bullet list →
// live preview) — a ratified product choice (master-design-plan §5 D3). Because
// the storage format doubles as the input format, a new author needs to be told
// the exact syntax up-front; this one-liner shows a real example so the box
// isn't mistaken for a free textarea.
export function AuthoringFormatHint({ kind }: { kind: 'steps' | 'assertions' }) {
  return (
    <p className="mb-1.5 font-mono text-2xs leading-relaxed text-fg-4">
      {kind === 'steps'
        ? (
            <>
              Format:
              {' '}
              <span className="text-fg-2">01. Open the page</span>
              {' '}
              — one step per numbered line. Optionally indent
              {' '}
              <span className="text-fg-2">input:</span>
              {' / '}
              <span className="text-fg-2">expected:</span>
              {' '}
              under a step.
            </>
          )
        : (
            <>
              Format:
              {' '}
              <span className="text-fg-2">- status == 200</span>
              {' '}
              — one assertion per line.
            </>
          )}
    </p>
  );
}
