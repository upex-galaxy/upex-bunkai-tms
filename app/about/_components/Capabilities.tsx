// Everything the product can do, grouped by domain, with an honest availability
// marker. Kept separate from the big-picture map on purpose: the map explains
// the shape, this answers "does it do X?".

interface Group {
  domain: string
  items: { t: string, state: 'listo' | 'próximo' }[]
}

const GROUPS: Group[] = [
  {
    domain: 'Equipo y acceso',
    items: [
      { t: 'Workspaces con roles e invitaciones', state: 'listo' },
      { t: 'Login por contraseña, magic link y OAuth', state: 'listo' },
      { t: 'Cambio entre workspaces', state: 'listo' },
      { t: 'Tokens de acceso personal', state: 'listo' },
      { t: 'Asientos, tiers y facturas', state: 'próximo' },
    ],
  },
  {
    domain: 'Estructura del producto',
    items: [
      { t: 'Proyectos dentro del workspace', state: 'listo' },
      { t: 'Módulos anidados con mover y archivar', state: 'listo' },
      { t: 'Ambientes por proyecto', state: 'listo' },
      { t: 'Vistas árbol, tabla y mapa mental', state: 'listo' },
      { t: 'Pestañas y paleta de comandos', state: 'listo' },
    ],
  },
  {
    domain: 'Requerimientos',
    items: [
      { t: 'Historias ancladas a un módulo', state: 'listo' },
      { t: 'Criterios de aceptación ordenables', state: 'listo' },
      { t: 'Editor Markdown con vista previa', state: 'listo' },
      { t: 'Import de Jira por JQL', state: 'listo' },
    ],
  },
  {
    domain: 'Biblioteca de ATCs',
    items: [
      { t: 'Builder con pasos y aserciones', state: 'listo' },
      { t: 'Anclaje obligatorio a criterios', state: 'listo' },
      { t: 'Propagación de ediciones a los tests', state: 'listo' },
      { t: 'Reporte de uso en N tests', state: 'listo' },
      { t: 'Duplicar y buscar con autocompletado', state: 'listo' },
    ],
  },
  {
    domain: 'Tests y ejecución',
    items: [
      { t: 'Armado de cadena de ATCs', state: 'listo' },
      { t: 'Reordenar la cadena por paso', state: 'listo' },
      { t: 'Tags reservados y propios', state: 'listo' },
      { t: 'Run manual con veredicto por paso', state: 'listo' },
      { t: 'Abortar con motivo y cerrar con veredicto', state: 'listo' },
      { t: 'Historial y reporte de runs filtrable', state: 'listo' },
      { t: 'Envío y streaming de runs automatizados', state: 'próximo' },
      { t: 'Subida de archivo de resultados de CI', state: 'próximo' },
    ],
  },
  {
    domain: 'Defectos',
    items: [
      { t: 'Carga desde el paso que falló', state: 'listo' },
      { t: 'Listado filtrable por módulo y severidad', state: 'listo' },
      { t: 'Heatmap con tendencia semanal', state: 'listo' },
      { t: 'Sync de una vía al tracker externo', state: 'listo' },
    ],
  },
  {
    domain: 'Cobertura y evidencia',
    items: [
      { t: 'Criterios y módulos sin cubrir', state: 'listo' },
      { t: 'Cadena de trazabilidad completa', state: 'listo' },
      { t: 'Tiempo hasta verde por historia', state: 'listo' },
      { t: 'Feed de actividad', state: 'listo' },
      { t: 'Export de la cadena como snapshot', state: 'listo' },
    ],
  },
  {
    domain: 'Coordinación',
    items: [
      { t: 'Inbox de notificaciones del workspace', state: 'próximo' },
      { t: 'Preferencias por tipo de evento', state: 'próximo' },
      { t: 'Test plans y milestones', state: 'próximo' },
      { t: 'Canales de chat con menciones', state: 'próximo' },
      { t: 'Dashboard de inicio', state: 'próximo' },
    ],
  },
];

export function Capabilities() {
  return (
    <>
      <div className="flex items-center gap-3 pb-4">
        <span className="inline-flex items-center gap-1.5 text-2xs text-fg-3">
          <span className="dot" data-status="pass" />
          listo o en QA
        </span>
        <span className="inline-flex items-center gap-1.5 text-2xs text-fg-3">
          <span className="dot" data-status="skipped" />
          próximo
        </span>
      </div>
      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
        {GROUPS.map(g => (
          <div key={g.domain} className="rounded-3 border border-stroke-2 bg-surface-2 p-3 shadow-card">
            <p className="pb-2 text-xs font-semibold text-fg-0">{g.domain}</p>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {g.items.map(it => (
                <li key={it.t} className="flex gap-2 text-2xs leading-relaxed text-fg-2">
                  <span className="dot mt-[5px]" data-status={it.state === 'listo' ? 'pass' : 'skipped'} />
                  {it.t}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
