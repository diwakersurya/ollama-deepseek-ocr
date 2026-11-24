// Results and errors are reported from places that are not components (the data layer, the address
// check), while Astryx shows toasts through a hook. Messages are handed over here; ToastBridge shows them.
export type Message = { kind: "ok" | "bad"; text: string };

let show: ((m: Message) => void) | null = null;
const waiting: Message[] = [];
const send = (m: Message) => (show ? show(m) : void waiting.push(m));

export const toast = {
  ok: (text: string) => send({ kind: "ok", text }),
  bad: (text: string) => send({ kind: "bad", text }),
  /** Called once by ToastBridge; messages raised before the app was on screen are shown then. */
  connect(fn: (m: Message) => void) {
    show = fn;
    waiting.splice(0).forEach(fn);
    return () => {
      show = null;
    };
  },
};
