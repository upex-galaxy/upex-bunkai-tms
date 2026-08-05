// The whole product on one screen. Five bands, read top to bottom, following
// the data: what enters, what gets authored, what gets executed, what evidence
// falls out, what decision it enables. Under them, the layer that cuts across
// all five. Deliberately not a feature table — the reader should see the shape
// of the system before the list of things it can do.

interface Node {
  entity: string
  id: string
  bullets: string[]
  tone?: 'key'
}

interface Band {
  n: string
  name: string
  claim: string
  nodes: Node[]
}

const BANDS: Band[] = [
  {
    n: '01',
    name: 'Entra el requerimiento',
    claim: 'Nada se testea sin saber qué se prometió.',
    nodes: [
      {
        entity: 'Workspace · Proyecto',
        id: 'tenencia',
        bullets: ['Multi-tenant con roles', 'Invitaciones por email', 'Ambientes por proyecto'],
      },
      {
        entity: 'Módulo',
        id: 'árbol',
        bullets: ['Árbol de hasta 6 niveles', 'Mover, renombrar, archivar', 'Eje de toda métrica'],
      },
      {
        entity: 'User Story · Criterio',
        id: 'requerimiento',
        bullets: ['Import por JQL desde Jira', 'Editor Markdown', 'Criterios atómicos y ordenables'],
      },
    ],
  },
  {
    n: '02',
    name: 'Se escribe la verificación',
    claim: 'La pieza reutilizable, no el documento.',
    nodes: [
      {
        entity: 'ATC',
        id: 'la pieza',
        tone: 'key',
        bullets: [
          'Pasos y aserciones ordenados',
          'Capa UI · API · Unit',
          'Anclaje obligatorio a criterio',
          'Duplicar, buscar, autocompletar',
        ],
      },
      {
        entity: 'Test',
        id: 'la cadena',
        tone: 'key',
        bullets: [
          'Cadena ordenada de ATCs',
          'Reordenar por paso',
          'Tags reservados y propios',
          'Propagación de ediciones',
        ],
      },
    ],
  },
  {
    n: '03',
    name: 'Se ejecuta',
    claim: 'Tres formas de correr, un solo modelo abajo.',
    nodes: [
      {
        entity: 'Run manual',
        id: 'humano',
        bullets: ['Veredicto por paso', 'Abortar con motivo', 'Cierre con veredicto final'],
      },
      {
        entity: 'Run agéntico',
        id: 'agente',
        bullets: ['La IA opera la misma API', 'Tokens de acceso personal', 'Sin interfaz aparte'],
      },
      {
        entity: 'Run automatizado',
        id: 'ci',
        bullets: ['Envío de resultados por paso', 'Subida de archivo de CI', 'Ligado a commit y rama'],
      },
    ],
  },
  {
    n: '04',
    name: 'Cae la evidencia',
    claim: 'El defecto no se va del ciclo.',
    nodes: [
      {
        entity: 'Bug',
        id: 'defecto',
        tone: 'key',
        bullets: ['Cargado desde el paso rojo', 'Módulo, severidad, estado', 'Sync opcional al tracker'],
      },
      {
        entity: 'Historial de runs',
        id: 'evidencia',
        bullets: ['Contenido congelado por run', 'Filtro por resultado', 'Totales por proyecto'],
      },
      {
        entity: 'Actividad',
        id: 'bitácora',
        bullets: ['Feed de lo que pasó', 'Quién, qué y cuándo'],
      },
    ],
  },
  {
    n: '05',
    name: 'Se decide',
    claim: 'La pregunta del release tiene respuesta.',
    nodes: [
      {
        entity: 'Cobertura',
        id: 'huecos',
        bullets: ['Criterios sin ATC', 'Filtro de nunca ejecutado', 'Tiempo hasta verde'],
      },
      {
        entity: 'Trazabilidad',
        id: 'cadena',
        bullets: ['Historia → defecto de una lectura', 'Filtro por veredicto y fecha', 'Export de solo lectura'],
      },
      {
        entity: 'Heatmap',
        id: 'tendencia',
        bullets: ['Conteo por módulo', 'Variación semana a semana'],
      },
    ],
  },
];

const CROSSCUTTING = [
  { t: 'API REST + OpenAPI', d: 'El contrato es la fuente de verdad; la UI es un cliente más.' },
  { t: 'Aislamiento por fila', d: 'Nadie ve ni recibe aviso de algo fuera de su workspace.' },
  { t: 'Notificaciones', d: 'Inbox de eventos de runs y defectos, con preferencias por tipo.' },
  { t: 'Vistas y comandos', d: 'Árbol, tabla, mapa mental, pestañas y paleta de comandos.' },
  { t: 'Test plans y milestones', d: 'Agrupar tests para un release y seguirlo contra una fecha.' },
  { t: 'Open core', d: 'Community self-hosted, Cloud y Enterprise sobre el mismo código.' },
];

export function BigPicture() {
  return (
    <div className="flex flex-col gap-2.5">
      {BANDS.map((b, i) => (
        <div key={b.n}>
          <div className="grid gap-3 lg:grid-cols-[212px_1fr]">
            {/* band label */}
            <div className="flex gap-3 lg:flex-col lg:gap-1">
              <span className="font-mono text-2xs text-accent">{b.n}</span>
              <div>
                <p className="text-md font-semibold leading-tight text-fg-0">{b.name}</p>
                <p className="pt-1 text-xs leading-relaxed text-fg-3">{b.claim}</p>
              </div>
            </div>

            {/* nodes */}
            <div className="grid gap-2.5 md:grid-cols-3">
              {b.nodes.map(n => (
                <div
                  key={n.entity}
                  className={
                    n.tone === 'key'
                      ? 'rounded-3 border border-accent/35 bg-accent-soft p-3'
                      : 'rounded-3 border border-stroke-2 bg-surface-2 p-3 shadow-card'
                  }
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-semibold text-fg-0">{n.entity}</p>
                    <span className="font-mono text-[9px] uppercase tracking-wider text-fg-4">{n.id}</span>
                  </div>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0 pt-2">
                    {n.bullets.map(x => (
                      <li key={x} className="flex gap-1.5 text-2xs leading-relaxed text-fg-2">
                        <span className="mt-[5px] size-1 shrink-0 rounded-full bg-fg-4" />
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {i < BANDS.length - 1 && (
            <div className="grid lg:grid-cols-[212px_1fr]">
              <span />
              <span className="flex items-center gap-2 py-1.5 pl-1">
                <span className="h-3 w-px bg-stroke-3" />
                <span className="font-mono text-[9px] uppercase tracking-widest text-fg-4">alimenta</span>
              </span>
            </div>
          )}
        </div>
      ))}

      {/* crosscutting */}
      <div className="mt-2 rounded-3 border border-stroke-2 bg-surface-1 p-3.5">
        <p className="font-mono text-2xs uppercase tracking-widest text-fg-4">Atraviesa las cinco bandas</p>
        <div className="grid gap-2.5 pt-2.5 md:grid-cols-3">
          {CROSSCUTTING.map(c => (
            <div key={c.t} className="rounded-2 border border-stroke-1 bg-surface-2 p-2.5">
              <p className="text-xs font-semibold text-fg-0">{c.t}</p>
              <p className="pt-1 text-2xs leading-relaxed text-fg-3">{c.d}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
