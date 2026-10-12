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
