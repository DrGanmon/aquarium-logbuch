import { runWorkerTask } from "../worker-client";
export async function readImage(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type))
    throw new Error("Ungültiges Bildformat.");
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Das Bild ist größer als 5 MB.");
  if (
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap !== "undefined"
  )
    return (
      await runWorkerTask("PROCESS_IMAGE", {
        file,
        mimeType: file.type === "image/png" ? "image/png" : "image/jpeg",
      })
    ).dataUrl;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(new Error("Bild konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}
export async function enableNotifications() {
  if (!("Notification" in window))
    throw new Error("Benachrichtigungen werden nicht unterstützt.");
  return Notification.requestPermission();
}
export function beep() {
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.connect(gain);
  gain.connect(context.destination);
  gain.gain.value = 0.15;
  oscillator.frequency.value = 880;
  oscillator.start();
  oscillator.stop(context.currentTime + 0.5);
  oscillator.onended = () => {
    void context.close();
  };
  navigator.vibrate?.([250, 100, 250]);
}

// Keep JSON/base64 requests below common 1 MiB proxy limits, including caption and headers.
export const SOCIAL_UPLOAD_MAX_BYTES = 650 * 1024;
export async function readSocialImage(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Ungültiges Bildformat.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Das Bild ist größer als 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();image.src = url;await image.decode();
    const canvas = document.createElement('canvas');
    let edge = 1600;
    for (let attempt = 0; attempt < 8; attempt++) {
      const factor = Math.min(1, edge / image.naturalWidth, edge / image.naturalHeight);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * factor));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * factor));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Bildverarbeitung nicht verfügbar.');
      context.fillStyle = '#ffffff';context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Bild konnte nicht verarbeitet werden.')), 'image/jpeg', Math.max(0.6, 0.85 - attempt * 0.05)));
      if (blob.size <= SOCIAL_UPLOAD_MAX_BYTES) {
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'));reader.readAsDataURL(blob);
        });
      }
      edge = Math.round(edge * 0.8);
    }
    throw new Error('Das Bild konnte nicht ausreichend verkleinert werden.');
  } finally { URL.revokeObjectURL(url); }
}
