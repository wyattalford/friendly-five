export class EvidenceImageInvalid extends Error {}

const MAX_EVIDENCE_IMAGE_BYTES = 2 * 1024 * 1024;
const EVIDENCE_IMAGE_PATTERN = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

export function normalizedEvidenceImage(
  image: string | null | undefined,
  imageName: string | null | undefined,
): { image?: string; imageName?: string } {
  if (image === null || image === undefined) {
    if (imageName !== null && imageName !== undefined) {
      throw new EvidenceImageInvalid("An evidence image name requires an image.");
    }
    return {};
  }

  const match = EVIDENCE_IMAGE_PATTERN.exec(image);
  const normalizedName = imageName?.trim();
  const bytes = match === null ? undefined : Buffer.from(match[2] ?? "", "base64");
  const hasMatchingSignature =
    bytes !== undefined &&
    ((match?.[1] === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
      (match?.[1] === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
      (match?.[1] === "image/webp" && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP"));
  if (
    match === null ||
    !hasMatchingSignature ||
    normalizedName === undefined ||
    normalizedName.length === 0 ||
    normalizedName.length > 120 ||
    /[\u0000-\u001f\u007f]/.test(normalizedName) ||
    (bytes?.byteLength ?? 0) > MAX_EVIDENCE_IMAGE_BYTES
  ) {
    throw new EvidenceImageInvalid(
      "Evidence images must be JPEG, PNG, or WebP files no larger than 2 MB.",
    );
  }
  return { image, imageName: normalizedName };
}
