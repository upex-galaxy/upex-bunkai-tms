import type { AtcListFilters } from '@lib/atcs/list-filters';
import type { AtcLayer, AtcPriority, AtcTechnique } from '@lib/types';
import type { SavedViewState } from './state';
import { ATC_FILTER_UNSPECIFIED, EMPTY_ATC_LIST_FILTERS } from '@lib/atcs/list-filters';
import { FACET_UNSPECIFIED, stateFromParams } from './state';

// BK-443 — the project workbench's filters as one saved-view state. The
// workbench keeps them in three places (the ATC search text, the Test tag text,
// and BK-399's technique / priority / layer facets); this module is the single
// translation between them and the `workbench` view kind's URL parameters
// (`atc_q`, `tag`, `technique`, `priority`, `layer`). Pure so it is testable
// without the provider.

export interface WorkbenchFilters {
  atcQuery: string
  tagInput: string
  atcFilters: AtcListFilters
}

export const EMPTY_WORKBENCH_FILTERS: WorkbenchFilters = {
  atcQuery: '',
  tagInput: '',
  atcFilters: EMPTY_ATC_LIST_FILTERS,
};

// Current filters -> canonical state (the address and "Save current view").
export function workbenchStateFromFilters(filters: WorkbenchFilters): SavedViewState {
  const params = new URLSearchParams();
  if (filters.atcQuery.trim() !== '') { params.set('atc_q', filters.atcQuery); }
  if (filters.tagInput.trim() !== '') { params.set('tag', filters.tagInput); }
  const { technique, priority, layer } = filters.atcFilters;
  if (technique !== null) { params.set('technique', technique === ATC_FILTER_UNSPECIFIED ? FACET_UNSPECIFIED : technique); }
  if (priority !== null) { params.set('priority', priority === ATC_FILTER_UNSPECIFIED ? FACET_UNSPECIFIED : priority); }
  if (layer !== null) { params.set('layer', layer); }
  return stateFromParams('workbench', params);
}

// A (canonical, validated) state -> the filters. An axis the state does not
// hold is cleared: opening a view replaces the applied filters.
export function workbenchFiltersFromState(state: SavedViewState): WorkbenchFilters {
  return {
    atcQuery: state.atc_q ?? '',
    tagInput: state.tag ?? '',
    atcFilters: {
      technique: state.technique === undefined
        ? null
        : state.technique === FACET_UNSPECIFIED ? ATC_FILTER_UNSPECIFIED : (state.technique as AtcTechnique),
      priority: state.priority === undefined
        ? null
        : state.priority === FACET_UNSPECIFIED ? ATC_FILTER_UNSPECIFIED : (state.priority as AtcPriority),
      layer: (state.layer as AtcLayer | undefined) ?? null,
    },
  };
}
