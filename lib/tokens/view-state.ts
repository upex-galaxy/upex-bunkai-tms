// Settings > Tokens list view-state logic (BK-88 Slice A — AC5/AC7/AC8).
// Mirrors `lib/account/workspaces.ts`'s `resolveWorkspacesViewState` shape
// exactly: error takes priority over an empty row count since a failed
// query also resolves to zero rows.

export interface TokenRow {
  id: string
  name: string | null
  prefix: string
  scopes: string[]
  workspaceId: string | null
  workspaceLabel: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}

export type TokensViewState = 'error' | 'empty' | 'list';

export function resolveTokensViewState({ error, rowCount }: { error: boolean, rowCount: number }): TokensViewState {
  if (error) {
    return 'error';
  }
  if (rowCount === 0) {
    return 'empty';
  }
  return 'list';
}
