import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DatePickerProps {
  value: Date | null;
  onChange: (date: Date) => void;
  placeholder?: string;
  className?: string;
}

export const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, placeholder = "Selecione uma data", className = "" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(value || new Date());
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (value) setCurrentMonth(value);
  }, [value]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 0 }); // Domingo
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = eachDayOfInterval({
    start: startDate,
    end: endDate
  });

  const weekDays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const handleSelectDate = (date: Date) => {
    onChange(date);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 cursor-pointer flex items-center justify-between hover:border-purple-500/50 transition-colors"
      >
        <span className={value ? 'text-zinc-200' : 'text-zinc-500'}>
          {value ? format(value, "dd/MM/yyyy") : placeholder}
        </span>
        <CalendarIcon className="h-4 w-4 text-zinc-500" />
      </div>

      {isOpen && (
        <div className="absolute z-50 top-[100%] right-0 md:left-0 mt-2 p-4 bg-[#12121a] border border-white/10 rounded-2xl shadow-2xl shadow-black/80 w-[280px]">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <button 
              type="button"
              onClick={prevMonth}
              className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h3 className="text-sm font-bold text-white capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
            </h3>
            <button 
              type="button"
              onClick={nextMonth}
              className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Weekdays */}
          <div className="grid grid-cols-7 gap-1 mb-2 text-center">
            {weekDays.map((day, idx) => (
              <div key={idx} className="text-[10px] font-black text-zinc-500">{day}</div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, idx) => {
              const isSelected = value ? isSameDay(day, value) : false;
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isToday = isSameDay(day, new Date());

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectDate(day)}
                  className={`
                    h-8 w-8 rounded-full flex items-center justify-center text-xs transition-all
                    ${!isCurrentMonth ? 'text-zinc-600' : 'text-zinc-300 hover:bg-white/10 hover:text-white'}
                    ${isSelected ? 'bg-purple-600 text-white font-bold shadow-lg shadow-purple-600/30' : ''}
                    ${isToday && !isSelected ? 'border border-purple-500/50 text-purple-400' : ''}
                  `}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>
          
          {/* Footer Actions */}
          <div className="mt-4 pt-3 border-t border-white/10 flex justify-between">
            <button 
              type="button"
              onClick={() => { onChange(new Date()); setIsOpen(false); }}
              className="text-xs font-bold text-purple-400 hover:text-purple-300 transition-colors"
            >
              Hoje
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
