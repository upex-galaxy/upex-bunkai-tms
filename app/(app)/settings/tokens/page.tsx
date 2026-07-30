import { ComingSoon } from '@components/settings/ComingSoon';

// Settings > Tokens — honest placeholder (BK-87). Real PAT issuance/list/
// revoke ships in BK-88.
export default function SettingsTokensPage() {
  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg-0">Tokens</h1>
        <p className="text-base text-fg-2">Personal access tokens for headless and CI use.</p>
      </div>
      <ComingSoon
        title="Personal Access Tokens isn't available yet"
        description="Personal Access Tokens — coming in BK-88. When it ships, you'll issue, list and revoke scoped PATs for CLI, CI and agent use straight from here."
        route="/settings/tokens"
      />
    </div>
  );
}
