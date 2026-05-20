'use client';

// Public Scalar docs UI rendered against `/api/openapi`. Client component
// because `@scalar/api-reference-react` mounts via React effects and ships
// its own stylesheet — both incompatible with the RSC contract.

import { ApiReferenceReact } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';

export default function ApiDocsPage() {
  return (
    <ApiReferenceReact
      configuration={{
        url: '/api/openapi',
        theme: 'default',
      }}
    />
  );
}
