import { configure } from '@testing-library/react-native';

// A cold transform cache makes the first render slow; the default 1s is too tight for CI.
configure({ asyncUtilTimeout: 4000 });
