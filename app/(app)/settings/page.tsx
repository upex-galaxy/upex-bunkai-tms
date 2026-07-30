import { redirect } from 'next/navigation';

// /settings hub landing — Account is the only screen this slice ships
// (BK-87 PR1), so the bare index always forwards there (TC-AC3).
export default function SettingsPage(): never {
  redirect('/settings/account');
}
