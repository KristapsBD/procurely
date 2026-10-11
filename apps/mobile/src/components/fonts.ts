import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans';
import { useFonts } from 'expo-font';
import { fonts } from './theme';

const sources = {
  [fonts.regular]: IBMPlexSans_400Regular,
  [fonts.medium]: IBMPlexSans_500Medium,
  [fonts.semibold]: IBMPlexSans_600SemiBold,
  [fonts.mono]: IBMPlexMono_500Medium,
};

/** True once the Ledger families are registered, or once loading failed (system fonts then show). */
export function useLedgerFonts(): boolean {
  const [loaded, error] = useFonts(sources);
  return loaded || error !== null;
}
