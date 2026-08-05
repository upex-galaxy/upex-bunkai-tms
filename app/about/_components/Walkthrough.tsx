'use client';

import { useState } from 'react';
import {
  AtcBuilderMock,
  BugMock,
  CoverageMock,
  HeatmapMock,
  ModulesMock,
  RunnerMock,
  StoryMock,
  TestBuilderMock,
} from './mockups';

// End-to-end walkthrough of a single, concrete job: certifying checkout before
// a Friday release. One screen per step, each paired with the problem it
// removes. Client component because the stepper is the whole point — a reader
// clicks forward at their own pace instead of scrolling past eight static
// blocks.

interface Step {
  n: string
  kicker: string
  title: string
  narrative: string
  solves: { problem: string, answer: string }
  mock: () => React.JSX.Element
}

const STEPS: Step[] = [
  {
    n: '01',
    kicker: 'Estructura',
    title: 'Elena arma el árbol de módulos',
    narrative:
      'Antes de escribir un solo test, Elena parte el producto en módulos: Checkout, con Carrito y Pago adentro; Facturación; Cuenta. No son carpetas decorativas: son el eje por el que después van a agregarse la cobertura y los defectos.',
    solves: {
      problem: 'En otras herramientas, la organización es una convención de nombres que nadie sostiene.',
      answer: 'Acá el módulo es una entidad real del modelo. Todo lo que se cree más adelante va a colgar de uno.',
    },
    mock: ModulesMock,
  },
  {
    n: '02',
    kicker: 'Requerimiento',
    title: 'Trae la historia de Jira y desarma sus criterios',
    narrative:
      'Importa BK-166 con una consulta JQL y la parte en criterios de aceptación atómicos. Tres criterios, tres condiciones verificables. Uno de ellos, el bloqueo tras cinco intentos, todavía no tiene nada que lo cubra.',
    solves: {
      problem: '"¿Qué cubre esta historia?" es una pregunta que hoy se responde de memoria.',
      answer: 'El criterio sin cubrir queda visible desde el momento cero, no aparece recién en la auditoría.',
    },
    mock: StoryMock,
  },
  {
    n: '03',
    kicker: 'Autoría',
    title: 'Escribe el ATC y lo ancla al criterio',
    narrative:
      'ATC-014 es un mini-flujo completo: abrir /login, completar credenciales, enviar, y las aserciones que se desprenden de esa acción. Declara su capa (UI) y queda atado a AC-1 y AC-2. Sin ese anclaje, no se guarda.',
    solves: {
      problem: 'Los tests huérfanos, sin historia ni criterio, se acumulan hasta volver inauditable el repositorio.',
      answer: 'La restricción vive en la base de datos. Un ATC sin criterio no llega a existir.',
    },
    mock: AtcBuilderMock,
  },
  {
    n: '04',
    kicker: 'Ensamblaje',
    title: 'Encadena ATCs hasta formar el Test',
    narrative:
      'TEST-07 no repite pasos: referencia ATC-014, ATC-031, ATC-044 y ATC-052 en orden. Puede mezclar capas — dos pasos de UI y uno de API en la misma cadena — y cada pieza sigue siendo propiedad de un solo lugar.',
    solves: {
      problem: 'El mismo paso copiado en cuarenta casos: cambiás el flujo y editás cuarenta lugares.',
      answer: 'Una edición en ATC-014 corrige los seis tests que lo usan. La cadena guarda referencias, no copias.',
    },
    mock: TestBuilderMock,
  },
  {
    n: '05',
    kicker: 'Ejecución',
    title: 'Corre el test contra Staging, paso por paso',
    narrative:
      'Arranca RUN-451 eligiendo el ambiente. Marca cada paso con el teclado: pass, fail o blocked. En el tercero, agregar al carrito, el ítem desaparece al refrescar. Fail.',
    solves: {
      problem: 'Las corridas manuales terminan en una planilla que nadie vuelve a mirar.',
      answer: 'El run congela lo que se ejecutó. Editar el ATC el mes que viene no reescribe esta evidencia.',
    },
    mock: RunnerMock,
  },
  {
    n: '06',
    kicker: 'Defecto',
    title: 'Carga el bug sin salir del run',
    narrative:
      'Un botón sobre el paso rojo abre el formulario con el contexto ya resuelto: qué run, qué paso, qué ambiente, qué historia, quién ejecutaba. Elena escribe el título y la severidad. Nada más.',
    solves: {
      problem: 'Al delegar el bug al tracker se pierde qué ATC falló, en qué estado y bajo qué ambiente.',
      answer: 'El defecto nace anclado a módulo, ATC y run. La copia a Jira es opcional y de una sola vía.',
    },
    mock: BugMock,
  },
  {
    n: '07',
    kicker: 'Patrón',
    title: 'Ve dónde se está degradando el producto',
    narrative:
      'Con los defectos anclados por construcción, el heatmap sale solo: Checkout concentra 14 defectos y subió 6 en la semana, mientras Facturación bajó. Ya no es "tenemos muchos bugs", es "Checkout se está rompiendo".',
    solves: {
      problem: 'Los reportes cuentan bugs pero no dicen qué parte del producto se está deteriorando.',
      answer: 'La tendencia por módulo convierte el conteo en una decisión sobre dónde poner el esfuerzo.',
    },
    mock: HeatmapMock,
  },
  {
    n: '08',
    kicker: 'Decisión',
    title: 'Responde si el release sale el viernes',
    narrative:
      'La cadena completa se lee de una: historia, criterio, ATC, test, run, defecto. Al costado, los números que importan — cuántos criterios quedan sin cubrir, qué nunca se ejecutó, cuánto tarda una historia en llegar a verde.',
    solves: {
      problem: '"Pasa el 80% de los tests" no dice si lo que se validó es lo que importa.',
      answer: 'La respuesta es una cadena navegable y exportable, no un porcentaje. Sirve para decidir y para auditar.',
    },
    mock: CoverageMock,
  },
];

export function Walkthrough() {
  const [active, setActive] = useState(0);
  const step = STEPS[active];
  const Mock = step.mock;

  return (
    <div className="flex flex-col gap-5">
      {/* stepper */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Pasos del recorrido">
        {STEPS.map((s, i) => (
          <button
            key={s.n}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={
              i === active
                ? 'inline-flex items-center gap-2 rounded-2 border border-accent bg-accent-soft px-2.5 py-1.5 text-xs text-fg-0 transition-colors duration-token ease-token'
                : 'inline-flex items-center gap-2 rounded-2 border border-stroke-2 bg-surface-2 px-2.5 py-1.5 text-xs text-fg-2 transition-colors duration-token ease-token hover:border-stroke-3 hover:text-fg-0'
            }
          >
            <span className={i === active ? 'font-mono text-2xs text-accent' : 'font-mono text-2xs text-fg-4'}>
              {s.n}
            </span>
            {s.kicker}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[0.72fr_1fr]">
        {/* narrative */}
        <div className="flex flex-col gap-3">
          <div>
            <p className="font-mono text-2xs uppercase tracking-widest text-accent">
              Paso
              {' '}
              {step.n}
              {' '}
              de 08
            </p>
            <h3 className="pt-1.5 text-xl font-semibold leading-snug text-fg-0">{step.title}</h3>
          </div>
          <p className="text-md leading-relaxed text-fg-2">{step.narrative}</p>

          <div className="rounded-3 border border-stroke-2 bg-surface-2 p-3">
            <p className="font-mono text-2xs uppercase tracking-wider text-fg-4">El problema de siempre</p>
            <p className="pt-1 text-xs leading-relaxed text-fg-2">{step.solves.problem}</p>
            <div className="my-2.5 h-px bg-stroke-1" />
            <p className="font-mono text-2xs uppercase tracking-wider text-accent">Lo que hace Bunkai</p>
            <p className="pt-1 text-xs leading-relaxed text-fg-1">{step.solves.answer}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActive(a => Math.max(0, a - 1))}
              disabled={active === 0}
              className="rounded-2 border border-stroke-2 bg-surface-2 px-2.5 py-1.5 text-xs text-fg-2 transition-colors duration-token ease-token hover:border-stroke-3 hover:text-fg-0 disabled:opacity-40"
            >
              ← Anterior
            </button>
            <button
              type="button"
              onClick={() => setActive(a => Math.min(STEPS.length - 1, a + 1))}
              disabled={active === STEPS.length - 1}
              className="rounded-2 bg-accent px-2.5 py-1.5 text-xs font-medium text-white transition-colors duration-token ease-token hover:bg-accent-hi disabled:opacity-40"
            >
              Siguiente →
            </button>
          </div>
        </div>

        {/* mockup */}
        <div>
          <Mock />
          <p className="pt-2 text-2xs text-fg-4">
            Representación de la pantalla real, con datos de ejemplo.
          </p>
        </div>
      </div>
    </div>
  );
}
