import React from 'react';
import ReactDOM from 'react-dom';
import { SmartCalculatorWorkflow } from './SmartCalculatorWorkflow';

interface InitialOrderData {
  clientId?: string;
  matrixName?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
}

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: InitialOrderData | null;
  onOrderCreated?: () => void;
}

export const CreateOrderModal: React.FC<CreateOrderModalProps> = ({ 
  isOpen, 
  onClose, 
  initialData,
  onOrderCreated 
}) => {
  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div 
        className="relative w-full max-w-6xl max-h-[85vh] flex flex-col rounded-2xl sm:rounded-[28px] border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d0d14] shadow-2xl overflow-y-auto animate-in zoom-in-95 duration-200 my-auto"
        onClick={e => e.stopPropagation()}
      >
        <SmartCalculatorWorkflow 
          mode="modal"
          onClose={onClose}
          initialData={initialData}
          onOrderCreated={onOrderCreated}
        />
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};
