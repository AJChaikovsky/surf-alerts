import { useEffect, useLayoutEffect, useRef } from "react";

import { animate, gsap } from "../motion";


// One word of a sentence rolling through options like a slot machine
// (HyperFrames motion guide), as on ajchaikovsky.com.
export default function RollingWord({ words }: { words: string[] }) {
  const rollerRef = useRef<HTMLSpanElement | null>(null);
  const wordRef = useRef<HTMLSpanElement | null>(null);

  // Fix the width to the widest word so the sentence doesn't jump.
  useLayoutEffect(() => {
    const roller = rollerRef.current;
    const word = wordRef.current;

    if (!roller || !word) return;

    function measure() {
      if (!roller || !word) return;

      const current = word.textContent;
      roller.style.width = "";

      let widest = 0;

      for (const option of words) {
        word.textContent = option;
        widest = Math.max(widest, word.offsetWidth);
      }

      word.textContent = current;
      roller.style.width = `${widest}px`;
    }

    measure();
    document.fonts?.ready.then(measure);
    window.addEventListener("resize", measure);

    return () => window.removeEventListener("resize", measure);
  }, [words]);

  useEffect(() => {
    const word = wordRef.current;

    if (!animate || !word || words.length < 2) return;

    let index = 0;
    let timeline: gsap.core.Timeline | null = null;

    function roll() {
      if (!word) return;

      const target = (index + 1) % words.length;

      // Spin through a few quick in-between words, then land.
      const spins = [1, 2, 3].map((k) => words[(index + k * 2) % words.length]);
      spins.push(words[target]);

      timeline = gsap.timeline({
        onComplete: () => {
          index = target;
          delayed = gsap.delayedCall(2.6, roll);
        },
      });

      spins.forEach((option, k) => {
        const last = k === spins.length - 1;

        timeline!
          .to(word, { yPercent: -100, filter: "blur(2px)", duration: 0.06, ease: "power1.in" })
          .add(() => {
            word.textContent = option;
          })
          .fromTo(
            word,
            { yPercent: 100 },
            last
              ? { yPercent: 0, filter: "blur(0px)", duration: 0.5, ease: "expo.out" }
              : { yPercent: 0, duration: 0.06, ease: "none" }
          );
      });
    }

    let delayed = gsap.delayedCall(2.4, roll);

    return () => {
      delayed.kill();
      timeline?.kill();
    };
  }, [words]);

  return (
    <span className="roller" ref={rollerRef}>
      <span className="roller-word" ref={wordRef}>
        {words[0]}
      </span>
    </span>
  );
}
