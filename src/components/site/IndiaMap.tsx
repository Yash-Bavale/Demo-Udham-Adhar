// Lightweight India political map served from Lovable Assets CDN.
import mapImg from "@/assets/india-map.svg.asset.json";

export function IndiaMap({ className = "" }: { className?: string }) {
  return (
    <img
      src={mapImg.url}
      alt="Map of India showing states served by our Udyam Adhar consultancy"
      loading="lazy"
      decoding="async"
      width={640}
      height={720}
      className={"mx-auto w-full max-w-md h-auto " + className}
    />
  );
}
