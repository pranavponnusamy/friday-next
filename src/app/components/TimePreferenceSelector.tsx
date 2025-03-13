import React from 'react';

export interface TimePreference {
  startHour: number;
  endHour: number;
  label: string;
}

export const TIME_PREFERENCES: TimePreference[] = [
  { startHour: 0, endHour: 24, label: 'Any time' },
  { startHour: 9, endHour: 12, label: 'Morning (9 AM - 12 PM)' },
  { startHour: 12, endHour: 17, label: 'Afternoon (12 PM - 5 PM)' },
  { startHour: 17, endHour: 20, label: 'Evening (5 PM - 8 PM)' },
  { startHour: 6, endHour: 22, label: 'Business hours (6 AM - 10 PM)' },
];

interface TimePreferenceSelectorProps {
  selectedPreference: TimePreference;
  onChange: (preference: TimePreference) => void;
  className?: string;
}

const TimePreferenceSelector: React.FC<TimePreferenceSelectorProps> = ({
  selectedPreference,
  onChange,
  className = '',
}) => {
  return (
    <div className={`flex flex-col space-y-2 ${className}`}>
      <label htmlFor="time-preference" className="block text-sm font-medium text-indigo-700 mb-1">
        Preferred Time
      </label>
      <select
        id="time-preference"
        value={TIME_PREFERENCES.findIndex(p => 
          p.startHour === selectedPreference.startHour && 
          p.endHour === selectedPreference.endHour
        )}
        onChange={(e) => {
          const index = parseInt(e.target.value);
          onChange(TIME_PREFERENCES[index]);
        }}
        className="block w-full p-2 border border-indigo-300 rounded-md shadow-sm 
                  focus:ring-indigo-500 focus:border-indigo-500 bg-white
                  text-indigo-800"
      >
        {TIME_PREFERENCES.map((preference, index) => (
          <option key={preference.label} value={index} className="text-indigo-800">
            {preference.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default TimePreferenceSelector;
