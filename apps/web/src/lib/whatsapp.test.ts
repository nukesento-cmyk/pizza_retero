import { describe, expect, it } from "vitest";
import { whatsappLink } from "./whatsapp";

describe("whatsappLink", () => {
  it("strips the plus and encodes the message", () => {
    expect(whatsappLink("+254712345678", "Hi! Order #A1 & extra cheese"))
      .toBe("https://wa.me/254712345678?text=Hi!%20Order%20%23A1%20%26%20extra%20cheese");
  });
});
