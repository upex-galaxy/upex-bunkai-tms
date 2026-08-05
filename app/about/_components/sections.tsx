import type { ReactNode } from 'react';
import Link from 'next/link';

// Static sections of /about. Server components — no state, no effects, so the
// page paints as HTML and only the walkthrough stepper ships JavaScript.

export function Section({
  id,
  n,
  kicker,
  title,
  lede,
  children,
}: {
  id: string
  n: string
  kicker: string
  title: string
  lede?: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-16 border-t border-stroke-1 py-12">
      <p className="font-mono text-2xs uppercase tracking-widest text-fg-4">
        {n}
        {' · '}
        <span className="text-accent">{kicker}</span>
      </p>
      <h2 className="max-w-[28ch] pt-2.5 text-[30px] font-bold leading-[1.12] tracking-tight text-fg-0">{title}</h2>
      {lede && <p className="max-w-[68ch] pt-3 text-lg leading-relaxed text-fg-2">{lede}</p>}
      <div className="pt-7">{children}</div>
    </section>
  );
}

export function AboutHero() {
  return (
    <header className="py-14">
      <p className="font-mono text-2xs uppercase tracking-widest text-fg-4">
        Recorrido guiado ·
        {' '}
        <span className="text-accent">para equipos de QA</span>
      </p>

      <div className="flex items-baseline gap-3.5 pt-5">
        <span className="font-jp text-[52px] font-bold leading-none text-fg-0">分解</span>
        <span className="text-[52px] font-bold leading-none tracking-tight text-fg-0">Bunkai</span>
      </div>

      <p className="max-w-[62ch] pt-5 text-[21px] leading-relaxed text-fg-2">
        El sistema de gestión de pruebas cuyo
        {' '}
        <strong className="font-semibold text-fg-0">modelo de datos vuelve inevitable el buen QA</strong>
        . Esta página lo explica entero: el mapa completo, y después un caso real de punta a punta con las pantallas
        reales.
      </p>

      <div className="flex flex-wrap gap-1.5 pt-6">
        {['ATCs reutilizables', 'Trazabilidad obligatoria', 'Manual · agéntico · automatizado', 'Defectos nativos', 'API-first'].map(
          t => (
            <span key={t} className="rounded-1 border border-stroke-2 bg-surface-2 px-2 py-1 font-mono text-2xs text-fg-2">
              {t}
            </span>
          ),
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-8">
        <a
          href="#recorrido"
          className="rounded-2 bg-accent px-3 py-2 text-xs font-medium text-white transition-colors duration-token ease-token hover:bg-accent-hi"
        >
          Empezar el recorrido →
        </a>
        <a
          href="#mapa"
          className="rounded-2 border border-stroke-2 bg-surface-2 px-3 py-2 text-xs text-fg-1 transition-colors duration-token ease-token hover:border-stroke-3"
        >
          Ver el mapa completo
        </a>
        <Link
          href="/qa"
          className="rounded-2 px-3 py-2 text-xs text-fg-3 transition-colors duration-token ease-token hover:text-fg-1"
        >
          Guía de testeabilidad
        </Link>
      </div>

      <p className="pt-8 text-xs text-fg-4">
        Se pronuncia BUN-kai. Es el término real de artes marciales japonesas para descomponer un kata en sus
        aplicaciones. No es la palabra del anime.
      </p>
    </header>
  );
}

export function PainSolution() {
  const rows = [
    {
      pain: 'El mismo paso, cuarenta veces',
      painD: 'Navegar a /login está copiado en cuarenta casos. Cambiás el flujo y editás cuarenta lugares, o se te escapan doce.',
      fix: 'El ATC se escribe una sola vez',
      fixD: 'Los tests lo referencian. Una edición corrige todas las cadenas que lo usan.',
    },
    {
      pain: 'Nadie sabe qué sigue siendo válido',
      painD: 'El producto avanza y el repositorio se pudre. Release tras release, la suite se despega de la app.',
      fix: 'La cobertura se calcula sola',
      fixD: 'Criterios sin cubrir y tests nunca ejecutados salen en una lista, no en una sensación.',
    },
    {
      pain: '"¿Qué cubre esta historia?"',
      painD: 'La trazabilidad vive repartida entre una planilla, una página de Confluence y la memoria de alguien.',
      fix: 'La cadena se lee de una',
      fixD: 'Historia, criterio, ATC, test, run y defecto en una sola vista, navegable en los dos sentidos.',
    },
    {
      pain: 'Los bugs se van del loop de QA',
      painD: 'La herramienta delega al tracker apenas algo falla, y se pierde qué ATC falló y bajo qué condiciones.',
      fix: 'El defecto nace en contexto',
      fixD: 'Anclado a módulo, ATC y run. La copia al tracker es opcional, no un traspaso de propiedad.',
    },
  ];

  return (
    <div className="grid gap-2.5">
      {rows.map(r => (
        <div key={r.pain} className="grid items-stretch gap-2.5 md:grid-cols-2">
          <div className="rounded-3 border border-stroke-2 bg-surface-1 p-3.5">
            <p className="font-mono text-2xs uppercase tracking-wider text-fg-4">Lo que duele hoy</p>
            <p className="pt-1.5 text-md font-semibold text-fg-1">{r.pain}</p>
            <p className="pt-1.5 text-xs leading-relaxed text-fg-3">{r.painD}</p>
          </div>
          <div className="rounded-3 border border-accent/30 bg-accent-soft p-3.5">
            <p className="font-mono text-2xs uppercase tracking-wider text-accent">Cómo lo resuelve Bunkai</p>
            <p className="pt-1.5 text-md font-semibold text-fg-0">{r.fix}</p>
            <p className="pt-1.5 text-xs leading-relaxed text-fg-2">{r.fixD}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ExecutionModes() {
  const modes = [
    {
      status: 'skipped',
      exec: 'ejecutor: humano',
      title: 'Manual',
      body: 'Arrancás el run contra un ambiente y marcás cada paso con el teclado. Si abortás, queda el motivo y la corrida se conserva: el historial no se borra para maquillar un reporte.',
    },
    {
      status: 'running',
      exec: 'ejecutor: agente',
      title: 'Agéntico',
      body: 'Una IA opera exactamente la misma API que opera una persona, autenticada con un token personal. El agente es un consumidor de primera clase, no un chatbot pegado al costado.',
    },
    {
      status: 'pass',
      exec: 'ejecutor: ci',
      title: 'Automatizado',
      body: 'El pipeline envía los resultados por paso, o sube un archivo de resultados, y aparece un run ligado a su commit y su rama. Mismos ATCs, mismos reportes que el modo manual.',
    },
  ];
  return (
    <>
      <div className="grid gap-2.5 md:grid-cols-3">
        {modes.map(m => (
          <div key={m.title} className="rounded-3 border border-stroke-2 bg-surface-2 p-3.5 shadow-card">
            <span className="status-chip" data-status={m.status}>
              <span className="dot" data-status={m.status} />
              {m.exec}
            </span>
            <p className="pt-2.5 text-lg font-semibold text-fg-0">{m.title}</p>
            <p className="pt-2 text-xs leading-relaxed text-fg-2">{m.body}</p>
          </div>
        ))}
      </div>
      <p className="max-w-[74ch] pt-4 text-md leading-relaxed text-fg-2">
        Un reporte de regresión puede alimentarse de cualquier mezcla de los tres, porque los tres producen el mismo
        tipo de run contra los mismos ATCs. Esa unificación es la parte difícil, y es la que ya está resuelta.
      </p>
    </>
  );
}

export function Origin() {
  const layers = [
    { n: '4', t: 'Fixtures', d: 'Punto de entrada de inyección de dependencias' },
    { n: '3.5', t: 'Steps', d: 'Cadenas de ATCs reutilizadas como precondición' },
    { n: '3', t: 'Componentes de dominio', d: 'Lógica de negocio — acá viven los ATCs' },
    { n: '2', t: 'Componentes base', d: 'Helpers de HTTP y de navegador' },
    { n: '1', t: 'TestContext', d: 'Config, logger, factories de datos, ambientes' },
  ];
  const mapping = [
    ['Método @atc(\'BK-166\')', 'Entidad ATC, capa UI'],
    ['Archivo de componente de dominio', 'Módulo en el árbol'],
    ['Cadena en tests/e2e/', 'Test — cadena ordenada de ATCs'],
    ['Capa Steps (3.5)', 'ATCs reutilizados como precondición'],
    ['Ejecución de Playwright', 'Run con ejecutor ci o agent'],
    ['Salida del reporter', 'Resultados, cobertura y heatmap'],
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <p className="max-w-[56ch] text-md leading-relaxed text-fg-2">
          Bunkai es la productización de
          {' '}
          <strong className="font-semibold text-fg-0">KATA</strong>
          , la Component Action Test Architecture, y de la metodología
          {' '}
          <strong className="font-semibold text-fg-0">IQL</strong>
          {' '}
          (Integrated Quality Lifecycle) a la que pertenece. No es una suposición sobre lo que un equipo de QA necesita:
          es una arquitectura que ya venía corriendo suites, convertida en sistema.
        </p>
        <div className="mt-4 overflow-hidden rounded-3 border border-stroke-2 bg-surface-2">
          <p className="border-b border-stroke-1 px-3 py-2 font-mono text-2xs uppercase tracking-wider text-fg-4">
            Capas de KATA · la de arriba usa la de abajo, nunca al revés
          </p>
          {layers.map(l => (
            <div key={l.n} className="flex gap-3 border-b border-stroke-1 px-3 py-2 last:border-b-0">
              <span className="w-6 shrink-0 font-mono text-2xs text-accent">{l.n}</span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-fg-0">{l.t}</span>
                <span className="block pt-0.5 text-2xs text-fg-3">{l.d}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="pb-2 font-mono text-2xs uppercase tracking-wider text-fg-4">El mismo ATC, de los dos lados</p>
        <div className="overflow-hidden rounded-3 border border-stroke-2 bg-surface-2">
          <div className="grid grid-cols-2 border-b border-stroke-2 bg-surface-1 px-3 py-2">
            <span className="font-mono text-2xs uppercase tracking-wider text-fg-4">En KATA · el código</span>
            <span className="font-mono text-2xs uppercase tracking-wider text-accent">En Bunkai · el producto</span>
          </div>
          {mapping.map(([a, b]) => (
            <div key={a} className="grid grid-cols-2 gap-2 border-b border-stroke-1 px-3 py-2 last:border-b-0">
              <span className="font-mono text-2xs text-fg-3">{a}</span>
              <span className="text-xs text-fg-1">{b}</span>
            </div>
          ))}
        </div>
        <p className="pt-3 max-w-[52ch] text-xs leading-relaxed text-fg-3">
          El identificador del ticket es la clave de unión. Por eso los dos lados calcen sin ningún archivo de mapeo:
          escribís la automatización en KATA y la gestionás acá, con el mismo vocabulario.
        </p>
      </div>
    </div>
  );
}

export function Closing() {
  return (
    <section className="border-t border-stroke-1 py-14">
      <p className="max-w-[54ch] text-[26px] font-bold leading-tight tracking-tight text-fg-0">
        Todo lo anterior es consecuencia de una sola decisión:
        {' '}
        <span className="text-accent">poner la disciplina en el modelo de datos.</span>
      </p>
      <div className="flex flex-wrap items-center gap-2 pt-7">
        <Link
          href="/login"
          className="rounded-2 bg-accent px-3 py-2 text-xs font-medium text-white transition-colors duration-token ease-token hover:bg-accent-hi"
        >
          Entrar a Bunkai
        </Link>
        <Link
          href="/qa"
          className="rounded-2 border border-stroke-2 bg-surface-2 px-3 py-2 text-xs text-fg-1 transition-colors duration-token ease-token hover:border-stroke-3"
        >
          Guía de testeabilidad para QA
        </Link>
        <a
          href="/api/docs"
          className="rounded-2 border border-stroke-2 bg-surface-2 px-3 py-2 text-xs text-fg-1 transition-colors duration-token ease-token hover:border-stroke-3"
        >
          Documentación de la API
        </a>
      </div>
    </section>
  );
}
