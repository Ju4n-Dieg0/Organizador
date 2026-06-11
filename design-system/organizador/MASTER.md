# Design System Master File — v2 "Midnight Glass"

> **LOGIC:** When building a specific page, first check `design-system/organizador/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Organizador
**Updated:** 2026-06-11 (v2 — rediseño dark por preferencia del usuario)
**Category:** Agency Client Management — Dark Glass Dashboard
**Mode:** DARK ONLY. No existe modo claro.

---

## Concepto

Dashboard oscuro, limpio y NO corporativo, estilo Linear/macOS: fondo en degradado
índigo profundo con blobs ambientales difuminados, superficies de vidrio (glass) con
bordes hairline, **dock de navegación flotante** (no sidebar), una sola fuente con
jerarquía por peso, y un solo acento índigo.

## Color Palette (tokens — única fuente de hex)

| Role | Value | Token |
|------|-------|-------|
| Fondo profundo (base gradiente) | `#020203` | `bgDeep` |
| Fondo base (top gradiente) | `#0a0a0f` | `bgBase` |
| Superficie elevada (cards sólidas, modals, drawers, dropdowns) | `#101016` | `bgElevated` |
| Glass surface (cards translúcidas) | `rgba(255,255,255,0.04)` | `surfaceGlass` |
| Glass hover | `rgba(255,255,255,0.07)` | `surfaceGlassHover` |
| Borde hairline | `rgba(255,255,255,0.08)` | `borderGlass` |
| Borde enfatizado | `rgba(255,255,255,0.14)` | `borderStrong` |
| Texto primario | `#EDEDEF` | `text` |
| Texto secundario | `#8A8F98` | `textMuted` |
| Acento (único) | `#6E79F4` | `accent` (índigo Linear, aclarado para contraste AA sobre dark) |
| Acento glow | `rgba(110,121,244,0.25)` | `accentGlow` |
| Éxito | `#4ADE80` | `success` |
| Advertencia (EXTENDIDO) | `#FBBF24` | `warning` |
| Error / destructivo | `#F87171` | `error` |
| Info (ASIGNADO) | `#60A5FA` | `info` |

Notas:
- NUNCA `#000000` puro de fondo (degradado `bgBase → bgDeep`).
- Semánticos claros (`#4ADE80`/`#FBBF24`/`#F87171`/`#60A5FA`) porque sobre fondo oscuro
  los tonos 500 de Tailwind no pasan contraste; estos sí (≥3:1 en UI, texto de estado siempre acompañado de label).
- Un solo acento. El verde solo para éxito semántico, jamás como segundo acento decorativo.

### Fondo de sistema (app shell)

```css
/* capa fija detrás de todo, pointer-events: none */
background:
  radial-gradient(600px 400px at 15% 10%, rgba(110,121,244,0.14), transparent 60%),
  radial-gradient(700px 500px at 85% 85%, rgba(76,29,149,0.12), transparent 60%),
  linear-gradient(180deg, #0a0a0f 0%, #020203 100%);
```
+ 2 blobs ambientales (divs absolutos, `filter: blur(80px)`, opacidad 0.08–0.12,
oscilación lenta con framer-motion solo `transform`, desactivada con reduced-motion).

## Typography

- **Única fuente:** `Plus Jakarta Sans` (300–800). Jerarquía por peso, no por familia:
  headings 700 con tracking `-0.02em`, body 400, labels 500, datos/KPIs 600–700.
- **Números/IDs/fechas en tablas:** `font-variant-numeric: tabular-nums`.
- Body ≥ 14px en tablas densas, 16px en formularios. Texto secundario con `textMuted`, nunca gris sobre gris ilegible.

```css
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
```

## Superficies (glass)

- **Card glass:** `surfaceGlass` + `border: 1px solid borderGlass` + `border-radius: 16px`
  + `box-shadow: inset 0 1px 1px rgba(255,255,255,0.06)` (refracción de borde). SIN sombras negras duras.
- **Doble bisel para contenedores hero/KPI:** shell exterior `rgba(255,255,255,0.03)`,
  radius 20px, padding 6px; núcleo interior radius 14px con su propio borde.
- **backdrop-blur SOLO en elementos fijos** (dock, headers sticky, overlays de modal): `backdrop-filter: blur(16px)`.
  Nunca blur en contenedores que scrollean (mata el rendimiento).
- Modals/drawers/dropdowns de AntD: fondo SÓLIDO `bgElevated` (no translúcido) para legibilidad,
  overlay `rgba(2,2,3,0.6)` + blur 8px.

## Navegación: Dock flotante (NO sidebar)

- Pill vertical flotante a la izquierda: `position: fixed`, separada de los bordes (`left: 16px`, centrada verticalmente),
  `border-radius: 9999px`, glass + blur, ancho ~56–64px, padding vertical 12px.
- Solo iconos (≥20px) con `Tooltip` a la derecha; item activo = círculo relleno `accent` con glow suave; los demás `textMuted` → hover `text`.
- Targets ≥44×44px. `aria-label` en cada item. Logout y usuario al fondo del dock, separados por divider hairline.
- El contenido NO queda debajo del dock: `padding-left` del main ≥ 96px en desktop.
- **Móvil (<768px):** el dock pasa a barra flotante horizontal inferior (pill, `bottom: 12px`, máx 5 items), main con `padding-bottom` de resguardo.

## Motion

- Easing global: `cubic-bezier(0.16, 1, 0.3, 1)` (expo-out). Entradas 200–300ms, salidas ~60% del tiempo de entrada.
- Entrada de páginas: fade + `translateY(12px)` → 0. Stagger de listas/cards: 30–50ms por item.
- Press: `scale(0.97)`; hover de cards: elevar fondo a `surfaceGlassHover` (sin mover layout).
- Kanban drag: la card levantada escala 1.03 con glow `accentGlow`; columna destino resalta su borde.
- Solo `transform`/`opacity`. `useReducedMotion` SIEMPRE respetado (blobs y stagger desactivados).

## Componentes clave

- **KPI cards:** doble bisel, número grande (28–32px, weight 700, tabular), label 12px `textMuted` uppercase tracking 0.08em, icono en chip circular con `accentGlow`.
- **Tablas:** densas, header 12px uppercase `textMuted`, filas hover `surfaceGlass`, divisores `borderGlass`, sin zebra.
- **Tags de estado:** PENDIENTE=`textMuted`, ASIGNADO=`info`, TERMINADO=`success`, EXTENDIDO=`warning` — siempre con texto, fondo al 12% del color, borde al 25%.
- **Kanban:** 4 columnas glass (header: nombre + contador en chip), cards con título, cliente, avatares de asignados, fecha con indicador de vencimiento; drag&drop entre columnas dispara la transición de dominio (con modal cuando requiere datos: asignar/extender).
- **Botón primario:** pill (`border-radius: 9999px`), fondo `accent`, glow `0 0 24px accentGlow` en hover, texto `onAccent #0a0a0f` (oscuro: blanco sobre accent solo da 3.7:1, no pasa AA).
- **Inputs:** fondo `rgba(255,255,255,0.05)`, borde `borderGlass`, focus: borde `accent` + ring `accentGlow`. Labels visibles SIEMPRE.

## Anti-Patterns (Do NOT Use)

- ❌ Modo claro o superficies blancas
- ❌ `#000000` puro / sombras negras duras (`rgba(0,0,0,0.3+)`)
- ❌ Sidebar corporativo de ancho completo (usar dock flotante)
- ❌ Más de un acento decorativo
- ❌ blur sobre contenedores con scroll
- ❌ Emojis como iconos; iconos de trazos gruesos inconsistentes
- ❌ Bordes `1px solid gray` genéricos (siempre hairline rgba blanco)
- ❌ Transiciones `linear`/`ease-in-out` o cambios instantáneos
- ❌ Texto bajo 4.5:1 de contraste sobre las superficies glass

## Pre-Delivery Checklist

- [ ] Fondo degradado + blobs presentes y fijos (no scrollean, no interceptan clicks)
- [ ] Dock flotante con tooltips, aria-labels, item activo visible, versión móvil inferior
- [ ] Cero hex crudos en componentes (todo vía `theme/tokens`)
- [ ] Contraste: `#EDEDEF` sobre glass ≥ 4.5:1; estados con label de texto
- [ ] Tabular-nums en columnas numéricas y fechas
- [ ] Kanban: drag respeta transiciones de dominio y pide razón/datos cuando aplica
- [ ] `useReducedMotion` desactiva blobs/stagger/drag-glow
- [ ] Focus visible en todo; targets ≥44px; usable a 375px sin scroll horizontal
- [ ] Modals/dropdowns con fondo sólido `bgElevated` legible
