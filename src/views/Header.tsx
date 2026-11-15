import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";

interface Props {
  back?: () => void;
  title?: string;
  actions?: ReactNode;
  /** Colours the large title with the screen's `--accent`. */
  accent?: boolean;
  /** Under the large title, like the home screen's search field. */
  children?: ReactNode;
}

/**
 * A screen's top bar, as on iOS: it stays at the top, and once the large title has scrolled away it shows a hairline
 * and a small centred title.
 */
export function Header({ back, title, actions, accent, children }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    // Past the bar (44 px, plus the status bar on iPhones), the content is under it.
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry!.isIntersecting), {
      rootMargin: `-${bar.current?.offsetHeight ?? 44}px 0px 0px 0px`,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={bar} className={`top-bar${scrolled ? " scrolled" : ""}`}>
        <div className="side">
          {back && (
            <button className="back" onClick={back}>
              <Icon name="chevronLeft" />
              Listes
            </button>
          )}
        </div>
        <span className="small-title" aria-hidden="true">
          {title}
        </span>
        <div className="side end">{actions}</div>
      </div>
      {title && <h1 className={`large-title${accent ? " accent" : ""}`}>{title}</h1>}
      {children}
      <div ref={sentinel} className="sentinel" />
    </>
  );
}
