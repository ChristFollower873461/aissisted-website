/* An optional welcome before the real link. No game code or assets load here. */
(function () {
  const opener = document.querySelector("[data-council-open]");
  const dialog = document.getElementById("council-dialog");
  if (!opener || !dialog || typeof dialog.showModal !== "function") return;
  const close = dialog.querySelector("[data-council-close]");
  const sail = dialog.querySelector(".council-sail");
  if (!close || !sail) return;

  opener.setAttribute("aria-haspopup", "dialog");
  opener.setAttribute("aria-controls", dialog.id);
  opener.addEventListener("click", (event) => {
    // Keep a link's normal new-tab and modified-click behavior.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    try {
      dialog.showModal();
    } catch {
      return; // If enhancement fails, the anchor still reaches the game.
    }
    event.preventDefault();
    sail.focus({ preventScroll: true });
  });
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => opener.focus({ preventScroll: true }));
  // Native modal dialogs make the page inert and handle Escape. Wrap the two
  // actions explicitly so Tab never wanders into browser chrome.
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    if (event.shiftKey && document.activeElement === sail) {
      event.preventDefault();
      close.focus();
    } else if (!event.shiftKey && document.activeElement === close) {
      event.preventDefault();
      sail.focus();
    }
  });
}());
