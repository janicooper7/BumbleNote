import { Gilda_Display, Jost, Pinyon_Script } from "next/font/google";

// The template pack's three voices, as the closest Google Fonts: a
// high-contrast display serif for the capitals, a thin copperplate script for
// the word that overlaps them, and a geometric sans for labels, pills and body.
// Loaded by the marketing page only — the dashboard keeps Fraunces/Hanken.

const gilda = Gilda_Display({ variable: "--font-gilda", subsets: ["latin"], weight: "400" });
const jost = Jost({ variable: "--font-jost", subsets: ["latin"] });
const pinyon = Pinyon_Script({ variable: "--font-pinyon", subsets: ["latin"], weight: "400" });

export const bnFontVars = `${gilda.variable} ${jost.variable} ${pinyon.variable}`;
