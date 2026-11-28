export interface QaSection {
  id: string
  label: string
}

export const qaSections: QaSection[] = [
  { id: 'antes', label: 'Antes de empezar' },
  { id: 'credenciales', label: 'Credenciales' },
  { id: 'pasos', label: 'Paso a paso' },
  { id: 'harness', label: 'Tu harness' },
  { id: 'admin', label: 'Token de admin' },
  { id: 'problemas', label: 'Problemas frecuentes' },
  { id: 'referencia', label: 'Referencia' },
];
