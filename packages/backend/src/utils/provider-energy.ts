import type { UsageRecord } from '../types/usage';
import type { GpuParams, ModelParams } from '@plexus/shared';
import { estimateKwhUsed } from '../services/inference-energy';

/**
 * Apply provider-reported energy data, setting kwhUsed on the usage record.
 *
 * Some providers (via Neuralwatt) emit energy consumption data in SSE comment
 * lines like:
 *   `: energy {"energy_kwh": 5.29e-05, "avg_power_watts": 3109, ...}`
 *
 * When present and valid, we use the provider's actual energy measurement
 * over our estimation. When absent, we fall back to estimation.
 *
 * Note: When energy_kwh is present but invalid (NaN, negative), kwhUsed is
 * left unchanged (null).
 */
export function applyProviderReportedEnergy(
  usageRecord: Partial<UsageRecord>,
  energyData: any,
  fallbackParams: {
    tokensInput: number;
    tokensOutput: number;
    modelParams: ModelParams;
    gpuParams: GpuParams;
  }
): void {
  if (energyData?.energy_kwh != null) {
    const energyKwh = Number(energyData.energy_kwh);
    if (!isNaN(energyKwh) && energyKwh >= 0) {
      usageRecord.kwhUsed = Number(energyKwh.toFixed(10));

      // Set provider-reported energy detail fields
      if (energyData.avg_power_watts != null) {
        usageRecord.avgPowerWatts = energyData.avg_power_watts;
      }
      if (energyData.duration_seconds != null) {
        usageRecord.durationSeconds = energyData.duration_seconds;
      }
      if (energyData.attribution_method != null) {
        usageRecord.attributionMethod = energyData.attribution_method;
      }
      if (energyData.attribution_ratio != null) {
        usageRecord.attributionRatio = energyData.attribution_ratio;
      }
      if (energyData.ratio_was_capped != null) {
        usageRecord.ratioWasCapped = energyData.ratio_was_capped ? 1 : 0;
      }
      if (energyData.uncapped_energy_kwh != null) {
        usageRecord.uncappedEnergyKwh = energyData.uncapped_energy_kwh;
      }
    }
  } else {
    usageRecord.kwhUsed = estimateKwhUsed(
      fallbackParams.tokensInput,
      fallbackParams.tokensOutput,
      fallbackParams.modelParams,
      fallbackParams.gpuParams
    );
  }
}
