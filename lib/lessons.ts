export interface Unit {
  id: string;
  title: string;
  emoji: string;
  /** Descripción del tema para la IA. */
  topic: string;
}

export const LESSONS_PER_UNIT = 3;

export const UNITS: Unit[] = [
  { id: "greetings", title: "Saludos y presentaciones", emoji: "👋", topic: "saludos, despedidas, presentarse, cortesía" },
  { id: "numbers", title: "Números y tiempo", emoji: "🕒", topic: "números, horas, días de la semana, meses" },
  { id: "food", title: "Comida y bebida", emoji: "🍎", topic: "comida, bebidas, pedir en un restaurante" },
  { id: "family", title: "Familia y personas", emoji: "👨‍👩‍👧", topic: "familia, describir personas, profesiones" },
  { id: "travel", title: "Viajes y transporte", emoji: "✈️", topic: "aeropuerto, hotel, transporte, direcciones" },
  { id: "city", title: "En la ciudad", emoji: "🏙️", topic: "lugares de la ciudad, tiendas, pedir indicaciones" },
  { id: "work", title: "Trabajo y estudios", emoji: "💼", topic: "oficina, reuniones, estudios, correos" },
  { id: "shopping", title: "Compras y ropa", emoji: "🛍️", topic: "ropa, colores, tallas, precios, pagar" },
  { id: "health", title: "Salud y cuerpo", emoji: "🩺", topic: "partes del cuerpo, síntomas, el médico" },
  { id: "feelings", title: "Emociones y opiniones", emoji: "💬", topic: "sentimientos, dar opiniones, estar de acuerdo" },
];

export function lessonKey(unitId: string, n: number) {
  return `${unitId}:${n}`;
}

/** Lista plana de lecciones en orden, para saber cuál está desbloqueada. */
export const LESSON_ORDER = UNITS.flatMap((u) =>
  Array.from({ length: LESSONS_PER_UNIT }, (_, i) => lessonKey(u.id, i + 1))
);

export interface Word {
  word: string;
  translation: string;
  example: string;
  exampleTranslation: string;
  emoji: string;
}
