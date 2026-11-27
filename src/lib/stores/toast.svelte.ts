export type ToastMessage = { text: string; error: boolean };

class ToastStore {
  message = $state<ToastMessage>();
}

export const toastStore = new ToastStore();

export function setMessage(text: string) {
  toastStore.message = { text, error: false };
}

/** Stays up longer: it usually says what to do next. */
export function setError(text: string) {
  toastStore.message = { text, error: true };
}
