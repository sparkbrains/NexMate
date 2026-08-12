import { createContext } from 'react';

export const AppContext = createContext({
  theme: 'dark',
  setTheme: () => {},
  sidebarOpen: false,
  setSidebarOpen: () => {},
  rewardsOpen: false,
  setRewardsOpen: () => {},
  hasUnseenReward: false,
  rewardPoints: 0,
  checkRewards: () => {},
  markRewardsSeen: () => {},
});
