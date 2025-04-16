export type SeatOptionType = 'bar' | 'table' | 'vip';

export type SeatOption = {
  id: string;
  bar_id: string;
  type: SeatOptionType;
  enabled: boolean;
  available_count: number;
  min_people: number;
  max_people: number;
};
