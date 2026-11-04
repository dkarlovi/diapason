import { readCssTheme } from "../Theme/CssTheme";
import type { HostThemeMessage } from "../Theme/ThemeMessage.type";

const studio = new URL(import.meta.env.BASE_URL, import.meta.url);

class DiapasonStudio extends HTMLElement {
  static observedAttributes = ["tune", "after-recording", "title", "loading", "style", "class"];
  #frame: HTMLIFrameElement;
  #theme: HostThemeMessage | undefined;
  #workflow: string | undefined;
  #timer: ReturnType<typeof setInterval> | undefined;
  #media: MediaQueryList | undefined;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host { display: block; width: 100%; aspect-ratio: 12 / 7; }
      :host([hidden]) { display: none; }
      iframe { display: block; width: 100%; height: 100%; border: 0; }
    `;
    this.#frame = document.createElement("iframe");
    this.#frame.addEventListener("load", this.#sendTheme);
    root.append(style, this.#frame);
  }

  connectedCallback() {
    this.#metadata();
    if (this.#workflow !== this.#workflowKey()) this.#navigate();
    window.addEventListener("message", this.#ready);
    this.#media = window.matchMedia?.("(prefers-color-scheme: dark)");
    this.#media?.addEventListener("change", this.#refresh);
    this.#timer = setInterval(() => {
      if (!document.hidden) this.#refresh();
    }, 250);
    this.#refresh();
  }

  disconnectedCallback() {
    clearInterval(this.#timer);
    window.removeEventListener("message", this.#ready);
    this.#media?.removeEventListener("change", this.#refresh);
  }

  attributeChangedCallback(name: string, previous: string | null, value: string | null) {
    if (!this.isConnected || previous === value) return;
    if (name === "tune" || name === "after-recording") this.#navigate();
    else {
      this.#metadata();
      this.#refresh();
    }
  }

  #metadata() {
    this.#frame.title =
      this.title || (this.hasAttribute("tune") ? "diapason tune editor" : "Whistle-to-MIDI studio");
    this.#frame.setAttribute("loading", this.getAttribute("loading") === "lazy" ? "lazy" : "eager");
    this.#frame.allow = this.hasAttribute("tune") ? "midi" : "microphone; midi";
  }

  #navigate() {
    this.#workflow = this.#workflowKey();
    this.#metadata();
    this.#theme = readCssTheme(this);
    const tune = this.getAttribute("tune");
    const url = new URL(tune !== null ? "tune" : "new", studio);
    url.searchParams.set("embed", "1");
    if (this.getAttribute("after-recording") === "edit")
      url.searchParams.set("afterRecording", "edit");
    if (this.#theme.theme) url.searchParams.set("theme", this.#theme.theme);
    url.searchParams.set("scheme", this.#theme.scheme);
    if (tune !== null) url.hash = `tune=${encodeURIComponent(tune)}`;
    this.#frame.src = url.href;
  }

  #workflowKey() {
    return JSON.stringify([this.getAttribute("tune"), this.getAttribute("after-recording")]);
  }

  #refresh = () => {
    const theme = readCssTheme(this);
    if (JSON.stringify(theme) === JSON.stringify(this.#theme)) return;
    this.#theme = theme;
    this.#sendTheme();
  };

  #sendTheme = () => {
    if (this.#theme) this.#frame.contentWindow?.postMessage(this.#theme, studio.origin);
  };

  #ready = (event: MessageEvent<unknown>) => {
    if (event.origin !== studio.origin || event.source !== this.#frame.contentWindow) return;
    if (
      event.data &&
      typeof event.data === "object" &&
      "type" in event.data &&
      event.data.type === "diapason:ready"
    ) {
      this.#refresh();
      this.#sendTheme();
    }
  };
}

if (!customElements.get("diapason-studio"))
  customElements.define("diapason-studio", DiapasonStudio);
