import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  description?: string;
}

interface CustomSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  error?: boolean;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Selecione uma opção...',
  className = '',
  disabled = false,
  error = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative w-full ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all cursor-pointer ${
          disabled ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-zinc-800' : ''
        } ${
          error
            ? 'border-red-500 ring-2 ring-red-500/20 bg-red-500/10'
            : 'bg-slate-50 dark:bg-black/50 border-slate-200 dark:border-white/10 hover:border-purple-500/50 dark:hover:border-purple-500/50'
        } text-slate-900 dark:text-zinc-100 shadow-sm`}
      >
        <div className="flex items-center gap-2 truncate min-w-0">
          {selectedOption ? (
            <>
              {selectedOption.icon && <span className="shrink-0">{selectedOption.icon}</span>}
              <span className="truncate">{selectedOption.label}</span>
            </>
          ) : (
            <span className="text-slate-400 dark:text-zinc-500 font-normal">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 dark:text-zinc-400 transition-transform shrink-0 ml-2 ${
            isOpen ? 'rotate-180 text-purple-600 dark:text-purple-400' : ''
          }`}
        />
      </div>

      {/* Options Menu Dropdown */}
      {isOpen && (
        <div className="absolute z-[9999] top-full left-0 right-0 mt-1.5 bg-white dark:bg-[#12121a] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150 p-1.5 max-h-60 overflow-y-auto custom-scrollbar">
          {options.length === 0 ? (
            <div className="px-4 py-3 text-xs text-slate-400 dark:text-zinc-500 text-center">
              Nenhuma opção disponível.
            </div>
          ) : (
            options.map(option => {
              const isSelected = option.value === value;
              return (
                <div
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all my-0.5 ${
                    isSelected
                      ? 'bg-purple-500/15 text-purple-600 dark:text-purple-300 font-bold'
                      : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    {option.icon && <span className="shrink-0">{option.icon}</span>}
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{option.label}</span>
                      {option.description && (
                        <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-normal truncate">
                          {option.description}
                        </span>
                      )}
                    </div>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0 ml-2" />}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
