// Camera-friendly versions of Playwright's actions. Playwright clicks and types
// instantly and has no visible pointer, which looks robotic on video; these
// draw a cursor, glide it along an eased path, type at a human pace, scroll
// smoothly and leave a beat between steps.

import type { Locator, Page } from "@playwright/test";

const SPEED = Number(process.env.DEMO_SPEED ?? "1") || 1;
const ms = (n: number) => Math.round(n * SPEED);

/**
 * Injected into every page load: a cursor that follows Playwright's mouse, a
 * ripple on click, no Next.js dev badge and no privacy notice. The last position survives
 * navigations via sessionStorage so the cursor doesn't jump to the corner.
 */
export const CURSOR_SCRIPT = `
(() => {
  if (window.top !== window) return;
  // Pre-dismiss the privacy notice so it never slides up mid-take.
  try { localStorage.setItem("bn_privacy_notice_v1", "1"); } catch {}
  const start = JSON.parse(sessionStorage.getItem("__demoCursor") || "[720,450]");
  const style = document.createElement("style");
  style.textContent = \`
    nextjs-portal { display: none !important; }
    #__demo-cursor { position: fixed; z-index: 2147483647; pointer-events: none; width: 26px; height: 26px;
      margin: -3px 0 0 -4px; transition: transform .12s ease; filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
    #__demo-cursor.down { transform: scale(.85); }
    .__demo-ripple { position: fixed; z-index: 2147483646; pointer-events: none; width: 44px; height: 44px;
      margin: -22px 0 0 -22px; border-radius: 50%; background: rgba(245, 197, 66, .45);
      animation: __demo-ripple .55s ease-out forwards; }
    @keyframes __demo-ripple { from { transform: scale(.2); opacity: 1 } to { transform: scale(1.4); opacity: 0 } }
  \`;
  const cursor = document.createElement("div");
  cursor.id = "__demo-cursor";
  cursor.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2.5v17.2l4.6-4.3 3 6.6 3.1-1.4-3-6.5h6.4z" fill="#fff" stroke="#1d1d1f" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const place = (x, y) => { cursor.style.left = x + "px"; cursor.style.top = y + "px"; };
  place(start[0], start[1]);
  const mount = () => { document.head.appendChild(style); document.body.appendChild(cursor); };
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
  window.addEventListener("mousemove", (e) => {
    place(e.clientX, e.clientY);
    sessionStorage.setItem("__demoCursor", JSON.stringify([e.clientX, e.clientY]));
  }, true);
  window.addEventListener("mousedown", (e) => {
    cursor.classList.add("down");
    const r = document.createElement("div");
    r.className = "__demo-ripple";
    r.style.left = e.clientX + "px"; r.style.top = e.clientY + "px";
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 600);
  }, true);
  window.addEventListener("mouseup", () => cursor.classList.remove("down"), true);
})();
`;

export class Director {
  private x = 720;
  private y = 450;

  constructor(readonly page: Page) {}

  /** A pause, scaled by DEMO_SPEED. */
  async beat(n = 700) {
    await this.page.waitForTimeout(ms(n));
  }

  /** Scrolls the element to the middle of the screen, smoothly, if it isn't comfortably in view. */
  async reveal(target: Locator) {
    await target.waitFor({ state: "visible" });
    const inView = await target.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 80 && r.bottom <= window.innerHeight - 80;
    });
    if (inView) return;
    await target.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    await this.page.waitForTimeout(900);
  }

  /** Glides the cursor to the element along an ease-in-out path. */
  async point(target: Locator) {
    await this.reveal(target);
    const box = await target.boundingBox();
    if (!box) throw new Error("Element has no box to point at");
    const tx = box.x + box.width / 2;
    const ty = box.y + box.height / 2;
    const dist = Math.hypot(tx - this.x, ty - this.y);
    const steps = Math.max(12, Math.min(60, Math.round(dist / 14)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      await this.page.mouse.move(this.x + (tx - this.x) * e, this.y + (ty - this.y) * e);
      await this.page.waitForTimeout(ms(12));
    }
    this.x = tx;
    this.y = ty;
  }

  /** Hover and linger — for "look at this" moments. */
  async hover(target: Locator, linger = 900) {
    await this.point(target);
    await this.beat(linger);
  }

  async click(target: Locator) {
    await this.point(target);
    await this.beat(250);
    await this.page.mouse.down();
    await this.page.waitForTimeout(90);
    await this.page.mouse.up();
    await this.beat(600);
  }

  /** Clicks into a field and types at a human pace (replacing what's there). */
  async type(target: Locator, text: string, { clear = true } = {}) {
    await this.click(target);
    if (clear) {
      await target.selectText().catch(() => {});
      await this.page.keyboard.press("Delete");
    }
    await target.pressSequentially(text, { delay: ms(45) });
    await this.beat(400);
  }

  /** Native <select>: point at it, then pick (the OS dropdown can't be filmed anyway). */
  async choose(target: Locator, value: string) {
    await this.point(target);
    await this.beat(300);
    await target.selectOption(value);
    await this.beat(500);
  }

  /** Smooth page scroll by `px` (negative scrolls up). */
  async scroll(px: number, duration = 1200) {
    await this.page.evaluate(
      ([dy, d]) =>
        new Promise<void>((done) => {
          const from = window.scrollY;
          const t0 = performance.now();
          const step = (now: number) => {
            const t = Math.min(1, (now - t0) / d);
            const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
            window.scrollTo(0, from + dy * e);
            if (t < 1) requestAnimationFrame(step);
            else done();
          };
          requestAnimationFrame(step);
        }),
      [px, ms(duration)] as const,
    );
    await this.beat(500);
  }

  async scrollToTop(duration = 1200) {
    await this.scroll(-(await this.page.evaluate(() => window.scrollY)), duration);
  }

  async scrollToBottom(duration = 2400) {
    const dy = await this.page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight - window.scrollY);
    await this.scroll(dy, duration);
  }

  /** Navigates and waits for the page to settle, off the clock. */
  async open(path: string) {
    await this.page.goto(path);
    await this.page.waitForLoadState("networkidle");
    await this.page.evaluate(() => document.fonts.ready);
  }

  /**
   * Holds on the opening frame until you're recording: press Enter in the
   * browser window (default), or wait DEMO_START seconds.
   */
  async action(name: string) {
    const mode = process.env.DEMO_START ?? "enter";
    if (mode === "enter") {
      console.log(`\n  ● ${name}\n    Start recording, then click the browser window and press Enter.`);
      await this.page.evaluate(
        () =>
          new Promise<void>((go) => {
            const onKey = (e: KeyboardEvent) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              e.stopPropagation();
              window.removeEventListener("keydown", onKey, true);
              go();
            };
            window.addEventListener("keydown", onKey, true);
          }),
      );
    } else {
      const secs = Number.isNaN(Number(mode)) ? 3 : Number(mode);
      console.log(`\n  ● ${name} — starting in ${secs}s`);
      await this.page.waitForTimeout(secs * 1000);
    }
    // Clicking into the window to press Enter moves the drawn cursor to your
    // real mouse; put it back where the take expects it.
    await this.page.mouse.move(this.x, this.y);
    await this.beat(800);
  }

  /** Holds on the final frame so the take doesn't end mid-motion. */
  async cut(hold = 2000) {
    await this.beat(hold);
    console.log("    ✓ Done — stop recording.");
  }
}

/**
 * Stands in for a real lesson: getDisplayMedia returns the "lesson tab" (a
 * blank video track plus student.wav) and getUserMedia the "mic" (tutor.wav),
 * both starting together — so the recorder captures and uploads a genuine
 * two-voice conversation (demo/audio, synthesized by tts.ps1 + build.mjs). The
 * browser's share-picker never appears; a script can't film it anyway.
 */
export async function fakeLesson(page: Page) {
  await page.route("**/__demo/*.wav", (route) =>
    route.fulfill({
      path: `demo/audio/${new URL(route.request().url()).pathname.split("/").pop()}`,
      contentType: "audio/wav",
    }),
  );
  await page.addInitScript(() => {
    const md = navigator.mediaDevices;
    if (!md) return;
    let tracks: Promise<{ student: MediaStream; tutor: MediaStream }> | null = null;
    const start = () =>
      (tracks ??= (async () => {
        const ctx = new AudioContext();
        await ctx.resume();
        const load = async (name: string) =>
          ctx.decodeAudioData(await (await fetch(`/__demo/${name}.wav`)).arrayBuffer());
        const [student, tutor] = await Promise.all([load("student"), load("tutor")]);
        const at = ctx.currentTime + 0.2;
        const play = (buffer: AudioBuffer) => {
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          const out = ctx.createMediaStreamDestination();
          src.connect(out);
          src.start(at);
          return out.stream;
        };
        return { student: play(student), tutor: play(tutor) };
      })());
    md.getDisplayMedia = async () => {
      const { student } = await start();
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      canvas.getContext("2d")!.fillRect(0, 0, 640, 360);
      return new MediaStream([...canvas.captureStream(1).getVideoTracks(), ...student.getAudioTracks()]);
    };
    md.getUserMedia = async () => new MediaStream((await start()).tutor.getAudioTracks());
  });
}
