// Find Time landing — engine entry.
// mountLanding(root) finds the [data-ft="…"] hooks rendered by LandingPage.tsx,
// builds the 3D week board (the page's one animation) into them and returns a
// cleanup function.
import { initEnv, glOK, FONT } from "./shared";
import { createWeekBoard } from "./weekBoard";

export function mountLanding(root) {
  initEnv();
  let dead = false;
  const disposers = [];

  // Labels are painted into canvas textures, so wait for the web font first
  // (max 1.8s, then fall back so the page never waits forever).
  const fontsReady = document.fonts
    ? Promise.race([
        Promise.all(
          ["500", "600", "700", "800"].map((w) =>
            document.fonts.load(`${w} 30px ${FONT}`),
          ),
        ),
        new Promise((r) => setTimeout(r, 1800)),
      ])
    : Promise.resolve();

  fontsReady
    .catch(() => {})
    .then(() => {
      if (dead) return;
      if (!glOK()) {
        const stage = root.querySelector('[data-ft="stage-plan"]');
        if (!stage) return;
        const note = document.createElement("div");
        note.className = "nogl";
        note.textContent =
          "THE 3D PREVIEW NEEDS WEBGL — TRY A BROWSER WITH HARDWARE ACCELERATION ON.";
        stage.appendChild(note);
        disposers.push(() => note.remove());
        return;
      }
      try {
        disposers.push(createWeekBoard(root));
      } catch (err) {
        console.error("[find-time landing] week board failed to start", err);
      }
    });

  return function unmountLanding() {
    dead = true;
    disposers.splice(0).forEach((dispose) => {
      try {
        dispose();
      } catch (err) {
        console.error(err);
      }
    });
  };
}
