import { AppShell } from "@/components/shell/app-shell";
import { CommandPalette } from "@/components/shell/command-palette";

// AppDataProvider lives in the root layout so the (editor) group shares the store too.
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <CommandPalette />
    </>
  );
}
