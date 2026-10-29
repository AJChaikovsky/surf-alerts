// Motion for the whole app, following HyperFrames' motion guide (the same
// rules ajchaikovsky.com uses): arrivals land on a long expo.out tail,
// exits are about half as long, titles blur in word by word and then hold
// still, list items stagger 40-80 ms apart. No floating or pulsing loops and
// no bounce on UI. Everything is skipped when the user prefers reduced motion.
import gsap from "gsap";

export const reduceMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const animate = !reduceMotion;

const finePointer =
  typeof window !== "undefined" &&
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;


// "Blur swap on one stage": the new page sharpens in; the ground never cuts.
export function blurSwapIn(element: HTMLElement | null) {
  if (!animate || !element) return;

  gsap.fromTo(
    element,
    { opacity: 0, filter: "blur(8px)" },
    {
      opacity: 1,
      filter: "blur(0px)",
      duration: 0.22,
      ease: "power2.out",
      clearProps: "filter,opacity",
    }
  );
}


// Page header: eyebrow fades in, title words blur in, then the subtitle.
export function revealHeader(element: HTMLElement | null) {
  if (!animate || !element) return;

  const tl = gsap.timeline({ defaults: { ease: "expo.out" } });

  tl.fromTo(
    element.querySelectorAll(".eyebrow"),
    { opacity: 0, y: 6 },
    { opacity: 1, y: 0, duration: 0.6 }
  )
    .fromTo(
      element.querySelectorAll(".split-word"),
      { opacity: 0, filter: "blur(6px)" },
      {
        opacity: 1,
        filter: "blur(0px)",
        duration: 0.4,
        stagger: 0.07,
        ease: "power2.out",
        clearProps: "filter",
      },
      0.05
    )
    .fromTo(
      element.querySelectorAll(".page-subtitle"),
      { opacity: 0, filter: "blur(8px)" },
      { opacity: 1, filter: "blur(0px)", duration: 0.5, clearProps: "filter" },
      "-=0.3"
    );
}


// A name, letter by letter: opacity 0.15 -> 1 with a slight blur.
export function revealName(chars: Element[] | NodeListOf<Element>, delay = 0) {
  if (!animate) return;

  gsap.fromTo(
    chars,
    { opacity: 0.15, filter: "blur(8px)" },
    {
      opacity: 1,
      filter: "blur(0px)",
      duration: 0.7,
      stagger: 0.05,
      delay,
      ease: "expo.out",
      clearProps: "filter",
    }
  );
}


// List items arriving: rise 20 px and fade, staggered.
export function staggerIn(items: Element[] | HTMLCollection, stagger = 0.06) {
  if (!animate || items.length === 0) return;

  gsap.fromTo(
    items,
    { opacity: 0, y: 20 },
    {
      opacity: 1,
      y: 0,
      duration: 0.8,
      stagger,
      ease: "expo.out",
      clearProps: "transform,opacity",
    }
  );
}


// A single block arriving (forms, panels).
export function riseIn(element: Element | null, delay = 0) {
  if (!animate || !element) return;

  gsap.fromTo(
    element,
    { opacity: 0, y: 20 },
    {
      opacity: 1,
      y: 0,
      duration: 0.9,
      delay,
      ease: "expo.out",
      clearProps: "transform,opacity",
    }
  );
}


// Slide an indicator (the nav pill) to a target element.
export function moveIndicator(
  indicator: HTMLElement,
  target: HTMLElement,
  instant: boolean
) {
  const props = {
    x: target.offsetLeft,
    y: target.offsetTop,
    width: target.offsetWidth,
    height: target.offsetHeight,
    opacity: 1,
  };

  if (!animate || instant) {
    gsap.set(indicator, props);
  } else {
    gsap.to(indicator, { ...props, duration: 0.45, ease: "expo.out" });
  }
}


// Card spotlight + 3D tilt (.tilt-card) and magnetic buttons (.magnetic),
// handled by one listener so cards rendered later get it too.
// Returns a cleanup function.
export function installPointerEffects(): () => void {
  let tilted: HTMLElement | null = null;
  let magnet: HTMLElement | null = null;

  function onMove(event: PointerEvent) {
    const target = event.target as Element | null;
    const card = target?.closest<HTMLElement>(".tilt-card") ?? null;
    const button = target?.closest<HTMLElement>(".magnetic") ?? null;

    if (tilted && tilted !== card) {
      if (animate) {
        gsap.to(tilted, { rotateX: 0, rotateY: 0, duration: 0.6, ease: "power3.out" });
      }
      tilted = null;
    }

    if (card) {
      const r = card.getBoundingClientRect();
      const x = event.clientX - r.left;
      const y = event.clientY - r.top;

      // The spotlight works everywhere; it's just a CSS gradient position.
      card.style.setProperty("--mx", `${x}px`);
      card.style.setProperty("--my", `${y}px`);

      if (animate && finePointer) {
        gsap.to(card, {
          rotateY: (x / r.width - 0.5) * 5,
          rotateX: -(y / r.height - 0.5) * 5,
          transformPerspective: 900,
          duration: 0.4,
          ease: "power2.out",
        });
      }

      tilted = card;
    }

    if (magnet && magnet !== button) {
      if (animate) gsap.to(magnet, { x: 0, y: 0, duration: 0.4, ease: "power3.out" });
      magnet = null;
    }

    if (button && animate && finePointer && !(button as HTMLButtonElement).disabled) {
      const r = button.getBoundingClientRect();

      gsap.to(button, {
        x: (event.clientX - (r.left + r.width / 2)) * 0.25,
        y: (event.clientY - (r.top + r.height / 2)) * 0.35,
        duration: 0.4,
        ease: "power3.out",
      });

      magnet = button;
    }
  }

  function onLeave() {
    if (tilted && animate) {
      gsap.to(tilted, { rotateX: 0, rotateY: 0, duration: 0.6, ease: "power3.out" });
    }
    if (magnet && animate) {
      gsap.to(magnet, { x: 0, y: 0, duration: 0.4, ease: "power3.out" });
    }
    tilted = null;
    magnet = null;
  }

  document.addEventListener("pointermove", onMove);
  document.documentElement.addEventListener("pointerleave", onLeave);

  return () => {
    document.removeEventListener("pointermove", onMove);
    document.documentElement.removeEventListener("pointerleave", onLeave);
  };
}

export { gsap };
