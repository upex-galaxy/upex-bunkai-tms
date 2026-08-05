import type { Metadata } from 'next';
import { BigPicture } from './_components/BigPicture';
import { Capabilities } from './_components/Capabilities';
import {
  AboutHero,
  Closing,
  ExecutionModes,
  Origin,
  PainSolution,
  Section,
} from './_components/sections';
import { Walkthrough } from './_components/Walkthrough';

export const metadata: Metadata = {
  title: 'Cómo funciona Bunkai · Recorrido guiado',
  description:
    'Recorrido guiado de Bunkai para equipos de QA: el mapa completo del producto y un caso de uso de punta a punta con las pantallas reales.',
};

// Public explainer surface — no auth gate, same posture as /qa. Written in
// Spanish because it is a teaching page for Spanish-speaking QA teams; the code
// around it stays English per the repo convention.
//
// Order is deliberate: the reader gets the pain first (so the model earns its
// constraints), then the whole map at once, then a single concrete job walked
// end to end, and only afterwards the catalogue and the KATA origin. Nothing
// here queries the database — every number is illustrative and labelled as such.

const NAV = [
  { id: 'problema', label: 'El problema' },
  { id: 'mapa', label: 'Mapa completo' },
  { id: 'recorrido', label: 'Recorrido' },
  { id: 'ejecucion', label: 'Modos de ejecución' },
  { id: 'capacidades', label: 'Qué puede hacer' },
  { id: 'origen', label: 'De dónde viene' },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-surface-0">
      <nav className="sticky top-0 z-30 border-b border-stroke-1 bg-surface-0/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center gap-3 px-6 py-2.5">
          <span className="inline-flex shrink-0 items-center gap-2">
            <span className="inline-flex size-5 items-center justify-center rounded-1 bg-accent font-jp text-xs font-bold leading-none text-white">
              分
            </span>
            <span className="text-sm font-bold tracking-tight text-fg-0">Bunkai</span>
          </span>
          <ul className="m-0 hidden list-none gap-1 overflow-x-auto p-0 md:flex">
            {NAV.map(n => (
              <li key={n.id}>
                <a
                  href={`#${n.id}`}
                  className="inline-block whitespace-nowrap rounded-2 px-2 py-1 text-xs text-fg-3 transition-colors duration-token ease-token hover:bg-surface-2 hover:text-fg-0"
                >
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
          <a
            href="/login"
            className="ml-auto shrink-0 rounded-2 border border-stroke-2 bg-surface-2 px-2.5 py-1.5 text-xs text-fg-1 transition-colors duration-token ease-token hover:border-stroke-3"
          >
            Entrar
          </a>
        </div>
      </nav>

      <main className="mx-auto max-w-[1180px] px-6 pb-16">
        <AboutHero />

        <Section
          id="problema"
          n="01"
          kicker="el problema"
          title="Las herramientas de gestión de pruebas guardan documentos. No enseñan a testear."
          lede="Cuatro dolores que cualquier equipo de QA reconoce, y qué hace Bunkai con cada uno. La diferencia no está en la lista de funciones: está en qué permite y qué impide el modelo de datos."
        >
          <PainSolution />
        </Section>

        <Section
          id="mapa"
          n="02"
          kicker="el mapa"
          title="Todo el producto en una pantalla, siguiendo el dato."
          lede="Cinco bandas de arriba abajo: qué entra, qué se escribe, qué se ejecuta, qué evidencia queda y qué decisión habilita. Abajo, lo que atraviesa las cinco."
        >
          <BigPicture />
        </Section>

        <Section
          id="recorrido"
          n="03"
          kicker="el recorrido"
          title="Un caso real, de punta a punta, en ocho pasos."
          lede="Elena tiene que certificar el checkout antes del release del viernes. Cada paso muestra la pantalla donde ocurre y el problema que deja de existir."
        >
          <Walkthrough />
        </Section>

        <Section
          id="ejecucion"
          n="04"
          kicker="ejecución"
          title="Tres formas de correr un test. Un solo modelo de datos abajo."
        >
          <ExecutionModes />
        </Section>

        <Section
          id="capacidades"
          n="05"
          kicker="capacidades"
          title="Qué puede hacer hoy y qué viene en camino."
          lede="El catálogo completo por dominio, sin maquillaje: lo que ya se puede usar y lo que todavía está en construcción."
        >
          <Capabilities />
        </Section>

        <Section
          id="origen"
          n="06"
          kicker="origen"
          title="Esto no empezó como producto. Empezó como arquitectura."
        >
          <Origin />
        </Section>

        <Closing />
      </main>

      <footer className="border-t border-stroke-1 py-6">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-3 px-6 text-2xs text-fg-4">
          <span className="font-mono">分解 · Bunkai</span>
          <span>Test Management System open core para equipos de QA.</span>
          <span className="ml-auto">Las pantallas de esta página son representaciones con datos de ejemplo.</span>
        </div>
      </footer>
    </div>
  );
}
