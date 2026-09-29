import { execFile } from "node:child_process";

const CHOOSE_FOLDER_SCRIPT =
  'POSIX path of (choose folder with prompt "Elige la carpeta del proyecto")';

function isCancellation(stderr: string, message: string): boolean {
  return /User canceled|-128/.test(stderr) || /User canceled|-128/.test(message);
}

export function pickFolder(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    if (process.platform !== "darwin") {
      reject(
        new Error(
          "El selector nativo de carpetas solo está disponible en macOS.",
        ),
      );
      return;
    }

    execFile(
      "osascript",
      ["-e", CHOOSE_FOLDER_SCRIPT],
      { encoding: "utf8" },
      (error, stdout, stderr) => {
        if (error) {
          if (isCancellation(stderr ?? "", error.message)) {
            resolve(null);
            return;
          }

          reject(
            new Error(
              `No se pudo abrir el selector de carpetas: ${(stderr ?? "").trim() || error.message}`,
            ),
          );
          return;
        }

        const path = stdout.trim().replace(/\/+$/, "");
        resolve(path.length > 0 ? path : null);
      },
    );
  });
}
