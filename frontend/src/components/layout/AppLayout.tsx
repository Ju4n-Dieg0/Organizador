import { Outlet } from 'react-router-dom';
import { Grid } from 'antd';
import { AppBackground } from './AppBackground';
import { Dock } from './Dock';

/**
 * App shell "Midnight Glass": fondo fijo con gradiente + blobs, dock de
 * navegación flotante (sin sidebar ni header corporativo) y main despejado
 * del dock (padding-left ≥ 96px en desktop, resguardo inferior en móvil).
 */
export function AppLayout() {
  const screens = Grid.useBreakpoint();
  const isMobile = screens.md === false;

  return (
    <div style={{ minHeight: '100vh' }}>
      <AppBackground />
      <Dock />
      <main
        style={{
          position: 'relative',
          zIndex: 1,
          minHeight: '100vh',
          padding: isMobile ? '24px 16px 110px' : '36px 32px 48px 112px',
        }}
      >
        <div style={{ maxWidth: 1320, marginInline: 'auto' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
