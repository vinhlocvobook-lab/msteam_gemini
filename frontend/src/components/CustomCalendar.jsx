import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import solarLunar from 'solarlunar';

export default function CustomCalendar({ holidays = [], weekendDays = [0, 6], onSelectDate, onClose }) {
  const today = new Date();
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  // Navigation handlers
  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const prevYear = () => {
    setCurrentDate(new Date(year - 1, month, 1));
  };

  const nextYear = () => {
    setCurrentDate(new Date(year + 1, month, 1));
  };

  // Helper functions
  const isToday = (date) => {
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  const isDateInPast = (date) => {
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const compareDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return compareDate < todayStart;
  };

  const isWeekend = (date) => {
    return weekendDays.includes(date.getDay());
  };

  const getHoliday = (date) => {
    const dDay = date.getDate();
    const dMonth = date.getMonth() + 1;

    try {
      const lunar = solarLunar.solar2lunar(date.getFullYear(), dMonth, dDay);
      const lDay = lunar.lDay;
      const lMonth = lunar.lMonth;

      return holidays.find(h => {
        if (h.type === 'solar') {
          return h.day === dDay && h.month === dMonth;
        } else if (h.type === 'lunar') {
          return h.day === lDay && h.month === lMonth;
        } else if (h.type === 'single') {
          return h.dateStr === `${date.getFullYear()}-${String(dMonth).padStart(2, '0')}-${String(dDay).padStart(2, '0')}`;
        }
        return false;
      });
    } catch (e) {
      console.error('[Calendar Error] Failed to compute lunar date:', e);
      return null;
    }
  };

  // Generate grid cell data
  const firstDayOfMonth = new Date(year, month, 1);
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

  // Day index for grid starting on Monday (index 0) to Sunday (index 6)
  let firstDayIndex = firstDayOfMonth.getDay() - 1;
  if (firstDayIndex === -1) firstDayIndex = 6;

  const dayCells = [];

  // Previous month filling
  const prevMonthDaysTotal = new Date(year, month, 0).getDate();
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayNum = prevMonthDaysTotal - i;
    dayCells.push({
      date: new Date(year, month - 1, dayNum),
      dayNum,
      isCurrentMonth: false
    });
  }

  // Current month filling
  for (let i = 1; i <= totalDaysInMonth; i++) {
    dayCells.push({
      date: new Date(year, month, i),
      dayNum: i,
      isCurrentMonth: true
    });
  }

  // Next month filling to make grid complete (35 or 42 cells)
  const totalCells = dayCells.length > 35 ? 42 : 35;
  const remainingCells = totalCells - dayCells.length;
  for (let i = 1; i <= remainingCells; i++) {
    dayCells.push({
      date: new Date(year, month + 1, i),
      dayNum: i,
      isCurrentMonth: false
    });
  }

  const weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

  return (
    <div className="custom-calendar-popover" onClick={(e) => e.stopPropagation()}>
      <div className="calendar-popover-header">
        <span className="calendar-popover-title">Chọn hạn chót</span>
        <button 
          type="button" 
          className="calendar-popover-close" 
          onMouseDown={(e) => {
            e.preventDefault();
            onClose();
          }}
        >
          <X size={15} />
        </button>
      </div>

      <div className="calendar-navigation">
        <div className="nav-group">
          <button 
            type="button" 
            className="nav-btn" 
            onMouseDown={(e) => {
              e.preventDefault();
              prevYear();
            }} 
            title="Năm trước"
          >
            <ChevronsLeft size={15} />
          </button>
          <button 
            type="button" 
            className="nav-btn" 
            onMouseDown={(e) => {
              e.preventDefault();
              prevMonth();
            }} 
            title="Tháng trước"
          >
            <ChevronLeft size={15} />
          </button>
        </div>
        <span className="current-month-year">
          Tháng {month + 1}, {year}
        </span>
        <div className="nav-group">
          <button 
            type="button" 
            className="nav-btn" 
            onMouseDown={(e) => {
              e.preventDefault();
              nextMonth();
            }} 
            title="Tháng sau"
          >
            <ChevronRight size={15} />
          </button>
          <button 
            type="button" 
            className="nav-btn" 
            onMouseDown={(e) => {
              e.preventDefault();
              nextYear();
            }} 
            title="Năm sau"
          >
            <ChevronsRight size={15} />
          </button>
        </div>
      </div>

      <div className="calendar-grid-header">
        {weekdays.map((day) => (
          <div key={day} className="grid-weekday-label">
            {day}
          </div>
        ))}
      </div>

      <div className="calendar-grid-body">
        {dayCells.map((cell, idx) => {
          const cellIsToday = isToday(cell.date);
          const cellIsWeekend = isWeekend(cell.date);
          const cellIsPast = isDateInPast(cell.date);
          const holiday = getHoliday(cell.date);
          
          let lunarText = '';
          let isLeap = false;
          let tooltip = '';

          try {
            const lunar = solarLunar.solar2lunar(
              cell.date.getFullYear(),
              cell.date.getMonth() + 1,
              cell.date.getDate()
            );
            isLeap = lunar.isLeap;
            lunarText = lunar.lDay === 1
              ? `${lunar.lDay}/${lunar.lMonth}${lunar.isLeap ? 'n' : ''}`
              : lunar.lDay.toString();
            
            tooltip = cellIsPast 
              ? 'Không thể chọn ngày trong quá khứ'
              : `Dương lịch: ${cell.date.toLocaleDateString('vi-VN')}\nÂm lịch: Ngày ${lunar.lDay} tháng ${lunar.lMonth}${lunar.isLeap ? ' (Nhuận)' : ''}, năm ${lunar.lYear}`;
            
            if (holiday && !cellIsPast) {
              tooltip += `\nNgày lễ: ${holiday.name}`;
            }
          } catch (e) {}

          return (
            <button
              key={idx}
              type="button"
              className={`calendar-grid-cell ${cell.isCurrentMonth ? '' : 'other-month'} ${cellIsToday ? 'today' : ''} ${cellIsWeekend ? 'weekend' : ''} ${holiday ? 'holiday' : ''} ${cellIsPast ? 'past-date' : ''}`}
              title={tooltip}
              disabled={cellIsPast}
              onMouseDown={(e) => {
                if (cellIsPast) return;
                e.preventDefault();
                onSelectDate(cell.date);
              }}
            >
              <span className="solar-number">{cell.dayNum}</span>
              <span className="lunar-number">{lunarText}</span>
              {holiday && !cellIsPast && (
                <span className="holiday-dot" style={{ backgroundColor: holiday.color || '#ef4444' }} />
              )}
            </button>
          );
        })}
      </div>

      <div className="calendar-popover-footer">
        <button
          type="button"
          className="quick-today-btn"
          onMouseDown={(e) => {
            e.preventDefault();
            onSelectDate(new Date());
          }}
        >
          Hôm nay
        </button>
        <button
          type="button"
          className="quick-today-btn"
          onMouseDown={(e) => {
            e.preventDefault();
            const tomorrow = new Date();
            tomorrow.setDate(today.getDate() + 1);
            onSelectDate(tomorrow);
          }}
        >
          Ngày mai
        </button>
      </div>
    </div>
  );
}
