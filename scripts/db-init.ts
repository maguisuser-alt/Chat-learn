// Crea la base de datos: colecciones e índices de todos los modelos y comprueba que se puede escribir.
// Uso:  npm run db:init
import mongoose from "mongoose";
import { buildMongoUri, redactMongoUri } from "../lib/dbUri";
import { User } from "../models/User";
import { UserProgress } from "../models/UserProgress";
import { Interaction } from "../models/Interaction";
import { Conversation } from "../models/Conversation";
import { Feedback } from "../models/Feedback";
import { StudyGuide } from "../models/StudyGuide";
import { StudyPlan } from "../models/StudyPlan";

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* sin .env.local: se usan las variables del sistema */
  }

  const uri = buildMongoUri();
  if (!uri) {
    console.error("✘ Falta MONGODB_HOST (o MONGODB_URI) en .env.local. Cópialo desde Atlas > Connect > Drivers.");
    return 1;
  }

  console.log(`Conectando a ${redactMongoUri(uri)} …`);
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`✘ No se pudo conectar: ${msg}`);
    if (/auth|credentials|bad auth/i.test(msg)) console.error("  → Revisa usuario y contraseña (Atlas > Database Access).");
    if (/ENOTFOUND|querySrv|getaddrinfo/i.test(msg)) console.error("  → El host no existe: revisa MONGODB_HOST.");
    if (/timed out|ReplicaSetNoPrimary|Server selection/i.test(msg)) {
      console.error("  → Probablemente tu IP no está permitida: Atlas > Network Access > Add IP Address.");
    }
    return 1;
  }

  const models = [User, UserProgress, Interaction, Conversation, Feedback, StudyGuide, StudyPlan];
  for (const m of models) {
    try {
      await m.createCollection();
    } catch (e) {
      if ((e as { codeName?: string }).codeName !== "NamespaceExists") throw e;
    }
    await m.syncIndexes();
    const list = await m.collection.indexes();
    console.log(`✔ ${m.collection.name.padEnd(14)} índices: ${list.map((i) => i.name).join(", ")}`);
  }

  // Prueba de escritura y lectura.
  const probe = await Interaction.create({ owner: "db-init", kind: "other", ok: true, latencyMs: 0 });
  const read = await Interaction.findById(probe._id).lean();
  await Interaction.deleteOne({ _id: probe._id });
  console.log(read ? "✔ Escritura y lectura correctas." : "✘ No se pudo leer lo escrito.");

  await mongoose.disconnect();
  return read ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("✘ Error inesperado:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
);
