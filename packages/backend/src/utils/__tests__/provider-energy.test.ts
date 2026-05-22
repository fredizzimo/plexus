import { describe, test, expect } from 'vitest';
import { applyProviderReportedEnergy } from '../provider-energy';
import type { UsageRecord } from '../../types/usage';
import { DEFAULT_GPU_PARAMS, DEFAULT_MODEL } from '@plexus/shared';

function createUsageRecord(overrides: Partial<UsageRecord> = {}): Partial<UsageRecord> {
  return {
    requestId: 'test-123',
    tokensInput: 100,
    tokensOutput: 50,
    kwhUsed: null,
    energyAvgPowerWatts: null,
    energyDurationSeconds: null,
    energyAttributionMethod: null,
    energyAttributionRatio: null,
    energyRatioWasCapped: null,
    energyUncappedKwh: null,
    ...overrides,
  };
}

const defaultFallback = {
  tokensInput: 500,
  tokensOutput: 200,
  modelParams: DEFAULT_MODEL,
  gpuParams: DEFAULT_GPU_PARAMS,
};

describe('applyProviderReportedEnergy', () => {
  describe('with valid provider-reported energy', () => {
    test('sets kwhUsed from energy_kwh', () => {
      const record = createUsageRecord();
      applyProviderReportedEnergy(
        record,
        {
          energy_kwh: 0.000056025,
          avg_power_watts: 2914,
          duration_seconds: 0.989,
        },
        defaultFallback
      );

      expect(record.kwhUsed).toBe(0.000056025);
    });

    test('handles scientific notation for energy_kwh', () => {
      const record = createUsageRecord();
      applyProviderReportedEnergy(
        record,
        {
          energy_kwh: 5.2904e-5,
        },
        defaultFallback
      );

      expect(record.kwhUsed).toBeCloseTo(5.2904e-5, 10);
    });

    test('handles zero energy_kwh', () => {
      const record = createUsageRecord();
      applyProviderReportedEnergy(
        record,
        {
          energy_kwh: 0,
        },
        defaultFallback
      );

      expect(record.kwhUsed).toBe(0);
    });
  });

  describe('fallback to estimation', () => {
    test('falls back to estimation when energyData is null', () => {
      const record = createUsageRecord();
      applyProviderReportedEnergy(record, null, defaultFallback);

      expect(record.kwhUsed).toBeGreaterThan(0);
    });

    test('falls back to estimation when energyData is undefined', () => {
      const record = createUsageRecord();
      applyProviderReportedEnergy(record, undefined, defaultFallback);

      expect(record.kwhUsed).toBeGreaterThan(0);
    });

    test('falls back to estimation when energy_kwh is missing', () => {
      const record = createUsageRecord();
      applyProviderReportedEnergy(
        record,
        {
          avg_power_watts: 1500,
        },
        defaultFallback
      );

      expect(record.kwhUsed).toBeGreaterThan(0);
    });
  });

  describe('invalid energy_kwh leaves kwhUsed unchanged', () => {
    test('leaves kwhUsed unchanged when energy_kwh is NaN', () => {
      const record = createUsageRecord();
      applyProviderReportedEnergy(
        record,
        {
          energy_kwh: NaN,
        },
        defaultFallback
      );

      expect(record.kwhUsed).toBeNull();
    });

    test('leaves kwhUsed unchanged when energy_kwh is negative', () => {
      const record = createUsageRecord();
      applyProviderReportedEnergy(
        record,
        {
          energy_kwh: -0.001,
        },
        defaultFallback
      );

      expect(record.kwhUsed).toBeNull();
    });
  });

  describe('estimation uses fallback params', () => {
    test('uses tokensInput and tokensOutput from fallback params', () => {
      const record = createUsageRecord({ tokensInput: 0, tokensOutput: 0 });
      applyProviderReportedEnergy(record, null, {
        tokensInput: 500,
        tokensOutput: 200,
        modelParams: DEFAULT_MODEL,
        gpuParams: DEFAULT_GPU_PARAMS,
      });

      // Estimation should produce a positive value based on 500/200 tokens
      expect(record.kwhUsed).toBeGreaterThan(0);
    });
  });

  describe('provider-reported energy detail fields', () => {
    test('sets all detail fields from provider energy data', () => {
      const record = createUsageRecord();
      applyProviderReportedEnergy(
        record,
        {
          energy_kwh: 0.000056025,
          avg_power_watts: 2914,
          duration_seconds: 0.989,
          attribution_method: 'counter_prorated_multi_gpu_8',
          attribution_ratio: 0.07,
          ratio_was_capped: true,
          uncapped_energy_kwh: 0.000800355,
        },
        defaultFallback
      );

      expect(record.energyAvgPowerWatts).toBe(2914);
      expect(record.energyDurationSeconds).toBe(0.989);
      expect(record.energyAttributionMethod).toBe('counter_prorated_multi_gpu_8');
      expect(record.energyAttributionRatio).toBe(0.07);
      expect(record.energyRatioWasCapped).toBe(1);
      expect(record.energyUncappedKwh).toBe(0.000800355);
    });

    test('sets energyRatioWasCapped as 0 when ratio_was_capped is false', () => {
      const record = createUsageRecord();
      applyProviderReportedEnergy(
        record,
        {
          energy_kwh: 0.000056025,
          ratio_was_capped: false,
        },
        defaultFallback
      );

      expect(record.energyRatioWasCapped).toBe(0);
    });

    test('leaves missing detail fields null when partial energy data provided', () => {
      const record = createUsageRecord();
      applyProviderReportedEnergy(
        record,
        {
          energy_kwh: 0.000056025,
          avg_power_watts: 2914,
        },
        defaultFallback
      );

      expect(record.energyAvgPowerWatts).toBe(2914);
      expect(record.energyDurationSeconds).toBeNull();
      expect(record.energyAttributionMethod).toBeNull();
      expect(record.energyAttributionRatio).toBeNull();
      expect(record.energyRatioWasCapped).toBeNull();
      expect(record.energyUncappedKwh).toBeNull();
    });

    test('leaves detail fields null when energy_kwh is invalid', () => {
      const record = createUsageRecord();
      applyProviderReportedEnergy(
        record,
        {
          energy_kwh: NaN,
          avg_power_watts: 2914,
          duration_seconds: 0.989,
        },
        defaultFallback
      );

      expect(record.kwhUsed).toBeNull();
      expect(record.energyAvgPowerWatts).toBeNull();
      expect(record.energyDurationSeconds).toBeNull();
    });
  });
});
