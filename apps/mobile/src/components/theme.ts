/** Every colour the kit paints with, by role. A dark palette is another object of this shape. */
export type Palette = {
  ground: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  divider: string;
  control: string;
  controlTrack: string;
  accent: string;
  accentTint: string;
  onAccent: string;
  pending: string;
  pendingTint: string;
  rejected: string;
  rejectedTint: string;
};

export const lightPalette: Palette = {
  ground: '#F6F7F5',
  surface: '#FFFFFF',
  ink: '#16201B',
  muted: '#5B665F',
  line: '#E2E6E1',
  divider: '#EEF1ED',
  control: '#CDD3CC',
  controlTrack: '#E8ECE7',
  accent: '#1F6B4A',
  accentTint: '#E3F1E9',
  onAccent: '#FFFFFF',
  pending: '#8A4B00',
  pendingTint: '#FBF1DF',
  rejected: '#A12C2C',
  rejectedTint: '#F7E4E2',
};

/** Family names as expo-font registers them (see `ledgerFonts`). */
export const fonts = {
  regular: 'IBMPlexSans_400Regular',
  medium: 'IBMPlexSans_500Medium',
  semibold: 'IBMPlexSans_600SemiBold',
  mono: 'IBMPlexMono_500Medium',
} as const;

export const theme = {
  palette: lightPalette,
  fonts,
  radius: { card: 14, control: 12, chip: 10, badge: 6 },
  /** Smallest touch target, in points. */
  controlHeight: 44,
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 },
} as const;
