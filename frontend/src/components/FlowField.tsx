import { useEffect, useRef } from "react";

import { reduceMotion } from "../motion";


// A soft, slowly flowing colour field (domain-warped noise in WebGL), ported
// from ajchaikovsky.com's hero: a lightweight stand-in for HyperFrames'
// aurora shader blocks. Colours come from the --glow-* CSS variables, so it
// follows the theme. It leans toward the cursor and pauses when off screen.

const VERTEX = `
  attribute vec2 a_pos;
  void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAGMENT = `
  precision mediump float;
  uniform vec2 u_res;
  uniform float u_time;
  uniform vec2 u_mouse;
  uniform vec3 u_bg, u_c1, u_c2, u_c3;
  uniform float u_strength;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_res;
    vec2 aspect = vec2(u_res.x / u_res.y, 1.0);
    vec2 p = uv * aspect * 1.4;
    vec2 m = u_mouse * aspect * 1.4;
    float t = u_time * 0.04;

    // Pull the field gently toward the cursor
    vec2 toMouse = m - p;
    p += toMouse * 0.12 * exp(-dot(toMouse, toMouse) * 1.5);

    vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
    vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + t * 1.5),
                  fbm(p + 3.0 * q + vec2(8.3, 2.8) - t));
    float f = fbm(p + 2.5 * r);

    vec3 col = mix(u_c1, u_c2, clamp(q.x * 1.4 - 0.2, 0.0, 1.0));
    col = mix(col, u_c3, clamp(r.y * r.y * 1.2, 0.0, 1.0));

    float k = smoothstep(0.3, 0.85, f) * u_strength;
    vec3 outc = mix(u_bg, col, k);

    // Fade into the page at the bottom
    outc = mix(u_bg, outc, smoothstep(0.0, 0.45, uv.y));

    gl_FragColor = vec4(outc, 1.0);
  }
`;

function hexToRgb(hex: string): [number, number, number] {
  let value = hex.trim().replace("#", "");

  if (value.length === 3) {
    value = value.split("").map((c) => c + c).join("");
  }

  const n = parseInt(value, 16);

  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}


export default function FlowField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl", {
      antialias: false,
      premultipliedAlpha: false,
    });

    // No WebGL: the plain page background shows instead.
    if (!canvas || !gl) return;

    function compile(type: number, source: string) {
      const shader = gl!.createShader(type);

      if (!shader) return null;

      gl!.shaderSource(shader, source);
      gl!.compileShader(shader);

      return gl!.getShaderParameter(shader, gl!.COMPILE_STATUS) ? shader : null;
    }

    const vs = compile(gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();

    if (!vs || !fs || !program) return;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );

    const aPos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = Object.fromEntries(
      ["u_res", "u_time", "u_mouse", "u_bg", "u_c1", "u_c2", "u_c3", "u_strength"].map(
        (name) => [name, gl.getUniformLocation(program, name)]
      )
    );

    function readTheme() {
      const css = getComputedStyle(document.documentElement);

      gl!.uniform3fv(u.u_bg, hexToRgb(css.getPropertyValue("--bg")));
      gl!.uniform3fv(u.u_c1, hexToRgb(css.getPropertyValue("--glow-1")));
      gl!.uniform3fv(u.u_c2, hexToRgb(css.getPropertyValue("--glow-2")));
      gl!.uniform3fv(u.u_c3, hexToRgb(css.getPropertyValue("--glow-3")));
      gl!.uniform1f(
        u.u_strength,
        parseFloat(css.getPropertyValue("--glow-strength")) || 0.5
      );
    }

    // The field is soft, so half resolution looks the same and costs a quarter.
    const SCALE = 0.5;

    function resize() {
      const w = Math.max(1, Math.floor(canvas!.clientWidth * SCALE));
      const h = Math.max(1, Math.floor(canvas!.clientHeight * SCALE));

      if (canvas!.width !== w || canvas!.height !== h) {
        canvas!.width = w;
        canvas!.height = h;
        gl!.viewport(0, 0, w, h);
      }

      gl!.uniform2f(u.u_res, w, h);
    }

    // Mouse, smoothed, in 0..1 with y up.
    const mouse = { x: 0.7, y: 0.55, tx: 0.7, ty: 0.55 };
    const start = performance.now();
    let time = 20; // start mid-flow so the first frame already looks settled

    function draw() {
      resize();
      gl!.uniform1f(u.u_time, time);
      gl!.uniform2f(u.u_mouse, mouse.x, mouse.y);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }

    function onPointerMove(event: PointerEvent) {
      const r = canvas!.getBoundingClientRect();
      mouse.tx = (event.clientX - r.left) / r.width;
      mouse.ty = 1 - (event.clientY - r.top) / r.height;
    }

    const themeObserver = new MutationObserver(() => {
      readTheme();
      draw();
    });
    const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const onSchemeChange = () => {
      readTheme();
      draw();
    };

    readTheme();
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    darkQuery.addEventListener("change", onSchemeChange);
    window.addEventListener("resize", draw);

    let frame: number | null = null;
    let visibilityObserver: IntersectionObserver | null = null;

    if (reduceMotion) {
      draw(); // one still frame
    } else {
      window.addEventListener("pointermove", onPointerMove);

      let visible = true;

      const loop = (now: number) => {
        time = 20 + (now - start) / 1000;
        mouse.x += (mouse.tx - mouse.x) * 0.04;
        mouse.y += (mouse.ty - mouse.y) * 0.04;
        draw();
        frame = visible ? requestAnimationFrame(loop) : null;
      };

      visibilityObserver = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;

        if (visible && frame === null) {
          frame = requestAnimationFrame(loop);
        }
      });
      visibilityObserver.observe(canvas);
    }

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      visibilityObserver?.disconnect();
      themeObserver.disconnect();
      darkQuery.removeEventListener("change", onSchemeChange);
      window.removeEventListener("resize", draw);
      window.removeEventListener("pointermove", onPointerMove);
      // Don't call loseContext() here: React can remount the same canvas
      // (StrictMode does in development), and a lost context never comes
      // back. The browser frees it when the canvas is removed.
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
