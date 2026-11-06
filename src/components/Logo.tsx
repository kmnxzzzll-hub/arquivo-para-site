import logo from "@/assets/bacbo-logo-transparent.png.asset.json";

export function Logo({ className = "" }: { className?: string }) {
  return <img src={logo.url} alt="Bac Bo Live" className={`h-auto object-contain ${className}`} width={677} height={325} />;
}
