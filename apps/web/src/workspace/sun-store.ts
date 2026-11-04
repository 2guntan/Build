import { create } from 'zustand';
import { sunPosition, type DayDate, type SunPosition, type SunStudySummary } from '@fs/sun';

interface SunState {
  enabled: boolean;
  date: DayDate;
  hour: number;
  playing: boolean;
  position: SunPosition | null;
  lat: number;
  lon: number;
  map: { points: [number, number, number][]; hours: Float32Array; summary: SunStudySummary } | null;
  setEnabled(v: boolean): void;
  setLocation(lat: number, lon: number): void;
  setDate(d: DayDate): void;
  setHour(h: number): void;
  setPlaying(v: boolean): void;
  setMap(m: SunState['map']): void;
}

/** Site time zone is Africa/Dakar: UTC+0, no daylight saving. */
const TZ_OFFSET_H = 0;

export const useSunStore = create<SunState>((set, get) => {
  const recompute = () => {
    const { date, hour, lat, lon } = get();
    set({ position: sunPosition(date, hour, lat, lon, TZ_OFFSET_H) });
  };
  return {
    enabled: false,
    date: { year: 2026, month: 6, day: 21 },
    hour: 12,
    playing: false,
    position: null,
    lat: 14.7167,
    lon: -17.4677,
    map: null,
    setEnabled(v) {
      set({ enabled: v });
      recompute();
    },
    setLocation(lat, lon) {
      set({ lat, lon });
      recompute();
    },
    setDate(d) {
      set({ date: d, map: null });
      recompute();
    },
    setHour(h) {
      set({ hour: h });
      recompute();
    },
    setPlaying(v) {
      set({ playing: v });
    },
    setMap(m) {
      set({ map: m });
    },
  };
});
