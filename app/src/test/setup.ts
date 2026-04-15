import "@testing-library/jest-dom/vitest";

/** jsdom does not implement `<dialog>` showModal/close; Modal uses them in tests. */
if (typeof HTMLDialogElement !== "undefined") {
  const proto = HTMLDialogElement.prototype;
  if (!proto.showModal) {
    proto.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
  }
  if (!proto.close) {
    proto.close = function (this: HTMLDialogElement) {
      const wasOpen = this.open;
      this.open = false;
      if (wasOpen) this.dispatchEvent(new Event("close"));
    };
  }
}
