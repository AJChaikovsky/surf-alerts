import { useLayoutEffect, useRef } from "react";

import { moveIndicator } from "../motion";
import "./SideNav.css";

export type Page = "spots" | "map" | "breaks" | "alerts" | "history";

const NAV_ITEMS: { page: Page; label: string }[] = [
  { page: "spots", label: "Surf Spots" },
  { page: "map", label: "Map" },
  { page: "breaks", label: "Local Breaks" },
  { page: "alerts", label: "My Alerts" },
  { page: "history", label: "Alert History" },
];


// Hash links keep the current page on refresh and make the browser back
// button work. A pill slides to the current page, as on ajchaikovsky.com.
export default function SideNav({ current }: { current: Page }) {
  const listRef = useRef<HTMLUListElement | null>(null);
  const pillRef = useRef<HTMLLIElement | null>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const list = listRef.current;
    const pill = pillRef.current;

    if (!list || !pill) return;

    function place(instant: boolean) {
      const active = list!.querySelector<HTMLElement>(`[data-page="${current}"]`);

      if (active) moveIndicator(pill!, active, instant);
    }

    // Jump into place the first time; slide after that.
    place(!placed.current);
    placed.current = true;

    // The layout changes between the side menu and top tabs.
    const onResize = () => place(true);
    window.addEventListener("resize", onResize);

    return () => window.removeEventListener("resize", onResize);
  }, [current]);

  return (
    <nav className="side-nav" aria-label="Main">
      <div className="side-nav-inner">
        <ul className="side-nav-list" ref={listRef}>
          <li className="side-nav-pill" ref={pillRef} aria-hidden="true" />

          {NAV_ITEMS.map((item, index) => (
            <li key={item.page}>
              <a
                href={`#/${item.page}`}
                data-page={item.page}
                className={
                  item.page === current
                    ? "side-nav-link active"
                    : "side-nav-link"
                }
                aria-current={item.page === current ? "page" : undefined}
              >
                <span className="side-nav-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
