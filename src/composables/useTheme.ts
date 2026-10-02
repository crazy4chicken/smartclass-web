import { computed, ref, watch } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'smartclass.theme'

/** Returns the persisted choice, defaulting to following the OS. */
function readStoredMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

const media = window.matchMedia('(prefers-color-scheme: dark)')
const prefersDark = ref(media.matches)
media.addEventListener('change', (event) => {
  prefersDark.value = event.matches
})

/** Single shared theme state: every `useTheme()` caller sees the same value. */
const mode = ref<ThemeMode>(readStoredMode())

/** Effective theme after resolving 'system' against the OS preference. */
const resolved = computed<'light' | 'dark'>(() =>
  mode.value === 'system' ? (prefersDark.value ? 'dark' : 'light') : mode.value,
)

watch(
  resolved,
  (value) => {
    document.documentElement.classList.toggle('dark', value === 'dark')
  },
  { immediate: true },
)

/** Kept for API compatibility: applying the theme is already immediate via the watcher. */
export function initTheme(): void {
  document.documentElement.classList.toggle('dark', resolved.value === 'dark')
}

export function useTheme() {
  return {
    /** The user's choice: light, dark, or system. */
    mode,
    /** The effective theme actually applied. */
    resolved,
    isDark: computed(() => resolved.value === 'dark'),
    setThemeMode(value: ThemeMode): void {
      mode.value = value
      localStorage.setItem(STORAGE_KEY, value)
    },
  }
}
