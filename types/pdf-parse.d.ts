// Se importa el módulo interno para evitar el código de depuración que
// pdf-parse ejecuta en su index.js cuando no se lo invoca como script.
declare module "pdf-parse/lib/pdf-parse.js" {
  import pdf from "pdf-parse";
  export default pdf;
}
