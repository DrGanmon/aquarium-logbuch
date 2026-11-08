import { shallowRef } from "vue";

/** In-app replacement for window.confirm: styled, translated and naming the consequence. */
export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (confirmed: boolean) => void;
}
export const confirmRequest = shallowRef<ConfirmRequest | null>(null);

export function askConfirm(options: Omit<ConfirmRequest, "resolve">): Promise<boolean> {
  confirmRequest.value?.resolve(false);
  return new Promise(resolve => {
    confirmRequest.value = { danger: true, ...options, resolve: (confirmed: boolean) => {
      confirmRequest.value = null;
      resolve(confirmed);
    } };
  });
}
