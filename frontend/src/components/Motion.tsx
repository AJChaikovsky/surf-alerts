import {
  useLayoutEffect,
  useRef,
  type ElementType,
  type ReactNode,
} from "react";

import { revealHeader, staggerIn } from "../motion";


// Splits text into word or letter spans for animation. Screen readers get
// the whole text from aria-label instead of one letter at a time.
export function SplitText({
  text,
  mode = "words",
}: {
  text: string;
  mode?: "words" | "chars";
}) {
  const parts = mode === "chars" ? Array.from(text) : text.split(/(\s+)/);

  return (
    <span aria-label={text} role="text">
      {parts.map((part, index) =>
        mode === "words" && /^\s+$/.test(part) ? (
          part
        ) : (
          <span
            key={index}
            aria-hidden="true"
            className={mode === "chars" ? "split-char" : "split-word"}
          >
            {part === " " ? " " : part}
          </span>
        )
      )}
    </span>
  );
}


// Numbered eyebrow, a title that blurs in word by word, and a subtitle.
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    revealHeader(ref.current);
  }, [title]);

  return (
    <header className="page-header" ref={ref}>
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>
          <SplitText text={title} />
        </h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>

      {children && <div className="page-header-actions">{children}</div>}
    </header>
  );
}


// Staggers its children in the first time there are any (so content that
// arrives from the API animates too), and again when `replayKey` changes.
export function Stagger({
  as: Tag = "div",
  className,
  replayKey,
  stagger = 0.06,
  children,
}: {
  as?: ElementType;
  className?: string;
  replayKey?: unknown;
  stagger?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const shownFor = useRef<unknown>(Symbol("never"));
  const count = Array.isArray(children)
    ? children.filter(Boolean).length
    : children
      ? 1
      : 0;

  useLayoutEffect(() => {
    const element = ref.current;

    if (!element || element.children.length === 0) return;

    if (shownFor.current !== replayKey) {
      shownFor.current = replayKey;
      staggerIn(element.children, stagger);
    }
  }, [count, replayKey, stagger]);

  return (
    <Tag className={className} ref={ref}>
      {children}
    </Tag>
  );
}
