import { ref } from 'vue'

/** True while the re-authentication dialog is on screen. */
export const stepUpVisible = ref(false)

/** The one in-flight prompt; every concurrent `requestStepUp()` awaits the same promise. */
let pending: {
  promise: Promise<void>
  complete: () => void
  cancel: (error: Error) => void
} | null = null

/**
 * Opens the dialog and resolves once a fresh primary authentication succeeded;
 * rejects if the user cancels or re-authentication fails. Concurrent calls share one prompt.
 */
export function requestStepUp(): Promise<void> {
  if (pending) {
    return pending.promise
  }
  let resolvePrompt!: () => void
  let rejectPrompt!: (error: Error) => void
  const promise = new Promise<void>((resolve, reject) => {
    resolvePrompt = resolve
    rejectPrompt = reject
  })
  pending = {
    promise,
    complete: () => {
      // Settling first makes a later demand open a fresh prompt.
      pending = null
      stepUpVisible.value = false
      resolvePrompt()
    },
    cancel: (error) => {
      pending = null
      stepUpVisible.value = false
      rejectPrompt(error)
    },
  }
  stepUpVisible.value = true
  return promise
}

/** Called by the dialog after a successful re-authentication. */
export function completeStepUp(): void {
  pending?.complete()
}

/** Called by the dialog when the user cancels or gives up. */
export function cancelStepUp(): void {
  pending?.cancel(new Error('step-up cancelled'))
}
