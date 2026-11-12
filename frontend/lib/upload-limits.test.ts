import { expect, it } from "vitest";
import { MAX_IMAGE_BYTES, uploadSizeError } from "./upload-limits";
it("checks combined images and metadata, without changing original files", () => {
  const body = new FormData();
  const first = new File([new Uint8Array(MAX_IMAGE_BYTES / 2)], "original.jpg");
  body.set("image", first);
  body.append(
    "burst_images",
    new File([new Uint8Array(MAX_IMAGE_BYTES / 2)], "frame.jpg"),
  );
  expect(uploadSizeError(body)).toBeNull();
  body.set("metadata", "location");
  expect(uploadSizeError(body)).toContain("4 MB");
  expect(body.get("image")).toBe(first);
});
