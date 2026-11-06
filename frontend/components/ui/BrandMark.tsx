import Image from "next/image";

/** Decorative beside the visible ClearPath name. Uses the supplied brand asset. */
export default function BrandMark() {
  return (
    <Image
      src="/clearpath-app-icon.svg"
      alt=""
      width={64}
      height={64}
      className="cp-brand-mark-image"
    />
  );
}
