import { describe, expect, it } from "vitest";
import { youTubeId } from "./guides";

describe("youTubeId", () => {
  const id = "dQw4w9WgXcQ";

  it.each([
    id,
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=42s`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://youtu.be/${id}?si=abc123`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}`,
    `  https://youtu.be/${id}  `,
  ])("reads %s", (input) => {
    expect(youTubeId(input)).toBe(id);
  });

  it.each([
    "/guides/add-a-student.mp4",
    "https://www.loom.com/embed/abc",
    "https://player.vimeo.com/video/123",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/playlist?list=PL123",
    "",
  ])("rejects %s", (input) => {
    expect(youTubeId(input)).toBeNull();
  });
});
