import React from 'react';
import { SmartCalculatorWorkflow } from '@/components/orders/SmartCalculatorWorkflow';

export const Calculadora: React.FC = () => {
  return (
    <div className="w-full h-full bg-transparent">
      <SmartCalculatorWorkflow mode="standalone" />
    </div>
  );
};

export default Calculadora;

