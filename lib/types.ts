/**
 * Bunkai entity types — Phase B stubs.
 *
 * Keys match the ERD in `.context/SRS/architecture-specs.md` §2 exactly
 * (snake_case, ISO timestamps as `string`). Phase D will swap to generated
 * Supabase types; preserving these names avoids field renames.
 */

export type Uuid = string;
export type Timestamp = string;

export type WorkspacePlan = 'community' | 'cloud' | 'enterprise';
export type MemberRole = 'viewer' | 'member' | 'admin' | 'owner';
export type MemberStatus = 'active' | 'invited' | 'suspended';

export interface Workspace {
  id: Uuid
  slug: string
  name: string
  owner_user_id: Uuid
  plan: WorkspacePlan
  created_at: Timestamp
}

export interface WorkspaceMember {
  workspace_id: Uuid
  user_id: Uuid
  role: MemberRole
  status: MemberStatus
  joined_at: Timestamp
}

export interface Project {
  id: Uuid
  workspace_id: Uuid
  slug: string
  name: string
  description: string | null
  created_at: Timestamp
}

export interface Module {
  id: Uuid
  project_id: Uuid
  parent_module_id: Uuid | null
  path: string
  name: string
  position: number
  created_at: Timestamp
}

export interface UserStory {
  id: Uuid
  module_id: Uuid
  title: string
  description: string | null
  external_id: string | null
  external_url: string | null
  created_at: Timestamp
}

export interface AcceptanceCriterion {
  id: Uuid
  user_story_id: Uuid
  title: string
  description: string | null
  position: number
  created_at: Timestamp
}

export type AtcLayer = 'UI' | 'API' | 'Unit';
export type AtcStatus = 'pass' | 'fail' | 'blocked' | 'skipped' | 'running' | 'unrun';

export interface Atc {
  id: Uuid
  project_id: Uuid
  module_id: Uuid
  user_story_id: Uuid
  slug: string
  title: string
  layer: AtcLayer
  version: number
  status: AtcStatus
  tags: string[]
  created_at: Timestamp
  updated_at: Timestamp
}

export interface AtcStep {
  id: Uuid
  atc_id: Uuid
  position: number
  content: string
  input_data: string | null
  expected: string | null
}

export interface AtcAssertion {
  id: Uuid
  atc_id: Uuid
  position: number
  content: string
}

export interface AtcAcceptanceCriterion {
  atc_id: Uuid
  acceptance_criterion_id: Uuid
}

export interface ModuleTreeNode extends Module {
  children: ModuleTreeNode[]
  user_stories: UserStoryWithChildren[]
  atcs: Atc[]
}

export interface UserStoryWithChildren extends UserStory {
  acceptance_criteria: AcceptanceCriterion[]
  atcs: Atc[]
}
