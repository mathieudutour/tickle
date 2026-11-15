/** Sizes a textarea to its text, so notes and long titles show in full instead of scrolling. */
export function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
