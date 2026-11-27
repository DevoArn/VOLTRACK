import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: { junit: 'test-results/unit-junit.xml' },
    coverage: {
      provider: 'v8',
      // Logic layer covered by unit tests. UI wiring is covered by the Playwright suite,
      // and the AudioWorklet DSP is exercised by the dsp-*.test.ts suites.
      include: [
        'src/core/**/*.ts',
        'src/modules/**/*.ts',
        'src/acid/patterns.ts',
        'src/presets.ts',
        'src/va/**/*.ts',
        'src/ui/controls.ts',
      ],
      exclude: ['src/**/*.d.ts', 'src/va/va.ts', 'src/modules/ui-bits.ts'],
      reporter: ['text-summary', 'json-summary', 'lcov', 'html'],
      reportsDirectory: 'coverage',
      // Ratchet: CI fails if coverage drops below today's level. Raise these as tests are added.
      thresholds: { statements: 45, branches: 42, functions: 45, lines: 45 },
    },
  },
});
