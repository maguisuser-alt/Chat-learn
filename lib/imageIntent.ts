/**
 * ¿El mensaje pide crear una imagen? Se decide sin IA cuando está claro y
 * devuelve "maybe" cuando hace falta que la IA lo interprete.
 */
export type ImageIntent = "image" | "chat" | "maybe";

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿¡"«»“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Verbos de creación (español e inglés), incluidas formas con pronombre: créame, hazme, dibújalo… */
const CREATE = /\b(crea|creame|crear|creen|genera|generame|generar|dibuja|dibujame|dibujar|disena|disename|disenar|haz|hazme|hacer|pinta|pintame|ilustra|ilustrame|muestrame|quiero|necesito|dame|create|generate|draw|design|make|paint|illustrate|render)\w*\b/;

/** Cosas que siempre son imágenes. */
const VISUAL =
  /\b(imagen(es)?|image|foto(grafia)?s?|photo|picture|logo(tipo)?s?|isotipo|icono|icon|ilustracion(es)?|illustration|dibujo|drawing|retrato|portrait|poster|cartel|afiche|flyer|folleto|banner|portada|cover|miniatura|thumbnail|fondo de pantalla|wallpaper|sticker|pegatina|avatar|mascota de marca|mockup|render|acuarela|watercolor|oleo|caricatura|cartoon|anime|pixel art|infografia|meme|tarjeta de (cumpleanos|felicitacion|invitacion)|invitacion|emblema|escudo|tatuaje|tattoo)\b/;

/** Cosas que son texto aunque digan «crea». */
const TEXTUAL =
  /\b(resumen|summary|examen|exam|test|quiz|preguntas|cuestionario|texto|text|lista|list|plan|horario|rutina|poema|poem|cancion|letra|cuento|historia|story|ensayo|essay|redaccion|carta|email|correo|mensaje|codigo|code|script|funcion|programa|tabla|table|esquema de texto|guion|discurso|tarjetas de estudio|flashcards|mapa conceptual en texto|traduccion|ejercicios?|receta|frase|eslogan|slogan|nombre para|nombres para|bio|biografia|informe|reporte|presentacion de texto|articulo|post|tweet|hilo)\b/;

/** «Hazlo más azul», «ponle un sombrero», «cámbialo a…»: retoques de la imagen anterior. */
const EDIT =
  /^(y |ahora |pero |mejor |vale,? |ok,? )?(hazlo|hazla|ponle|ponlo|ponla|cambia(lo|la)?|quita(le)?|anade(le)?|agrega(le)?|sin |con |mas |menos |otra vez|otra version|otro estilo|en (blanco y negro|color|acuarela|3d)|que sea|make it|add |remove |change |more |less |without )/;

export function detectImageIntent(message: string, previousHadImage = false): ImageIntent {
  const t = strip(message);
  if (!t || t.length > 600) return "chat";
  // Preguntas sobre imágenes («¿qué es un logo?», «explica cómo dibujar un retrato») no son peticiones.
  if (/^(que|como|por que|cual|cuales|cuando|donde|quien|explica|explicame|define|describe|what|how|why|explain)\b/.test(t)) return "chat";

  if (previousHadImage && t.length <= 160 && EDIT.test(t)) return "image";

  const create = CREATE.test(t);
  const visual = VISUAL.test(t);
  const textual = TEXTUAL.test(t);
  if (create && visual && !textual) return "image";
  if (create && visual && textual) return "maybe"; // «crea un póster con un resumen…»
  if (create && !textual && /^(crea|creame|genera|generame|dibuja|dibujame|disena|pinta|ilustra|create|generate|draw|design|paint)\b/.test(t)) {
    // «crea un gato astronauta»: empieza pidiendo crear algo sin decir qué tipo.
    return "maybe";
  }
  return "chat";
}
