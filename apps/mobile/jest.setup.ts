import { configure } from '@testing-library/react-native';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

// A cold transform cache makes the first render slow; the default 1s is too tight for CI.
configure({ asyncUtilTimeout: 4000 });

// React Native requires each component on first access. With a cold transform cache that
// first access can take seconds, and inside a test it eats into the wait for the screen.
// Touch them here, before any test's clock starts.
void [ActivityIndicator, Pressable, ScrollView, Text, TextInput, View];
