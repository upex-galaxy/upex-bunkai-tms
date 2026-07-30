import { ComingSoon } from '@components/settings/ComingSoon';

// Settings > Workspaces — honest placeholder (BK-87). Real membership list /
// leave-workspace flow ships in BK-89/90.
export default function SettingsWorkspacesPage() {
  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg-0">Workspaces</h1>
        <p className="text-base text-fg-2">The workspaces you belong to.</p>
      </div>
      <ComingSoon
        title="Workspace management isn't available yet"
        description="Workspace management — coming in BK-89/90. When it ships, you'll see every membership, its role, and be able to leave a workspace straight from here."
        route="/settings/workspaces"
      />
    </div>
  );
}
