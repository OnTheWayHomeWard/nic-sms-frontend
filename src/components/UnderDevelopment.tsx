import { Construction } from "lucide-react";

export default function UnderDevelopment() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center min-h-96">
      <Construction className="size-12 text-muted-foreground" strokeWidth={1.5} />
      <div className="space-y-1">
        <p className="text-lg font-semibold">Under Development</p>
        <p className="text-sm text-muted-foreground">This page is coming soon.</p>
      </div>
    </div>
  );
}