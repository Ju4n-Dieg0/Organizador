import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Badge, Dropdown, Grid, Tooltip } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import {
  AppstoreOutlined,
  DashboardOutlined,
  IdcardOutlined,
  InboxOutlined,
  LogoutOutlined,
  ScheduleOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { ROUTES } from '../../constants/routes';
import { useAuth } from '../../hooks/useAuth';
import { usePendingRequests } from '../../hooks/useRequests';
import { colors, radii, shadows } from '../../theme';

interface DockItemDef {
  key: string;
  icon: ReactNode;
  label: string;
}

const NAV_ITEMS: DockItemDef[] = [
  { key: ROUTES.dashboard, icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: ROUTES.clients, icon: <TeamOutlined />, label: 'Clientes' },
  { key: ROUTES.plans, icon: <AppstoreOutlined />, label: 'Planes' },
  { key: ROUTES.team, icon: <IdcardOutlined />, label: 'Equipo' },
  { key: ROUTES.tasks, icon: <ScheduleOutlined />, label: 'Pendientes' },
  { key: ROUTES.requests, icon: <InboxOutlined />, label: 'Solicitudes' },
];

const dockShell: CSSProperties = {
  position: 'fixed',
  zIndex: 100,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  background: colors.surfaceGlass,
  border: `1px solid ${colors.borderGlass}`,
  borderRadius: radii.pill,
  boxShadow: shadows.glassInset,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
};

interface DockButtonProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  danger?: boolean;
  tooltipPlacement: 'right' | 'top';
  /** Contador en badge sobre el icono (oculto si 0/undefined). */
  badgeCount?: number;
  onClick?: () => void;
}

function DockButton({
  icon,
  label,
  active = false,
  danger = false,
  tooltipPlacement,
  badgeCount,
  onClick,
}: DockButtonProps) {
  const ariaLabel = badgeCount
    ? `${label} (${badgeCount} pendiente${badgeCount === 1 ? '' : 's'})`
    : label;
  return (
    <Tooltip title={label} placement={tooltipPlacement}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-current={active ? 'page' : undefined}
        onClick={onClick}
        className={`dock-item${active ? ' dock-item-active' : ''}`}
        style={{
          width: 44,
          height: 44,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          border: 'none',
          borderRadius: radii.pill,
          background: active ? colors.accent : 'transparent',
          color: active ? colors.onAccent : danger ? colors.error : colors.textMuted,
          boxShadow: active ? shadows.dockGlow : 'none',
        }}
      >
        {badgeCount ? (
          // title="" evita anunciar el conteo dos veces (ya va en el aria-label).
          // warning (no error): "pendiente de acción", consistente con la feature.
          <Badge
            count={badgeCount}
            size="small"
            offset={[4, -4]}
            title=""
            style={{ background: colors.warning, color: colors.onAccent }}
          >
            <span style={{ color: 'inherit', fontSize: 'inherit' }}>{icon}</span>
          </Badge>
        ) : (
          icon
        )}
      </button>
    </Tooltip>
  );
}

/**
 * Dock de navegación flotante (MASTER §Navegación): pill glass con blur,
 * solo iconos con tooltip y aria-label; item activo en círculo accent con
 * glow; usuario/logout al fondo tras divider hairline.
 * En <768px se convierte en barra pill flotante inferior (máx 5 items).
 */
export function Dock() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const screens = Grid.useBreakpoint();
  const isMobile = screens.md === false;
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  // Badge de solicitudes pendientes (polling 30s; pueden resolverse por Telegram).
  const { data: pendingRequests } = usePendingRequests();
  const pendingCount = pendingRequests?.length ?? 0;
  const badgeFor = (key: string) =>
    key === ROUTES.requests && pendingCount > 0 ? pendingCount : undefined;

  const activeKey = useMemo(() => {
    const { pathname } = location;
    if (pathname === ROUTES.dashboard) return ROUTES.dashboard;
    const match = NAV_ITEMS.find(
      (item) => item.key !== ROUTES.dashboard && pathname.startsWith(item.key),
    );
    return match?.key ?? ROUTES.dashboard;
  }, [location]);

  if (isMobile) {
    // Barra inferior: 4 secciones principales + menú de usuario (máx 5 items).
    // Planes y Equipo viven en el menú; Solicitudes queda en la barra (badge).
    const menuRoutes: string[] = [ROUTES.plans, ROUTES.team];
    const mobileItems = NAV_ITEMS.filter((item) => !menuRoutes.includes(item.key));
    // La ruta activa vive dentro del menú: se indica con un dot accent sobre
    // el trigger (no marcando el botón del menú como item activo completo).
    const activeInsideMenu = menuRoutes.includes(activeKey);
    return (
      <nav
        aria-label="Navegación principal"
        style={{
          ...dockShell,
          flexDirection: 'row',
          bottom: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '8px 12px',
        }}
      >
        {mobileItems.map((item) => (
          <DockButton
            key={item.key}
            icon={item.icon}
            label={item.label}
            active={activeKey === item.key}
            badgeCount={badgeFor(item.key)}
            tooltipPlacement="top"
            onClick={() => navigate(item.key)}
          />
        ))}
        <Dropdown
          trigger={['click']}
          placement="topRight"
          onOpenChange={setUserMenuOpen}
          menu={{
            selectable: true,
            selectedKeys: [activeKey],
            items: [
              {
                key: ROUTES.plans,
                icon: <AppstoreOutlined />,
                label: 'Planes',
                onClick: () => navigate(ROUTES.plans),
              },
              {
                key: ROUTES.team,
                icon: <IdcardOutlined />,
                label: 'Equipo',
                onClick: () => navigate(ROUTES.team),
              },
              { type: 'divider' },
              {
                key: 'logout',
                icon: <LogoutOutlined />,
                label: 'Cerrar sesión',
                danger: true,
                onClick: logout,
              },
            ],
          }}
        >
          <button
            type="button"
            aria-label={`Menú de usuario: ${user?.name ?? 'Usuario'}${activeInsideMenu ? ' (sección actual dentro del menú)' : ''}`}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            className="dock-item"
            style={{
              position: 'relative',
              width: 44,
              height: 44,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              border: 'none',
              borderRadius: radii.pill,
              background: 'transparent',
              color: colors.textMuted,
            }}
          >
            <UserOutlined />
            {activeInsideMenu && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  width: 6,
                  height: 6,
                  borderRadius: radii.pill,
                  background: colors.accent,
                  boxShadow: shadows.dockGlow,
                }}
              />
            )}
          </button>
        </Dropdown>
      </nav>
    );
  }

  return (
    <nav
      aria-label="Navegación principal"
      style={{
        ...dockShell,
        flexDirection: 'column',
        left: 16,
        top: '50%',
        transform: 'translateY(-50%)',
        padding: '12px 8px',
        width: 60,
      }}
    >
      {NAV_ITEMS.map((item) => (
        <DockButton
          key={item.key}
          icon={item.icon}
          label={item.label}
          active={activeKey === item.key}
          badgeCount={badgeFor(item.key)}
          tooltipPlacement="right"
          onClick={() => navigate(item.key)}
        />
      ))}

      <div
        aria-hidden
        style={{
          width: 28,
          height: 1,
          background: colors.borderGlass,
          margin: '6px 0',
        }}
      />

      {/* Botón enfocable: el Tooltip con el nombre se muestra también por focus. */}
      <Tooltip title={user?.name ?? 'Usuario'} placement="right">
        <button
          type="button"
          aria-label={`Sesión de ${user?.name ?? 'Usuario'}`}
          style={{
            width: 36,
            height: 36,
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radii.pill,
            background: colors.surfaceGlassHover,
            border: `1px solid ${colors.borderGlass}`,
            color: colors.text,
            fontSize: 14,
            fontWeight: 600,
            userSelect: 'none',
            cursor: 'default',
          }}
        >
          {(user?.name ?? 'U').charAt(0).toUpperCase()}
        </button>
      </Tooltip>
      <DockButton
        icon={<LogoutOutlined />}
        label="Cerrar sesión"
        danger
        tooltipPlacement="right"
        onClick={logout}
      />
    </nav>
  );
}
