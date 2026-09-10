// The card that renders when a BumbleNote link is pasted into Slack, WhatsApp,
// iMessage or X. Generated rather than shipped as a flat PNG so the wording
// stays editable in one place with the rest of the site copy.
//
// Deliberately typeset in ImageResponse's built-in font rather than Fraunces:
// satori needs real font binaries, and the usual way to get one — scraping a
// TTF URL out of the Google Fonts CSS API with a spoofed User-Agent — is a
// fragile thing to put in the deploy path. Brand is carried by the honey/navy
// palette and the composition instead.
//
// Sizes here are load-bearing. The card is a fixed 1200x630 with no scrollbar to
// save it: text that overflows silently collides with whatever sits below it.
// The current copy fills roughly 550px of the 630, which leaves room for a word
// or two more — not a sentence. Re-render and look at it after any copy change.

import { ImageResponse } from "next/og";

export const alt = "BumbleNote — AI notes for online language tutors";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 84px",
          background: "linear-gradient(150deg, #fffdf7 0%, #fff5e2 100%)",
          color: "#16233d",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: "0.16em",
            color: "#9a6400",
          }}
        >
          <div
            style={{ width: 20, height: 20, borderRadius: 10, background: "#fdb300" }}
          />
          BUMBLENOTE
        </div>

        <div
          style={{
            marginTop: 38,
            fontSize: 68,
            lineHeight: 1.08,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            maxWidth: 940,
          }}
        >
          Your lesson feedback, written for you.
        </div>

        <div
          style={{
            marginTop: 30,
            fontSize: 30,
            lineHeight: 1.45,
            color: "#4d5d79",
            maxWidth: 860,
          }}
        >
          Vocabulary, practice areas and progress — drafted from every 1-on-1
          English lesson on Zoom and Google Meet.
        </div>

        <div
          style={{
            marginTop: 44,
            height: 9,
            width: 176,
            borderRadius: 5,
            background: "#fdb300",
          }}
        />
      </div>
    ),
    size,
  );
}
