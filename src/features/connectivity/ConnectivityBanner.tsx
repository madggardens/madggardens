import { useOnlineStatus } from './useOnlineStatus';

export function ConnectivityBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      className="sticky top-0 z-[1000] bg-amber-300 px-4 py-3 text-center text-sm font-semibold text-stone-950"
      role="status"
    >
      No tienes conexión. Puedes consultar lo que ya está cargado, pero no enviar cambios.
    </div>
  );
}
