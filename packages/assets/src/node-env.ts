/**
 * GLTFExporter expects browser APIs. Node 24 has Blob; provide the FileReader
 * subset it uses so exports run headless in CI.
 */
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.(); });
  }
  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((b) => { this.result = `data:${blob.type};base64,${Buffer.from(b).toString("base64")}`; this.onloadend?.(); });
  }
}
(globalThis as unknown as { FileReader: unknown }).FileReader ??= NodeFileReader;
