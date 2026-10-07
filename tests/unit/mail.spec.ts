import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MESSAGES, renderMessage } from "@/lib/mail/messages";
import { mailSettings } from "@/lib/mail/settings";
import { fileTransport } from "@/lib/mail/transports";

/** G-113, D342: when the app sends, what it sends, and the stand-in the browser suite reads. */

const ON = { MAIL_TRANSPORT: "file", MAIL_FROM: "Charts <no-reply@example.com>", APP_URL: "https://charts.example.com" };

describe("mailSettings", () => {
  it("is off when nothing is set, which is how production runs until there is a sender", () => {
    expect(mailSettings({})).toEqual({ on: false, reason: "MAIL_TRANSPORT is not set" });
  });

  it("is on with a transport, a sender and the site's address, which AUTH_URL gives before APP_URL", () => {
    expect(mailSettings(ON)).toMatchObject({ on: true, transport: "file", siteUrl: "https://charts.example.com" });
    expect(mailSettings({ ...ON, AUTH_URL: "https://auth.example.com/" })).toMatchObject({ siteUrl: "https://auth.example.com" });
  });

  it("is off when any one of them is missing or empty, as a copied .env.example leaves them", () => {
    expect(mailSettings({ ...ON, MAIL_TRANSPORT: "" }).on).toBe(false);
    expect(mailSettings({ ...ON, MAIL_TRANSPORT: "smtp" }).on).toBe(false);
    expect(mailSettings({ ...ON, MAIL_FROM: "" }).on).toBe(false);
    expect(mailSettings({ ...ON, APP_URL: "" }).on).toBe(false);
  });

  it("refuses a site address with a path or no scheme, since every link is built on it", () => {
    expect(mailSettings({ ...ON, APP_URL: "charts.example.com" }).on).toBe(false);
    expect(mailSettings({ ...ON, APP_URL: "https://charts.example.com/app" }).on).toBe(false);
  });

  it("needs Resend's key to send through Resend", () => {
    expect(mailSettings({ ...ON, MAIL_TRANSPORT: "resend" })).toEqual({ on: false, reason: "RESEND_API_KEY is not set" });
    expect(mailSettings({ ...ON, MAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_x" }).on).toBe(true);
  });
});

describe("renderMessage", () => {
  it("fills every declared message from its values, with the link in the text", () => {
    const confirm = renderMessage("confirm-address", "a@example.com", { link: "https://x/l?token=t", hours: "48" });
    expect(confirm).toMatchObject({ to: "a@example.com", subject: MESSAGES["confirm-address"].subject });
    expect(confirm.text).toContain("https://x/l?token=t");
    expect(confirm.text).toContain("48 hours");
    const reset = renderMessage("reset-password", "a@example.com", { link: "https://x/r", minutes: "60" });
    expect(reset.text).toContain("https://x/r");
    const again = renderMessage("already-registered", "a@example.com", { resetLink: "https://x/r", loginLink: "https://x/l" });
    expect(again.text).toContain("https://x/l");
  });

  it("throws on a missing value rather than sending a message with a hole in it", () => {
    expect(() => renderMessage("reset-password", "a@example.com", { link: "", minutes: "60" })).toThrow(/needs "link"/);
  });
});

describe("fileTransport", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("writes one readable file per message, and nothing else", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "mail-"));
    const outbox = path.join(dir, "outbox");
    await fileTransport(outbox).send({ to: "a@example.com", subject: "S", text: "T" }, "F <f@example.com>");
    const files = await readdir(outbox);
    expect(files).toHaveLength(1);
    const written = JSON.parse(await readFile(path.join(outbox, files[0]), "utf8"));
    expect(written).toMatchObject({ from: "F <f@example.com>", to: "a@example.com", subject: "S", text: "T" });
  });
});
