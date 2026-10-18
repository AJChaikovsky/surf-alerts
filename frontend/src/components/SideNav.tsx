import "./SideNav.css";

export type Page = "spots" | "map" | "breaks" | "alerts" | "history";

const NAV_ITEMS: { page: Page; label: string }[] = [
  { page: "spots", label: "Surf Spots" },
  { page: "map", label: "Map" },
  { page: "breaks", label: "Local Breaks" },
  { page: "alerts", label: "My Alerts" },
  { page: "history", label: "Alert History" },
];


// Hash links keep the current page on refresh
// and make the browser back button work.
export default function SideNav({ current }: { current: Page }) {
  return (
    <nav className="side-nav" aria-label="Main">
      <div className="side-nav-inner">
        <p className="side-nav-brand">Surf Alerts</p>

        <ul className="side-nav-list">
          {NAV_ITEMS.map((item) => (
            <li key={item.page}>
              <a
                href={`#/${item.page}`}
                className={
                  item.page === current
                    ? "side-nav-link active"
                    : "side-nav-link"
                }
                aria-current={
                  item.page === current ? "page" : undefined
                }
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
