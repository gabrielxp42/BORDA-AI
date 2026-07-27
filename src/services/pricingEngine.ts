import { PricingRule, MatrixVersion } from '@/types/borda';

export interface PricingOptions {
  stitchCount: number;
  colorCount: number;
  quantity: number;
  chargeColorAddon?: boolean;
  isBigHoop?: boolean;
  isReadyPiece?: boolean;
  isFringe?: boolean;
  hasLaser?: boolean;
  hasPress?: boolean;
}

export interface PricingCalculationResult {
  baseStitchCost: number;
  operationalMarginAmount: number;
  colorAddonAmount: number;
  bigHoopAddonAmount: number;
  readyPieceAddonAmount: number;
  fringeAddonAmount: number;
  laserAddonAmount: number;
  pressAddonAmount: number;
  unitPrice: number;
  totalPrice: number;
  breakdown: { label: string; amount: number; percentage?: number }[];
}

export function calculateEmbroideryPrice(
  options: PricingOptions,
  rules: PricingRule[]
): PricingCalculationResult {
  const {
    stitchCount,
    colorCount,
    quantity,
    chargeColorAddon = true,
    isBigHoop = false,
    isReadyPiece = false,
    isFringe = false,
    hasLaser = false,
    hasPress = false,
  } = options;

  // 1. Thousand Stitches Base Rate (Default R$ 0,65 / 1000 stitches)
  const baseRateRule = rules.find((r) => r.rule_type === 'thousand_stitches') || { value: 0.65 };
  const baseRatePerThousand = Number(baseRateRule.value);
  const baseStitchCost = (stitchCount / 1000) * baseRatePerThousand;

  // 2. Base Operational Margin (Default 20%)
  const marginRule = rules.find((r) => r.name.toLowerCase().includes('operacional')) || { value: 20 };
  const marginPercent = Number(marginRule.value);
  const operationalMarginAmount = baseStitchCost * (marginPercent / 100);

  let currentSubtotal = baseStitchCost + operationalMarginAmount;

  // 3. Color Addon Bracket (Opcional)
  let colorAddonPercent = 0;
  let colorAddonAmount = 0;

  if (chargeColorAddon) {
    colorAddonPercent = 20; // default 1-6 colors
    if (colorCount >= 7 && colorCount <= 12) colorAddonPercent = 30;
    if (colorCount > 12) colorAddonPercent = 40;

    const colorRule = rules.find(
      (r) =>
        r.rule_type === 'color_percent' &&
        r.min_value !== undefined &&
        r.max_value !== undefined &&
        colorCount >= r.min_value &&
        colorCount <= r.max_value
    );
    if (colorRule) {
      colorAddonPercent = Number(colorRule.value);
    }

    colorAddonAmount = currentSubtotal * (colorAddonPercent / 100);
    currentSubtotal += colorAddonAmount;
  }

  // 4. Operational Addons
  let bigHoopAddonAmount = 0;
  if (isBigHoop) {
    const rule = rules.find((r) => r.name.toLowerCase().includes('bastidor')) || { value: 30 };
    bigHoopAddonAmount = currentSubtotal * (Number(rule.value) / 100);
  }

  let readyPieceAddonAmount = 0;
  if (isReadyPiece) {
    const rule = rules.find((r) => r.name.toLowerCase().includes('pronta')) || { value: 50 };
    readyPieceAddonAmount = currentSubtotal * (Number(rule.value) / 100);
  }

  let fringeAddonAmount = 0;
  if (isFringe) {
    const rule = rules.find((r) => r.name.toLowerCase().includes('fringe')) || { value: 30 };
    fringeAddonAmount = currentSubtotal * (Number(rule.value) / 100);
  }

  let laserAddonAmount = 0;
  if (hasLaser) {
    const rule = rules.find((r) => r.name.toLowerCase().includes('laser')) || { value: 0.5 };
    laserAddonAmount = Number(rule.value);
  }

  let pressAddonAmount = 0;
  if (hasPress) {
    const rule = rules.find((r) => r.name.toLowerCase().includes('prensa')) || { value: 0.5 };
    pressAddonAmount = Number(rule.value);
  }

  const unitPrice =
    currentSubtotal +
    bigHoopAddonAmount +
    readyPieceAddonAmount +
    fringeAddonAmount +
    laserAddonAmount +
    pressAddonAmount;

  const totalPrice = unitPrice * Math.max(1, quantity);

  const breakdown = [
    { label: `Base (${stitchCount.toLocaleString('pt-BR')} pts @ R$ ${baseRatePerThousand.toFixed(2)}/mil)`, amount: baseStitchCost },
    { label: `Margem Operacional (${marginPercent}%)`, amount: operationalMarginAmount, percentage: marginPercent },
    { 
      label: chargeColorAddon 
        ? `Adicional Cores (${colorCount} cores = +${colorAddonPercent}%)` 
        : `Adicional Cores (${colorCount} cores = Isento / R$ 0,00)`, 
      amount: colorAddonAmount, 
      percentage: colorAddonPercent 
    },
  ];

  if (isBigHoop) breakdown.push({ label: 'Adicional Bastidor Grande (+30%)', amount: bigHoopAddonAmount });
  if (isReadyPiece) breakdown.push({ label: 'Adicional Peça Pronta (+50%)', amount: readyPieceAddonAmount });
  if (isFringe) breakdown.push({ label: 'Adicional Fringe (+30%)', amount: fringeAddonAmount });
  if (hasLaser) breakdown.push({ label: 'Adicional Laser (+R$ 0.50/un)', amount: laserAddonAmount });
  if (hasPress) breakdown.push({ label: 'Adicional Prensa (+R$ 0.50/un)', amount: pressAddonAmount });

  return {
    baseStitchCost,
    operationalMarginAmount,
    colorAddonAmount,
    bigHoopAddonAmount,
    readyPieceAddonAmount,
    fringeAddonAmount,
    laserAddonAmount,
    pressAddonAmount,
    unitPrice,
    totalPrice,
    breakdown,
  };
}
