import { decodeDataUrlOnMainThread } from "../../../lib/editor/decode-main-thread";

// Bundled by tests/e2e/decode-parity.spec.ts and injected into the page, so the spec runs the real main-thread decode.
(window as unknown as { __decodeOnMainThread: typeof decodeDataUrlOnMainThread }).__decodeOnMainThread = decodeDataUrlOnMainThread;
