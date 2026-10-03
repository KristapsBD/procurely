import { configure } from '@testing-library/react-native';

// A cold transform cache makes the first render slow; the default 1s is too tight for CI, and so
// is Jest's default 5s for the first test of a file while several files transform in parallel.
configure({ asyncUtilTimeout: 4000 });
jest.setTimeout(15000);
