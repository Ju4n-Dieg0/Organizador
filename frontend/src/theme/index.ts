import { theme } from 'antd';
import type { ThemeConfig } from 'antd';
import { colors, fonts, radii } from './tokens';

/**
 * Tema AntD "Midnight Glass" (design-system/organizador/MASTER.md).
 * DARK ONLY: darkAlgorithm + overrides de tokens del design system.
 */
export const themeConfig: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: colors.accent,
    colorInfo: colors.info,
    colorSuccess: colors.success,
    colorWarning: colors.warning,
    colorError: colors.error,
    colorBgBase: colors.bgBase,
    colorBgLayout: 'transparent',
    colorBgElevated: colors.bgElevated,
    colorBgContainer: colors.bgElevated,
    colorBgSpotlight: colors.bgElevated,
    // Texto de botones/controles sólidos sobre accent: oscuro para AA (≈5.2:1).
    colorTextLightSolid: colors.onAccent,
    colorText: colors.text,
    colorTextSecondary: colors.textMuted,
    colorTextTertiary: colors.textMuted,
    colorBorder: colors.borderGlass,
    colorBorderSecondary: colors.borderGlass,
    colorSplit: colors.borderGlass,
    borderRadius: radii.base,
    borderRadiusLG: radii.card,
    fontFamily: fonts.body,
    controlOutline: colors.accentGlow,
    colorBgMask: colors.overlay,
  },
  components: {
    // Tablas glass: el contenedor es transparente para que se vea la card glass.
    Table: {
      colorBgContainer: 'transparent',
      headerBg: 'transparent',
      headerColor: colors.textMuted,
      headerSplitColor: 'transparent',
      rowHoverBg: colors.surfaceGlass,
      borderColor: colors.borderGlass,
      cellPaddingBlockSM: 10,
      headerBorderRadius: 0,
    },
    // Superficies elevadas SÓLIDAS (legibilidad, MASTER §Superficies).
    Modal: {
      contentBg: colors.bgElevated,
      headerBg: colors.bgElevated,
      titleFontSize: 17,
    },
    Drawer: {
      colorBgElevated: colors.bgElevated,
    },
    Select: {
      colorBgElevated: colors.bgElevated,
      colorBgContainer: colors.surfaceInput,
      optionSelectedBg: colors.surfaceGlassHover,
      controlHeight: 40,
    },
    Dropdown: {
      colorBgElevated: colors.bgElevated,
    },
    DatePicker: {
      colorBgElevated: colors.bgElevated,
      colorBgContainer: colors.surfaceInput,
      controlHeight: 40,
    },
    Input: {
      colorBgContainer: colors.surfaceInput,
      activeBorderColor: colors.accent,
      hoverBorderColor: colors.borderStrong,
      controlHeight: 40,
    },
    InputNumber: {
      colorBgContainer: colors.surfaceInput,
    },
    Button: {
      controlHeight: 40,
      borderRadius: radii.pill,
      borderRadiusLG: radii.pill,
      borderRadiusSM: radii.pill,
      primaryShadow: 'none',
      defaultShadow: 'none',
      defaultBg: colors.surfaceGlass,
      defaultBorderColor: colors.borderGlass,
    },
    Segmented: {
      itemSelectedBg: colors.surfaceGlassHover,
      trackBg: colors.surfaceGlass,
      borderRadius: radii.base,
    },
    Card: {
      colorBgContainer: colors.surfaceGlass,
      borderRadiusLG: radii.card,
    },
    Descriptions: {
      labelBg: colors.surfaceGlass,
    },
    Tooltip: {
      colorBgSpotlight: colors.bgElevated,
    },
    Popconfirm: {
      colorBgElevated: colors.bgElevated,
    },
    Timeline: {
      tailColor: colors.borderGlass,
    },
    Skeleton: {
      gradientFromColor: colors.surfaceGlass,
      gradientToColor: colors.surfaceGlassHover,
    },
    Avatar: {
      colorBgContainer: colors.surfaceGlassHover,
    },
    Pagination: {
      itemBg: 'transparent',
      itemActiveBg: colors.surfaceGlassHover,
    },
    Message: {
      contentBg: colors.bgElevated,
    },
  },
};

export {
  colors,
  fonts,
  radii,
  shadows,
  motionTokens,
  appBackground,
  taskStatusColor,
  withAlpha,
} from './tokens';
