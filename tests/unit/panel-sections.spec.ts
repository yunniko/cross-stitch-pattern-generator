import { describe, expect, it } from "vitest";
import { sectionAt, type PanelSection } from "@/lib/panel/sections";
import { groupThousands } from "@/lib/panel/format";
import { ACCOUNT_SECTIONS } from "@/lib/account/sections";
import { ADMIN_SECTIONS } from "@/lib/admin/sections";
import { signInMethods } from "@/lib/account/sign-in-methods";

const LIST: PanelSection[] = [
  { id: "profile", label: "Profile", href: "/account" },
  { id: "usage", label: "Usage", href: "/account/usage" },
];

describe("sectionAt (G-107)", () => {
  it("finds the section an address is, or is below", () => {
    expect(sectionAt(LIST, "/account")?.id).toBe("profile");
    expect(sectionAt(LIST, "/account/usage")?.id).toBe("usage");
    expect(sectionAt(LIST, "/account/usage/2026")?.id).toBe("usage");
    expect(sectionAt(LIST, "/account/usage/")?.id).toBe("usage");
  });

  it("does not take a longer name for a child", () => {
    expect(sectionAt(LIST, "/account/usages")?.id).toBe("profile");
    expect(sectionAt(LIST, "/accounts")).toBeNull();
    expect(sectionAt(LIST, "/")).toBeNull();
  });
});

describe("the declared lists", () => {
  for (const [area, list, root] of [
    ["account", ACCOUNT_SECTIONS, "/account"],
    ["admin", ADMIN_SECTIONS, "/admin/"],
  ] as const) {
    it(`${area}: ids and addresses are unique, and every address is in the area`, () => {
      expect(new Set(list.map((s) => s.id)).size).toBe(list.length);
      expect(new Set(list.map((s) => s.href)).size).toBe(list.length);
      for (const section of list) expect(section.href.startsWith(root)).toBe(true);
    });
  }

  it("the account area opens on Charts at /account, where signing in lands; Profile has its own address (D405)", () => {
    expect(ACCOUNT_SECTIONS[0].id).toBe("charts");
    expect(sectionAt(ACCOUNT_SECTIONS, "/account")?.id).toBe("charts");
    expect(sectionAt(ACCOUNT_SECTIONS, "/account/profile")?.id).toBe("profile");
    expect(sectionAt(ACCOUNT_SECTIONS, "/account/stamps")?.id).toBe("stamps");
  });
});

describe("groupThousands", () => {
  it("parts thousands with a space", () => {
    expect(groupThousands(0)).toBe("0");
    expect(groupThousands(999)).toBe("999");
    expect(groupThousands(1203)).toBe("1 203");
    expect(groupThousands(41260)).toBe("41 260");
    expect(groupThousands(1234567)).toBe("1 234 567");
    expect(groupThousands(-1203)).toBe("−1 203");
  });
});

describe("signInMethods", () => {
  it("lists the password, then each linked provider once", () => {
    const methods = signInMethods({ email: "a@example.com", hasPassword: true, providers: ["google", "google"] });
    expect(methods.map((m) => m.name)).toEqual(["Email and password", "Google"]);
    expect(methods[0].note).toBe("a@example.com");
  });

  it("lists nothing it does not have", () => {
    expect(signInMethods({ email: "a@example.com", hasPassword: false, providers: [] })).toEqual([]);
  });
});
