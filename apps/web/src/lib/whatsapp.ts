/**
 * Build a WhatsApp click-to-chat link. Phase 5 adds a server-issued enquiry
 * reference to the prefilled text so staff can pull the same cart into the
 * shared order engine.
 */
export function whatsappLink(e164: string, text: string): string {
  const digits = e164.replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
