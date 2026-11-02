import { buttonVariants } from '@components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';

// The project header's create affordances. BK-666 (AC-08): rendered only for
// roles that can create (owner, admin, member), as the explorer already gates
// its own; a viewer used to see both and hit the API's refusal. The API stays
// the authority.
export function ProjectCreateLinks({ projectSlug, canCreate }: { projectSlug: string, canCreate: boolean }) {
  if (!canCreate) {
    return null;
  }
  return (
    <>
      <Link
        href={`/projects/${projectSlug}/atcs/new`}
        className={buttonVariants({ size: 'sm' })}
        data-testid="project-new-atc"
      >
        <Plus size={11} />
        {' '}
        New ATC
      </Link>
      <Link
        href={`/projects/${projectSlug}/tests/new`}
        className={buttonVariants({ variant: 'primary', size: 'sm' })}
        data-testid="project-new-test"
      >
        <Plus size={11} />
        {' '}
        New Test
      </Link>
    </>
  );
}
