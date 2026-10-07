import { ref } from 'vue'

/**
 * Why the router guard refused a navigation. The guard never moves the operator
 * somewhere else on its own, so a refusal either leaves them on the page they
 * were reading (with an error message) or, when a hard load left nothing on
 * screen, fills the page with this explanation.
 */
export interface RouteDenial {
  /** Path the operator asked for, e.g. `/hub/sessions`. */
  path: string
  /** Permission keys that would have allowed it; holding any one of them is enough. */
  required: readonly string[]
}

/** Non-null only while a refused hard load is on screen; cleared by the next allowed navigation. */
export const routeDenial = ref<RouteDenial | null>(null)

export function setRouteDenial(denial: RouteDenial): void {
  routeDenial.value = denial
}

export function clearRouteDenial(): void {
  routeDenial.value = null
}
