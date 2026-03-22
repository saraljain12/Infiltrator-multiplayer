// In dev mode use sessionStorage (per-tab) so multiple tabs can simulate different players.
// In production use localStorage so sessions persist across page refreshes.
const storage = import.meta.env.DEV ? sessionStorage : localStorage;
export default storage;
