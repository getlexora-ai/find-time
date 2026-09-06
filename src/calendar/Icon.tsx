import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

/**
 * The ~30 Solar `*-linear` icons the calendar reference uses, ported as
 * react-native-svg line glyphs (24×24, stroke 1.5, round caps) to keep the
 * identity without an Iconify dependency (HANDOFF.md §5). Shapes are deliberately
 * simple but each is distinct — the shield / triangle / magic-stick / cup glyphs
 * are the "never colour alone" carriers (spec §6).
 */
export type IconName =
  | 'sun'
  | 'folder'
  | 'calendar'
  | 'calendar-add'
  | 'magic'
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-down'
  | 'arrow-right-up'
  | 'transfer'
  | 'eye'
  | 'shield'
  | 'dots'
  | 'search'
  | 'palette'
  | 'bell'
  | 'add'
  | 'triangle'
  | 'close'
  | 'check'
  | 'cup'
  | 'clock'
  | 'bolt'
  | 'chart'
  | 'bulb'
  | 'pen'
  | 'trash'
  | 'refresh'
  | 'cursor'
  | 'mic'
  | 'stars';

type Props = { name: IconName; size?: number; color?: string; strokeWidth?: number };

export function Icon({ name, size = 16, color = 'currentColor', strokeWidth = 1.5 }: Props) {
  const p = { stroke: color, strokeWidth, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {glyph(name, p)}
    </Svg>
  );
}

function glyph(name: IconName, p: Record<string, unknown>) {
  switch (name) {
    case 'sun':
      return (
        <>
          <Circle cx={12} cy={12} r={4} {...p} />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
            const r = (a * Math.PI) / 180;
            return (
              <Line
                key={a}
                x1={12 + Math.cos(r) * 7}
                y1={12 + Math.sin(r) * 7}
                x2={12 + Math.cos(r) * 9.5}
                y2={12 + Math.sin(r) * 9.5}
                {...p}
              />
            );
          })}
        </>
      );
    case 'folder':
      return (
        <>
          <Path d="M3 7.5C3 6 4 5 5.5 5H9l2 2.5h7.5C20 7.5 21 8.5 21 10v7c0 1.5-1 2.5-2.5 2.5h-13C4 19.5 3 18.5 3 17V7.5Z" {...p} />
          <Line x1={7} y1={11} x2={17} y2={11} {...p} />
        </>
      );
    case 'calendar':
      return (
        <>
          <Rect x={3} y={5} width={18} height={16} rx={3} {...p} />
          <Line x1={3} y1={9.5} x2={21} y2={9.5} {...p} />
          <Line x1={8} y1={3} x2={8} y2={6} {...p} />
          <Line x1={16} y1={3} x2={16} y2={6} {...p} />
        </>
      );
    case 'calendar-add':
      return (
        <>
          <Rect x={3} y={5} width={18} height={16} rx={3} {...p} />
          <Line x1={3} y1={9.5} x2={21} y2={9.5} {...p} />
          <Line x1={12} y1={12.5} x2={12} y2={18} {...p} />
          <Line x1={9.25} y1={15.25} x2={14.75} y2={15.25} {...p} />
        </>
      );
    case 'magic':
      return (
        <>
          <Line x1={5} y1={19} x2={15} y2={9} {...p} />
          <Path d="M15 9l2-2" {...p} />
          <Path d="M17 3.5l.6 1.4 1.4.6-1.4.6L17 7.5l-.6-1.4L15 5.5l1.4-.6L17 3.5Z" {...p} />
          <Path d="M6.5 5l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4.4-1Z" {...p} />
          <Path d="M19 13l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4.4-1Z" {...p} />
        </>
      );
    case 'arrow-left':
      return <Polyline points="14 6 8 12 14 18" {...p} />;
    case 'arrow-right':
      return <Polyline points="10 6 16 12 10 18" {...p} />;
    case 'arrow-down':
      return <Polyline points="6 10 12 16 18 10" {...p} />;
    case 'arrow-right-up':
      return (
        <>
          <Line x1={7} y1={17} x2={17} y2={7} {...p} />
          <Polyline points="9 7 17 7 17 15" {...p} />
        </>
      );
    case 'transfer':
      return (
        <>
          <Polyline points="8 7 4 11 8 15" {...p} />
          <Line x1={4} y1={11} x2={15} y2={11} {...p} />
          <Polyline points="16 9 20 13 16 17" {...p} />
          <Line x1={20} y1={13} x2={9} y2={13} {...p} />
        </>
      );
    case 'eye':
      return (
        <>
          <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" {...p} />
          <Circle cx={12} cy={12} r={3} {...p} />
        </>
      );
    case 'shield':
      return (
        <>
          <Path d="M12 3l7 2.5v5.5c0 5-3 8-7 9.5-4-1.5-7-4.5-7-9.5V5.5L12 3Z" {...p} />
          <Polyline points="9 12 11 14 15 9.5" {...p} />
        </>
      );
    case 'dots':
      return (
        <>
          <Circle cx={5} cy={12} r={1.4} fill={p.stroke as string} stroke="none" />
          <Circle cx={12} cy={12} r={1.4} fill={p.stroke as string} stroke="none" />
          <Circle cx={19} cy={12} r={1.4} fill={p.stroke as string} stroke="none" />
        </>
      );
    case 'search':
      return (
        <>
          <Circle cx={11} cy={11} r={6} {...p} />
          <Line x1={15.5} y1={15.5} x2={20} y2={20} {...p} />
        </>
      );
    case 'palette':
      return (
        <>
          <Path d="M12 3c5 0 9 3.7 9 8.3 0 2.6-2.1 3.7-4 3.7h-1.6c-1 0-1.9.9-1.9 1.9 0 .5.2.9.5 1.3.3.4.5.8.5 1.3 0 1-.9 1.7-2 1.7-5 0-9-4-9-9s4-10 10.4-10Z" {...p} />
          <Circle cx={8} cy={11} r={1.1} fill={p.stroke as string} stroke="none" />
          <Circle cx={12} cy={8} r={1.1} fill={p.stroke as string} stroke="none" />
          <Circle cx={16} cy={11} r={1.1} fill={p.stroke as string} stroke="none" />
        </>
      );
    case 'bell':
      return (
        <>
          <Path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2H4.5L6 16Z" {...p} />
          <Path d="M10 18.5a2 2 0 0 0 4 0" {...p} />
        </>
      );
    case 'add':
      return (
        <>
          <Circle cx={12} cy={12} r={9} {...p} />
          <Line x1={12} y1={8} x2={12} y2={16} {...p} />
          <Line x1={8} y1={12} x2={16} y2={12} {...p} />
        </>
      );
    case 'triangle':
      return (
        <>
          <Path d="M12 4.5l8.5 14.5H3.5L12 4.5Z" {...p} />
          <Line x1={12} y1={10} x2={12} y2={14} {...p} />
          <Circle cx={12} cy={16.5} r={0.8} fill={p.stroke as string} stroke="none" />
        </>
      );
    case 'close':
      return (
        <>
          <Circle cx={12} cy={12} r={9} {...p} />
          <Line x1={9} y1={9} x2={15} y2={15} {...p} />
          <Line x1={15} y1={9} x2={9} y2={15} {...p} />
        </>
      );
    case 'check':
      return (
        <>
          <Circle cx={12} cy={12} r={9} {...p} />
          <Polyline points="8 12 11 15 16 9" {...p} />
        </>
      );
    case 'cup':
      return (
        <>
          <Path d="M4 8h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Z" {...p} />
          <Path d="M16 9h2.5a2.5 2.5 0 0 1 0 5H16" {...p} />
          <Line x1={7} y1={3} x2={7} y2={5} {...p} />
          <Line x1={11} y1={3} x2={11} y2={5} {...p} />
        </>
      );
    case 'clock':
      return (
        <>
          <Circle cx={12} cy={12} r={9} {...p} />
          <Polyline points="12 7 12 12 15.5 14" {...p} />
        </>
      );
    case 'bolt':
      return <Path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z" {...p} />;
    case 'chart':
      return (
        <>
          <Line x1={4} y1={20} x2={20} y2={20} {...p} />
          <Rect x={6} y={12} width={3} height={6} {...p} />
          <Rect x={11} y={8} width={3} height={10} {...p} />
          <Rect x={16} y={4} width={3} height={14} {...p} />
        </>
      );
    case 'bulb':
      return (
        <>
          <Path d="M9 16.5A6 6 0 1 1 15 16.5" {...p} />
          <Line x1={10} y1={19} x2={14} y2={19} {...p} />
          <Line x1={10.5} y1={21} x2={13.5} y2={21} {...p} />
        </>
      );
    case 'pen':
      return (
        <>
          <Path d="M5 19h4L19 9l-4-4L5 15v4Z" {...p} />
          <Line x1={13} y1={7} x2={17} y2={11} {...p} />
        </>
      );
    case 'trash':
      return (
        <>
          <Line x1={4} y1={7} x2={20} y2={7} {...p} />
          <Path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" {...p} />
          <Path d="M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 16.5 5v2" {...p} />
        </>
      );
    case 'refresh':
      return (
        <>
          <Path d="M20 12a8 8 0 1 1-2.3-5.6" {...p} />
          <Polyline points="18 3 18 7 14 7" {...p} />
        </>
      );
    case 'cursor':
      return <Path d="M6 4l12 6-5 2-2 5-5-13Z" {...p} />;
    case 'mic':
      return (
        <>
          <Rect x={9} y={3} width={6} height={11} rx={3} {...p} />
          <Path d="M6 11a6 6 0 0 0 12 0" {...p} />
          <Line x1={12} y1={17} x2={12} y2={21} {...p} />
        </>
      );
    case 'stars':
      return (
        <>
          <Path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4Z" {...p} />
          <Path d="M18 15l.7 1.8L20.5 17.5 18.7 18.2 18 20l-.7-1.8L15.5 17.5 17.3 16.8 18 15Z" {...p} />
        </>
      );
    default:
      return null;
  }
}
